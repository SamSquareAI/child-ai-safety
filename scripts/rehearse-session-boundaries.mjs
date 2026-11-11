import assert from 'node:assert/strict';
import {createGateway, createAdmissionController} from '../dist/index.js';
import {createReferenceService, tokenDigest} from '../services/reference-server.mjs';

// Synthetic adapters and loopback HTTP only. No provider or credential file access.
const tokens = {
  old: 'synthetic_old_session_token_0000000000000000',
  fresh: 'synthetic_new_session_token_0000000000000000',
  other: 'synthetic_other_tenant_token_000000000000000',
};
const detector = {protocolVersion:'1', id:'synthetic', revision:'1', modality:'text',
  locales:['en'], ageBands:['9-11'], stages:['input','output']};
const allow = async () => ({verdict:'allow', category:'none'});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
const admission = () => createAdmissionController({maxConcurrent:8, maxPerTenant:4});
function gateway(shared, tenant, policyVersion, overrides = {}) {
  return createGateway({profile:{ageBand:'9-11',locale:'en',task:'learning'}, policyVersion,
    authority:{tenantId:tenant,applicationId:'synthetic-app'}, detector, admission:shared,
    authorize:async()=>true, localAssess:allow, assess:allow,
    generate:async()=>`Synthetic ${tenant} answer`, stageTimeoutMs:1000, requestTimeoutMs:3000,
    ...overrides});
}
const credential = (id, tenantId, handle) => ({id, tenantId, applicationId:'synthetic-app',
  digest:tokenDigest(tokens[id]), handle});
async function post(url, key, extra = {}) {
  const response = await fetch(url+'/v1/generate', {method:'POST',
    headers:{authorization:`Bearer ${tokens[key]}`, 'content-type':'application/json'},
    body:JSON.stringify({protocolVersion:'1',input:'Synthetic learning question',...extra}),
    signal:AbortSignal.timeout(5000)});
  assert.equal(response.headers.get('cache-control'),'no-store');
  return {status:response.status, body:await response.json()};
}
async function ready(promise) {
  let timer;
  try { await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Rehearsal checkpoint deadline')),2000);
  })]); } finally { clearTimeout(timer); }
}

async function rehearse() {
  const checks=[];
  const shared=admission(), entered=deferred(), release=deferred();
  let authorized=true, oldCalls=0;
  const old=gateway(shared,'tenant-a','draft-old',{authorize:async()=>authorized,
    generate:async()=>{oldCalls++;entered.resolve();await release.promise;return 'SYNTHETIC_RETIRED_SESSION_CANDIDATE';}});
  const fresh=gateway(shared,'tenant-a','draft-current');
  const other=gateway(shared,'tenant-b','draft-current');
  const service=createReferenceService({timeoutMs:4000,credentials:[
    credential('old','tenant-a',old.handle),credential('fresh','tenant-a',fresh.handle),
    credential('other','tenant-b',other.handle)]});
  try {
    const url=await service.listen();
    assert.equal((await post(url,'fresh',{tenantId:'tenant-b'})).status,400);
    checks.push('wire-authority-spoof-rejected');
    const pending=post(url,'old');
    await ready(entered.promise);
    authorized=false;
    assert.equal(service.revokeCredential('old'),true);
    const blocked=await pending;
    assert.equal(blocked.status,503);
    assert.equal(JSON.stringify(blocked.body).includes('SYNTHETIC_RETIRED_SESSION_CANDIDATE'),false);
    checks.push('revoked-inflight-output-suppressed');
    assert.equal((await post(url,'old')).status,401);
    assert.equal(oldCalls,1);
    checks.push('retired-bearer-reuse-denied');
    const a=await post(url,'fresh'), b=await post(url,'other');
    assert.equal(a.status,200);assert.equal(a.body.text,'Synthetic tenant-a answer');
    assert.equal(b.status,200);assert.equal(b.body.text,'Synthetic tenant-b answer');
    checks.push('fresh-session-and-other-tenant-remain-isolated');
  } finally {release.resolve();await service.close();}

  // A rollback is a credential/handler cutover, not mutation of a running gateway.
  const outputEntered=deferred(), outputRelease=deferred(), rollbackShared=admission();
  const candidate=gateway(rollbackShared,'tenant-a','draft-candidate',{
    assess:async(_text,stage)=>{if(stage==='output'){outputEntered.resolve();await outputRelease.promise;}return allow();}});
  const restored=gateway(rollbackShared,'tenant-a','draft-restored');
  const cutover=createReferenceService({timeoutMs:4000,credentials:[
    credential('old','tenant-a',candidate.handle),credential('fresh','tenant-a',restored.handle)]});
  try {
    const url=await cutover.listen(), pending=post(url,'old');
    await ready(outputEntered.promise);cutover.revokeCredential('old');
    const blocked=await pending;assert.equal(blocked.status,503);assert.equal('text' in blocked.body,false);
    outputRelease.resolve();
    const current=await post(url,'fresh');assert.equal(current.status,200);
    assert.equal(current.body.policyVersion,'draft-restored');
    assert.equal((await post(url,'old')).status,401);
    checks.push('rollback-cutover-withholds-retired-policy-output');
  } finally {outputRelease.resolve();await cutover.close();}

  // Revocation is not persisted by the reference service. Simulate trusted
  // operator provisioning that excludes retired keys on replacement startup.
  const replacement=createReferenceService({credentials:[credential('fresh','tenant-a',restored.handle)]});
  try {
    const url=await replacement.listen();assert.equal((await post(url,'old')).status,401);
    const current=await post(url,'fresh');assert.equal(current.status,200);
    assert.equal(current.body.policyVersion,'draft-restored');
    checks.push('replacement-startup-excludes-retired-credential');
  } finally {await replacement.close();}
  return {scope:'loopback-synthetic-session-boundaries',providerCalls:0,productionQualified:false,
    revocationScope:'process-local',restartCredentialSource:'explicit-synthetic-configuration',
    checks:checks.map(id=>({id,passed:true}))};
}

try {
  if(process.argv.length!==2)throw new Error('Unsupported rehearsal arguments');
  console.log(JSON.stringify(await rehearse(),null,2));
} catch {
  console.error('Synthetic session-boundary rehearsal failed; no private details emitted.');
  process.exitCode=1;
}
