// In-process open-loop synthetic load, NOT HTTP/ML capacity or safety evidence.
import { performance } from 'node:perf_hooks';
import { createGateway } from '../dist/gateway.js';
import { createAdmissionController } from '../dist/admission.js';
const args=process.argv.slice(2);
const value=(name,fallback)=>args.includes(name)?Number(args[args.indexOf(name)+1]):fallback;
const rate=value('--rate',100),seconds=value('--seconds',2),latency=value('--latency-ms',5),capacity=value('--concurrency',32);
if(!Number.isInteger(rate)||rate<1||rate>1000||!Number.isInteger(seconds)||seconds<1||seconds>30||!Number.isInteger(latency)||latency<0||latency>100||!Number.isInteger(capacity)||capacity<1||capacity>256)throw new Error('Invalid bounded load configuration');
const admission=createAdmissionController({maxConcurrent:capacity,maxPerTenant:capacity});
const mock=async(_,__,___,signal)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve({verdict:'allow',category:'none'});},latency);
 const abort=()=>{clearTimeout(timer);reject(new Error('cancelled'));};
 if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
});
const g=createGateway({profile:{ageBand:'9-11',locale:'en',task:'learning'},policyVersion:'draft-0',authority:{tenantId:'synthetic',applicationId:'load'},
 detector:{protocolVersion:'1',id:'synthetic-allow-oracle',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']},
 admission,authorize:async()=>true,localAssess:async()=>({verdict:'allow',category:'none'}),assess:mock,
 generate:async()=> 'Synthetic approved answer.'});
const max=rate*seconds,start=performance.now();let attempted=0,allowed=0,unavailable=0;
const active=new Set(),durations=[],allowedDurations=[],unavailableDurations=[],arrivalDurations=[],lags=[];
await new Promise(resolve=>{
 const tick=()=>{
  const elapsed=performance.now()-start;
  const due=Math.min(max,Math.floor(elapsed*rate/1000));
  while(attempted<due){
   const scheduled=start+(attempted+1)*1000/rate;attempted++;const began=performance.now();lags.push(began-scheduled);
   const job=g.run('Explain a pattern.').then(result=>{
    const duration=performance.now()-began;
    if(result.action==='allow'){allowed++;allowedDurations.push(duration);}else{unavailable++;unavailableDurations.push(duration);}
    durations.push(duration);arrivalDurations.push(performance.now()-scheduled);
   });active.add(job);void job.then(()=>active.delete(job));
  }
  if(attempted===max){clearInterval(timer);resolve();}
 };
 const timer=setInterval(tick,5);tick();
});
await Promise.all([...active]);
const percentile=(xs,p)=>{if(!xs.length)return null;const a=[...xs].sort((a,b)=>a-b);return Number(a[Math.max(0,Math.ceil(a.length*p)-1)].toFixed(2));};
console.log(JSON.stringify({scope:'IN_PROCESS_SYNTHETIC_NO_HTTP_NO_DETECTOR',rate,seconds,latencyMsPerAssessment:latency,concurrencyLimit:capacity,attempted,allowed,unavailable,
 elapsedMs:Number((performance.now()-start).toFixed(2)),executionLatencyMs:{p50:percentile(durations,.5),p95:percentile(durations,.95),p99:percentile(durations,.99)},
 allowedLatencyMs:{p50:percentile(allowedDurations,.5),p95:percentile(allowedDurations,.95),p99:percentile(allowedDurations,.99)},unavailableLatencyP99Ms:percentile(unavailableDurations,.99),
 scheduledArrivalP99Ms:percentile(arrivalDurations,.99),schedulerLagP99Ms:percentile(lags,.99),rssBytes:process.memoryUsage().rss},null,2));
