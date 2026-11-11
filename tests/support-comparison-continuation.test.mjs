import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparisonPlan, comparisonSchedule, scoreComparison } from '../evaluation/support-comparison.mjs';
import { prepareContinuation, runContinuation, mergeContinuation } from '../evaluation/support-comparison-continuation.mjs';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const inputs = await read('../evaluation/support-comparison-v1/inputs.json');
const labels = await read('../evaluation/support-comparison-v1/expectations.json');
const freeze = await read('../evaluation/support-comparison-v1/freeze.json');
const policies = {};
for (const [arm, path] of [['v1', '../evaluation/claude-policy-draft.txt'], ['v2', '../evaluation/support-routing-v2/policy-draft.txt']]) {
  policies[arm] = `${await readFile(new URL(path, import.meta.url), 'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
}
const plan = comparisonPlan(inputs, labels, policies), schedule = comparisonSchedule(inputs);
const key = new Map(labels.map(row => [row.id, row.expected]));
const observations = schedule.map((row, index) => ({ id: row.input.id, turns: [{ turn: 1,
  status: index < 57 ? 'observed' : 'skipped',
  ...(index < 57 ? { decision: index === 56 ? { verdict: 'unavailable', category: 'none' } : key.get(row.caseId) } : {}),
}] }));
const metrics = { calls: 57, statuses: Array(57).fill(200) };
const previousCheckpoint = { sourceRevision: 'a'.repeat(40), freezeSha256: corpusDigest(freeze), metrics,
  checkpoint: { status: 'unavailable', calls: 57, corpusSha256: corpusDigest(schedule.map(row => row.input)), observations } };
const previousSummary = { sourceRevision: previousCheckpoint.sourceRevision, freezeSha256: corpusDigest(freeze), plan,
  status: 'unavailable', metrics, score: scoreComparison(inputs, labels, observations) };
const continuation = prepareContinuation(inputs, labels, plan, freeze, previousCheckpoint, previousSummary);

test('continuation preserves all completed pairs regardless of match and bounds combined attempts under $2', () => {
  assert.equal(continuation.preservedCaseIds.length, 28);
  assert.equal(continuation.maxCalls, 92);
  assert.equal(continuation.combinedMaximumCalls, 149);
  assert.equal(continuation.combinedReserveMicroUsd, 1_573_440);
  const bad = structuredClone(previousSummary); bad.metrics.calls = 58;
  assert.throws(() => prepareContinuation(inputs, labels, plan, freeze, previousCheckpoint, bad), /invalid-continuation-parent/);
  const mismatch = structuredClone(previousSummary); mismatch.score.paired['fresh-draft'].bothMatch++;
  assert.throws(() => prepareContinuation(inputs, labels, plan, freeze, previousCheckpoint, mismatch), /invalid-continuation-parent/);
});

test('evaluation continuation retains unavailable outcomes and proceeds to independent cases without generation', async () => {
  let calls = 0, checkpoints = 0;
  const assess = async (text, stage, profile, _signal, context) => {
    calls++;
    const row = inputs.find(row => row.text === text && row.stage === stage && row.locale === profile.locale && row.ageBand === profile.ageBand);
    assert.deepEqual(context, { version: '1', requestInput: stage === 'input' ? text : row.requestInput });
    return calls === 1 ? { verdict: 'unavailable', category: 'none' } : key.get(row.id);
  };
  const result = await runContinuation(inputs, { basePlan: plan, continuation,
    assessors: { v1: assess, v2: assess }, signal: new AbortController().signal, save: async () => { checkpoints++; } });
  assert.equal(result.status, 'completed'); assert.equal(calls, 92);
  assert.equal(result.observations[0].turns[0].decision.verdict, 'unavailable');
  assert.equal(checkpoints, 185);
  const merged = mergeContinuation(inputs, continuation, observations, result.observations);
  assert.deepEqual(merged.slice(0, 56), observations.slice(0, 56));
  const score = scoreComparison(inputs, labels, merged);
  assert.equal(score.paired['fresh-draft'].incomplete, 1);
  assert.equal(score.paired['known-regression'].completePairs, 2);
  assert.equal(score.diagnosticTargetsMet, false);
  assert.throws(() => mergeContinuation(inputs, continuation, observations, [...result.observations, result.observations[0]]), /invalid-continuation-observations/);
});

test('cancellation and checkpoint failure stop later calls without exposing storage details', async () => {
  let calls = 0;
  const assess = async () => { calls++; return { verdict: 'allow', category: 'none' }; };
  await assert.rejects(runContinuation(inputs, { basePlan: plan, continuation, assessors: { v1: assess, v2: assess },
    signal: new AbortController().signal, save: async () => { throw new Error('PRIVATE_STORAGE'); } }), /checkpoint-failed/);
  assert.equal(calls, 0);
  const controller = new AbortController(); controller.abort();
  const result = await runContinuation(inputs, { basePlan: plan, continuation, assessors: { v1: assess, v2: assess },
    signal: controller.signal, save: async () => {} });
  assert.equal(result.status, 'cancelled'); assert.equal(calls, 0);
});
