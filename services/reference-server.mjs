/** Loopback-only reference transport. Not a production identity/consent service.
 * Credentials bind server-owned handlers; client input never chooses tenant.
 * No logging, persistence, provider calls, or default allow handler. */
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
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
  let closing=false, closePromise, listenPromise;
  const sendEncoded = (res,status,body) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close'});
    res.end(body);
  };
  const send = (res,status,body) => sendEncoded(res,status,JSON.stringify(body));
  const stopBody = (req,res) => {
    if(!req.complete){if(res.writableFinished || res.destroyed)req.destroy();else res.once('finish',()=>req.destroy());}
  };
  async function handle(req,res) {
    // Apply cleanup to header rejections too, including Expect requests.
    res.once('finish',()=>stopBody(req,res));
    if(closing){send(res,503,{error:'unavailable'});return;}
    if(req.rawHeaders.length>64){send(res,431,{error:'header_limit'});return;}
    // No browser CORS support; a server-to-server endpoint only.
    if (req.url==='/healthz' && req.method==='GET') {send(res,200,{status:'reference-only'});return;}
    if (req.url!=='/v1/generate' || req.method!=='POST') {send(res,404,{error:'not_found'});return;}
    if ('origin' in req.headers) {send(res,403,{error:'server_to_server_only'});return;}
    const authCount=req.rawHeaders.filter((_,i)=>i%2===0 && req.rawHeaders[i].toLowerCase()==='authorization').length;
    const auth=req.headers.authorization;
    if(authCount!==1 || typeof auth!=='string' || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(auth)){send(res,401,{error:'unauthorized'});return;}
    const digest=Buffer.from(tokenDigest(auth.slice(7)),'hex');
    let principal;
    for(const key of keys) if(timingSafeEqual(key.digest,digest) && !key.revoked) principal=key;
    if(!principal){send(res,401,{error:'unauthorized'});return;}
    if(req.headers['content-type']!=='application/json' || 'content-encoding' in req.headers){send(res,415,{error:'unsupported_content'});return;}
    const size=req.headers['content-length'];
    if(size && (!/^\d+$/.test(size) || Number(size)>16384)){send(res,413,{error:'body_limit'});return;}
    const release=admission.acquire(principal.tenantId);
    if(!release){send(res,429,{error:'capacity'});return;}
    const ctrl=new AbortController();principal.active.add(ctrl);
    const deadline=performance.now()+timeoutMs;
    const unavailable=()=>closing || principal.revoked || ctrl.signal.aborted || performance.now()>=deadline;
    const bodyLimit=new Error('body_limit');
    let cleanupBody=()=>{};
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
        const onData=chunk=>{
          bytes+=chunk.length;
          if(bytes>16384){cleanupBody();reject(bodyLimit);return;}
          chunks.push(chunk);
        };
        const onEnd=()=>{const body=Buffer.concat(chunks);cleanupBody();resolve(body);};
        const onError=()=>{cleanupBody();reject(new Error('body_error'));};
        cleanupBody=()=>{
          req.off('data',onData);req.off('end',onEnd);req.off('error',onError);req.off('aborted',onError);
          chunks.length=0;req.pause();
        };
        req.on('data',onData);req.once('end',onEnd);req.once('error',onError);req.once('aborted',onError);
      }),cancelled]);
      if(unavailable()){send(res,503,{error:'unavailable'});return;}
      const request=decodeRequest(body);
      if(request===null){send(res,400,{error:'invalid_request'});return;}
      work=Promise.resolve().then(()=>{
        if(unavailable())throw new Error('unavailable');
        return principal.handle(request,ctrl.signal);
      });
      const result=await Promise.race([work,cancelled]);
      if(unavailable()){send(res,503,{error:'unavailable'});return;}
      // Capture the JSON fields before a serialization hook can change them.
      const snapshot=Object.fromEntries(Object.entries(result));
      if(!validResult(snapshot)){send(res,503,{error:'unavailable'});return;}
      const encoded=JSON.stringify(result);
      if(Buffer.byteLength(encoded)>32768 || !isDeepStrictEqual(JSON.parse(encoded),snapshot) || unavailable()){
        send(res,503,{error:'unavailable'});return;
      }
      const status=snapshot.action==='unavailable'?503:200;
      sendEncoded(res,status,encoded);
    } catch(error) {
      // Classify our fixed errors only. Never serialize the exception/provider body.
      send(res,error===bodyLimit?413:503,{error:'unavailable'});
    } finally {
      cleanupBody();
      clearTimeout(timer);res.off('close',disconnect);ctrl.signal.removeEventListener('abort',stop);ctrl.abort();
      principal.active.delete(ctrl);
      if(work)void Promise.allSettled([work]).then(release);else release();
      // Stop a sender that continues after a rejected/expired body. Finish the
      // response first so clients receive the fixed error before socket close.
      stopBody(req,res);
    }
  }
  const server=http.createServer({maxHeaderSize:8192,connectionsCheckingInterval:1000},(req,res)=>{void handle(req,res).catch(()=>send(res,503,{error:'unavailable'}));});
  server.headersTimeout=10000;server.requestTimeout=30000;server.keepAliveTimeout=1000;
  // Keep all parser-accepted headers visible; enforce the count above instead
  // of Node's maxHeadersCount, which silently discards excess headers.
  server.maxHeadersCount=0;server.maxConnections=maxConcurrent*2;
  server.on('clientError',(_,socket)=>{
    if(socket.destroyed)return;
    if(!socket.writable){socket.destroy();return;}
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',()=>socket.destroy());
  });
  const rejectExpectation=(req,res)=>{res.once('finish',()=>stopBody(req,res));send(res,417,{error:'expectation_not_supported'});};
  server.on('checkContinue',rejectExpectation);
  server.on('checkExpectation',rejectExpectation);
  return Object.freeze({
    async listen(port=0) {
      if(closing)throw new Error('Service closed');
      if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Invalid port');
      if(listenPromise)throw new Error('Service already started');
      listenPromise=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
      await listenPromise;
      if(closing)throw new Error('Service closed');
      return `http://127.0.0.1:${server.address().port}`;
    },
    revokeCredential(credentialId){
      const key=keys.find(k=>k.id===credentialId);if(!key)return false;
      key.revoked=true;for(const ctrl of key.active)ctrl.abort();return true;
    },
    close(){
      if(closePromise)return closePromise;
      closing=true;
      closePromise=(async()=>{
        // A pending bind must finish before close, or it can start listening
        // after close has already reported completion.
        await listenPromise?.catch(()=>{});
        await new Promise(resolve=>{
          server.close(()=>resolve());
          server.closeAllConnections();
        });
      })();
      for(const k of keys)for(const ctrl of k.active)ctrl.abort();
      return closePromise;
    }
  });
}
