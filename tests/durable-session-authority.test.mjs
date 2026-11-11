import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,chmodSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createReferenceService,tokenDigest} from '../services/reference-server.mjs';
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const supportsSqliteAuthority = typeof process.getuid === 'function' &&
  (nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13));
const {createSqliteSessionAuthority} = supportsSqliteAuthority
  ? await import('../services/sqlite-session-authority.mjs')
  : {};
const sqliteTest = (name, fn) => test(name, {
  skip: supportsSqliteAuthority ? false : 'SQLite authority requires Node 22.13+ on POSIX',
}, fn);
const token='synthetic_durable_session_bearer_0000000000';
const freshToken='synthetic_fresh_session_bearer_000000000000';
const identity={id:'old',tenantId:'tenant-a',applicationId:'app-a',digest:tokenDigest(token)};
const freshIdentity={...identity,id:'fresh',digest:tokenDigest(freshToken)};
const result=(policyVersion='draft-current')=>({protocolVersion:'1',policyVersion,
 detectorId:'synthetic',detectorRevision:'1',action:'allow',text:'SYNTHETIC_PRIVATE_CANDIDATE'});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function database(t){
 const directory=mkdtempSync(join(tmpdir(),'child-ai-session-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 return join(directory,'sessions.sqlite');
}
function store(t,path,options={}){
 const authority=createSqliteSessionAuthority({path,...options});t.after(()=>authority.close());return authority;
}
async function listener(t,authority,entries=[{...identity,handle:async()=>result()}],options={}){
 const service=createReferenceService({credentials:entries,
  credentialAuthority:(identity,context)=>authority.isActive(identity,context),...options});
 const url=await service.listen();t.after(()=>service.close());return {service,url};
}
async function post(url,bearer=token){
 const response=await fetch(url+'/v1/generate',{method:'POST',headers:{authorization:`Bearer ${bearer}`,
  'content-type':'application/json'},body:JSON.stringify({protocolVersion:'1',input:'Synthetic question'}),signal:AbortSignal.timeout(5000)});
 assert.equal(response.headers.get('cache-control'),'no-store');
 return {status:response.status,body:await response.json()};
}
sqliteTest('session tombstones survive independent connections and reopen without restoring expired or revoked IDs',t=>{
 const path=database(t);let now=1000;
 const first=store(t,path,{now:()=>now}),second=store(t,path,{now:()=>now});
 first.issue({...identity,expiresAt:2000});assert.equal(second.isActive(identity),true);
 assert.equal(second.isActive({...identity,tenantId:'tenant-b'}),false);
 assert.equal(second.isActive({...identity,applicationId:'wrong'}),false);
 assert.equal(second.isActive({...identity,digest:'a'.repeat(64)}),false);
 assert.equal(second.revoke('old'),true);assert.equal(first.isActive(identity),false);
 assert.equal(second.revoke('old'),true);assert.equal(second.revoke('missing'),false);
 assert.throws(()=>first.issue({...identity,expiresAt:9000}),/Session authority unavailable/);
 first.issue({...freshIdentity,expiresAt:2000});
 assert.equal(second.isActive(freshIdentity),true);now=2000;assert.equal(second.isActive(freshIdentity),false);
 first.close();second.close();
 const reopened=store(t,path,{now:()=>now});assert.equal(reopened.isActive(identity),false);
 assert.equal(reopened.isActive(freshIdentity),false);
 assert.equal(readFileSync(path).includes(Buffer.from(token)),false);
});
sqliteTest('a separate Node process can revoke a session and later processes retain the tombstone',t=>{
 const path=database(t),authority=store(t,path);
 authority.issue({...identity,expiresAt:Date.now()+60000});
 const source=`import {createSqliteSessionAuthority} from ${JSON.stringify(new URL('../services/sqlite-session-authority.mjs',import.meta.url).href)};
  const authority=createSqliteSessionAuthority({path:process.argv[1]});
  const identity=${JSON.stringify(identity)};
  const before=authority.isActive(identity);
  if(process.argv[2]==='revoke')authority.revoke(identity.id);
  console.log(JSON.stringify({before,after:authority.isActive(identity)}));authority.close();`;
 const run=action=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',source,path,action],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 };
 assert.deepEqual(run('revoke'),{before:true,after:false});
 assert.equal(authority.isActive(identity),false);authority.close();
 assert.deepEqual(run('check'),{before:false,after:false});
});
sqliteTest('two HTTP instances honor shared revocation and replacement sessions; stale startup configuration cannot restore access',async t=>{
 const path=database(t),a=store(t,path),b=store(t,path);
 a.issue({...identity,expiresAt:Date.now()+60000});a.issue({...freshIdentity,expiresAt:Date.now()+60000});
 const entered=deferred(),release=deferred();t.after(()=>release.resolve());
 const entries=[{...identity,handle:async()=>{entered.resolve();await release.promise;return result('draft-candidate');}},
  {...freshIdentity,handle:async()=>result('draft-restored')}];
 const one=await listener(t,a,entries),two=await listener(t,b,entries);
 const pending=post(one.url);await entered.promise;b.revoke('old');
 assert.equal((await post(two.url)).status,401);
 release.resolve();const blocked=await pending;assert.equal(blocked.status,503);
 assert.equal(JSON.stringify(blocked.body).includes('SYNTHETIC_PRIVATE_CANDIDATE'),false);
 assert.equal((await post(one.url)).status,401);
 const replacement=await post(two.url,freshToken);assert.equal(replacement.status,200);
 assert.equal(replacement.body.policyVersion,'draft-restored');
 await one.service.close();a.close();
 const reopened=store(t,path),afterRestart=await listener(t,reopened,entries);
 assert.equal((await post(afterRestart.url)).status,401);
 assert.equal((await post(afterRestart.url,freshToken)).body.policyVersion,'draft-restored');
});
sqliteTest('expiry during work and unavailable authority both suppress content',async t=>{
 let now=1000;const a=store(t,database(t),{now:()=>now});a.issue({...identity,expiresAt:2000});
 const service=await listener(t,a,[{...identity,handle:async()=>{now=2000;return result();}}]);
 const expired=await post(service.url);assert.equal(expired.status,503);assert.equal('text' in expired.body,false);
 assert.equal((await post(service.url)).status,401);
 a.close();const unavailable=await post(service.url);assert.equal(unavailable.status,503);
 assert.deepEqual(unavailable.body,{error:'unavailable'});
});
sqliteTest('revocation during serialization is checked against the durable authority before delivery',async t=>{
 const a=store(t,database(t));a.issue({...identity,expiresAt:Date.now()+60000});
 const service=await listener(t,a,[{...identity,handle:async()=>{
  const value=result();Object.defineProperty(value,'toJSON',{value:()=>{a.revoke('old');return value;}});return value;
 }}]);
 const response=await post(service.url);assert.equal(response.status,503);
 assert.equal('text' in response.body,false);
});
sqliteTest('hung authority times out, holds admission until settlement, and never becomes implicit approval',async t=>{
 const entered=deferred(),release=deferred();t.after(()=>release.resolve(true));
 const service=await listener(t,{},undefined,{timeoutMs:40,maxConcurrent:1,maxPerTenant:1,
  credentialAuthority:()=>{entered.resolve();return release.promise;}});
 const pending=post(service.url);await entered.promise;
 const stopped=await pending;assert.equal(stopped.status,503);assert.equal('text' in stopped.body,false);
 assert.equal((await post(service.url)).status,429);
 release.resolve(true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await post(service.url)).status,200);
});
sqliteTest('only explicit authority approval can reach a configured handler',async t=>{
 let calls=0;
 for(const verdict of [false,undefined,'true',{}]){
  const service=await listener(t,{},[{...identity,handle:async()=>{calls++;return result();}}],
   {credentialAuthority:async()=>verdict});
  assert.equal((await post(service.url)).status,401);
 }
 const service=await listener(t,{},[{...identity,handle:async()=>{calls++;return result();}}],
  {credentialAuthority:async()=>{throw new Error('SYNTHETIC_PRIVATE_STORE_ERROR');}});
 const response=await post(service.url);assert.equal(response.status,503);
 assert.deepEqual(response.body,{error:'unavailable'});assert.equal(calls,0);
});
sqliteTest('authority files require a private directory, reject symlinks, and validate inputs',t=>{
 const path=database(t);chmodSync(join(path,'..'),0o755);
 assert.throws(()=>createSqliteSessionAuthority({path}),/Session authority unavailable/);
 chmodSync(join(path,'..'),0o700);
 const authority=store(t,path);
 assert.throws(()=>authority.issue({...identity,expiresAt:0}),/Session authority unavailable/);
 assert.throws(()=>authority.issue({...identity,expiresAt:Date.now()+60000,extra:true}),/Invalid session/);
 assert.equal(authority.isActive({...identity,extra:true}),false);
 authority.close();const link=join(path,'..','link.sqlite');symlinkSync(path,link);
 assert.throws(()=>createSqliteSessionAuthority({path:link}),/Session authority unavailable/);
 assert.throws(()=>createSqliteSessionAuthority({path:':memory:'}),/Invalid authority configuration/);
});
