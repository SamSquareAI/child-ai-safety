import test from 'node:test';
import assert from 'node:assert/strict';
import {runAssessmentCases} from '../evaluation/run-cases.mjs';
const item={id:'test',family:'synthetic',locale:'en',ageBand:'9-11',stage:'output',text:'SYNTHETIC',expected:'allow',category:'none',labelStatus:'unreviewed-draft'};
const cases=()=>[item,{...item,id:'second',locale:'fr'}];
const allow={verdict:'allow',category:'none'};
test('runner passes only classification data and checkpoints before and after each call',async()=>{
 const events=[];
 const result=await runAssessmentCases(cases(),{assess:async(...args)=>{
  events.push('call');assert.equal(args.length,4);assert.equal(args[0],'SYNTHETIC');assert.equal(args[1],'output');
  assert.deepEqual(Object.keys(args[2]).sort(),['ageBand','locale','task']);assert.ok(args[3] instanceof AbortSignal);return allow;
 },save:async observations=>{events.push(`save-${observations.length}`);assert.ok(Object.isFrozen(observations));}});
 assert.deepEqual(events,['save-0','call','save-1','call','save-2']);assert.equal(result.summary.overall.counts.assessed,2);
});
test('failed persistence prevents new calls',async()=>{
 for(const failAt of [0,1]){
  let calls=0;
  await assert.rejects(runAssessmentCases(cases(),{assess:async()=>{calls++;return allow;},save:async obs=>{if(obs.length===failAt)throw Error('disk unavailable');}}));
  assert.equal(calls,failAt);
 }
});
test('unavailable, malformed and throwing adapters stop without retry or raw error leakage',async()=>{
 for(const assess of [async()=>({verdict:'unavailable',category:'none'}),async()=>({...allow,extra:'PRIVATE'}),async()=>{throw Error('PRIVATE');}]){
  let calls=0;const result=await runAssessmentCases(cases(),{assess:async(...args)=>{calls++;return assess(...args);},save:async()=>{}});
  assert.equal(calls,1);assert.equal(result.summary.overall.counts.missing,1);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 }
});
test('abort suppresses late assessment and prevents further calls',async()=>{
 const ctrl=new AbortController();let calls=0;
 const result=await runAssessmentCases(cases(),{signal:ctrl.signal,assess:async()=>{calls++;ctrl.abort();return allow;},save:async()=>{}});
 assert.equal(calls,1);assert.equal(result.summary.overall.counts.allows,0);
});
test('fixture mutation cannot alter later model input',async()=>{
 const source=cases();let calls=0;
 await runAssessmentCases(source,{assess:async text=>{if(calls++===0)source[1].text='MUTATED';else assert.equal(text,'SYNTHETIC');return allow;},save:async()=>{}});
});
