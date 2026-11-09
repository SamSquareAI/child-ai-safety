import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {evaluatePipeline} from '../evaluation/pipeline.mjs';
import {pipelineBudget} from '../evaluation/pipeline-budget.mjs';
const cases=JSON.parse(readFileSync(new URL('../evaluation/pipeline-cases.json',import.meta.url)));
const capabilities={protocolVersion:'1',id:'mock',revision:'0',modality:'text',locales:['en','fr','es'],ageBands:['9-11'],stages:['input','output']};
const allow={verdict:'allow',category:'none'};
const options=()=>({assessment:{capabilities,assess:async(text,stage)=>stage==='input'&&text.includes('weapon')?{verdict:'refuse',category:'harm'}:allow},generator:async()=> 'SYNTHETIC_CANDIDATE',save:async()=>{}});
test('pipeline experiment exercises generation, input blocks, final revocation and content-free evidence',async()=>{
 const checkpoints=[];const observations=await evaluatePipeline(cases,{...options(),save:async x=>checkpoints.push(x)});
 assert.equal(observations.length,6);assert.ok(observations.every(x=>x.match&&x.renderSpeechAgree));
 assert.equal(observations.find(x=>x.id==='dangerous-request').generationCalls,0);
 assert.equal(observations.find(x=>x.id==='disclosure').generationCalls,0);
 const revoked=observations.find(x=>x.id==='consent-revoked');assert.equal(revoked.finalRevocationExercised,true);assert.equal(revoked.approvedTextDelivered,false);
 assert.equal(revoked.outputAssessments,1);assert.equal(JSON.stringify(checkpoints).includes('SYNTHETIC_CANDIDATE'),false);
 assert.deepEqual(checkpoints.map(x=>x.length),[0,1,2,3,4,5,6]);
});
test('persistence failure prevents any generation or assessment',async()=>{
 let calls=0;const opt=options();opt.assessment.assess=async()=>{calls++;return allow;};
 await assert.rejects(evaluatePipeline(cases,{...opt,save:async()=>{throw Error('disk');}}));assert.equal(calls,0);
});
test('infrastructure unavailability stops the experiment and never records raw candidates',async()=>{
 const observations=await evaluatePipeline(cases,{...options(),generator:async()=>null});
 assert.equal(observations.length,1);assert.equal(observations[0].action,'unavailable');assert.equal(observations[0].deliveryKind,'static');
});
test('pipeline budget rejects unverified prior reports',()=>{
 assert.throws(()=>pipelineBudget(Buffer.from('{}'),Buffer.from('{}')));
});
test('live runner defaults to dry-run and cannot execute without a key',()=>{
 const run=args=>spawnSync(process.execPath,['scripts/claude-pipeline.mjs',...args],{encoding:'utf8',env:{...process.env,ANTHROPIC_API_KEY:''}});
 const plan=run([]);assert.equal(plan.status,0,plan.stderr);const parsed=JSON.parse(plan.stdout);
 assert.equal(parsed.executed,false);assert.equal(parsed.maxCalls,18);
 if(parsed.budget)assert.equal(parsed.budget.totalReservedMicroUsd,9_035_520);
 for(const args of [['--execute'],['--execute','--dry-run'],['--unknown']])assert.equal(run(args).status,1);
});
