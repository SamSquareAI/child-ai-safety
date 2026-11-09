import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {checkBatchBudget,SMOKE_REPORT_SHA256} from '../evaluation/budget.mjs';
// Tests may use the already recorded local smoke report. No private evidence is
// fabricated or checked in; generic invalid evidence checks run in every clone.
const path=new URL('../reports/private/claude-smoke.json',import.meta.url);
const billing={schemaVersion:1,source:'claude-console-key-cost',smokeReportSha256:SMOKE_REPORT_SHA256,
 dataAsOf:'2026-11-09T09:00:00.000Z',observedAt:'2026-11-09T09:01:00.000Z',totalCostUpperBoundMicroUsd:10000};
const now=new Date('2026-11-09T09:02:00.000Z');
test('unbound, malformed or absent billing cannot authorize another paid batch',()=>{
 for(const invalid of [null,{},billing])assert.throws(()=>checkBatchBudget(Buffer.from('{}'),invalid,{now}));
});
test('recorded local report needs fresh billing and stays below the shared cap',{skip:!existsSync(path)},()=>{
 const bytes=readFileSync(path);
 const result=checkBatchBudget(bytes,billing,{now});
 assert.equal(result.totalReservedMicroUsd,6_593_280);
 assert.equal(result.providerEnforced,false);
 for(const patch of [
  {dataAsOf:'2026-11-09T07:34:00.000Z'}, // Dashboard observed after smoke but data predates it.
  {observedAt:'2026-11-09T09:03:00.000Z'},
  {smokeReportSha256:'0'.repeat(64)},
  {totalCostUpperBoundMicroUsd:10_000_000},
  {totalCostUpperBoundMicroUsd:-1},
  {totalCostUpperBoundMicroUsd:0.1},
  {source:'unverified'},
  {extra:true},
 ])assert.throws(()=>checkBatchBudget(bytes,{...billing,...patch},{now}));
 assert.throws(()=>checkBatchBudget(bytes,billing,{now:new Date('2026-11-11T09:00:00.000Z')}));
 for(const calls of [0,49,1.5,NaN])assert.throws(()=>checkBatchBudget(bytes,billing,{calls,now}));
});
