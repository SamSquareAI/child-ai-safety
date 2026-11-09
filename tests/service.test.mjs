import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createReferenceService,tokenDigest} from '../services/reference-server.mjs';
const tokenA='syntheticA'.repeat(5),tokenB='syntheticB'.repeat(5);
const receipt={protocolVersion:'1',policyVersion:'draft-0',detectorId:'fixture',detectorRevision:'0'};
const result=text=>({...receipt,action:'allow',text});
async function setup(t,overrides={}){
 const handles=[];
 const a=overrides.a??(async request=>{handles.push('a');return result('Approved A');});
 const b=overrides.b??(async request=>{handles.push('b');return result('Approved B');});
 const service=createReferenceService({credentials:[{id:'a',tenantId:'tenant-a',applicationId:'app-a',digest:tokenDigest(tokenA),handle:a},{id:'b',tenantId:'tenant-b',applicationId:'app-b',digest:tokenDigest(tokenB),handle:b}],...overrides.config});
 const url=await service.listen();t.after(()=>service.close());
 const post=(body={protocolVersion:'1',input:'hello'},token=tokenA,headers={})=>fetch(url+'/v1/generate',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 return {service,url,post,handles};
}
test('HTTP authentication binds the server-owned handler, never body authority',async t=>{
 const {post,handles}=await setup(t);
 assert.equal((await post({},'bad')).status,401);assert.deepEqual(handles,[]);
 assert.equal((await post({protocolVersion:'1',input:'hello',tenantId:'tenant-b'})).status,400);assert.deepEqual(handles,[]);
 let response=await post();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).text,'Approved A');
 response=await post(undefined,tokenB);assert.equal((await response.json()).text,'Approved B');assert.deepEqual(handles,['a','b']);
});
test('HTTP rejects malformed, oversized, compressed and browser requests',async t=>{
 const {post,handles}=await setup(t);
 assert.equal((await post('{')).status,400);
 assert.equal((await post('x'.repeat(17000))).status,413);
 assert.equal((await post(undefined,tokenA,{'content-encoding':'gzip'})).status,415);
 assert.equal((await post(undefined,tokenA,{origin:'https://example.invalid'})).status,403);
 assert.deepEqual(handles,[]);
});
test('duplicate auth headers are rejected',async t=>{
 const {url,handles}=await setup(t);
 const status=await new Promise((resolve,reject)=>{const req=http.request(url+'/v1/generate',{method:'POST',headers:['Host',new URL(url).host,'Authorization',`Bearer ${tokenA}`,'Authorization',`Bearer ${tokenB}`,'Content-Type','application/json']},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{"protocolVersion":"1","input":"hello"}');});
 assert.equal(status,401);assert.deepEqual(handles,[]);
});
test('provider exceptions and malformed results do not leak',async t=>{
 const {post}=await setup(t,{a:async()=>{throw new Error('PRIVATE_CONTENT synthetic-key');},b:async()=>({...result('private'),extra:'PRIVATE_CONTENT'})});
 for(const token of [tokenA,tokenB]){const r=await post(undefined,token);assert.equal(r.status,503);assert.equal(await r.text(),'{"error":"unavailable"}');}
});
test('in-flight revocation aborts request and future use',async t=>{
 let entered;const ready=new Promise(r=>{entered=r;});let aborted=false;
 const {post,service}=await setup(t,{a:async(_,signal)=>{entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('stopped'));}));}});
 const request=post();await ready;assert.equal(service.revokeCredential('a'),true);assert.equal((await request).status,503);assert.equal(aborted,true);
 assert.equal((await post()).status,401);
});
test('HTTP deadline prevents a stuck handler from delivering output',async t=>{
 const {post}=await setup(t,{config:{timeoutMs:25,maxConcurrent:2,maxPerTenant:1},a:async()=>new Promise(()=>{})});
 assert.equal((await post()).status,503);assert.equal((await post()).status,429);
 const r=await post(undefined,tokenB);assert.equal(r.status,200);
});
test('HTTP admission isolates tenants while limiting each tenant',async t=>{
 let release,entered;const ready=new Promise(r=>{entered=r;});
 const {post}=await setup(t,{config:{maxConcurrent:2,maxPerTenant:1},a:async()=>{entered();return new Promise(r=>{release=r;});}});
 const first=post();await ready;assert.equal((await post()).status,429);assert.equal((await post(undefined,tokenB)).status,200);
 release(result('First approved'));assert.equal((await first).status,200);
});
test('slow request bodies expire before any handler is called',async t=>{
 const {url,handles}=await setup(t,{config:{timeoutMs:25}});
 const status=await new Promise((resolve,reject)=>{
  const req=http.request(url+'/v1/generate',{method:'POST',headers:{authorization:`Bearer ${tokenA}`,'content-type':'application/json','content-length':'1000'}},res=>{res.resume();resolve(res.statusCode);});
  req.on('error',reject);req.write('{');
 });
 assert.equal(status,503);assert.deepEqual(handles,[]);
});
test('client disconnect cancels the pending handler',async t=>{
 let entered,aborted;
 const ready=new Promise(r=>{entered=r;});const stopped=new Promise(r=>{aborted=r;});
 const {url}=await setup(t,{a:async(_,signal)=>{
  entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted();reject(new Error('stopped'));},{once:true}));
 }});
 const req=http.request(url+'/v1/generate',{method:'POST',headers:{authorization:`Bearer ${tokenA}`,'content-type':'application/json'}});
 req.on('error',()=>{});req.end('{"protocolVersion":"1","input":"hello"}');
 await ready;req.destroy();
 await Promise.race([stopped,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('disconnect did not abort')),500);timer.unref();})]);
});
