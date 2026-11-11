import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClaudeAssessmentAdapter, CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';
import { validAssessment } from '../dist/protocol.js';
import { validInput } from './holdout.mjs';
import { corpusDigest } from './corpus-digest.mjs';
import { runContextualAssessment } from './contextual-assessment-runner.mjs';

/** Offline fixture oracle only: no credentials, environment lookup or network. */
export async function rehearseSupportRouting() {
  const folder = new URL('./support-routing-v2/', import.meta.url);
  const inputs = JSON.parse(await readFile(new URL('inputs.json', folder)));
  const expectations = JSON.parse(await readFile(new URL('expectations.json', folder)));
  const policy = `${await readFile(new URL('policy-draft.txt', folder), 'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
  const freeze = JSON.parse(await readFile(new URL('freeze.json', folder)));
  assert.equal(corpusDigest(inputs), freeze.inputsSha256, 'Input fixture drift');
  assert.equal(corpusDigest(expectations), freeze.expectationsSha256, 'Draft expectation drift');
  assert.equal(corpusDigest(policy), freeze.policySha256, 'Policy draft drift');
  assert.equal(inputs.length, 108);
  assert.ok(inputs.every(row => validInput(row) && row.track === 'assessment'));
  assert.equal(new Set(inputs.map(row => row.id)).size, 108);
  assert.equal(new Set(expectations.map(row => row.id)).size, 108);
  const labels = new Map(expectations.map(row => [row.id, row]));
  assert.ok(inputs.every(row => labels.get(row.id)?.labelStatus === 'author-draft-not-independent' && validAssessment(labels.get(row.id).expected)));
  let wireCalls = 0, checkpoints = 0;
  const model = 'synthetic-support-routing-v2';
  const adapter = createClaudeAssessmentAdapter({
    apiKey: 'synthetic-no-credential', model, apiVersion: '2026-10-21', systemPolicy: policy,
    timeoutMs: 1000, maxOutputTokens: 128, maxRequestBytes: 16384, maxResponseBytes: 16384,
    capabilities: { protocolVersion: '1', id: 'support-routing-oracle', revision: freeze.policySha256.slice(0, 32),
      modality: 'text', locales: ['en', 'fr', 'es'], ageBands: ['6-8', '9-11', '12-15', 'unknown'], stages: ['input', 'output'] },
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      const body = JSON.parse(new TextDecoder().decode(init.body));
      assert.equal(body.system, policy);
      assert.equal(body.model, model);
      const payload = JSON.parse(body.messages[0].content);
      assert.deepEqual(Object.keys(payload).sort(), ['context', 'profile', 'stage', 'text']);
      const row = inputs.find(row => row.text === payload.text && row.stage === payload.stage &&
        row.locale === payload.profile.locale && row.ageBand === payload.profile.ageBand);
      assert.ok(row);
      assert.deepEqual(payload.context, { version: '1', requestInput: row.stage === 'input' ? row.text : row.requestInput });
      // This oracle intentionally reads public labels. It is not an assessor.
      wireCalls++;
      return Response.json({ type: 'message', role: 'assistant', model, stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(labels.get(row.id).expected) }] });
    },
  });
  const run = await runContextualAssessment(inputs, {
    assess: adapter.assess, maxCalls: inputs.length, timeoutMs: 1000,
    signal: new AbortController().signal, save: async report => {
      checkpoints++;
      assert.equal(report.release, 'blocked');
    },
  });
  assert.equal(run.status, 'completed');
  for (const row of run.observations) assert.deepEqual(row.turns[0].decision, labels.get(row.id).expected);
  return {
    mode: 'offline-fixture-oracle', semanticEvaluation: 'not-performed', productionQualified: false,
    liveProviderCalls: 0, scriptedTransportCalls: wireCalls, checkpoints,
    cases: inputs.length, scenarioFamilies: new Set(inputs.map(row => row.family)).size,
    policySha256: freeze.policySha256, inputSha256: freeze.inputsSha256,
  };
}
