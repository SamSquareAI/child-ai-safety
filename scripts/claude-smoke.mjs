/** Explicit, one-shot, synthetic transport experiment. Never a safety benchmark. */
import {readFile,mkdir,writeFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createClaudeAssessmentAdapter,CLAUDE_ASSESSMENT_OUTPUT_CONTRACT} from '../dist/index.js';
const root=new URL('../',import.meta.url);
const model='claude-haiku-5-5',apiVersion='2026-10-21';
const maxCalls=3,maxRequestBytes=8192,maxOutputTokens=128;
const cases=[
 {id:'science-en',locale:'en',text:'Why does rain fall from clouds?'},
 {id:'science-fr',locale:'fr',text:'Pourquoi la pluie tombe-t-elle des nuages ?'},
 {id:'science-es',locale:'es',text:'¿Por qué cae lluvia de las nubes?'}
];
async function main(){
 const args=process.argv.slice(2);
 if(args.length>1 || args.some(arg=>!['--execute','--dry-run'].includes(arg)))throw Error('arguments');
 const rules=await readFile(new URL('evaluation/claude-policy-draft.txt',root),'utf8');
 const systemPolicy=`${rules}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
 const policySha256=createHash('sha256').update(systemPolicy).digest('hex');
 // Conservative planning allowance: full request bytes + 4096 overhead tokens,
 // at $10/$50 per million, far above the checked Haiku base prices. This is a
 // planning reserve, NOT provider-side billing enforcement or an invoice.
 const reserveUSD=maxCalls*((maxRequestBytes+4096)*10+maxOutputTokens*50)/1_000_000;
 const plan={scope:'SYNTHETIC_CLAUDE_SMOKE_ONLY',model,apiVersion,policySha256,
  maxCalls,maxRequestBytes,maxOutputTokens,authorizedMaximumUSD:10,planningReserveUSD:reserveUSD,
  pricingChecked:'2026-11-09',billingReconciled:false};
 if(args[0]!=='--execute'){console.log(JSON.stringify({...plan,executed:false}));return;}
 const age=Date.now()-Date.parse('2026-11-09T00:00:00Z');
 if(age<0 || age>7*86400000 || reserveUSD>=10)throw Error('pricing review required');
 const apiKey=process.env.ANTHROPIC_API_KEY;
 if(!apiKey)throw Error('credential unavailable');
 const privateRoot=new URL('reports/private/',root);await mkdir(privateRoot,{recursive:true,mode:0o700});
 // Crash-safe one-shot reservation. Never automatically reset it or repeat a run.
 const lock=await open(new URL('claude-smoke-reservation.json',privateRoot),'wx',0o600);
 try{await lock.writeFile(JSON.stringify({...plan,reservedAt:new Date().toISOString()}));}finally{await lock.close();}
 let calls=0;
 const providerStatuses=[];
 const fetcher=async(url,init)=>{
  if(++calls>maxCalls || url!=='https://api.anthropic.com/v1/messages')throw Error('call bound');
  const response=await fetch(url,init);providerStatuses.push(response.status);return response;
 };
 const adapter=createClaudeAssessmentAdapter({apiKey,model,apiVersion,systemPolicy,timeoutMs:15000,
  maxOutputTokens,maxRequestBytes,maxResponseBytes:16384,fetch:fetcher,
  capabilities:{protocolVersion:'1',id:'claude-experimental',revision:policySha256.slice(0,32),modality:'text',locales:['en','fr','es'],ageBands:['9-11'],stages:['input','output']}});
 const results=[];
 for(const item of cases){
  const assessment=await adapter.assess(item.text,'input',{ageBand:'9-11',locale:item.locale,task:'learning'},new AbortController().signal);
  results.push({id:item.id,locale:item.locale,assessment});
  if(assessment.verdict==='unavailable')break;
 }
 const report={...plan,executed:true,completedAt:new Date().toISOString(),calls,providerStatuses,results};
 await writeFile(new URL('claude-smoke.json',privateRoot),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({report:fileURLToPath(new URL('claude-smoke.json',privateRoot)),calls,providerStatuses,results}));
 if(results.length!==cases.length || results.some(x=>x.assessment.verdict==='unavailable'))process.exitCode=1;
}
try{await main();}catch{
 // Do not serialize credential-bearing config or transport errors.
 console.error('Claude smoke run not completed. Check explicit mode, local credential, pricing review and one-shot reservation. No automatic retry.');
 process.exitCode=1;
}
