import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway,createAdmissionController,createHttpAssessmentAdapter,createClaudeAssessmentAdapter,CLAUDE_ASSESSMENT_OUTPUT_CONTRACT} from '../dist/index.js';
const allow={verdict:'allow',category:'none'},unavailable={verdict:'unavailable',category:'none'};
const profile={ageBand:'9-11',locale:'en',task:'learning'};
const capabilities={protocolVersion:'1',id:'synthetic-context',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']};
const options=overrides=>({profile,policyVersion:'draft-context',authority:{tenantId:'synthetic',applicationId:'tests'},detector:capabilities,
  admission:createAdmissionController({maxConcurrent:2,maxPerTenant:2}),authorize:async()=>true,localAssess:async()=>allow,
  assess:async()=>allow,generate:async()=> 'The same context-dependent answer.',...overrides});
const http=fetch=>createHttpAssessmentAdapter({endpoint:'https://detector.invalid/assess',capabilities,timeoutMs:500,maxRequestBytes:65536,maxResponseBytes:1024,fetch});
const json=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});

test('the original question determines output assessment without mutable shared state',async()=>{
  const seen=[];
  const adapter=http(async(_url,init)=>{
    const request=JSON.parse(new TextDecoder().decode(init.body));seen.push(request);
    if(request.stage==='input')await new Promise(resolve=>setImmediate(resolve));
    return json(request.stage==='output'&&request.context.requestInput==='Question B'
      ?{verdict:'refuse',category:'harm'}:allow);
  });
  const gateway=createGateway(options({assess:adapter.assess}));
  const [a,b]=await Promise.all([gateway.run('Question A'),gateway.run('Question B')]);
  assert.equal(a.action,'allow');assert.equal(b.action,'refuse');assert.equal('text' in b,false);
  for(const question of ['Question A','Question B']){
    const packets=seen.filter(x=>x.context.requestInput===question);
    assert.deepEqual(packets.map(x=>x.stage),['input','output']);
    assert.ok(packets.every(x=>x.protocolVersion==='2'&&x.context.version==='1'));
  }
});

test('gateway freezes a distinct request envelope and rejects caller supplied history',async()=>{
  const contexts=[];
  const gateway=createGateway(options({assess:async(_text,_stage,_profile,_signal,context)=>{
    assert.ok(Object.isFrozen(context));contexts.push(context);return allow;
  }}));
  await gateway.run('First');await gateway.run('Second');
  assert.equal(contexts[0],contexts[1]);assert.notEqual(contexts[0],contexts[2]);
  assert.equal(contexts[0].requestInput,'First');assert.equal(contexts[2].requestInput,'Second');
  const invalid=await gateway.handle({protocolVersion:'1',input:'hello',history:[]});
  assert.equal(invalid.action,'unavailable');assert.equal(contexts.length,4);
});

test('output without valid bounded context never reaches a detector',async()=>{
  let calls=0,accessed=false;
  const adapter=http(async()=>{calls++;return json(allow);});
  const accessor={version:'1'};Object.defineProperty(accessor,'requestInput',{get(){accessed=true;return 'secret';},enumerable:true});
  for(const context of [undefined,null,{},accessor,{version:'2',requestInput:'q'},
    {version:'1',requestInput:' '},{version:'1',requestInput:'😀'.repeat(4001)},
    {version:'1',requestInput:'q',history:[]},Object.create({version:'1',requestInput:'q'})]){
    assert.deepEqual(await adapter.assess('candidate','output',profile,new AbortController().signal,context),unavailable);
  }
  assert.equal(calls,0);assert.equal(accessed,false);
  assert.deepEqual(await adapter.assess('input','input',profile,new AbortController().signal,{version:'1',requestInput:'different'}),unavailable);
  assert.equal(calls,0);
});

test('transport snapshots valid context and counts its bytes before sending',async()=>{
  const context={version:'1',requestInput:'😀'.repeat(4000)};let packet;
  const adapter=http(async(_url,init)=>{packet=JSON.parse(new TextDecoder().decode(init.body));return json(allow);});
  const result=adapter.assess('candidate','output',profile,new AbortController().signal,context);
  context.requestInput='changed';assert.deepEqual(await result,allow);
  assert.equal(packet.context.requestInput,'😀'.repeat(4000));
  let calls=0;
  const small=createHttpAssessmentAdapter({endpoint:'https://detector.invalid/assess',capabilities,timeoutMs:500,maxRequestBytes:256,maxResponseBytes:1024,
    fetch:async()=>{calls++;return json(allow);}});
  assert.deepEqual(await small.assess('candidate','output',profile,new AbortController().signal,{version:'1',requestInput:'😀'.repeat(4000)}),unavailable);
  assert.equal(calls,0);
});

test('Claude receives the original question as data beside the output candidate',async()=>{
  let packet;
  const adapter=createClaudeAssessmentAdapter({apiKey:'synthetic-only',model:'synthetic-model',apiVersion:'2026-10-21',
    capabilities,systemPolicy:`Draft. ${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`,timeoutMs:500,maxOutputTokens:128,maxRequestBytes:65536,maxResponseBytes:16384,
    fetch:async(_url,init)=>{packet=JSON.parse(new TextDecoder().decode(init.body));return json({type:'message',role:'assistant',model:'synthetic-model',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(allow)}]});}});
  assert.deepEqual(await adapter.assess('candidate','output',profile,new AbortController().signal,{version:'1',requestInput:'Original question'}),allow);
  const data=JSON.parse(packet.messages[0].content);
  assert.equal(data.text,'candidate');assert.deepEqual(data.context,{version:'1',requestInput:'Original question'});
  assert.equal(packet.system,`Draft. ${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`);
});
