/* First-run state contract, no live Steam or GIPHY calls. */
const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const store={};let listener;const chrome={runtime:{onMessage:{addListener(fn){listener=fn}}},storage:{local:{get(keys,cb){setImmediate(()=>cb({...store}))},set(obj,cb){setImmediate(()=>{Object.assign(store,obj);cb()})}}}};
vm.runInNewContext(source,{chrome,Promise,URL,setTimeout,clearTimeout,AbortController});
const send=type=>new Promise(resolve=>assert.equal(listener({type},{},resolve),true));
(async()=>{let a=await Promise.all([send('SGP_SETUP_CLAIM'),send('SGP_SETUP_CLAIM')]);assert.equal(a.filter(x=>x.show).length,1);assert.equal((await send('SGP_SETUP_CLAIM')).show,false);await send('SGP_SETUP_RELEASE');assert.equal((await send('SGP_SETUP_CLAIM')).show,true);await send('SGP_SETUP_RELEASE');store.giphyApiKey='fixture';assert.equal((await send('SGP_SETUP_CLAIM')).show,false);console.log('PASS onboarding once across windows, release and skip existing API key')})().catch(e=>{console.error(e);process.exitCode=1});
