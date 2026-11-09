import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway,createAdmissionController} from '../dist/index.js';
const allow=async()=>({verdict:'allow',category:'none'});
function gateway(overrides={}) {
 return createGateway({profile:{ageBand:'9-11',locale:'en',task:'learning'},policyVersion:'draft-0',
  authority:{tenantId:'PRIVATE_TENANT',applicationId:'PRIVATE_APP'},
  detector:{protocolVersion:'1',id:'mock',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']},
  admission:createAdmissionController({maxConcurrent:2,maxPerTenant:1}),authorize:async()=>true,localAssess:allow,assess:allow,generate:async()=> 'approved',...overrides});
}
const total=g=>Object.values(g.diagnostics().counts).reduce((a,b)=>a+b,0);
test('diagnostics are immutable fixed-key snapshots without content or identifiers',async()=>{
 const g=gateway();const before=g.diagnostics();
 await g.run('PRIVATE_PROMPT');const after=g.diagnostics();
 assert.equal(before.counts.allowed,0);assert.equal(after.counts.allowed,1);
 assert.equal(after.byPhase.delivery.allowed,1);assert.equal(total(g),1);
 for(const object of [after,after.counts,after.byPhase,after.byPhase.delivery])assert.equal(Object.isFrozen(object),true);
 assert.equal(/PRIVATE_|approved|responseId|tenantId/.test(JSON.stringify(after)),false);
});
test('invalid wire and text inputs are counted once',async()=>{
 const g=gateway();await g.handle({protocolVersion:'2',input:'test'});await g.run('');
 assert.equal(g.diagnostics().counts.invalid_request,2);assert.equal(total(g),2);
});
for(const [reason,overrides,phase] of [
 ['authorization_denied',{authorize:async()=>false},'authorization'],
 ['adapter_error',{generate:async()=>{throw new Error('stage_timeout PRIVATE_ERROR');}},'generation'],
 ['invalid_generation',{generate:async()=>({text:'PRIVATE_OUTPUT'})},'generation'],
 ['invalid_assessment',{assess:async()=>({verdict:'allow',category:'none',extra:'PRIVATE'})},'remote_input'],
 ['detector_unavailable',{assess:async()=>({verdict:'unavailable',category:'none'})},'remote_input'],
 ['refused',{localAssess:async()=>({verdict:'refuse',category:'privacy'})},'local_input'],
 ['supported',{assess:async()=>({verdict:'support',category:'safeguarding'})},'remote_input']
])test(`diagnostics distinguish ${reason}`,async()=>{
 const g=gateway(overrides);const response=await g.run('synthetic');
 assert.equal(g.diagnostics().counts[reason],1);assert.equal(g.diagnostics().byPhase[phase][reason],1);assert.equal(total(g),1);
 assert.equal(/PRIVATE|stage_timeout/.test(JSON.stringify(response)),false);
});
test('stage deadline and request deadline have distinct internal counters',async()=>{
 for(const [reason,overrides] of [['stage_timeout',{stageTimeoutMs:15,requestTimeoutMs:500}],['request_timeout',{stageTimeoutMs:500,requestTimeoutMs:15}]]){
  const g=gateway({...overrides,generate:async()=>new Promise(()=>{})});
  assert.equal((await g.run('synthetic')).action,'unavailable');assert.equal(g.diagnostics().counts[reason],1);assert.equal(total(g),1);
 }
});
test('cancellation and capacity are distinct and never counted twice on late settlement',async()=>{
 let enter,finish;const entered=new Promise(r=>{enter=r;});
 const g=gateway({generate:async()=>{enter();return new Promise(r=>{finish=r;});}});
 const ctrl=new AbortController();const active=g.run('synthetic',ctrl.signal);await entered;
 await g.run('second');ctrl.abort();await active;
 const snap=g.diagnostics();assert.equal(snap.counts.cancelled,1);assert.equal(snap.counts.capacity,1);
 finish('late private candidate');await new Promise(r=>setImmediate(r));assert.equal(total(g),2);
 const pre=new AbortController();pre.abort();await g.run('third',pre.signal);assert.equal(g.diagnostics().counts.cancelled,2);
});
test('shared function callbacks retain correct remote-output phase attribution',async()=>{
 let calls=0;const same=async()=>++calls===4?{verdict:'refuse',category:'harm'}:{verdict:'allow',category:'none'};
 const g=gateway({localAssess:same,assess:same});await g.run('synthetic');
 assert.equal(g.diagnostics().byPhase.remote_output.refused,1);
});
