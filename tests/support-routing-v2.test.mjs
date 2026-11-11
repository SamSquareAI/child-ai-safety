import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGateway, createAdmissionController, createResearchDeliveryProjection } from '../dist/index.js';
import { rehearseSupportRouting } from '../evaluation/support-routing-v2.mjs';

const inputs = JSON.parse(await readFile(new URL('../evaluation/support-routing-v2/inputs.json', import.meta.url)));
const expectations = JSON.parse(await readFile(new URL('../evaluation/support-routing-v2/expectations.json', import.meta.url)));
const labels = new Map(expectations.map(row => [row.id, row.expected]));
const allow = { verdict: 'allow', category: 'none' };
const receipt = { protocolVersion: '1', policyVersion: 'support-routing-draft-v2', detectorId: 'fixture-oracle', detectorRevision: '2' };
const localized = { en: 'A synthetic educational answer.', fr: 'Une réponse éducative inventée.', es: 'Una respuesta educativa inventada.' };

// These are injected branch tests, not language understanding or safety accuracy tests.
async function execute(row, { revoke = false, omitCatalog = false } = {}) {
  let generationCalls = 0, authorized = true;
  const assessments = [];
  const question = row.stage === 'input' ? row.text : row.requestInput;
  const candidate = row.stage === 'output' ? row.text : localized[row.locale];
  const expected = labels.get(row.id);
  const gateway = createGateway({
    profile: { locale: row.locale, ageBand: row.ageBand, task: 'learning' },
    policyVersion: receipt.policyVersion,
    authority: { tenantId: 'synthetic-regression', applicationId: 'support-routing-test' },
    detector: { protocolVersion: '1', id: receipt.detectorId, revision: receipt.detectorRevision,
      modality: 'text', locales: ['en', 'fr', 'es'], ageBands: ['6-8', '9-11', '12-15', 'unknown'], stages: ['input', 'output'] },
    admission: createAdmissionController({ maxConcurrent: 1, maxPerTenant: 1 }),
    authorize: async () => authorized,
    localAssess: async () => allow,
    assess: async (text, stage, profile, _signal, context) => {
      assert.deepEqual(profile, { locale: row.locale, ageBand: row.ageBand, task: 'learning' });
      assert.deepEqual(context, { version: '1', requestInput: question });
      assessments.push(stage);
      if (stage === row.stage) {
        assert.equal(text, row.text);
        if (revoke && stage === 'output') authorized = false;
        return expected;
      }
      return allow;
    },
    generate: async text => {
      assert.equal(text, question); generationCalls++; return candidate;
    },
  });
  const result = await gateway.run(question);
  const key = `${row.locale}.${expected.verdict}.${expected.category}`;
  const staticText = `SYNTHETIC_STATIC_${row.locale}_${expected.verdict}`;
  const fallbackText = `SYNTHETIC_FALLBACK_${row.locale}`;
  const project = createResearchDeliveryProjection({ receipt,
    catalog: omitCatalog || expected.verdict === 'allow' ? {} : { [key]: staticText }, fallbackText });
  const view = project(result);
  // Synthetic consumers share only the projected text. No real UI/TTS is exercised.
  const display = [view.text], speech = [view.text];
  assert.deepEqual(display, speech);
  return { result, view, candidate, generationCalls, assessments, staticText, fallbackText };
}

test('v2 policy/context reaches the actual Claude adapter over simulated transport for 108 cases', async () => {
  const result = await rehearseSupportRouting();
  assert.equal(result.scriptedTransportCalls, 108);
  assert.equal(result.checkpoints, 216);
  assert.equal(result.liveProviderCalls, 0);
  assert.equal(result.semanticEvaluation, 'not-performed');
});

for (const row of inputs) {
  // A real disclosure would short-circuit at input before these output-only fixtures.
  // Their output contract is exercised directly by the adapter rehearsal instead.
  if (['helpful-disclosure-answer', 'inadequate-disclosure-answer'].includes(row.family)) continue;
  test(`scripted support-routing branch: ${row.id}`, async () => {
    const run = await execute(row);
    const expected = labels.get(row.id);
    assert.equal(run.result.action, expected.verdict);
    if (row.stage === 'input' && expected.verdict === 'support') {
      assert.equal(run.generationCalls, 0);
      assert.deepEqual(run.assessments, ['input']);
    } else {
      assert.equal(run.generationCalls, 1);
      assert.deepEqual(run.assessments, ['input', 'output']);
    }
    if (expected.verdict === 'allow') {
      assert.equal(run.view.kind, 'approved'); assert.equal(run.view.text, run.candidate);
    } else {
      assert.equal(Object.hasOwn(run.result, 'text'), false);
      assert.equal(run.view.kind, 'static'); assert.equal(run.view.text, run.staticText);
      assert.notEqual(run.view.text, run.candidate);
    }
  });
}

for (const locale of ['en', 'fr', 'es']) {
  test(`final consent denial still suppresses helpful output: ${locale}`, async () => {
    const row = inputs.find(row => row.family === 'helpful-poster-answer' && row.locale === locale && row.ageBand === 'unknown');
    const run = await execute(row, { revoke: true });
    assert.equal(run.result.action, 'unavailable');
    assert.equal(run.view.kind, 'static');
    assert.equal(run.view.text, run.fallbackText);
    assert.equal(Object.hasOwn(run.result, 'text'), false);
  });
  test(`missing research support catalog uses static fallback, never a candidate: ${locale}`, async () => {
    const row = inputs.find(row => row.family === 'disclosure' && row.locale === locale && row.ageBand === '6-8');
    const run = await execute(row, { omitCatalog: true });
    assert.equal(run.view.kind, 'static'); assert.equal(run.view.text, run.fallbackText);
    assert.equal(run.generationCalls, 0);
  });
}

// Inject input allow only to isolate this output branch. This does not change
// the disclosure policy: a real input-stage support decision stops generation.
for (const row of inputs.filter(row => row.family === 'inadequate-disclosure-answer')) {
  test(`isolated output support replaces an inadequate candidate: ${row.id}`, async () => {
    const run = await execute(row);
    assert.equal(run.result.action, 'support');
    assert.equal(run.generationCalls, 1);
    assert.equal(Object.hasOwn(run.result, 'text'), false);
    assert.equal(run.view.kind, 'static'); assert.equal(run.view.text, run.staticText);
    assert.notEqual(run.view.text, run.candidate);
  });
}
