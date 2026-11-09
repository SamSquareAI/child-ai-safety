import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGateway } from '../dist/gateway.js';
const allow = { verdict:'allow', category:'none' };
const profile = { ageBand:'9-11', locale:'en', task:'learning' };
function setup(overrides={}) {
  const calls=[];
  const options={ profile, policyVersion:'draft-0',
    authorize:async()=>{ calls.push('authorize');return true; },
    localAssess:async(_,stage)=>{ calls.push(`local:${stage}`);return allow; },
    assess:async(_,stage)=>{ calls.push(`assess:${stage}`);return allow; },
    generate:async()=>{ calls.push('generate');return 'An approved synthetic answer.'; }, ...overrides };
  return { gateway:createGateway(options),calls };
}
test('checks each boundary and returns only approved complete output',async()=>{
 const {gateway,calls}=setup();assert.equal((await gateway.run('Explain patterns')).action,'allow');
 assert.deepEqual(calls,['authorize','local:input','authorize','assess:input','authorize','generate','local:output','authorize','assess:output','authorize']);
});
for(const value of [false,undefined,'true',null]) test(`no external processing without strict authorization: ${value}`,async()=>{
 const {gateway,calls}=setup({authorize:async()=>value});assert.equal((await gateway.run('Hello')).action,'unavailable');assert.deepEqual(calls,[]);
});
test('local privacy rejection suppresses remote calls',async()=>{
 const {gateway,calls}=setup({localAssess:async()=>({verdict:'refuse',category:'privacy'})});
 const result=await gateway.run('Synthetic identifier');assert.equal(result.action,'refuse');assert.equal('text' in result,false);assert.deepEqual(calls,['authorize']);
});
for(const raw of [null,{}, {verdict:'allow'}, {verdict:'allow',category:'privacy'}, {verdict:'support',category:'none'}, {verdict:'allow',category:'none',evidence:'private'},'safe']) test(`malformed assessment fails closed: ${JSON.stringify(raw)}`,async()=>{
 const {gateway,calls}=setup({assess:async()=>raw});assert.equal((await gateway.run('Hello')).action,'unavailable');assert.equal(calls.includes('generate'),false);
});
test('local output privacy rejection suppresses remote output assessment',async()=>{
 const {gateway,calls}=setup({localAssess:async(_,stage)=>stage==='input'?allow:{verdict:'refuse',category:'privacy'}});
 assert.equal((await gateway.run('Hello')).action,'refuse');assert.equal(calls.includes('assess:output'),false);
});
test('unsafe output never returns candidate or classifier details',async()=>{
 const {gateway}=setup({generate:async()=> 'SYNTHETIC_PRIVATE_CANDIDATE',assess:async(_,stage)=>stage==='input'?allow:{verdict:'refuse',category:'relational'}});
 const result=await gateway.run('Hello');assert.equal(result.action,'refuse');assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE'),false);
});
test('revocation at any authorization boundary prevents delivery',async()=>{
 for(let deniedAt=1;deniedAt<=5;deniedAt++){
  let checks=0;const {gateway,calls}=setup({authorize:async()=>++checks!==deniedAt});
  assert.equal((await gateway.run('Hello')).action,'unavailable');
  if(deniedAt<=3) assert.equal(calls.includes('generate'),false);
 }
});
test('adapter failure details never leak',async()=>{
 const {gateway}=setup({generate:async()=>{throw new Error('secret-token synthetic child text');}});
 const r=await gateway.run('Hello');assert.equal(r.action,'unavailable');assert.doesNotMatch(JSON.stringify(r),/secret|child text/);
});
test('timeout aborts cooperative work and prevents generation',async()=>{
 let aborted=false;const {gateway,calls}=setup({stageTimeoutMs:10,assess:async(_,__,___,signal)=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))});
 assert.equal((await gateway.run('Hello')).action,'unavailable');assert.equal(aborted,true);assert.equal(calls.includes('generate'),false);
});
test('late adapter completion after timeout cannot resume pipeline',async()=>{
 const {gateway,calls}=setup({stageTimeoutMs:5,assess:()=>new Promise(resolve=>setTimeout(()=>resolve(allow),25))});
 assert.equal((await gateway.run('Hello')).action,'unavailable');await new Promise(r=>setTimeout(r,35));assert.equal(calls.includes('generate'),false);
});
test('caller abort suppresses delivery',async()=>{
 const ctrl=new AbortController();ctrl.abort();const {gateway,calls}=setup();
 assert.equal((await gateway.run('Hello',ctrl.signal)).action,'unavailable');assert.deepEqual(calls,[]);
});
test('abort during assessment stops the pipeline',async()=>{
 const ctrl=new AbortController();let started;
 const ready=new Promise(r=>{started=r;});
 const {gateway,calls}=setup({assess:async()=>{started();return new Promise(()=>{});}});
 const result=gateway.run('Hello',ctrl.signal);await ready;ctrl.abort();
 assert.equal((await result).action,'unavailable');assert.equal(calls.includes('generate'),false);
});
test('unavailable safety service does not start generation',async()=>{
 const {gateway,calls}=setup({assess:async()=>({verdict:'unavailable',category:'none'})});
 assert.equal((await gateway.run('Hello')).action,'unavailable');assert.equal(calls.includes('generate'),false);
});
test('simultaneous requests do not share their candidates',async()=>{
 const {gateway}=setup({generate:async text=>{await new Promise(r=>setTimeout(r,text==='first'?8:1));return `Approved ${text}`;}});
 const [a,b]=await Promise.all([gateway.run('first'),gateway.run('second')]);
 assert.equal(a.text,'Approved first');assert.equal(b.text,'Approved second');
});
test('configuration is copied; caller cannot later relax its profile',async()=>{
 const mutable={...profile};let seen;const {gateway}=setup({profile:mutable,generate:async(_,p)=>{seen=p;return 'Safe fixture.';}});
 mutable.ageBand='12-15';await gateway.run('Hello');assert.equal(seen.ageBand,'9-11');assert.equal(Object.isFrozen(seen),true);
});
test('mandatory components cannot be omitted',()=>assert.throws(()=>setup({assess:undefined}),/mandatory/));
test('unsupported profile cannot configure a gateway',()=>assert.throws(()=>setup({profile:{...profile,locale:'xx'}}),/Unsupported/));
test('unknown age remains explicitly unknown, not adult',async()=>{
 let seen;const {gateway}=setup({profile:{...profile,ageBand:'unknown'},generate:async(_,p)=>{seen=p.ageBand;return 'Safe fixture.';}});
 await gateway.run('Hello');assert.equal(seen,'unknown');
});
for(const input of ['',null,{},'a'.repeat(4001)]) test('invalid input suppresses every adapter',async()=>{
 const {gateway,calls}=setup();assert.equal((await gateway.run(input)).action,'unavailable');assert.deepEqual(calls,[]);
});
for(const output of ['',null,{text:'nested'},'a'.repeat(8001)]) test('invalid generated output is never released',async()=>{
 const {gateway}=setup({generate:async()=>output});assert.equal((await gateway.run('Hello')).action,'unavailable');
});
const fixtures=JSON.parse(await readFile(new URL('../fixtures/scenarios.json',import.meta.url),'utf8'));
test('fixture set has 30 unique synthetic cases, all locales and learning bands',()=>{
 assert.equal(fixtures.length,30);assert.equal(new Set(fixtures.map(f=>f.id)).size,30);
 assert.deepEqual([...new Set(fixtures.map(f=>f.locale))].sort(),['en','es','fr']);
 assert.deepEqual([...new Set(fixtures.map(f=>f.ageBand))].sort(),['12-15','6-8','9-11']);
});
for(const f of fixtures) test(`contract fixture (NOT classifier accuracy): ${f.id}`,async()=>{
 // Oracle deliberately comes from the fixture label. This tests decision
 // propagation, not semantic detection. Never report it as a safety score.
 const oracle={verdict:f.expected,category:f.category};
 const {gateway,calls}=setup({profile:{...profile,locale:f.locale,ageBand:f.ageBand},
  localAssess:async(_,stage)=>stage===(f.stage??'input')?oracle:allow,
  generate:async()=>f.stage==='output'?f.text:'Synthetic learning answer.'});
 const result=await gateway.run(f.stage==='output'?'Tell me about patterns.':f.text);
 assert.equal(result.action,f.expected);
 if(f.expected!=='allow') {assert.equal('text' in result,false);assert.match(result.responseId,new RegExp(`^${f.locale}\\.`));if(!f.stage)assert.equal(calls.includes('generate'),false);}
});
