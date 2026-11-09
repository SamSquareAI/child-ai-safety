import {validAssessment} from '../dist/protocol.js';
import {summarizeAssessments} from './report.mjs';

/** Sequential, bounded evaluation; injected assess/save are trusted local code. */
export async function runAssessmentCases(cases,{assess,save,signal=new AbortController().signal}={}){
 if(!Array.isArray(cases)||cases.length<1||cases.length>48||typeof assess!=='function'||typeof save!=='function'||!(signal instanceof AbortSignal))throw new TypeError('Invalid batch configuration');
 summarizeAssessments(cases,[]);
 // Snapshot fixtures so a callback cannot change later model inputs or labels.
 const snapshot=cases.map(item=>Object.freeze({...item}));
 const observations=[];
 const checkpoint=()=>save(Object.freeze(observations.map(item=>Object.freeze({...item, ...('assessment' in item?{assessment:Object.freeze({...item.assessment})}:{})}))));
 await checkpoint(); // Persistence failure prevents even the first paid call.
 for(const item of snapshot){
  if(signal.aborted)break;
  let assessment;
  try{assessment=await assess(item.text,item.stage,Object.freeze({ageBand:item.ageBand,locale:item.locale,task:'learning'}),signal);}
  catch{observations.push({id:item.id,error:'unavailable'});await checkpoint();break;}
  if(!validAssessment(assessment)){observations.push({id:item.id,error:'unavailable'});await checkpoint();break;}
  if(signal.aborted){observations.push({id:item.id,error:'unavailable'});await checkpoint();break;}
  observations.push({id:item.id,assessment:{verdict:assessment.verdict,category:assessment.category}});
  await checkpoint(); // No next call if saving partial progress fails.
  if(assessment.verdict==='unavailable')break;
 }
 return Object.freeze({observations:Object.freeze(observations),summary:summarizeAssessments(snapshot,observations)});
}
