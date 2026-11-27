/* Public API contract fixtures; no live credentials or network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const calls=[];let listener;let queue=[];
const chrome={runtime:{onMessage:{addListener(fn){listener=fn}}},storage:{local:{get(k,cb){cb({giphyApiKey:'old-key-kept'})}}}};
vm.runInNewContext(source,{chrome,URL,Promise,AbortController,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms===12000?30:1),fetch:async(url,opts)=>{calls.push(url);let r=queue.shift();if(r==='network')throw new TypeError();return {ok:r.status===200,status:r.status,json:async()=>r.body}}});
const request=(q,offset=0,limit=25)=>new Promise(resolve=>listener({type:'SGP_GIFSNAP_FETCH',query:q,offset,limit},{},resolve));
const item={id:'abc',content_id:'verified-same-clip',title:'cat',url:'https://cdn.example.com/a.gif?x=1',preview_url:'https://cdn.example.com/poster.jpg',animated_preview:{animated:true,mime_type:'image/webp',url:'https://cdn.example.com/a.webp'},source:'fixture'};
(async()=>{
 queue=[{status:200,body:{data:[item],pagination:{has_next:true,next_page:2}}}];let r=await request('猫');assert.equal(r.ok,true);assert.equal(r.items[0].id,'gifsnap:abc');assert.equal(r.items[0].contentId,'verified-same-clip');assert.equal(r.items[0].previewUrl,item.animated_preview.url);assert.equal(r.items[0].sendUrl,item.url);assert.equal(r.nextOffset,25);let u=new URL(calls.at(-1));assert.equal(u.pathname,'/api/v1/gifs/search');assert.equal(u.searchParams.get('q'),'猫');assert.equal(u.searchParams.get('page'),'1');assert.ok(!u.href.includes('old-key-kept'));assert.equal(u.searchParams.has('community'),false);
 queue=[{status:200,body:{data:[{...item,id:'second',animated_preview:{animated:true,mime_type:'video/mp4',url:'https://cdn.example.com/a.mp4'}}],pagination:{has_next:false}}}];r=await request('猫',25);assert.equal(r.items[0].previewUrl,item.url);assert.equal(new URL(calls.at(-1)).searchParams.get('page'),'2');assert.equal(r.hasMore,false);
 queue=[{status:200,body:{data:[{...item,id:'ugc_bad'},{...item,id:'private',url:'https://127.0.0.1/a.gif'}],pagination:{has_next:false}}}];r=await request('');assert.equal(r.code,'BAD_RESPONSE');assert.equal(new URL(calls.at(-1)).pathname,'/api/v1/gifs/trending');
 queue=['network',{status:200,body:{data:[],pagination:{has_next:false}}}];r=await request('');assert.equal(r.ok,true);assert.equal(r.attempts,2);assert.equal(r.items.length,0);
 queue=[{status:429,body:{}}];r=await request('');assert.equal(r.code,'RATE_LIMIT');assert.equal(r.attempts,1);
 console.log('PASS GifSnap keyless request, isolated source, pagination, media selection, rejection, retry and quota');
})().catch(e=>{console.error(e);process.exitCode=1});
