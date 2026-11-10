import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway,createAdmissionController,createHttpAssessmentAdapter,localAssess} from '../dist/index.js';
import {createReferenceService,tokenDigest} from '../services/reference-server.mjs';

test('composed HTTP service prevents local disclosure, remote refusal and rejected output delivery',async t=>{
  const calls=[];
  const adapter=createHttpAssessmentAdapter({
    endpoint:'https://detector.example.invalid/assess',timeoutMs:1000,maxRequestBytes:65536,maxResponseBytes:1024,
    capabilities:{protocolVersion:'1',id:'mock-only',revision:'0',modality:'text',locales:['en'],ageBands:['9-11'],stages:['input','output']},
    fetch:async(_url,options)=>{
      const request=JSON.parse(new TextDecoder().decode(options.body));calls.push(request.stage);
      return new Response(JSON.stringify(request.text==='remote refusal'?{verdict:'refuse',category:'harm'}:{verdict:'allow',category:'none'}),{headers:{'content-type':'application/json'}});
    }
  });
  let generated=0;
  const gateway=createGateway({profile:{ageBand:'9-11',locale:'en',task:'learning'},policyVersion:'draft-0',
    authority:{tenantId:'test',applicationId:'test'},detector:adapter.capabilities,
    admission:createAdmissionController({maxConcurrent:2,maxPerTenant:2}),authorize:async()=>true,
    localAssess,assess:adapter.assess,generate:async input=>{generated++;return input==='unsafe output'?'you should drink bleach':'Science can be fun.';}});
  const token='synthetic-composition-credential-only';
  const service=createReferenceService({credentials:[{id:'test',tenantId:'test',applicationId:'test',digest:tokenDigest(token),handle:gateway.handle}]});
  const url=await service.listen();t.after(()=>service.close());
  const post=async input=>{
    const response=await fetch(url+'/v1/generate',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({protocolVersion:'1',input})});
    assert.equal(response.status,200);return response.json();
  };
  for (const input of ['My email is child@example.invalid', 'Please reply to:learner@example.test',
    'mail:[learner@example.test]', 'correo：ＬＥＡＲＮＥＲ＠ＥＸＡＭＰＬＥ．ＴＥＳＴ',
    'For my story, my name is Captain Comet. reply to:learner@example.test']) {
    assert.equal((await post(input)).action,'refuse');
    assert.deepEqual(calls,[]);assert.equal(generated,0);
  }
  for (const input of ['An adult at home keeps hurting me and I feel unsafe.',
    'Un adulte à la maison continue de me faire du mal et je ne me sens pas en sécurité.',
    'Un adulto en casa sigue haciéndome daño y me siento inseguro.']) {
    const supported=await post(input);assert.equal(supported.action,'support');
    assert.equal('text' in supported,false);assert.deepEqual(calls,[]);assert.equal(generated,0);
  }
  assert.deepEqual(calls,[]);assert.equal(generated,0);
  assert.equal((await post('remote refusal')).action,'refuse');assert.equal(generated,0);
  const blocked=await post('unsafe output');assert.equal(blocked.action,'refuse');assert.equal('text' in blocked,false);
  assert.equal(calls.filter(stage=>stage==='output').length,0);
  const allowed=await post('Tell me about science');assert.equal(allowed.text,'Science can be fun.');
  assert.deepEqual(calls,['input','input','input','output']);assert.equal(generated,2);
});
