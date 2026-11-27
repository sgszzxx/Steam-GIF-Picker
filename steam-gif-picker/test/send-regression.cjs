/* Unit tests for single-dispatch behavior; no Steam session. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');
const block = source.slice(source.indexOf('  function triggerSendOnce('),source.indexOf('  async function sendUrlToTarget('));
function run({local=false, type='submit', hasButton=true, hasForm=true, sameForm=true}={}) {
  const events=[];
  const form={requestSubmit(b){events.push(['submit',Boolean(b)])}};
  class Event { constructor(type,opts){this.type=type;Object.assign(this,opts)} preventDefault(){this.defaultPrevented=true} }
  const button=hasButton?{tagName:'BUTTON',type,form:hasForm&&sameForm?form:null,dispatchEvent(e){events.push(['click',Boolean(e.defaultPrevented)]);if(type==='submit'&&this.form&&!e.defaultPrevented)this.form.requestSubmit(this)}}:null;
  const composer={form:hasForm?form:null,closest:()=>hasForm?form:null,dispatchEvent(e){events.push([e.type,e.key])}};
  const ctx={findSendButton:()=>button,IS_LOCAL_TEST:local,MouseEvent:Event,KeyboardEvent:Event,window:{}};
  vm.createContext(ctx);vm.runInContext(block+'\nthis.call=triggerSendOnce;',ctx);
  return {method:ctx.call(composer),events};
}
for(const [config,method,events] of [
  [{},'button-click-no-submit',[['click',true]]],
  [{type:'button'},'button-click',[['click',false]]],
  [{local:true},'form-submit',[['submit',true]]],
  [{hasButton:false},'keyboard',[['keydown','Enter']]],
  [{local:true,sameForm:false},'form-submit',[['submit',false]]],
  [{local:true,hasForm:false},'button-click',[['click',false]]],
]) {const r=run(config);assert.equal(r.method,method);assert.deepEqual(r.events,events);assert.ok(r.events.length<=1);console.log('PASS',JSON.stringify(config),method||'no action');}
console.log('All send dispatch contract tests passed.');
