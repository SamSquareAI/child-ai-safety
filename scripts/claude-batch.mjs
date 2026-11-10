/** One-shot synthetic assessment experiment. No generation, retries or production integration. */
import {readFile,mkdir,open,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClaudeAssessmentAdapter,CLAUDE_ASSESSMENT_OUTPUT_CONTRACT} from '../dist/index.js';
import {checkBatchBudget,deferredBatchBudget,sha256,SMOKE_RESERVE_MICRO_USD} from '../evaluation/budget.mjs';
import {summarizeAssessments} from '../evaluation/report.mjs';
import {runAssessmentCases} from '../evaluation/run-cases.mjs';
const root=new URL('../',import.meta.url),privateRoot=new URL('reports/private/',root);
async function main(){
 const args=process.argv.slice(2);
 if(new Set(args).size!==args.length || args.some(arg=>!['--execute','--dry-run','--defer-billing'].includes(arg)) || (args.includes('--execute')&&args.includes('--dry-run')))throw Error('mode');
 const fixtureBytes=await readFile(new URL('evaluation/adversarial-draft.json',root));
 const cases=JSON.parse(fixtureBytes);
 if(cases.length!==48)throw Error('case bound');
 summarizeAssessments(cases,[]); // Validate every case before any provider access.
 // Historical output fixtures lack original questions. Do not spend on a partial
 // rerun that cannot meet the new contextual assessment contract.
 const contextualFixturesReady=!cases.some(item=>item.stage==='output');
 const policy=`${await readFile(new URL('evaluation/claude-policy-draft.txt',root),'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
 const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim();
 const model='claude-haiku-5-5',apiVersion='2026-10-21';
 const plan={scope:'SYNTHETIC_DRAFT_ASSESSMENT_BATCH',model,apiVersion,sourceRevision,fixtureSha256:sha256(fixtureBytes),policySha256:sha256(policy),
  maxCalls:48,maxRequestBytes:8192,maxOutputTokens:128,authorizedMicroUsd:10_000_000,
  smokeReserveMicroUsd:SMOKE_RESERVE_MICRO_USD,batchReserveMicroUsd:6_205_440,billingReconciled:false};
 let budget;
 try{const smoke=await readFile(new URL('claude-smoke.json',privateRoot));budget=args.includes('--defer-billing')?deferredBatchBudget(smoke):checkBatchBudget(smoke,JSON.parse(await readFile(new URL('claude-billing.json',privateRoot))),{calls:48});}catch{}
 if(!args.includes('--execute')){console.log(JSON.stringify({...plan,budget,executed:false,readyForExecution:!!budget&&contextualFixturesReady,blocker:!contextualFixturesReady?'historical output fixtures lack original request context; author a new contextual corpus and budget':budget?null:'fresh smoke billing reconciliation required (or authorized --defer-billing)'}));return;}
 if(!contextualFixturesReady)throw Error('contextual fixtures required');
 if(!budget || !process.env.ANTHROPIC_API_KEY)throw Error('prerequisite');
 const age=Date.now()-Date.parse('2026-11-09T00:00:00Z');
 if(age<0 || age>7*86400000)throw Error('pricing expired');
 if(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim())throw Error('uncommitted sources');
 await mkdir(privateRoot,{recursive:true,mode:0o700});
 const lock=await open(new URL('claude-batch-reservation.json',privateRoot),'wx',0o600);
 try{await lock.writeFile(JSON.stringify({...plan,budget,reservedAt:new Date().toISOString()}));}finally{await lock.close();}
 let calls=0;const statuses=[];
 const adapter=createClaudeAssessmentAdapter({apiKey:process.env.ANTHROPIC_API_KEY,model,apiVersion,systemPolicy:policy,
  timeoutMs:15000,maxOutputTokens:128,maxRequestBytes:8192,maxResponseBytes:16384,
  capabilities:{protocolVersion:'1',id:'claude-experimental',revision:plan.policySha256.slice(0,32),modality:'text',locales:['en','fr','es'],ageBands:['6-8','9-11','12-15','unknown'],stages:['input','output']},
  fetch:async(url,init)=>{if(++calls>48 || url!=='https://api.anthropic.com/v1/messages')throw Error('call bound');const response=await fetch(url,init);statuses.push(response.status);return response;}});
 const reportUrl=new URL('claude-batch.json',privateRoot);
 const save=async observations=>writeFile(reportUrl,JSON.stringify({...plan,budget,executed:true,calls,statuses,observedAt:new Date().toISOString(),observations,summary:summarizeAssessments(cases,observations)},null,2),{mode:0o600});
 const {observations,summary}=await runAssessmentCases(cases,{assess:adapter.assess,save});
 console.log(JSON.stringify({report:fileURLToPath(reportUrl),calls,counts:summary.overall.counts}));
 if(observations.length!==cases.length || summary.overall.exactMatches.numerator!==cases.length)process.exitCode=1;
}
try{await main();}catch{console.error('Claude batch not started or incomplete: verify billing record, credential, committed sources, pricing window and exclusive reservation. No automatic retry.');process.exitCode=1;}
