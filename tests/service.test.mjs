import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import {createReferenceService,tokenDigest} from '../services/reference-server.mjs';
const tokenA='syntheticA'.repeat(5),tokenB='syntheticB'.repeat(5);
const receipt={protocolVersion:'1',policyVersion:'draft-0',detectorId:'fixture',detectorRevision:'0'};
const result=text=>({...receipt,action:'allow',text});
const requestBody=JSON.stringify({protocolVersion:'1',input:'hello'});
const headers=(url,extra='')=>`POST /v1/generate HTTP/1.1\r\nHost: ${new URL(url).host}\r\nAuthorization: Bearer ${tokenA}\r\nContent-Type: application/json\r\n${extra}`;
function rawRequest(t,url,wire){
 const socket=net.connect(Number(new URL(url).port),'127.0.0.1');
 t.after(()=>socket.destroy());
 const response=new Promise((resolve,reject)=>{
  let data='';
  const timer=setTimeout(()=>{socket.destroy();reject(new Error('raw request did not close'));},1500);
  socket.on('data',chunk=>{data+=chunk.toString();});
  socket.once('error',reject);
  socket.once('close',()=>{clearTimeout(timer);resolve({status:Number(data.split(' ')[1]),data});});
 });
 socket.on('connect',()=>socket.write(wire));
 return {socket,response};
}
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

test('header count is rejected instead of silently hiding trailing headers',async t=>{
 const {url,handles,post}=await setup(t);
 const padding=Array.from({length:32},(_,i)=>`X-Pad-${i}: x\r\n`).join('');
 for(const tail of ['Origin: https://example.invalid\r\n',`Authorization: Bearer ${tokenB}\r\n`]){
  const {response}=rawRequest(t,url,headers(url,padding+tail+'Content-Length: 1000\r\n\r\n'));
  assert.equal((await response).status,431);
 }
 assert.deepEqual(handles,[]);
 assert.equal((await post()).status,200);
});

test('header rejections close incomplete uploads without occupying admission',async t=>{
 const {url,post,handles}=await setup(t,{config:{maxConcurrent:1,maxPerTenant:1}});
 const cases=[
  [headers(url,'Origin: \r\nContent-Length: 1000\r\n\r\n'),403],
  [headers(url,'Content-Encoding: \r\nContent-Length: 1000\r\n\r\n'),415],
  [headers(url,'Content-Length: 17000\r\n\r\n'),413],
  [headers(url,'Expect: 100-continue\r\nContent-Length: 1000\r\n\r\n'),417],
  [headers(url,'Expect: custom\r\nContent-Length: 1000\r\n\r\n'),417],
  ['POST /v1/generate HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n',401],
  ['POST /unknown HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n',404]
 ];
 for(const [wire,status] of cases)assert.equal((await rawRequest(t,url,wire).response).status,status);
 assert.deepEqual(handles,[]);
 assert.equal((await post()).status,200);
});

test('chunked body limit closes the upload and releases admission',async t=>{
 const {url,post,handles}=await setup(t,{config:{maxConcurrent:1,maxPerTenant:1}});
 const chunk='x'.repeat(16385);
 const wire=headers(url,'Transfer-Encoding: chunked\r\n\r\n')+chunk.length.toString(16)+'\r\n'+chunk+'\r\n';
 assert.equal((await rawRequest(t,url,wire).response).status,413);
 assert.deepEqual(handles,[]);
 assert.equal((await post()).status,200);
});

test('revocation while reading a body closes it, releases admission, and rejects reuse',async t=>{
 const {url,post,service,handles}=await setup(t,{config:{maxConcurrent:1,maxPerTenant:1}});
 const upload=rawRequest(t,url,headers(url,'Content-Length: 1000\r\n\r\n')+'{');
 await new Promise(resolve=>upload.socket.once('connect',resolve));
 await fetch(url+'/healthz');
 assert.equal((await post(undefined,tokenB)).status,429);
 assert.equal(service.revokeCredential('missing'),false);
 assert.equal(service.revokeCredential('a'),true);
 assert.equal((await upload.response).status,503);
 assert.deepEqual(handles,[]);
 assert.equal((await post()).status,401);
 assert.equal((await post(undefined,tokenB)).status,200);
});

test('elapsed deadlines reject a synchronous handler even before the timer runs',async t=>{
 const {post}=await setup(t,{config:{timeoutMs:20},a:()=>{
  const until=performance.now()+40;
  while(performance.now()<until){}
  return result('late output');
 }});
 const response=await post();
 assert.equal(response.status,503);
 assert.equal(await response.text(),'{"error":"unavailable"}');
});

test('handler errors cannot impersonate transport body-limit errors',async t=>{
 const {post}=await setup(t,{a:()=>{throw new Error('body_limit');}});
 assert.equal((await post()).status,503);
});

test('revocation during result serialization prevents delivery',async t=>{
 let service;
 const fixture=await setup(t,{a:()=>{
  const value=result('must not be delivered');
  Object.defineProperty(value,'toJSON',{value:()=>{service.revokeCredential('a');return value;}});
  return value;
 }});
 service=fixture.service;
 const response=await fixture.post();
 assert.equal(response.status,503);
 assert.equal(await response.text(),'{"error":"unavailable"}');
});

test('shutdown aborts active work, closes partial headers and bodies, and cannot restart',async t=>{
 let entered,stopped;
 const ready=new Promise(resolve=>{entered=resolve;});
 const aborted=new Promise(resolve=>{stopped=resolve;});
 const {url,service}=await setup(t,{a:(_,signal)=>{
  signal.addEventListener('abort',stopped,{once:true});entered();return new Promise(()=>{});
 }});
 const active=rawRequest(t,url,headers(url,`Content-Length: ${Buffer.byteLength(requestBody)}\r\n\r\n`)+requestBody);
 await ready;
 const partial=rawRequest(t,url,'POST /v1/generate HTTP/1.1\r\n');
 const body=rawRequest(t,url,headers(url,'Content-Length: 1000\r\n\r\n')+'{');
 await Promise.all([partial,body].map(({socket})=>new Promise(resolve=>socket.once('connect',resolve))));
 await fetch(url+'/healthz');
 await Promise.all([service.close(),service.close(),aborted,active.response,partial.response,body.response]);
 await assert.rejects(service.listen(),/Service closed/);
 await service.close();
});

test('disconnect during upload releases admission without an unhandled stream error',async t=>{
 const {url,post,handles}=await setup(t,{config:{maxConcurrent:1,maxPerTenant:1}});
 const upload=rawRequest(t,url,headers(url,'Content-Length: 1000\r\n\r\n')+'{');
 await new Promise(resolve=>upload.socket.once('connect',resolve));
 await fetch(url+'/healthz');
 assert.equal((await post(undefined,tokenB)).status,429);
 upload.socket.destroy();await upload.response;
 await fetch(url+'/healthz');
 assert.deepEqual(handles,[]);
 assert.equal((await post(undefined,tokenB)).status,200);
});

test('shutdown during startup waits for the bind and prevents a live listener',async t=>{
 const service=createReferenceService({credentials:[{id:'a',tenantId:'tenant-a',applicationId:'app-a',digest:tokenDigest(tokenA),handle:()=>result('unused')}]});
 t.after(()=>service.close());
 const starting=service.listen();
 const rejected=assert.rejects(starting,/Service closed/);
 await Promise.all([service.close(),rejected]);
 await assert.rejects(service.listen(),/Service closed/);
});

test('concurrent listen attempts are rejected without disrupting the first listener',async t=>{
 const service=createReferenceService({credentials:[{id:'a',tenantId:'tenant-a',applicationId:'app-a',digest:tokenDigest(tokenA),handle:()=>result('unused')}]});
 t.after(()=>service.close());
 const starting=service.listen();
 await assert.rejects(service.listen(),/Service already started/);
 const url=await starting;
 assert.equal((await fetch(url+'/healthz')).status,200);
});

test('timed-out work holds capacity until it actually settles, then releases it',async t=>{
 let finish;
 const {post}=await setup(t,{config:{timeoutMs:20,maxConcurrent:1,maxPerTenant:1},a:()=>new Promise(resolve=>{finish=resolve;})});
 assert.equal((await post()).status,503);
 assert.equal((await post(undefined,tokenB)).status,429);
 finish(result('late output'));
 await new Promise(resolve=>setImmediate(resolve));
 const response=await post(undefined,tokenB);
 assert.equal(response.status,200);
 assert.equal((await response.json()).text,'Approved B');
});

test('parser errors close half-open connections after returning a fixed response',async t=>{
 const {url,handles,post}=await setup(t,{config:{maxConcurrent:1,maxPerTenant:1}});
 // Leave both client write halves open, filling maxConnections if the server
 // merely sends FIN without destroying its half-open parser-error sockets.
 for(let i=0;i<2;i++){
  const socket=net.connect({port:Number(new URL(url).port),host:'127.0.0.1',allowHalfOpen:true});
  t.after(()=>socket.destroy());
  const response=new Promise((resolve,reject)=>{
   let data='';
   const timer=setTimeout(()=>{socket.destroy();reject(new Error('parser error response did not finish'));},1000);
   socket.on('data',chunk=>{data+=chunk;});
   socket.once('end',()=>{clearTimeout(timer);resolve(data);});
   socket.once('error',error=>{clearTimeout(timer);reject(error);});
  });
  socket.on('connect',()=>socket.write('INVALID HTTP\r\n\r\n'));
  assert.match(await response,/^HTTP\/1.1 400 Bad Request\r\n/);
 }
 assert.deepEqual(handles,[]);
 assert.equal((await post()).status,200);
});

test('parser rejects oversized headers and ambiguous framing before dispatch',async t=>{
 const {url,post,handles}=await setup(t);
 const invalid=[
  headers(url,'X-Large: '+'x'.repeat(8192)+'\r\n\r\n'),
  headers(url,'Content-Length: 10\r\nTransfer-Encoding: chunked\r\n\r\n'),
  headers(url,'Content-Length: 10\r\nContent-Length: 20\r\n\r\n')
 ];
 for(const wire of invalid)assert.equal((await rawRequest(t,url,wire).response).status,400);
 assert.deepEqual(handles,[]);
 assert.equal((await post()).status,200);
});

test('response byte limits cover JSON escaping and serialization runs once',async t=>{
 let serializations=0;
 const {post}=await setup(t,{a:()=>result('\u0000'.repeat(8000)),b:()=>{
  const value=result('small response');
  Object.defineProperty(value,'toJSON',{value:()=>{
   serializations++;return result(serializations===1?'small response':'\u0000'.repeat(8000));
  }});
  return value;
 }});
 const oversized=await post();
 assert.equal(oversized.status,503);
 assert.equal(await oversized.text(),'{"error":"unavailable"}');
 const response=await post(undefined,tokenB);
 assert.equal(response.status,200);
 assert.equal((await response.json()).text,'small response');
 assert.equal(serializations,1);
});
