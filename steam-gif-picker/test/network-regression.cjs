/* Network classification and bounded retries; no external requests or credentials. */
const assert = require('node:assert/strict');
const vm = require('node:vm'); const fs = require('node:fs'); const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const good = {data:[{id:'fixture',url:'https://giphy.com/gifs/fixture',images:{original:{url:'https://media.giphy.com/media/fixture/giphy.gif'}}}],pagination:{total_count:1}};
const response = (status, body) => ({ok:status>=200&&status<300,status,json:async()=>body});
async function scenario(queue,key='fixture-only') {
  let listener, calls=0; const urls=[];
  const chrome = {runtime:{onMessage:{addListener(fn){listener=fn}}},storage:{local:{get(k,cb){cb({giphyApiKey:key,giphyRating:'pg-13'})}}}};
  vm.runInNewContext(source,{chrome,Promise,URL,AbortController,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms===12000?12:1),fetch:async(url,opts)=>{
    urls.push(url); const result=queue[calls++];assert.ok(result,'unexpected extra fetch');
    if(result==='timeout') return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'})),{once:true}));
    if(result==='network') throw new TypeError('fixture failure');
    return result;
  }});
  const result=await new Promise(resolve=>listener({type:'SGP_GIPHY_FETCH',query:'猫',offset:0,limit:25},{},resolve));
  assert.equal(calls,queue.length); assert.ok(!JSON.stringify(result).includes('fixture-only'));
  if(calls) {const u=new URL(urls[0]);assert.equal(u.host,'api.giphy.com');assert.equal(u.searchParams.get('q'),'猫');}
  return result;
}
(async()=>{
  let r=await scenario(['timeout',response(200,good)]);assert.equal(r.ok,true);assert.equal(r.attempts,2);assert.equal(r.items[0].id,'fixture');
  r=await scenario(['timeout','timeout']);assert.equal(r.code,'TIMEOUT');assert.equal(r.attempts,2);
  r=await scenario(['network','network']);assert.equal(r.code,'NETWORK_ERROR');
  r=await scenario([response(503,{}),response(200,good)]);assert.equal(r.ok,true);assert.equal(r.attempts,2);
  for(const status of [401,403,429,400]){r=await scenario([response(status,{})]);assert.equal(r.code,({401:'API_AUTH',403:'API_AUTH',429:'RATE_LIMIT',400:'BAD_REQUEST'})[status]);assert.equal(r.attempts,1);}
  r=await scenario([response(200,{meta:{status:429}})]);assert.equal(r.code,'RATE_LIMIT');
  r=await scenario([response(200,{data:[],pagination:{total_count:0}})]);assert.equal(r.ok,true);assert.equal(r.items.length,0);
  r=await scenario([response(200,{unexpected:true})]);assert.equal(r.code,'BAD_RESPONSE');
  r=await scenario([response(200,{data:[{}]})]);assert.equal(r.code,'BAD_RESPONSE');
  r=await scenario([], '');assert.equal(r.code,'NO_API_KEY');
  console.log('PASS bounded timeout/network/5xx retry, auth/quota/no-key, invalid and empty response classification');
})().catch(e=>{console.error(e);process.exitCode=1});
