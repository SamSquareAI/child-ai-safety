import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const run=args=>spawnSync(process.execPath,['scripts/claude-batch.mjs',...args],{encoding:'utf8',env:{...process.env,ANTHROPIC_API_KEY:''}});
test('batch defaults to a no-network plan with the existing shared authorization',()=>{
 const proc=run([]);assert.equal(proc.status,0,proc.stderr);const plan=JSON.parse(proc.stdout);
 assert.equal(plan.executed,false);assert.equal(plan.maxCalls,48);assert.equal(plan.authorizedMicroUsd,10_000_000);
 assert.ok(plan.smokeReserveMicroUsd+plan.batchReserveMicroUsd<10_000_000);
 assert.match(plan.fixtureSha256,/^[a-f0-9]{64}$/);
});
test('batch cannot execute without a local credential or with ambiguous modes',()=>{
 for(const args of [['--execute'],['--execute','--dry-run'],['--unknown']])assert.equal(run(args).status,1);
});
