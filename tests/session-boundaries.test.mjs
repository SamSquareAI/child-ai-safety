import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/rehearse-session-boundaries.mjs',import.meta.url));

test('session-boundary rehearsal completes six real loopback checks without content or bearer output',()=>{
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.scope,'loopback-synthetic-session-boundaries');
  assert.equal(report.providerCalls,0);assert.equal(report.productionQualified,false);
  assert.equal(report.revocationScope,'process-local');
  assert.equal(report.restartCredentialSource,'explicit-synthetic-configuration');
  assert.deepEqual(report.checks.map(c=>c.id),[
    'wire-authority-spoof-rejected','revoked-inflight-output-suppressed',
    'retired-bearer-reuse-denied','fresh-session-and-other-tenant-remain-isolated',
    'rollback-cutover-withholds-retired-policy-output','replacement-startup-excludes-retired-credential']);
  assert.ok(report.checks.every(c=>c.passed===true));
  for(const secret of ['SYNTHETIC_RETIRED_SESSION_CANDIDATE','Synthetic tenant-a answer',
    'Synthetic tenant-b answer','synthetic_old_session_token','synthetic_new_session_token']) {
    assert.equal((result.stdout+result.stderr).includes(secret),false);
  }
});
test('unsupported rehearsal arguments fail without starting a reported run',()=>{
  const result=spawnSync(process.execPath,[script,'--execute'],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.equal(result.stderr,'Synthetic session-boundary rehearsal failed; no private details emitted.\n');
});
