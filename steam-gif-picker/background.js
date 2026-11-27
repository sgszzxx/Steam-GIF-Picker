/* Steam GIF Picker - MV3 service worker */
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const REQUEST_TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 500;
// Add only authorized, documented providers here. No proxy, no scraping, no fake fallback.
const GIF_PROVIDERS = Object.freeze({ giphy: { name: 'GIPHY', buildRequest: buildGiphyRequest, parse: parseGiphyResponse }, gifsnap: { name: 'GifSnap', buildRequest: buildGifSnapRequest, parse: parseGifSnapResponse } });

function failure(code, message, retryable = false) { return { ok: false, code, message, retryable }; }
function httpFailure(status, service = 'GIPHY') {
  if (status === 401 || status === 403) return failure('API_AUTH', service === 'GifSnap' ? 'GifSnap 拒绝访问：公共接口可能限制了当前地区或访问方式，请稍后重试或切换数据源。' : `${service} 拒绝访问：请检查 API Key 是否正确、有效且具有访问权限。`);
  if (status === 429) return failure('RATE_LIMIT', `${service} 请求频率或配额已达上限，请稍后再试。`);
  if (status === 400) return failure('BAD_REQUEST', `${service} 拒绝了请求参数，请检查关键词或设置。`);
  if (status === 408) return failure('TIMEOUT', `${service} 请求超时，请检查网络后重试。`, true);
  if (status >= 500 && status <= 599) return failure('SERVICE_ERROR', `${service} 服务暂时异常（HTTP ${status}），请稍后重试。`, true);
  return failure('HTTP_ERROR', `${service} 请求失败（HTTP ${status}）。`);
}
function buildGiphyRequest(message, stored) {
  const query = String(message.query || '').trim();
  const offset = Math.max(0, Math.floor(Number(message.offset) || 0));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(message.limit) || 25)));
  const rating = ['g','pg','pg-13','r'].includes(stored.giphyRating) ? stored.giphyRating : 'pg-13';
  const url = new URL(`${GIPHY_BASE}/${query ? 'search' : 'trending'}`);
  for (const [key, value] of Object.entries({api_key: String(stored.giphyApiKey || '').trim(), limit, offset, rating})) url.searchParams.set(key, String(value));
  if (query) { url.searchParams.set('q', query); url.searchParams.set('lang', 'en'); }
  return { url, offset, limit };
}
function parseGiphyResponse(payload, request) {
  const metaStatus = Number(payload?.meta?.status || 200);
  if (metaStatus >= 400) return httpFailure(metaStatus);
  if (!Array.isArray(payload?.data)) return failure('BAD_RESPONSE', 'GIPHY 返回了无法识别的数据，请稍后重试。');
  const raw = payload.data;
  const items = raw.map(normalizeGif).filter(Boolean);
  if (raw.length && !items.length) return failure('BAD_RESPONSE', 'GIPHY 返回的 GIF 数据不完整，请稍后重试。');
  const totalCount = Number(payload?.pagination?.total_count || 0);
  return { ok: true, items, offset: request.offset, count: raw.length, totalCount,
    hasMore: request.offset + raw.length < totalCount && raw.length > 0 };
}
// Public REST API: https://gifsnap.com/docs (no key currently required).
function buildGifSnapRequest(message) {
  const query = String(message.query || '').trim().slice(0, 500);
  const offset = Math.max(0, Math.floor(Number(message.offset) || 0));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(message.limit) || 25)));
  const page = Math.floor(offset / limit) + 1;
  const url = new URL(`https://gifsnap.com/api/v1/gifs/${query ? 'search' : 'trending'}`);
  url.searchParams.set('page', String(page)); url.searchParams.set('limit', String(limit));
  if (query) url.searchParams.set('q', query);
  // Do not opt in to community submissions (requires moderation controls).
  return { url, offset, limit, page };
}
function normalizeGifSnap(raw) {
  if (!raw || !['string','number'].includes(typeof raw.id) || String(raw.id).startsWith('ugc_')) return null;
  const directUrl = safePublicMedia(raw.url);
  if (!directUrl) return null;
  const a = raw.animated_preview;
  const animated = a?.animated === true && ['image/gif','image/webp'].includes(a.mime_type) ? safePublicMedia(a.url) : '';
  const posterUrl = safePublicMedia(raw.preview_url);
  const sourceMetadata = typeof raw.source === 'string' ? raw.source.slice(0,500) : '';
  return { id: 'gifsnap:' + String(raw.id), providerId: String(raw.id), source: 'gifsnap',
    sourceMetadata, contentId: typeof raw.content_id === 'string' ? raw.content_id.trim() : '', title: String(raw.title || 'GIF').slice(0,180),
    pageUrl: directUrl, sendUrl: directUrl, directUrl, previewUrl: animated || directUrl, posterUrl,
    width: Number(raw.width || 0), height: Number(raw.height || 0), isDemo: false };
}
function safePublicMedia(value) {
  const href = safeHttps(value);
  if (!href) return '';
  const u = new URL(href);
  // Reject credentials, local and literal IP targets; previews come from public CDNs.
  if (u.username || u.password || u.port || !u.hostname.includes('.') || /(^|\.)localhost$|\.local$|^[0-9.]+$/i.test(u.hostname)) return '';
  return href;
}
function parseGifSnapResponse(payload, request) {
  if (!Array.isArray(payload?.data) || !payload.pagination || typeof payload.pagination.has_next !== 'boolean')
    return failure('BAD_RESPONSE', 'GifSnap 返回了无法识别的数据，请稍后重试。');
  const raw = payload.data, items = raw.map(normalizeGifSnap).filter(Boolean);
  if (raw.length && !items.length) return failure('BAD_RESPONSE', 'GifSnap 返回的 GIF 数据不完整，请稍后重试。');
  const nextPage = Number(payload.pagination.next_page);
  const hasMore = raw.length > 0 && payload.pagination.has_next === true && Number.isInteger(nextPage) && nextPage > request.page;
  return { ok: true, items, offset: request.offset, count: raw.length, hasMore,
    nextOffset: hasMore ? (nextPage - 1) * request.limit : request.offset + request.limit };
}

// Local, transient visual signatures for explicitly selected duplicate candidates.
// Only GifSnap's own HTTPS CDN, no redirects, credentials, disk cache or media upload.
async function fingerprintGifSnapPreview(value, signal) {
  let decoder;
  try {
    const u = new URL(value);
    if (u.origin !== 'https://media.gifsnap.com' || u.username || u.password || !/\.(gif|webp)$/i.test(u.pathname)) return null;
    if (typeof OffscreenCanvas === 'undefined') return null;
    const response = await fetch(u.href, { signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.body) return null;
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const max = 1024 * 1024;
    if (!['image/gif', 'image/webp'].includes(type) || Number(response.headers.get('content-length')) > max) { await response.body.cancel(); return null; }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (!signal.aborted) {
        const {done, value: chunk} = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > max) { await reader.cancel(); return null; }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
    if (signal.aborted || !size) return null;
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    if (type === 'image/webp') decoder = await openWebpDecoder(bytes, signal);
    else if (typeof ImageDecoder !== 'undefined') decoder = new ImageDecoder({data: bytes, type, desiredWidth: 24, desiredHeight: 24});
    else if (typeof createImageBitmap !== 'undefined') decoder = await openCompatibleGif(bytes, signal);
    else return null;
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack?.frameCount || 0;
    if (count < 2 || count > 300 || signal.aborted) return null;
    const canvas = new OffscreenCanvas(16, 16);
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const frames = []; let ratio = 0;
    for (const frameIndex of [0, Math.floor((count-1)/2), count-1]) {
      if (signal.aborted) return null;
      const {image} = await decoder.decode({frameIndex});
      try {
        if (image.displayWidth < 16 || image.displayHeight < 16) return null;
        ratio = image.displayWidth / image.displayHeight;
        ctx.fillStyle = '#808080'; ctx.fillRect(0,0,16,16);
        ctx.drawImage(image,0,0,16,16);
        const rgba = ctx.getImageData(0,0,16,16).data;
        const rgb = []; let lo = 255, hi = 0;
        for (let i=0;i<rgba.length;i+=4) {
          const v = .299*rgba[i]+.587*rgba[i+1]+.114*rgba[i+2]; lo=Math.min(lo,v);hi=Math.max(hi,v);
          rgb.push(rgba[i],rgba[i+1],rgba[i+2]);
        }
        if (hi-lo < 30) return null; // blank/placeholder frames are not identity evidence
        frames.push(rgb);
      } finally { image.close(); }
    }
    return { ratio, frames };
  } catch { return null; }
  finally { try { decoder?.close(); } catch {} }
}
async function fingerprintBatch(urls) {
  const unique = [...new Set(Array.isArray(urls) ? urls.filter(x => typeof x === 'string' && x.length < 2048) : [])].slice(0,12);
  const results = {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  let cursor = 0;
  const worker = async () => {
    while (!controller.signal.aborted && cursor < unique.length) {
      const url = unique[cursor++];
      const value = await fingerprintGifSnapPreview(url, controller.signal);
      if (value && !controller.signal.aborted) results[url] = value;
    }
  };
  try {
    await Promise.race([Promise.all(Array.from({length:4},worker)), new Promise(resolve => controller.signal.addEventListener('abort',resolve,{once:true}))]);
    return {ok:true, signatures:results};
  } finally { clearTimeout(timer); controller.abort(); }
}

// Built-in media preparation. Bounded, local, no proxy; exact CDN origins and paths.
const MEDIA_MAX = 8 * 1024 * 1024;
function webpMediaURL(value) {
  try { const u = new URL(value); return !u.username && !u.password && ((u.origin === 'https://media.gifsnap.com' && /^\/gifs\//.test(u.pathname)) || (u.origin === 'https://static.klipy.com' && /^\/ii\//.test(u.pathname))) ? u.href : ''; } catch { return ''; }
}
// Local, bounded header probe. The CDN response is not a guarantee of Steam's preview.
// Cache only successful metadata, in memory; no per-image compatibility blacklist.
const gifProbeCache = new Map(), gifProbePending = new Map();
const GIF_PROBE_TTL = 5 * 60 * 1000;
function positiveLength(value) {
  return typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
}
async function probeGifHeaders(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const init = {signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'};
  const mime = r => (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const encodingOK = r => !r.headers.get('content-encoding') || r.headers.get('content-encoding').toLowerCase() === 'identity';
  try {
    let head;
    // HEAD gets a shorter individual deadline so a rejected/slow HEAD leaves time for Range.
    const hc = new AbortController();
    const abortHead = () => hc.abort();
    controller.signal.addEventListener('abort',abortHead,{once:true});
    const ht = setTimeout(abortHead,1800);
    try { head = await fetch(url,{...init,signal:hc.signal,method:'HEAD'}); }
    catch {} finally {clearTimeout(ht);controller.signal.removeEventListener('abort',abortHead);}
    if (head?.ok && head.status === 200) {
      const type = mime(head), size = encodingOK(head) ? positiveLength(head.headers.get('content-length')) : null;
      if (type && type !== 'image/gif') return {ok:true,mime:type,size};
      if (type === 'image/gif' && size !== null) return {ok:true,mime:type,size};
    }
    if (controller.signal.aborted) return {ok:false,code:'PROBE_TIMEOUT'};
    const r = await fetch(url,{...init,method:'GET',headers:{Range:'bytes=0-63'}});
    // A range-ignorant server may respond with the entire GIF. Never read its body here.
    if (r.body) { try { void r.body.cancel().catch(()=>{}); } catch {} }
    if (!r.ok || ![200,206].includes(r.status)) return {ok:false,code:'PROBE_HTTP'};
    const type = mime(r); let size = null;
    if (encodingOK(r)) {
      if (r.status === 206) {
        const match = /^bytes 0-(\d+)\/(\d+)$/i.exec(r.headers.get('content-range') || '');
        if (match) {const total=positiveLength(match[2]); const end=Number(match[1]);if(total!==null && Number.isSafeInteger(end) && end>=0 && end<total && end<=63) size=total;}
      } else size=positiveLength(r.headers.get('content-length'));
    }
    if (!type || (type === 'image/gif' && size === null)) return {ok:false,code:'PROBE_UNKNOWN'};
    return {ok:true,mime:type,size};
  } catch { return {ok:false,code:'PROBE_UNAVAILABLE'}; }
  finally {clearTimeout(timer);controller.abort();}
}
function inspectGifLink(value, warm = false) {
  const url = webpMediaURL(value);
  if (!url || url.length > 2048 || !/\.gif$/i.test(new URL(url).pathname)) return Promise.resolve({ok:false,code:'PROBE_URL'});
  const cached = gifProbeCache.get(url);
  if (cached && Date.now()-cached.at < GIF_PROBE_TTL) return Promise.resolve(cached.result);
  if (cached) gifProbeCache.delete(url);
  if (gifProbePending.has(url)) return gifProbePending.get(url);
  // At most one speculative request, allow actual user clicks priority.
  if (gifProbePending.size >= (warm ? 1 : 3)) return Promise.resolve({ok:false,code:'PROBE_BUSY'});
  const task = probeGifHeaders(url).then(result=>{
    if(result.ok){gifProbeCache.set(url,{at:Date.now(),result});while(gifProbeCache.size>128)gifProbeCache.delete(gifProbeCache.keys().next().value);}
    return result;
  }).finally(()=>gifProbePending.delete(url));
  gifProbePending.set(url,task);
  return task;
}
// Frame-adaptive RGB palette. Exact colors are preserved when <=255 opaque colors;
// otherwise weighted median cut on a 5-bit histogram chooses representative colors.
// Palette index 0 is reserved for binary transparency (GIF format constraint).
function adaptiveGifPalette(rgba) {
  const palette=new Uint8Array(768), pixels=new Uint8Array(rgba.length/4), exact=new Map();
  let overflow=false;
  for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]<128)continue;const key=(rgba[i]<<16)|(rgba[i+1]<<8)|rgba[i+2];if(!exact.has(key)){if(exact.size===255){overflow=true;break;}exact.set(key,exact.size+1);}}
  if(!overflow){for(const [key,j] of exact){palette[j*3]=key>>>16;palette[j*3+1]=key>>>8&255;palette[j*3+2]=key&255;}for(let i=0,j=0;i<rgba.length;i+=4,j++)if(rgba[i+3]>=128)pixels[j]=exact.get((rgba[i]<<16)|(rgba[i+1]<<8)|rgba[i+2]);return {palette,pixels};}
  const n=new Uint32Array(32768),rs=new Uint32Array(32768),gs=new Uint32Array(32768),bs=new Uint32Array(32768);
  const bin=(r,g,b)=>(r>>3)*1024+(g>>3)*32+(b>>3);
  for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]<128)continue;const k=bin(rgba[i],rgba[i+1],rgba[i+2]);n[k]++;rs[k]+=rgba[i];gs[k]+=rgba[i+1];bs[k]+=rgba[i+2];}
  const entries=[];for(let k=0;k<n.length;k++)if(n[k])entries.push({k,n:n[k],c:[rs[k]/n[k],gs[k]/n[k],bs[k]/n[k]]});
  function box(a){let weight=0,mean=[0,0,0],sq=[0,0,0];for(const e of a){weight+=e.n;for(let j=0;j<3;j++){mean[j]+=e.n*e.c[j];sq[j]+=e.n*e.c[j]*e.c[j];}}const v=sq.map((x,j)=>Math.max(0,x-mean[j]*mean[j]/weight)*[0.30,0.59,0.11][j]);let axis=0;for(let j=1;j<3;j++)if(v[j]>v[axis])axis=j;return {a,weight,mean:mean.map(x=>x/weight),axis,score:a.length>1?v[axis]:-1};}
  const boxes=[box(entries)];while(boxes.length<255){let at=-1,score=-1;for(let i=0;i<boxes.length;i++)if(boxes[i].score>score){score=boxes[i].score;at=i;}if(at<0)break;const b=boxes[at];b.a.sort((x,y)=>x.c[b.axis]-y.c[b.axis]);let sum=0,cut=1;for(;cut<b.a.length-1;cut++){sum+=b.a[cut-1].n;if(sum>=b.weight/2)break;}boxes.splice(at,1,box(b.a.slice(0,cut)),box(b.a.slice(cut)));}
  for(let i=0;i<boxes.length;i++)for(let j=0;j<3;j++)palette[(i+1)*3+j]=Math.round(boxes[i].mean[j]);
  // Nearest representative for each occupied bin; weighted distance prioritizes luminance.
  const lut=new Uint8Array(32768);for(const e of entries){let best=Infinity,idx=1;const [r,g,b]=e.c;for(let i=1;i<=boxes.length;i++){const j=i*3,dr=r-palette[j],dg=g-palette[j+1],db=b-palette[j+2];const dist=30*dr*dr+59*dg*dg+11*db*db;if(dist<best){best=dist;idx=i;}}lut[e.k]=idx;}
  for(let i=0,j=0;i<rgba.length;i+=4,j++)if(rgba[i+3]>=128)pixels[j]=lut[bin(rgba[i],rgba[i+1],rgba[i+2])];return {palette,pixels};
}
// GIF89a: local color table per frame; full composited frames retain disposal 2.
function createGifEncoder(w, h, repeats = Infinity, max = MEDIA_MAX) {
  const chunks = []; let length = 0;
  function add(a) { length += a.length; if (length > max) throw Error('OUTPUT_LIMIT'); chunks.push(Uint8Array.from(a)); }
  const word = n => [n & 255, n >> 8 & 255];
  add([...Array.from('GIF89a', c=>c.charCodeAt(0)), ...word(w), ...word(h), 0xf7, 0, 0]);
  add(new Uint8Array(768)); // global background index 0; actual colors are local
  if(repeats!==0) add([0x21,0xff,11,...Array.from('NETSCAPE2.0',c=>c.charCodeAt(0)),3,1,...word(Number.isFinite(repeats)?Math.min(65535,Math.max(1,repeats)):0),0]);
  function frame(rgba, delay) {
    const {palette,pixels} = adaptiveGifPalette(rgba);
    const bytes=[]; let bits=0, bitCount=0, width=9, next=258, dict=new Map();
    const emit=code=>{bits|=code<<bitCount;bitCount+=width;while(bitCount>=8){bytes.push(bits&255);bits>>>=8;bitCount-=8;}};
    emit(256); let prefix=pixels[0];
    for(let i=1;i<pixels.length;i++){
      const p=pixels[i], key=prefix*256+p, known=dict.get(key);
      if(known!==undefined){prefix=known;continue;}
      emit(prefix);
      if(next<4096){dict.set(key,next++);if(next>(1<<width)&&width<12)width++;}
      else {emit(256);dict=new Map();next=258;width=9;}
      prefix=p;
    }
    emit(prefix); if(next===(1<<width)&&width<12)width++; emit(257); if(bitCount)bytes.push(bits&255);
    add([0x21,0xf9,4,0x09,...word(Math.max(1,Math.min(65535,Math.round(delay)))),0,0,0x2c,0,0,0,0,...word(w),...word(h),0x87]);
    add(palette); add([8]);
    for(let i=0;i<bytes.length;i+=255){const block=bytes.slice(i,i+255);add([block.length,...block]);}add([0]);
  }
  return {frame, finish(){add([0x3b]);const result=new Uint8Array(length);let p=0;for(const c of chunks){result.set(c,p);p+=c.length;}return result;}};
}
// Local WebP container compatibility decoder (RFC 9649 / Google WebP RIFF spec).
// Rewrap ANMF subframes as still WebP, use Chromium's existing still-image decoder,
// and compose the frame rectangles in sequence. No external scripts or WebCodecs.
function parseWebpContainer(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=i=>String.fromCharCode(...bytes.subarray(i,i+4));
  const u24=i=>bytes[i]+bytes[i+1]*256+bytes[i+2]*65536;
  const bad=()=>{throw Error('WebP 容器损坏或不受支持，未发送。');};
  if(bytes.length<12||tag(0)!=='RIFF'||tag(8)!=='WEBP')bad();
  const end=view.getUint32(4,true)+8;if(end!==bytes.length)bad();
  function chunks(start,stop){const out=[];for(let i=start;i<stop;){if(i+8>stop)bad();const len=view.getUint32(i+4,true),p=i+8,next=p+len+(len&1);if(next>stop)bad();out.push({tag:tag(i),p,len,start:i,end:next});i=next;if(out.length>2048)bad();}return out;}
  function dimensions(w,h){if(!w||!h||w>8192||h>8192||w*h>16000000)throw Error('图像尺寸超限。');}
  const top=chunks(12,end), ext=top.find(c=>c.tag==='VP8X'), anim=top.find(c=>c.tag==='ANIM');
  let w=0,h=0; if(ext){if(ext.len!==10)bad();w=u24(ext.p+4)+1;h=u24(ext.p+7)+1;dimensions(w,h);}
  const all=top.filter(c=>c.tag==='ANMF');
  if(!all.length){if(anim||(ext&&(bytes[ext.p]&2)))bad();const bit=top.find(c=>c.tag==='VP8 '||c.tag==='VP8L');if(!bit)bad();
    if(!w){if(bit.tag==='VP8L'){if(bit.len<5||bytes[bit.p]!==47)bad();const v=view.getUint32(bit.p+1,true);w=(v&16383)+1;h=((v>>>14)&16383)+1;}else{if(bit.len<10||bytes[bit.p+3]!==157||bytes[bit.p+4]!==1||bytes[bit.p+5]!==42)bad();w=view.getUint16(bit.p+6,true)&16383;h=view.getUint16(bit.p+8,true)&16383;}}dimensions(w,h);return {w,h,frames:[],repeats:0};}
  if(!ext||!(bytes[ext.p]&2)||!anim||anim.len!==6||all.length>300)bad();
  const loops=view.getUint16(anim.p+4,true);
  const frames=all.map(c=>{if(c.len<24)bad();const p=c.p,x=u24(p)*2,y=u24(p+3)*2,fw=u24(p+6)+1,fh=u24(p+9)+1,ms=u24(p+12),flags=bytes[p+15];dimensions(fw,fh);if(x+fw>w||y+fh>h||(flags&252))bad();const sub=chunks(p+16,p+c.len);const bit=sub.filter(s=>s.tag==='VP8 '||s.tag==='VP8L'),alpha=sub.filter(s=>s.tag==='ALPH');if(bit.length!==1||alpha.length>1||(alpha.length&&bit[0].tag!=='VP8 '))bad();return {x,y,w:fw,h:fh,ms,dispose:!!(flags&1),replace:!!(flags&2),bit:bit[0],alpha:alpha[0]};});
  return {w,h,frames,repeats:loops===0?Infinity:loops-1};
}
function wrapWebpStill(raw,f){
  const parts=[];if(f.alpha){const ext=new Uint8Array(18);ext.set([86,80,56,88,10,0,0,0,16],0);for(const [off,v] of [[12,f.w-1],[15,f.h-1]]){ext[off]=v&255;ext[off+1]=(v>>>8)&255;ext[off+2]=(v>>>16)&255;}parts.push(ext,raw.subarray(f.alpha.start,f.alpha.end));}parts.push(raw.subarray(f.bit.start,f.bit.end));
  const total=parts.reduce((a,p)=>a+p.length,12);const out=new Uint8Array(total);out.set([82,73,70,70,0,0,0,0,87,69,66,80]);new DataView(out.buffer).setUint32(4,total-8,true);let pos=12;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;
}
async function openCompatibleWebp(raw,signal){
  if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw Error('当前 Chromium 缺少 Canvas 或静态图片解码能力，未发送。');
  const info=parseWebpContainer(raw),{w,h,frames}=info;
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');if(!ctx)throw Error('无法初始化 Canvas，未发送。');
  let last=-1;const check=()=>{if(signal?.aborted)throw Error('媒体准备超时。');};
  const bitmap=async data=>{check();const img=await createImageBitmap(new Blob([data],{type:'image/webp'}));if(signal?.aborted){img.close();check();}return img;};
  return {tracks:{ready:Promise.resolve(),selectedTrack:{frameCount:frames.length||1,repetitionCount:info.repeats}},async decode({frameIndex:i}){
    if(i<0||i>=(frames.length||1))throw Error('WebP 帧索引无效。');check();
    if(!frames.length){const image=await bitmap(raw);Object.defineProperties(image,{displayWidth:{value:image.width},displayHeight:{value:image.height},duration:{value:100000}});return {image};}
    if(i<=last){ctx.clearRect(0,0,w,h);last=-1;}
    for(let j=last+1;j<=i;j++){
      check();if(j>0&&frames[j-1].dispose){const p=frames[j-1];ctx.clearRect(p.x,p.y,p.w,p.h);} // transparent background, as used by browser animation decoders
      const f=frames[j],im=await bitmap(wrapWebpStill(raw,f));try{if(im.width!==f.w||im.height!==f.h)throw Error('WebP 帧尺寸不匹配。');if(f.replace)ctx.clearRect(f.x,f.y,f.w,f.h);ctx.drawImage(im,f.x,f.y);}finally{im.close();}last=j;
    }
    const image=await createImageBitmap(canvas);Object.defineProperties(image,{displayWidth:{value:w},displayHeight:{value:h},duration:{value:Math.max(10,frames[i].ms)*1000}});return {image};
  },close(){canvas.width=1;canvas.height=1;}};
}
// GIF89a frame isolation for visual fingerprints only. Browser decodes LZW;
// the parser handles rectangles, palettes, transparency and disposal locally.
async function openCompatibleGif(raw,signal){
  const d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),bad=()=>{throw Error('GIF 容器无效');};
  const need=(p,n)=>{if(p+n>raw.length)bad();};
  if(raw.length<14||!/^GIF8[79]a$/.test(String.fromCharCode(...raw.subarray(0,6))))bad();
  const w=d.getUint16(6,true),h=d.getUint16(8,true);if(!w||!h||w*h>4000000)bad();
  const gct=raw[10]&128?3*(2**((raw[10]&7)+1)):0;let pos=13+gct;need(0,pos);
  const header=raw.slice(0,pos);let gce=null;const frames=[];let trailer=false;
  function blocks(){while(true){need(pos,1);const n=raw[pos++];if(!n)return;need(pos,n);pos+=n;}}
  while(pos<raw.length){const kind=raw[pos++];if(kind===59){trailer=true;break;}
    if(kind===33){need(pos,1);const label=raw[pos++];if(label===249){need(pos,6);if(raw[pos]!==4||raw[pos+5]!==0)bad();gce={flags:raw[pos+1],ms:d.getUint16(pos+2,true)*10,index:raw[pos+4]};if((gce.flags>>2&7)>3)bad();pos+=6;}else{if(label===1)bad();blocks();}continue;}
    if(kind!==44)bad();const start=pos-1;need(pos,9);const x=d.getUint16(pos,true),y=d.getUint16(pos+2,true),fw=d.getUint16(pos+4,true),fh=d.getUint16(pos+6,true),packed=raw[pos+8];if(!fw||!fh||x+fw>w||y+fh>h)bad();pos+=9;const lct=packed&128?3*(2**((packed&7)+1)):0;if(!lct&&!gct)bad();need(pos,lct+1);pos+=lct+1;blocks();frames.push({x,y,w:fw,h:fh,start,end:pos,gce:gce||{flags:0,ms:100,index:0}});gce=null;if(frames.length>300)bad();
  }
  if(!trailer||frames.length<2)bad();
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)bad();let last=-1,saved=null;
  const check=()=>{if(signal?.aborted)throw Error('媒体准备超时。');};
  const background=()=>{const n=raw[11]*3+13;if(gct&&n+2<13+gct)return `rgb(${raw[n]},${raw[n+1]},${raw[n+2]})`;return null;};
  function clearFrame(f){ctx.clearRect(f.x,f.y,f.w,f.h);if(!(f.gce.flags&1)&&background()){ctx.fillStyle=background();ctx.fillRect(f.x,f.y,f.w,f.h);}}
  function reset(){ctx.clearRect(0,0,w,h);if(!(frames[0].gce.flags&1)&&background()){ctx.fillStyle=background();ctx.fillRect(0,0,w,h);}last=-1;saved=null;}
  function still(f){const hd=header.slice(),v=new DataView(hd.buffer);v.setUint16(6,f.w,true);v.setUint16(8,f.h,true);const block=raw.slice(f.start,f.end);block.fill(0,1,5);const control=Uint8Array.of(33,249,4,f.gce.flags&1,0,0,f.gce.index,0);return new Blob([hd,control,block,Uint8Array.of(59)],{type:'image/gif'});}
  reset();
  return {tracks:{ready:Promise.resolve(),selectedTrack:{frameCount:frames.length}},async decode({frameIndex:i}){if(i<=last)reset();if(i<0||i>=frames.length)bad();for(let j=last+1;j<=i;j++){check();if(j>0){const prev=frames[j-1],disposal=prev.gce.flags>>2&7;if(disposal===2)clearFrame(prev);else if(disposal===3&&saved)ctx.putImageData(saved,prev.x,prev.y);}const f=frames[j];saved=(f.gce.flags>>2&7)===3?ctx.getImageData(f.x,f.y,f.w,f.h):null;const im=await createImageBitmap(still(f));try{check();if(im.width!==f.w||im.height!==f.h)bad();ctx.drawImage(im,f.x,f.y);}finally{im.close();}last=j;}const image=await createImageBitmap(canvas);Object.defineProperties(image,{displayWidth:{value:w},displayHeight:{value:h}});return {image};},close(){saved=null;canvas.width=1;canvas.height=1;}};
}

async function openWebpDecoder(raw,signal){
  if(typeof ImageDecoder!=='undefined'){
    let native;try{native=new ImageDecoder({data:raw,type:'image/webp',preferAnimation:true});await native.tracks.ready;if(!native.tracks.selectedTrack?.frameCount)throw Error('no frames');return native;}catch{try{native?.close();}catch{}}
  }
  return openCompatibleWebp(raw,signal);
}

async function prepareWebpFile(value) {
  const url=webpMediaURL(value); if(!url)throw Error('仅支持 GifSnap 与 KLIPY 已授权媒体域名的图片文件。');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),30000); let decoder;
  try {
    const res=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!res.ok||!res.body)throw Error('动图下载失败。');
    if(Number(res.headers.get('content-length'))>MEDIA_MAX){await res.body.cancel();throw Error('原始文件超过 8 MiB。');}
    const reader=res.body.getReader(); const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MEDIA_MAX){await reader.cancel();throw Error('原始文件超过 8 MiB。');}chunks.push(value);}}finally{reader.releaseLock();}
    const raw=new Uint8Array(size);let pos=0;for(const c of chunks){raw.set(c,pos);pos+=c.length;}
    // Determine the format from actual file bytes, not the URL suffix or a poster.
    const ascii=(a,b)=>String.fromCharCode(...raw.subarray(a,b));
    let mime='';
    if(size>=13 && /^(GIF87a|GIF89a)$/.test(ascii(0,6)))mime='image/gif';
    else if(size>=24 && raw[0]===137 && ascii(1,4)==='PNG' && raw[4]===13 && raw[5]===10 && raw[6]===26 && raw[7]===10)mime='image/png';
    else if(size>=4 && raw[0]===255 && raw[1]===216 && raw[2]===255)mime='image/jpeg';
    if(mime){
      // Native-compatible originals stay byte-for-byte unchanged, avoiding quality loss.
      if(typeof createImageBitmap==='function'){
        const bitmap=await createImageBitmap(new Blob([raw],{type:mime}));
        try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>16000000)throw Error('图像尺寸超限。');}finally{bitmap.close();}
      }
      if(controller.signal.aborted)throw Error('媒体准备超时。');
      let binary='';for(let i=0;i<raw.length;i+=16384)binary+=String.fromCharCode(...raw.subarray(i,i+16384));
      return {ok:true,data:btoa(binary),mime};
    }
    if(size<12||ascii(0,4)!=='RIFF'||ascii(8,12)!=='WEBP')throw Error('当前仅支持 GIF、PNG、JPEG 和 WebP 图片，其他格式未发送。');
    if(typeof OffscreenCanvas==='undefined')throw Error('当前 Chromium 缺少后台 Canvas，未发送。');
    decoder=await openWebpDecoder(raw,controller.signal);await decoder.tracks.ready;
    const track=decoder.tracks.selectedTrack,count=track?.frameCount||0;
    if(!count||count>180)throw Error('动画超过 180 帧或无法解码，未发送。');
    async function encode(maxSide){
      let canvas,ctx,enc,elapsed=0,delayRemainder=0;
      for(let i=0;i<count;i++){
        if(controller.signal.aborted)throw Error('媒体准备超时。');
        const {image}=await decoder.decode({frameIndex:i});
        try {
          if(!canvas){const sw=image.displayWidth,sh=image.displayHeight;if(!sw||!sh||sw*sh>16000000)throw Error('图像尺寸超限。');const scale=Math.min(1,maxSide/Math.max(sw,sh));canvas=new OffscreenCanvas(Math.max(1,Math.round(sw*scale)),Math.max(1,Math.round(sh*scale)));ctx=canvas.getContext('2d',{willReadFrequently:true});if(count>1)enc=createGifEncoder(canvas.width,canvas.height,track.repetitionCount);}
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
          if(count===1){const blob=await canvas.convertToBlob({type:'image/png'});if(blob.size>MEDIA_MAX)throw Error('PNG 过大。');return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/png',frames:1};}
          const ms=(image.duration??100000)/1000;elapsed+=ms;if(elapsed>30000)throw Error('动画超过 30 秒，未发送。');
          const exact=ms/10+delayRemainder;const delay=Math.max(2,Math.round(exact));delayRemainder=exact-delay;
          enc.frame(ctx.getImageData(0,0,canvas.width,canvas.height).data,delay);
        }finally{image.close();}
      }
      return {bytes:enc.finish(),mime:'image/gif',frames:count};
    }
    let output;for(const side of [640,480,320,240]){try{output=await encode(side);break;}catch(e){if(e.message!=='OUTPUT_LIMIT'||side===240)throw e;}}
    if(controller.signal.aborted)throw Error('媒体准备超时。');
    let binary='';for(let i=0;i<output.bytes.length;i+=16384)binary+=String.fromCharCode(...output.bytes.subarray(i,i+16384));
    return {ok:true,data:btoa(binary),mime:output.mime,frames:output.frames};
  } finally{clearTimeout(timer);try{decoder?.close();}catch{}}
}

async function fetchOnce(provider, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(request.url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) return httpFailure(response.status, provider.name);
    let payload;
    try { payload = await response.json(); }
    catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') throw error;
      return failure('BAD_RESPONSE', `${provider.name} 返回了无法识别的数据，请稍后重试。`);
    }
    return provider.parse(payload, request);
  } catch (error) {
    return controller.signal.aborted || error?.name === 'AbortError'
      ? failure('TIMEOUT', `${provider.name} 请求超时，请检查网络后重试。`, true)
      : failure('NETWORK_ERROR', `无法连接 ${provider.name}，请检查当前网络是否能访问该服务。`, true);
  } finally { clearTimeout(timeout); }
}
async function fetchWithRetry(provider, request) {
  let result = await fetchOnce(provider, request);
  if (result.retryable) {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    result = await fetchOnce(provider, request);
    return { ...result, attempts: 2 };
  }
  return { ...result, attempts: 1 };
}

function getLocalSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['giphyApiKey', 'giphyRating'], (stored) => resolve(stored || {}));
  });
}

function normalizeGif(raw) {
  const images = raw?.images || {};
  const id = String(raw?.id || '');
  const pageUrl = safeHttps(raw?.url) || (id ? `https://giphy.com/gifs/${encodeURIComponent(id)}` : '');
  const previewUrl = safeHttps(
    images.fixed_width_small?.url ||
    images.fixed_width?.url ||
    images.downsized_small?.url ||
    images.original?.url
  );
  const directUrl = safeHttps(images.original?.url || images.downsized?.url);
  if (!id || !pageUrl || !previewUrl) return null;
  return {
    id,
    title: String(raw?.title || 'GIF').slice(0, 180),
    pageUrl,
    sendUrl: pageUrl,
    directUrl,
    previewUrl,
    width: Number(images.fixed_width_small?.width || images.fixed_width?.width || images.original?.width || 0),
    height: Number(images.fixed_width_small?.height || images.fixed_width?.height || images.original?.height || 0),
    source: 'giphy',
    isDemo: false
  };
}

function safeHttps(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// First-run configuration is displayed in the verified chat UI rather than
// automatically opening chrome-extension:// in Steam's custom browser window.
let setupQueue = Promise.resolve();
function enqueueSetup(task) {
  const result = setupQueue.then(task);
  setupQueue = result.catch(() => {});
  return result;
}
function setupStorageGet() {
  return new Promise((resolve, reject) => chrome.storage.local.get(['giphyApiKey', 'sgpSetupShown'], data => {
    if (chrome.runtime.lastError) reject(new Error('storage unavailable'));
    else resolve(data || {});
  }));
}
function setupStorageSet(value) {
  return new Promise((resolve, reject) => chrome.storage.local.set({ sgpSetupShown: value }, () => {
    if (chrome.runtime.lastError) reject(new Error('storage unavailable'));
    else resolve();
  }));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SGP_SETUP_CLAIM' || message?.type === 'SGP_SETUP_RELEASE') {
    enqueueSetup(async () => {
      const stored = await setupStorageGet();
      if (message.type === 'SGP_SETUP_RELEASE') {
        await setupStorageSet(false);
        return { ok: true };
      }
      if (String(stored.giphyApiKey || '').trim() || stored.sgpSetupShown) return { ok: true, show: false };
      await setupStorageSet(true);
      return { ok: true, show: true };
    }).then(sendResponse, () => sendResponse({ ok: false, show: false }));
    return true;
  }
  if (message?.type === 'SGP_INSPECT_GIF_LINK') {
    inspectGifLink(message.url,message.warm === true).then(sendResponse,()=>sendResponse({ok:false,code:'PROBE_UNAVAILABLE'}));
    return true;
  }
  if (message?.type === 'SGP_PREPARE_WEBP') {
    prepareWebpFile(message.url).then(sendResponse, error => sendResponse(failure('MEDIA_ERROR',error?.message === 'OUTPUT_LIMIT' ? '转换后文件超过 8 MiB。' : String(error?.message || '媒体准备失败。').slice(0,160))));
    return true;
  }
  if (message?.type === 'SGP_GIFSNAP_FINGERPRINT') {
    fingerprintBatch(message.urls).then(sendResponse, () => sendResponse({ok:false}));
    return true;
  }
  if (!['SGP_GIPHY_FETCH','SGP_GIFSNAP_FETCH'].includes(message?.type)) return false;

  (async () => {
    const stored = await getLocalSettings();
    const provider = GIF_PROVIDERS[message.type === 'SGP_GIFSNAP_FETCH' ? 'gifsnap' : 'giphy'];
    const apiKey = String(stored.giphyApiKey || '').trim();
    if (provider.name === 'GIPHY' && !apiKey) {
      return { ok: false, code: 'NO_API_KEY', message: '请先在扩展设置中填写 GIPHY API Key。' };
    }

    return fetchWithRetry(provider, provider.buildRequest(message, stored));
  })().then(sendResponse).catch((error) => {
    sendResponse(failure('UNKNOWN', '扩展后台请求失败，请重试或重新加载扩展。'));
  });

  return true;
});
