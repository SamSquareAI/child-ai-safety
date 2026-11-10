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

// Synthetic consistency fixtures only: these are not real independent approvals.
import {createHash} from 'node:crypto';
import {createDeploymentDeliveryProjection,createResearchDeliveryProjection,deliveryCatalogSha256,requiredDeliveryResponseKeys} from '../dist/delivery.js';
import {validResult} from '../dist/protocol.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
async function deployment(enabledLocales=['en','fr','es']){
 const catalog=Object.fromEntries(enabledLocales.flatMap(locale=>requiredDeliveryResponseKeys(locale).map(key=>[key,`SYNTHETIC ${key}`])));
 const cfg={receipt:{...receipt},catalog,enabledLocales,catalogVersion:'synthetic-v1',authorRef:'urn:test:author',
  catalogSha256:'',evidence:[{id:'synthetic-evidence',ref:'urn:test:evidence',content:'SYNTHETIC review fixture; no actual review.',sha256:''}],reviews:[]};
 cfg.catalogSha256=await deliveryCatalogSha256({catalogVersion:cfg.catalogVersion,receipt:cfg.receipt,enabledLocales,catalog});
 cfg.evidence[0].sha256=digest(cfg.evidence[0].content);
 cfg.reviews=['safeguarding','native-language'].map(role=>({reviewerRef:`urn:test:${role}`,independent:true,decision:'approved',role,
  evidenceId:cfg.evidence[0].id,evidenceSha256:cfg.evidence[0].sha256,catalogVersion:cfg.catalogVersion,catalogSha256:cfg.catalogSha256,locales:[...enabledLocales]}));
 return cfg;
}
test('research mode remains explicit, synchronous and compatible with empty catalogs',()=>{
 assert.equal(createResearchDeliveryProjection,createDeliveryProjection);
 assert.equal(createDeliveryProjection({...config(),catalog:{}})({...receipt,action:'support',responseId:'fr.support.harm'}).text,config().fallbackText);
});
test('deployment coverage equals every runtime-schema static key, including critical support',async()=>{
 const cfg=await deployment();const project=await createDeploymentDeliveryProjection(cfg);
 for(const locale of cfg.enabledLocales){
  const expected=[];
  for(const action of ['refuse','support','unavailable'])for(const category of ['none','privacy','harm','safeguarding','relational']){
   const responseId=`${locale}.${action}.${category}`,result={...receipt,action,responseId};
   if(validResult(result)){
    expected.push(responseId);assert.equal(project(result,locale).text,cfg.catalog[responseId]);
   }
  }
  assert.deepEqual([...requiredDeliveryResponseKeys(locale)].sort(),expected.sort());assert.equal(expected.length,9);
 }
 // Each missing key must block even if the remaining catalog is freshly rebound.
 for(const key of Object.keys(cfg.catalog)){
  const bad=structuredClone(cfg);delete bad.catalog[key];
  bad.catalogSha256=await deliveryCatalogSha256({catalogVersion:bad.catalogVersion,receipt:bad.receipt,enabledLocales:bad.enabledLocales,catalog:bad.catalog});
  for(const r of bad.reviews)r.catalogSha256=bad.catalogSha256;
  await assert.rejects(createDeploymentDeliveryProjection(bad),TypeError,key);
 }
});
test('strict deployment rejects missing, unsupported or mismatched scope and review evidence',async()=>{
 const cases=[
  c=>{delete c.catalog;},c=>{c.catalog={};},c=>{c.enabledLocales=[];},c=>{delete c.enabledLocales;},
  c=>{c.enabledLocales=['de'];},c=>{c.enabledLocales=['en','en'];},
  c=>{c.enabledLocales=['en',,];},c=>{c.reviews[0].locales=['en',,];},
  c=>{c.catalog['en.support.safeguarding']='Changed without review';},
  c=>{c.catalog['en.support.none']='Invalid runtime key';},
  c=>{c.catalog['de.support.harm']='Unsupported';},c=>{c.catalog['en.support.harm']=' ';},
  c=>{c.catalogVersion='new-version';},c=>{c.receipt.policyVersion='new-policy';},
  c=>{c.catalogSha256='x'.repeat(64);},c=>{c.reviews=[];},c=>{c.evidence=[];},
  c=>{c.reviews.pop();},c=>{delete c.reviews[0].independent;},c=>{c.reviews[0].independent=false;},
  c=>{c.reviews[0].decision='pending';},c=>{c.reviews[0].reviewerRef=c.authorRef;},
  c=>{c.reviews[0].reviewerRef='unqualified free text';},c=>{c.authorRef='';},
  c=>{c.reviews[0].catalogVersion='stale';},c=>{c.reviews[0].catalogSha256='0'.repeat(64);},
  c=>{c.reviews[0].locales=['en'];},c=>{c.reviews[0].locales=['de'];},
  c=>{c.reviews[0].evidenceId='missing';},c=>{c.reviews[0].evidenceSha256='0'.repeat(64);},
  c=>{c.evidence[0].content='Altered';},c=>{c.evidence[0].ref='https://user:password@example.test/evidence';},
  c=>{c.evidence.push({...c.evidence[0]});},c=>{delete c.reviews[0].reviewerRef;},
  c=>{c.reviews[0].unexpected=true;},c=>{c.evidence[0].sha256='';}
 ];
 for(const mutate of cases){const c=await deployment();mutate(c);await assert.rejects(createDeploymentDeliveryProjection(c),TypeError,String(mutate));}
});
test('strict projection binds runtime locale and preserves locale-specific fallback and receipt checks',async()=>{
 const cfg=await deployment(['en','fr']);const project=await createDeploymentDeliveryProjection(cfg);
 assert.equal(project({...receipt,action:'support',responseId:'fr.support.harm'},'fr').text,'SYNTHETIC fr.support.harm');
 for(const result of [null,{}, {...receipt,action:'support',responseId:'en.support.harm'},
  {...receipt,action:'support',responseId:'es.support.harm'},
  {...receipt,policyVersion:'stale',action:'allow',text:'REJECTED'},
  {...receipt,action:'support',responseId:'fr.support.safeguarding',text:'REJECTED'}]){
  assert.deepEqual(project(result,'fr'),{kind:'static',format:'plain-text',text:'SYNTHETIC fr.unavailable.none'});
 }
 assert.equal(project({...receipt,action:'allow',text:'Approved.'},'fr').text,'Approved.');
 assert.throws(()=>project({...receipt,action:'allow',text:'REJECTED'},'es'),TypeError);
 assert.throws(()=>project(null),TypeError);
});
test('deployment snapshots before asynchronous hashing and rejects getters without invoking them',async()=>{
 const cfg=await deployment(['fr']);const pending=createDeploymentDeliveryProjection(cfg);
 cfg.catalog['fr.support.safeguarding']='CHANGED';cfg.reviews.length=0;cfg.enabledLocales.push('es');cfg.receipt.policyVersion='changed';
 const project=await pending;
 assert.equal(project({...receipt,action:'support',responseId:'fr.support.safeguarding'},'fr').text,'SYNTHETIC fr.support.safeguarding');
 const bad=await deployment();let called=false;
 Object.defineProperty(bad.reviews[0],'independent',{get(){called=true;return true;}});
 await assert.rejects(createDeploymentDeliveryProjection(bad),TypeError);assert.equal(called,false);
});
test('catalog bindings are deterministic across key and locale order and bind the exact receipt',async()=>{
 const c=await deployment();
 const binding={catalogVersion:c.catalogVersion,receipt:c.receipt,enabledLocales:[...c.enabledLocales].reverse(),catalog:Object.fromEntries(Object.entries(c.catalog).reverse())};
 assert.equal(await deliveryCatalogSha256(binding),c.catalogSha256);
 binding.receipt={...receipt,detectorRevision:'changed'};
 assert.notEqual(await deliveryCatalogSha256(binding),c.catalogSha256);
});
