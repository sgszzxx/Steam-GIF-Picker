const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const base='https://media.gifsnap.com/gifs/';
function response(status,headers={},cancel){return {ok:status>=200&&status<300,status,headers:new Headers(headers),body:cancel?{cancel:async()=>cancel()}:null};}
function harness(queue,enabled=true){let listener;const calls=[];const chrome={runtime:{onMessage:{addListener(fn){listener=fn}}},storage:{local:{get(k,cb){cb({sgpWebpUpload:enabled})}}}};vm.runInNewContext(source,{chrome,URL,AbortController,Promise,Map,Date,setTimeout,clearTimeout,fetch:async(url,opts)=>{calls.push({url,...opts});assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');const r=queue.shift();assert.ok(r,'unexpected request');if(r==='network')throw Error('network');return r;}});return {calls,probe:(url=base+'fixture.gif',warm=false)=>new Promise(resolve=>listener({type:'SGP_INSPECT_GIF_LINK',url,warm},{},resolve))};}
(async()=>{
 let h=harness([response(200,{'Content-Type':'image/gif','Content-Length':'1133401'})]);let r=await h.probe();assert.equal(r.size,1133401);assert.equal(r.mime,'image/gif');assert.equal(h.calls[0].method,'HEAD');await h.probe();assert.equal(h.calls.length,1);
 h=harness([response(200,{'Content-Type':'image/gif','Content-Length':'2671403'})]);r=await h.probe();assert.equal(r.size,2671403);
 let cancelled=0;h=harness([response(405),response(206,{'Content-Type':'image/gif','Content-Length':'64','Content-Range':'bytes 0-63/2671403'},()=>cancelled++)]);r=await h.probe();assert.equal(r.size,2671403);assert.equal(h.calls[1].headers.Range,'bytes=0-63');assert.equal(cancelled,1);
 h=harness([response(200,{'Content-Type':'image/gif'}),response(200,{'Content-Type':'image/gif','Content-Length':'452677'},()=>cancelled++)]);r=await h.probe();assert.equal(r.size,452677);assert.equal(cancelled,2);
 h=harness([response(200,{'Content-Type':'image/gif'}),response(206,{'Content-Type':'image/gif','Content-Length':'64','Content-Range':'bytes 0-63/*'})]);assert.equal((await h.probe()).ok,false);
 h=harness([response(200,{'Content-Type':'image/webp','Content-Length':'12'})]);assert.equal((await h.probe()).mime,'image/webp');assert.equal(h.calls.length,1);
 h=harness(['network','network']);assert.equal((await h.probe()).ok,false);assert.equal(h.calls.length,2);
 h=harness([response(200,{'Content-Type':'image/gif','Content-Length':'100'})]);const a=await Promise.all([h.probe(undefined,true),h.probe()]);assert.equal(a[0].size,100);assert.equal(a[1].size,100);assert.equal(h.calls.length,1);
 h=harness([]);for(const u of ['https://evil.example/gifs/a.gif','https://media.gifsnap.com/not-gifs/a.gif','https://media.gifsnap.com/gifs/a.webp','http://media.gifsnap.com/gifs/a.gif'])assert.equal((await h.probe(u)).ok,false);assert.equal(h.calls.length,0);
 h=harness([response(200,{'Content-Type':'image/gif','Content-Length':'123'})],false);assert.equal((await h.probe()).size,123);assert.equal(h.calls.length,1);
 h=harness([response(200,{'Content-Type':'image/gif','Content-Length':'452677'})]);assert.equal((await h.probe('https://static.klipy.com/ii/fixture/1a/50/test.gif')).size,452677);assert.equal(h.calls.length,1);
 h=harness([]);for(const u of ['https://static.klipy.com.evil.example/ii/a.gif','https://static.klipy.com@evil.example/ii/a.gif','https://user@static.klipy.com/ii/a.gif','https://static.klipy.com:444/ii/a.gif','http://static.klipy.com/ii/a.gif','https://static.klipy.com/other/a.gif'])assert.equal((await h.probe(u)).ok,false);assert.equal(h.calls.length,0);
 console.log('PASS GIF probe: HEAD, Range total, ignored Range cancellation, unknown, MIME, network, cache/coalescing, URL allowlist, legacy disabled ignored');
})().catch(e=>{console.error(e);process.exitCode=1});
