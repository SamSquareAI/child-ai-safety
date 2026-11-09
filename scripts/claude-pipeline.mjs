import {readFile,mkdir,open,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClaudeAssessmentAdapter,createClaudeGenerator,CLAUDE_ASSESSMENT_OUTPUT_CONTRACT} from '../dist/index.js';
import {sha256} from '../evaluation/budget.mjs';
import {pipelineBudget,PIPELINE_MAX_CALLS} from '../evaluation/pipeline-budget.mjs';
import {evaluatePipeline} from '../evaluation/pipeline.mjs';
const root=new URL('../',import.meta.url),privateRoot=new URL('reports/private/',root);
async function main(){
 const args=process.argv.slice(2);
 if(args.length>1||args.some(x=>!['--execute','--dry-run'].includes(x)))throw Error('mode');
 const fixtureBytes=await readFile(new URL('evaluation/pipeline-cases.json',root)),cases=JSON.parse(fixtureBytes);
 const assessmentPolicy=`${await readFile(new URL('evaluation/claude-policy-draft.txt',root),'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
 const generationPolicy=await readFile(new URL('evaluation/generation-policy-draft.txt',root),'utf8');
 let budget;try{budget=pipelineBudget(await readFile(new URL('claude-smoke.json',privateRoot)),await readFile(new URL('claude-batch.json',privateRoot)));}catch{}
 const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim();
 const plan={scope:'LIVE_SYNTHETIC_PIPELINE_NOT_CERTIFICATION',model:'claude-haiku-5-5',apiVersion:'2026-10-21',sourceRevision,
  fixtureSha256:sha256(fixtureBytes),assessmentPolicySha256:sha256(assessmentPolicy),generationPolicySha256:sha256(generationPolicy),maxCalls:PIPELINE_MAX_CALLS,budget};
 if(args[0]!=='--execute'){console.log(JSON.stringify({...plan,executed:false,priorEvidenceVerified:!!budget}));return;}
 const apiKey=process.env.ANTHROPIC_API_KEY,age=Date.now()-Date.parse('2026-11-09T00:00:00Z');
 if(!budget||!apiKey||age<0||age>7*86400000)throw Error('prerequisite');
 if(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim())throw Error('dirty');
 await mkdir(privateRoot,{recursive:true,mode:0o700});const lock=await open(new URL('claude-pipeline-reservation.json',privateRoot),'wx',0o600);
 try{await lock.writeFile(JSON.stringify({...plan,reservedAt:new Date().toISOString()}));}finally{await lock.close();}
 let calls=0;const statuses=[];
 const transport=async(url,init)=>{if(++calls>PIPELINE_MAX_CALLS||url!=='https://api.anthropic.com/v1/messages')throw Error('call bound');const response=await fetch(url,init);statuses.push(response.status);return response;};
 const common={apiKey,model:plan.model,apiVersion:plan.apiVersion,timeoutMs:15000,maxOutputTokens:128,maxRequestBytes:8192,maxResponseBytes:16384,fetch:transport};
 const assessment=createClaudeAssessmentAdapter({...common,systemPolicy:assessmentPolicy,
  capabilities:{protocolVersion:'1',id:'claude-pipeline-draft',revision:plan.assessmentPolicySha256.slice(0,32),modality:'text',locales:['en','fr','es'],ageBands:['9-11'],stages:['input','output']}});
 const generator=createClaudeGenerator({...common,systemPolicy:generationPolicy,maxOutputTokens:256});
 const reportUrl=new URL('claude-pipeline.json',privateRoot);
 const observations=await evaluatePipeline(cases,{assessment,generator,save:async observations=>writeFile(reportUrl,JSON.stringify({...plan,executed:true,calls,statuses,observedAt:new Date().toISOString(),observations},null,2),{mode:0o600})});
 console.log(JSON.stringify({report:fileURLToPath(reportUrl),calls,completed:observations.length,matches:observations.filter(x=>x.match).length}));
 if(observations.length!==6||observations.some(x=>!x.match||!x.renderSpeechAgree||x.id==='consent-revoked'&&!x.finalRevocationExercised))process.exitCode=1;
}
try{await main();}catch{console.error('Pipeline experiment not started or incomplete. Check credential, prior reports, clean source, pricing window and one-shot reservation. No retry.');process.exitCode=1;}
