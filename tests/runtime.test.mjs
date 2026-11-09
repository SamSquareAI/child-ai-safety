import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../dist/gateway.js';
import { createAdmissionController } from '../dist/admission.js';
import { validAssessment,validRequest,validResult,decodeRequest } from '../dist/protocol.js';
const allow={verdict:'allow',category:'none'};
const detector={protocolVersion:'1',id:'synthetic',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function options(overrides={}) {return {
 profile:{ageBand:'9-11',locale:'en',task:'learning'},policyVersion:'draft-0',
 authority:{tenantId:'tenant-a',applicationId:'app-a'},detector,
 admission:createAdmissionController({maxConcurrent:2,maxPerTenant:1}),
 authorize:async()=>true,localAssess:async()=>allow,assess:async()=>allow,generate:async()=> 'Synthetic approved answer.',...overrides
};}
test('versioned request rejects body-supplied authority and unsupported protocol',async()=>{
 let called=0;const g=createGateway(options({authorize:async()=>{called++;return true;}}));
 for(const request of [{protocolVersion:'2',input:'hello'},{protocolVersion:'1',input:'hello',tenantId:'other'},{protocolVersion:'1',input:'hello',profile:{}},{input:'hello'}]){
  assert.equal((await g.handle(request)).action,'unavailable');
 }
 assert.equal(called,0);
 const result=await g.handle({protocolVersion:'1',input:'hello'});
 assert.equal(result.action,'allow');assert.equal(validResult(result),true);
 assert.equal(result.detectorId,'synthetic');assert.equal(result.detectorRevision,'0');
});
test('protocol does not coerce values or strip properties',()=>{
 assert.equal(validRequest({protocolVersion:1,input:'hello'}),false);
 const input={verdict:'allow',category:'none',extra:1};assert.equal(validAssessment(input),false);assert.equal(input.extra,1);
 assert.equal(validResult({protocolVersion:'1',action:'allow',text:'hello',responseId:'en.refuse.harm',policyVersion:'0',detectorId:'x',detectorRevision:'0'}),false);
 assert.equal(validResult({protocolVersion:'1',action:'refuse',responseId:'en.support.harm',policyVersion:'0',detectorId:'x',detectorRevision:'0'}),false);
});
test('transport helper rejects bad UTF-8, oversized bodies, and authority fields',()=>{
 assert.equal(decodeRequest(new Uint8Array([255])),null);
 assert.equal(decodeRequest(new Uint8Array(16385)),null);
 assert.equal(decodeRequest(new TextEncoder().encode('{"protocolVersion":"1","input":"Hello","tenantId":"evil"}')),null);
 assert.deepEqual(decodeRequest(new TextEncoder().encode('{"protocolVersion":"1","input":"Hello"}')),{protocolVersion:'1',input:'Hello'});
});
test('Unicode code-point boundaries match the shared schema',async()=>{
 const g=createGateway(options());
 assert.equal((await g.handle({protocolVersion:'1',input:'🐻'.repeat(4000)})).action,'allow');
 assert.equal((await g.handle({protocolVersion:'1',input:'🐻'.repeat(4001)})).action,'unavailable');
});
test('configuration runtime schemas reject type coercion and extra authority',()=>{
 for(const delta of [{policyVersion:123},{authority:{tenantId:'a',applicationId:'b',admin:true}},{profile:{ageBand:'9-11',locale:'en',task:'learning',extra:true}}])
  assert.throws(()=>createGateway(options(delta)),/configuration/);
});
test('detector declares all required coverage; unsupported profiles never fall back',()=>{
 for(const delta of [{protocolVersion:'2'},{modality:'image'},{stages:['input']},{locales:['fr']},{ageBands:['6-8']},{locales:['en','en']}])
  assert.throws(()=>createGateway(options({detector:{...detector,...delta}})),/detector/);
});
test('snapshot cannot be changed through mutable capability arrays',async()=>{
 const mutable={...detector,locales:['en']};const g=createGateway(options({detector:mutable}));
 mutable.revision='changed';mutable.locales.length=0;
 assert.equal((await g.run('Hello')).detectorRevision,'0');
});
test('overall deadline bounds multiple individually valid stages',async()=>{
 let generated=false;
 const g=createGateway(options({stageTimeoutMs:100,requestTimeoutMs:20,
  authorize:async()=>{await pause(9);return true;},localAssess:async()=>{await pause(9);return allow;},generate:async()=>{generated=true;return 'never';}}));
 assert.equal((await g.run('Hello')).action,'unavailable');assert.equal(generated,false);
});
test('timed-out uncooperative work holds permit until it actually settles',async()=>{
 let resolve,entered;const ready=new Promise(r=>{entered=r;});let count=0;
 const g=createGateway(options({stageTimeoutMs:15,generate:async()=>{count++;entered();return new Promise(r=>{resolve=r;});}}));
 const first=g.run('First');await ready;assert.equal((await first).action,'unavailable');
 assert.equal((await g.run('Second')).action,'unavailable');assert.equal(count,1);
 resolve('Late answer');await pause(0);
 // Replace generator using a fresh instance with the same controller.
 const admission=createAdmissionController({maxConcurrent:1,maxPerTenant:1});
 const release=admission.acquire('a');assert.equal(admission.acquire('a'),null);release();release();
 const again=admission.acquire('a');assert.equal(typeof again,'function');again();
 // The original instance's recovered permit allows a third request to enter.
 const third=g.run('Third');await pause(0);assert.equal(count,2);resolve('Approved third');assert.equal((await third).action,'allow');
});
test('same tenant shares limits across applications; other tenant can proceed',async()=>{
 const admission=createAdmissionController({maxConcurrent:2,maxPerTenant:1});let entered,resolve;
 const ready=new Promise(r=>{entered=r;});
 const a=createGateway(options({admission,generate:async()=>{entered();return new Promise(r=>{resolve=r;});}}));
 const same=createGateway(options({admission,authority:{tenantId:'tenant-a',applicationId:'another-app'}}));
 const b=createGateway(options({admission,authority:{tenantId:'tenant-b',applicationId:'app-b'}}));
 const first=a.run('First');await ready;
 assert.equal((await same.run('Second')).action,'unavailable');assert.equal((await b.run('Other tenant')).action,'allow');
 resolve('Approved');assert.equal((await first).action,'allow');
});
test('global admission bound rejects another tenant when full',()=>{
 const c=createAdmissionController({maxConcurrent:1,maxPerTenant:1});const release=c.acquire('a');
 assert.equal(c.acquire('b'),null);release();const b=c.acquire('b');assert.equal(typeof b,'function');b();
});
test('early refusal returns capacity and contains no input',async()=>{
 const admission=createAdmissionController({maxConcurrent:1,maxPerTenant:1});
 const g=createGateway(options({admission,localAssess:async()=>({verdict:'refuse',category:'privacy'})}));
 for(let i=0;i<3;i++){const r=await g.run('SYNTHETIC_PRIVATE_DETAIL');assert.equal(r.action,'refuse');assert.equal(validResult(r),true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_DETAIL/);}
});
