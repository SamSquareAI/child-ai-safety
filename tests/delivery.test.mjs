import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeliveryProjection} from '../dist/delivery.js';
import {createGateway,createAdmissionController} from '../dist/index.js';
const receipt={protocolVersion:'1',policyVersion:'draft-0',detectorId:'mock',detectorRevision:'0'};
const config=()=>({receipt:{...receipt},catalog:{'en.refuse.harm':'Reviewed static refusal.','en.support.safeguarding':'Reviewed static support.'},fallbackText:'Reviewed static unavailability.'});
const projection=()=>createDeliveryProjection(config());
test('only matching approved results expose their complete text for plain-text rendering',()=>{
 const view=projection()({...receipt,action:'allow',text:'Approved answer.'});
 assert.deepEqual(view,{kind:'approved',format:'plain-text',text:'Approved answer.'});assert.ok(Object.isFrozen(view));
});
test('refusal and support select trusted static messages, malformed or missing entries use fallback',()=>{
 const project=projection();
 assert.equal(project({...receipt,action:'refuse',responseId:'en.refuse.harm'}).text,'Reviewed static refusal.');
 assert.equal(project({...receipt,action:'support',responseId:'en.support.safeguarding'}).text,'Reviewed static support.');
 for(const candidate of [null,{}, {...receipt,action:'refuse',responseId:'en.refuse.harm',text:'REJECTED'},
  {...receipt,action:'unavailable',responseId:'en.unavailable.none'},
  {...receipt,policyVersion:'stale',action:'allow',text:'REJECTED'},
  {...receipt,detectorRevision:'other',action:'allow',text:'REJECTED'},
  {...receipt,action:'allow',text:'REJECTED',rawError:'PRIVATE'}]){
  const view=project(candidate);assert.equal(view.kind,'static');assert.equal(view.text,'Reviewed static unavailability.');
 }
});
test('catalog and receipt configuration are snapshots; accessors and unbounded catalogs rejected',()=>{
 const cfg=config();const project=createDeliveryProjection(cfg);cfg.receipt.policyVersion='changed';cfg.catalog['en.refuse.harm']='CHANGED';
 assert.equal(project({...receipt,action:'refuse',responseId:'en.refuse.harm'}).text,'Reviewed static refusal.');
 for(const delta of [{fallbackText:''},{catalog:{'en.refuse.harm':'x'.repeat(8001)}},{catalog:{bad:'text'}},{receipt:{...receipt,extra:true}}])assert.throws(()=>createDeliveryProjection({...config(),...delta}),TypeError);
 let called=false;const catalog={};Object.defineProperty(catalog,'en.refuse.harm',{enumerable:true,get(){called=true;return 'SECRET';}});
 assert.throws(()=>createDeliveryProjection({...config(),catalog}),TypeError);assert.equal(called,false);
});
test('generated rejected content is never projected to render or speech buffers',async()=>{
 const g=createGateway({profile:{ageBand:'9-11',locale:'en',task:'learning'},policyVersion:'draft-0',
  authority:{tenantId:'synthetic',applicationId:'test'},detector:{protocolVersion:'1',id:'mock',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']},
  admission:createAdmissionController({maxConcurrent:1,maxPerTenant:1}),authorize:async()=>true,
  localAssess:async()=>({verdict:'allow',category:'none'}),assess:async(_text,stage)=>stage==='output'?{verdict:'refuse',category:'harm'}:{verdict:'allow',category:'none'},
  generate:async()=> 'REJECTED_CANDIDATE_NEVER_DELIVER'});
 const raw=await g.run('Synthetic input');const view=projection()(raw);
 const rendered=[],spoken=[];rendered.push(view.text);spoken.push(view.text);
 assert.equal(JSON.stringify([raw,view,rendered,spoken]).includes('REJECTED_CANDIDATE'),false);
 assert.deepEqual(rendered,['Reviewed static refusal.']);assert.deepEqual(spoken,rendered);
});
