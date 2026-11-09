import test from 'node:test';
import assert from 'node:assert/strict';
import {createClaudeGenerator} from '../dist/claude-generation.js';
import {createClaudeAssessmentAdapter,CLAUDE_ASSESSMENT_OUTPUT_CONTRACT,createGateway,createAdmissionController,createDeliveryProjection} from '../dist/index.js';
const model='synthetic-model',allow={verdict:'allow',category:'none'};
const envelope=text=>new Response(JSON.stringify({model,type:'message',role:'assistant',stop_reason:'end_turn',content:[{type:'text',text}]}),{headers:{'content-type':'application/json'}});
function setup({output='Synthetic answer',inputAssessment=allow,outputAssessment=allow,authorization=()=>true}={}){
 const events=[];
 const common={apiKey:'synthetic-not-real',model,apiVersion:'2026-10-21',timeoutMs:200,maxOutputTokens:128,maxRequestBytes:8192,maxResponseBytes:16384};
 const assess=createClaudeAssessmentAdapter({...common,systemPolicy:`Draft rules. ${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`,
  capabilities:{protocolVersion:'1',id:'synthetic',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']},
  fetch:async(_url,init)=>{const body=JSON.parse(new TextDecoder().decode(init.body));const data=JSON.parse(body.messages[0].content);events.push(`assessment-${data.stage}`);return envelope(JSON.stringify(data.stage==='input'?inputAssessment:outputAssessment));}});
 const generate=createClaudeGenerator({...common,systemPolicy:'Draft generation rules. Produce a short learning answer.',fetch:async()=>{events.push('generation');return envelope(output);}});
 const receipt={protocolVersion:'1',policyVersion:'draft-0',detectorId:'synthetic',detectorRevision:'0'};
 const project=createDeliveryProjection({receipt,catalog:{'en.refuse.harm':'Reviewed refusal.'},fallbackText:'Reviewed unavailable.'});
 const gateway=createGateway({profile:{ageBand:'9-11',locale:'en',task:'learning'},policyVersion:'draft-0',authority:{tenantId:'test',applicationId:'test'},
  detector:assess.capabilities,admission:createAdmissionController({maxConcurrent:1,maxPerTenant:1}),authorize:async()=>{events.push('authorize');return authorization();},
  localAssess:async(_text,stage)=>{events.push(`local-${stage}`);return allow;},assess:assess.assess,generate});
 return {gateway,events,project};
}
test('both Claude wire adapters compose through gateway and delivery in the required order',async()=>{
 const {gateway,events,project}=setup();const result=await gateway.run('Synthetic question');
 assert.equal(result.action,'allow');assert.deepEqual(project(result),{kind:'approved',format:'plain-text',text:'Synthetic answer'});
 assert.deepEqual(events,['authorize','local-input','authorize','assessment-input','authorize','generation','local-output','authorize','assessment-output','authorize']);
});
test('remote input refusal prevents generation and narration candidate',async()=>{
 const {gateway,events,project}=setup({inputAssessment:{verdict:'refuse',category:'harm'}});
 const result=await gateway.run('Synthetic question');assert.equal(project(result).text,'Reviewed refusal.');assert.equal(events.includes('generation'),false);
});
test('remote output refusal discards the generated candidate before delivery',async()=>{
 const {gateway,events,project}=setup({output:'PRIVATE_REJECTED_CANDIDATE',outputAssessment:{verdict:'refuse',category:'harm'}});
 const result=await gateway.run('Synthetic question');assert.ok(events.includes('generation'));assert.equal(project(result).kind,'static');
 assert.equal(JSON.stringify([result,project(result)]).includes('PRIVATE_REJECTED'),false);
});
test('final consent denial suppresses fully assessed generated text',async()=>{
 let authorizations=0;
 const {gateway,events,project}=setup({output:'PRIVATE_LATE_CANDIDATE',authorization:()=>++authorizations<5});
 const result=await gateway.run('Synthetic question');assert.equal(result.action,'unavailable');assert.equal(events.includes('assessment-output'),true);
 assert.equal(JSON.stringify([result,project(result)]).includes('PRIVATE_LATE'),false);
});
