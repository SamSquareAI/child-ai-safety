import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdmissionController, createGateway, createResearchDeliveryProjection, localAssess } from '../dist/index.js';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { summarizeAssessments } from '../evaluation/report.mjs';

const cases = JSON.parse(await readFile(new URL('../evaluation/adversarial-draft.json', import.meta.url), 'utf8'));
const { catalog } = JSON.parse(await readFile(new URL('../catalogs/draft-responses.json', import.meta.url), 'utf8'));
summarizeAssessments(cases, []);

const questions = {
  en: 'Can you explain the topic of this lesson?',
  fr: 'Peux-tu expliquer le sujet de cette leçon ?',
  es: '¿Puedes explicar el tema de esta lección?',
};
const answers = {
  en: 'Here is a short example for this lesson.',
  fr: 'Voici un petit exemple pour cette leçon.',
  es: 'Aquí tienes un ejemplo breve para esta lección.',
};
const receipt = { protocolVersion: '1', policyVersion: 'draft', detectorId: 'fixture-oracle', detectorRevision: '1' };
const allow = { verdict: 'allow', category: 'none' };
const admission = createAdmissionController({ maxConcurrent: 1, maxPerTenant: 1 });

async function runCase(item, outageBaseline) {
  const detectorUnavailable = outageBaseline !== undefined;
  const dependsOnDetector = outageBaseline?.assessmentStages.includes(item.stage);
  const input = item.stage === 'input' ? item.text : questions[item.locale];
  const candidate = item.stage === 'output' ? item.text : answers[item.locale];
  const profile = { locale: item.locale, ageBand: item.ageBand, task: 'learning' };
  const expectedAction = dependsOnDetector ? 'unavailable' : item.expected;
  const responseId = expectedAction === 'allow' ? null :
    `${item.locale}.${expectedAction}.${dependsOnDetector ? 'none' : item.category}`;
  let generationCalls = 0;
  const assessments = [];
  const generationInputs = [];
  const gateway = createGateway({
    profile,
    policyVersion: receipt.policyVersion,
    authority: { tenantId: 'synthetic-pilot', applicationId: 'offline-evaluation' },
    detector: { protocolVersion: '1', id: receipt.detectorId, revision: receipt.detectorRevision,
      modality: 'text', locales: [item.locale], ageBands: [item.ageBand], stages: ['input', 'output'] },
    admission,
    authorize: async () => true,
    localAssess,
    assess: async (text, stage, assessedProfile, _signal, context) => {
      assessments.push({ stage, context, profile: assessedProfile, text });
      if (stage !== item.stage) return allow;
      if (detectorUnavailable) return { verdict: 'unavailable', category: 'none' };
      return { verdict: item.expected, category: item.category };
    },
    generate: async question => {
      generationInputs.push(question);
      generationCalls++;
      return candidate;
    },
  });

  const result = await gateway.handle({ protocolVersion: '1', input });
  // Check observations outside callbacks: the gateway converts callback exceptions to unavailability.
  for (const observed of assessments) {
    assert.deepEqual(observed.context, { version: '1', requestInput: input });
    assert.deepEqual(observed.profile, profile);
    assert.equal(observed.text, observed.stage === 'input' ? input : candidate);
  }
  for (const question of generationInputs) assert.equal(question, input);
  const assessmentStages = assessments.map(observed => observed.stage);
  const project = createResearchDeliveryProjection({ receipt, catalog, fallbackText: catalog[`${item.locale}.unavailable.none`] });
  const delivery = project(result);
  assert.equal(result.action, expectedAction, item.id);
  if (responseId) {
    assert.equal(result.responseId, responseId, item.id);
    assert.ok(Object.hasOwn(catalog, responseId), item.id);
    assert.deepEqual(delivery, { kind: 'static', format: 'plain-text', text: catalog[responseId] }, item.id);
    assert.equal(Object.hasOwn(result, 'text'), false, item.id);
    assert.equal(delivery.text.includes(item.text), false, item.id);
    if (item.stage === 'input') assert.equal(generationCalls, 0, item.id);
  } else {
    assert.deepEqual(delivery, { kind: 'approved', format: 'plain-text', text: candidate }, item.id);
    assert.deepEqual(assessmentStages, ['input', 'output'], item.id);
    assert.equal(generationCalls, 1, item.id);
  }
  if (detectorUnavailable) assert.deepEqual(assessmentStages, outageBaseline.assessmentStages, item.id);
  return { id: item.id, locale: item.locale, stage: item.stage, action: result.action,
    responseId, deliveryKind: delivery.kind, generationCalls, assessmentStages };
}

const observations = [];
const outages = [];
for (const item of cases) {
  const observation = await runCase(item);
  observations.push(observation);
  if (item.expected !== 'allow') outages.push(await runCase(item, observation));
}

console.log(JSON.stringify({
  scope: 'offline-fixture-oracle-delivery',
  productionQualified: false,
  corpusSha256: corpusDigest(cases),
  observations,
  outages,
}, null, 2));
