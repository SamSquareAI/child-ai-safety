import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=args=>spawnSync(process.execPath,['scripts/claude-smoke.mjs',...args],{encoding:'utf8',env:{...process.env,ANTHROPIC_API_KEY:''}});
test('Claude smoke defaults to a no-network, no-credential plan with bounded calls',()=>{
 for(const args of [[],['--dry-run']]){
  const proc=run(args);assert.equal(proc.status,0,proc.stderr);
  const plan=JSON.parse(proc.stdout);assert.equal(plan.executed,false);assert.equal(plan.maxCalls,3);
  assert.equal(plan.authorizedMaximumUSD,10);assert.ok(plan.planningReserveUSD<1);
  assert.equal(plan.billingReconciled,false);assert.match(plan.policySha256,/^[a-f0-9]{64}$/);
 }
});
test('paid Claude smoke rejects missing credential and ambiguous modes',()=>{
 for(const args of [['--execute'],['--execute','--dry-run'],['--unknown']]){
  const proc=run(args);assert.equal(proc.status,1);assert.equal(proc.stdout,'');
  assert.equal(proc.stderr.includes('sk-ant'),false);
 }
});
