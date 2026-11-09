/** Loopback-only reference transport. Not a production identity/consent service.
 * Credentials bind server-owned handlers; client input never chooses tenant.
 * No logging, persistence, provider calls, or default allow handler. */
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { decodeRequest, validResult } from '../dist/protocol.js';
import { createAdmissionController } from '../dist/admission.js';

export const tokenDigest = token => createHash('sha256').update(token).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);

export function createReferenceService({ credentials, timeoutMs = 5000, maxConcurrent = 32, maxPerTenant = 8 } = {}) {
  if (!Array.isArray(credentials) || credentials.length < 1 || credentials.length > 64 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000) throw new TypeError('Invalid service configuration');
  const keys = credentials.map(c => {
    if (!id(c.id) || !id(c.tenantId) || !id(c.applicationId) || typeof c.handle !== 'function' || typeof c.digest !== 'string' || !/^[a-f0-9]{64}$/.test(c.digest)) throw new TypeError('Invalid credential configuration');
    return { id:c.id,tenantId:c.tenantId,applicationId:c.applicationId,digest:Buffer.from(c.digest,'hex'),handle:c.handle,revoked:false,active:new Set() };
  });
  if (new Set(keys.map(k=>k.id)).size!==keys.length || new Set(credentials.map(c=>c.digest)).size!==keys.length) throw new TypeError('Duplicate credentials');
  const admission = createAdmissionController({maxConcurrent,maxPerTenant});
  const send = (res,status,body) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close'});
    res.end(JSON.stringify(body));
  };
  async function handle(req,res) {
    // No browser CORS support; a server-to-server endpoint only.
    if (req.url==='/healthz' && req.method==='GET') {send(res,200,{status:'reference-only'});return;}
    if (req.url!=='/v1/generate' || req.method!=='POST') {send(res,404,{error:'not_found'});return;}
    if (req.headers.origin) {send(res,403,{error:'server_to_server_only'});return;}
    const authCount=req.rawHeaders.filter((_,i)=>i%2===0 && req.rawHeaders[i].toLowerCase()==='authorization').length;
    const auth=req.headers.authorization;
    if(authCount!==1 || typeof auth!=='string' || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(auth)){send(res,401,{error:'unauthorized'});return;}
    const digest=Buffer.from(tokenDigest(auth.slice(7)),'hex');
    let principal;
    for(const key of keys) if(timingSafeEqual(key.digest,digest) && !key.revoked) principal=key;
    if(!principal){send(res,401,{error:'unauthorized'});return;}
    if(req.headers['content-type']!=='application/json' || req.headers['content-encoding']){send(res,415,{error:'unsupported_content'});return;}
    const size=req.headers['content-length'];
    if(size && (!/^\d+$/.test(size) || Number(size)>16384)){send(res,413,{error:'body_limit'});return;}
    const release=admission.acquire(principal.tenantId);
    if(!release){send(res,429,{error:'capacity'});return;}
    const ctrl=new AbortController();principal.active.add(ctrl);
    let work;
    let stop;
    const cancelled=new Promise((_,reject)=>{stop=()=>reject(new Error('stopped'));});
    ctrl.signal.addEventListener('abort',stop,{once:true});
    // Mark handled even while body reading is still underway.
    void cancelled.catch(()=>{});
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    const disconnect=()=>{if(!res.writableEnded)ctrl.abort();};
    res.once('close',disconnect);
    try {
      const body=await Promise.race([new Promise((resolve,reject)=>{
        const chunks=[];let bytes=0;
        req.on('data',chunk=>{
          bytes+=chunk.length;
          if(bytes>16384){reject(new Error('body_limit'));return;}
          chunks.push(chunk);
        });
        req.once('end',()=>resolve(Buffer.concat(chunks)));
        req.once('error',()=>reject(new Error('body_error')));
        req.once('aborted',()=>reject(new Error('body_error')));
      }),cancelled]);
      if(principal.revoked || ctrl.signal.aborted){send(res,403,{error:'unavailable'});return;}
      const request=decodeRequest(body);
      if(request===null){send(res,400,{error:'invalid_request'});return;}
      work=Promise.resolve().then(()=>{
        if(ctrl.signal.aborted || principal.revoked)throw new Error('unavailable');
        return principal.handle(request,ctrl.signal);
      });
      const result=await Promise.race([work,cancelled]);
      if(principal.revoked || ctrl.signal.aborted){send(res,503,{error:'unavailable'});return;}
      if(!validResult(result)){send(res,503,{error:'unavailable'});return;}
      const encoded=JSON.stringify(result);
      if(Buffer.byteLength(encoded)>32768){send(res,503,{error:'unavailable'});return;}
      send(res,result.action==='unavailable'?503:200,result);
    } catch(error) {
      // Classify our fixed errors only. Never serialize the exception/provider body.
      send(res,error?.message==='body_limit'?413:503,{error:'unavailable'});
    } finally {
      clearTimeout(timer);res.off('close',disconnect);ctrl.signal.removeEventListener('abort',stop);ctrl.abort();
      principal.active.delete(ctrl);
      if(work)void Promise.allSettled([work]).then(release);else release();
      // Stop a sender that continues after a rejected/expired body. Finish the
      // response first so clients receive the fixed error before socket close.
      if(!req.complete){if(res.writableFinished)req.destroy();else res.once('finish',()=>req.destroy());}
    }
  }
  const server=http.createServer({maxHeaderSize:8192},(req,res)=>{void handle(req,res).catch(()=>send(res,503,{error:'unavailable'}));});
  server.headersTimeout=10000;server.requestTimeout=30000;server.keepAliveTimeout=1000;
  server.maxHeadersCount=32;server.maxConnections=maxConcurrent*2;
  server.on('clientError',(_,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
  server.on('checkContinue',(req,res)=>send(res,417,{error:'expectation_not_supported'}));
  return Object.freeze({
    async listen(port=0) {
      if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Invalid port');
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
      return `http://127.0.0.1:${server.address().port}`;
    },
    revokeCredential(credentialId){
      const key=keys.find(k=>k.id===credentialId);if(!key)return false;
      key.revoked=true;for(const ctrl of key.active)ctrl.abort();return true;
    },
    async close(){for(const k of keys)for(const ctrl of k.active)ctrl.abort();server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));}
  });
}
