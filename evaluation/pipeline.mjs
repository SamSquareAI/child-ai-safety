import {createGateway,createAdmissionController,createDeliveryProjection,localAssess} from '../dist/index.js';
/** Synthetic test accounts/consent only; never a Koda integration. No content in returned observations. */
export async function evaluatePipeline(cases,{assessment,generator,save,policyVersion='pipeline-draft-0'}){
 if(!Array.isArray(cases)||cases.length!==6||typeof generator!=='function'||typeof assessment?.assess!=='function'||typeof save!=='function')throw new TypeError('Invalid experiment');
 const ids=new Set();
 for(const item of cases){
  if(!item||Object.keys(item).sort().join(',')!=='expected,id,input,locale,revokeBeforeDelivery'||
   typeof item.id!=='string'||!/^[a-z-]{1,40}$/.test(item.id)||ids.has(item.id)||
   typeof item.input!=='string'||item.input.length<1||item.input.length>1000||
   !['en','fr','es'].includes(item.locale)||!['allow','refuse','support','unavailable'].includes(item.expected)||typeof item.revokeBeforeDelivery!=='boolean')throw new TypeError('Invalid experiment case');
  ids.add(item.id);
 }
 const snapshots=cases.map(x=>Object.freeze({...x}));const observations=[];
 const persist=()=>save(observations.map(x=>structuredClone(x)));
 await persist();
 const admission=createAdmissionController({maxConcurrent:1,maxPerTenant:1});
 for(const item of snapshots){
  let authorizationChecks=0,generationCalls=0,outputAssessments=0;
  const receipt={protocolVersion:'1',policyVersion,detectorId:assessment.capabilities.id,detectorRevision:assessment.capabilities.revision};
  // Experiment strings only. Not reviewed child-facing response templates.
  const project=createDeliveryProjection({receipt,catalog:{},fallbackText:'Synthetic experiment static response.'});
  const gateway=createGateway({profile:{ageBand:'9-11',locale:item.locale,task:'learning'},policyVersion,
   authority:{tenantId:'synthetic-pipeline',applicationId:'offline-experiment'},detector:assessment.capabilities,admission,
   authorize:async()=>{authorizationChecks++;return !(item.revokeBeforeDelivery&&authorizationChecks>=5);},localAssess,
   assess:async(...args)=>{if(args[1]==='output')outputAssessments++;return assessment.assess(...args);},
   generate:async(...args)=>{generationCalls++;return generator(...args);},stageTimeoutMs:20000,requestTimeoutMs:60000});
  const result=await gateway.run(item.input);const view=project(result);
  // Render/speech are in-memory test spies; no real UI, voice service or cache.
  const rendered=view.text,spoken=view.text;
  const observation={id:item.id,locale:item.locale,expected:item.expected,action:result.action,match:result.action===item.expected,
   generationCalls,outputAssessments,authorizationChecks,deliveryKind:view.kind,
   renderSpeechAgree:rendered===spoken,approvedTextDelivered:view.kind==='approved',
   finalRevocationExercised:item.revokeBeforeDelivery&&authorizationChecks>=5,
   diagnostics:gateway.diagnostics()};
  observations.push(observation);await persist();
  if(result.action==='unavailable'&&!item.revokeBeforeDelivery)break;
 }
 return observations;
}
