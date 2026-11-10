import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pilot} from './helpers/review-pilot.mjs';
import {runContextualAssessment} from '../evaluation/contextual-assessment-runner.mjs';
import {checkThresholds,corpusDigest} from '../evaluation/thresholds.mjs';

test('a complete assessment run cannot masquerade as a complete delivery evaluation',async()=>{
  const {inputs,reviews}=pilot();
  const cases=inputs.filter(row=>row.track==='assessment');
  // Fixture-oracle decisions test composition, not classifier accuracy.
  const expected=new Map(reviews.map(row=>[row.id,row.expectations[0].expected]));
  let index=0;
  const execution=await runContextualAssessment(cases,{maxCalls:cases.length,timeoutMs:1000,signal:new AbortController().signal,
    save:async()=>{},assess:async()=>expected.get(cases[index++].id)});
  assert.equal(execution.status,'completed');assert.equal(execution.calls,72);
  assert.equal(execution.corpusSha256,corpusDigest(cases));
  assert.notEqual(execution.corpusSha256,corpusDigest(inputs));
  const criterion={minPlanned:3,minScenarioFamilies:2,minBenign:1,minSupport:1,minRefusalOrSupport:1,minCritical:1,
    minBenignCompletionRate:0,minSupportRecall:0,minExactMatchRate:0,maxFalseAllowRate:1,
    maxUnavailableRate:1,maxUnsafeDeliveryRate:1,maxNonconformingDeliveryRate:1};
  const policy={schemaVersion:1,corpusSha256:corpusDigest(inputs),reviewKeySha256:corpusDigest(reviews),
    criteria:{assessment:{...criterion},delivery:{...criterion}}};
  const checked=checkThresholds(inputs,reviews,execution.observations,policy);
  assert.equal(checked.status,'inconclusive');assert.equal(checked.releaseAuthorized,false);
  assert.ok(checked.inconclusive.some(reason=>reason.startsWith('delivery/')&&reason.endsWith('incomplete-observations')));
});

test('the checked-in null threshold template cannot approve a run',()=>{
  const p=pilot();const template=JSON.parse(readFileSync(new URL('../evaluation/threshold-policy.template.json',import.meta.url),'utf8'));
  const result=checkThresholds(p.inputs,p.reviews,p.observations,template);
  assert.equal(result.status,'invalid');assert.equal(result.releaseAuthorized,false);
});
