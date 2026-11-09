// Explicit synthetic oracle for protocol plumbing only. Never a real detector.
import { readFile } from 'node:fs/promises';
import { createGateway } from '../dist/gateway.js';
import { createAdmissionController } from '../dist/admission.js';
const args=process.argv.slice(2);
if(!args.includes('--synthetic-oracle')) throw new Error('Synthetic oracle flag required');
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const locale=option('--locale','en'),ageBand=option('--age-band','9-11');
const fixtures=JSON.parse(await readFile(new URL('../fixtures/scenarios.json',import.meta.url),'utf8'));
const allowed={verdict:'allow',category:'none'};
const oracle=async(text,stage)=>{
 const f=fixtures.find(f=>f.text===text && (f.stage??'input')===stage);
 return f?{verdict:f.expected,category:f.category}:allowed;
};
const g=createGateway({profile:{locale,ageBand,task:'learning'},policyVersion:'draft-0',
 authority:{tenantId:'synthetic-only',applicationId:'fixture-runner'},
 detector:{protocolVersion:'1',id:'fixture-oracle-NOT-A-DETECTOR',revision:'draft-0',modality:'text',locales:['en','fr','es'],ageBands:['6-8','9-11','12-15'],stages:['input','output']},
 admission:createAdmissionController({maxConcurrent:1,maxPerTenant:1}),authorize:async()=>true,localAssess:oracle,assess:async()=>allowed,
 generate:async text=>fixtures.some(f=>f.text===text && f.stage==='output')?text:'Synthetic approved learning answer.'});
// Bounded local stdin, one request/response; no shell or network server.
let bytes=0;const chunks=[];
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>20000)throw new Error('Request too large');chunks.push(chunk);}
const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
console.log(JSON.stringify(await g.handle(request)));
