import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('operator rehearsal writes a private final checkpoint and rejects reuse and drift', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-holdout-rehearsal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const paths = ['inputs.json', 'freeze.json', 'policy.txt', 'report'].map(name => join(dir, name));
  const [inputsPath, freezePath, policyPath, reportDir] = paths;
  const cases = [{
    id: 'example', family: 'science', locale: 'fr', ageBand: '9-11', task: 'learning',
    track: 'assessment', stage: 'input', text: 'Private synthetic question.',
  }];
  const settings = { model: 'synthetic-fixed-model', apiVersion: '2026-10-21', maxCalls: 1, timeoutMs: 1000 };
  const freeze = {
    ...settings, corpusSha256: corpusDigest(cases), assessmentSha256: corpusDigest(cases),
    configurationSha256: corpusDigest(claudeHoldoutConfiguration({ ...settings, systemPolicy: CLAUDE_ASSESSMENT_OUTPUT_CONTRACT })),
  };
  await Promise.all([
    writeFile(inputsPath, JSON.stringify(cases)),
    writeFile(freezePath, JSON.stringify(freeze)),
    writeFile(policyPath, CLAUDE_ASSESSMENT_OUTPUT_CONTRACT),
  ]);
  const script = fileURLToPath(new URL('../scripts/rehearse-claude-holdout.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const success = run(...paths);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).simulatedRequests, 1);
  const reportPath = join(reportDir, 'checkpoint.json');
  const report = await readFile(reportPath, 'utf8');
  assert.equal(JSON.parse(report).checkpoint.status, 'completed');
  assert.equal((await stat(reportPath)).mode & 0o077, 0);
  assert.doesNotMatch(report + success.stdout, /Private synthetic question|Return only/);
  assert.match(run(...paths).stderr, /report-directory-exists/);
  assert.equal(await readFile(reportPath, 'utf8'), report);
  await writeFile(policyPath, CLAUDE_ASSESSMENT_OUTPUT_CONTRACT + '\nchanged');
  const rejected = run(inputsPath, freezePath, policyPath, join(dir, 'unused'));
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /configuration-freeze-mismatch/);
  await assert.rejects(stat(join(dir, 'unused')), { code: 'ENOENT' });
});
