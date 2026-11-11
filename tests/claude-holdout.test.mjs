import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';
import { claudeHoldoutConfiguration, runClaudeHoldout } from '../evaluation/claude-holdout.mjs';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';

test('Claude holdout binds output context and checkpoints, and stops before transport on freeze drift', async () => {
  const cases = [{
    id: 'example', family: 'science', locale: 'fr', ageBand: '9-11', task: 'learning',
    track: 'assessment', stage: 'output', text: 'Synthetic candidate.', requestInput: 'Synthetic original question.',
  }];
  const config = {
    model: 'synthetic-fixed-model', apiVersion: '2026-10-21',
    systemPolicy: CLAUDE_ASSESSMENT_OUTPUT_CONTRACT, maxCalls: 1, timeoutMs: 1000,
  };
  const checkpoints = [];
  const requests = [];
  const decision = { verdict: 'allow', category: 'none' };
  const options = {
    ...config, assessmentSha256: corpusDigest(cases),
    configurationSha256: corpusDigest(claudeHoldoutConfiguration(config)),
    apiKey: 'synthetic-key', signal: new AbortController().signal,
    save: async report => { checkpoints.push(report); },
    fetch: async (url, init) => {
      requests.push({ url, payload: JSON.parse(new TextDecoder().decode(init.body)), checkpoints: checkpoints.length });
      return Response.json({
        type: 'message', role: 'assistant', model: config.model, stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(decision) }],
      });
    },
  };
  await assert.rejects(runClaudeHoldout([{ ...cases[0], requestInput: 'Changed.' }], options), /assessment-freeze-mismatch/);
  await assert.rejects(runClaudeHoldout(cases, { ...options, model: 'different-model' }), /configuration-freeze-mismatch/);
  assert.deepEqual(requests, []);
  assert.deepEqual(checkpoints, []);

  const result = await runClaudeHoldout(cases, options);
  assert.equal(result.status, 'completed');
  assert.equal(result.corpusSha256, options.assessmentSha256);
  assert.equal(result.configurationSha256, options.configurationSha256);
  assert.deepEqual(result.observations, [{ id: 'example', turns: [{ turn: 1, status: 'observed', decision }] }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].checkpoints, 1);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].payload.model, config.model);
  assert.deepEqual(JSON.parse(requests[0].payload.messages[0].content), {
    profile: { ageBand: '9-11', locale: 'fr', task: 'learning' },
    stage: 'output', text: cases[0].text, context: { version: '1', requestInput: cases[0].requestInput },
  });
  assert.deepEqual(checkpoints.at(-1), result);
  assert.doesNotMatch(JSON.stringify(checkpoints), /Synthetic|synthetic-key|Return only/);
});
