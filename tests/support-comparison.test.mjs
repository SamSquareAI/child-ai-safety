import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { comparisonPlan, comparisonSchedule, runPairedComparison, scoreComparison } from '../evaluation/support-comparison.mjs';

const inputs = JSON.parse(await readFile(new URL('../evaluation/support-comparison-v1/inputs.json', import.meta.url)));
const labels = JSON.parse(await readFile(new URL('../evaluation/support-comparison-v1/expectations.json', import.meta.url)));
const freeze = JSON.parse(await readFile(new URL('../evaluation/support-comparison-v1/freeze.json', import.meta.url)));
const policies = {};
for (const [arm, path] of [['v1', '../evaluation/claude-policy-draft.txt'], ['v2', '../evaluation/support-routing-v2/policy-draft.txt']]) {
  policies[arm] = `${await readFile(new URL(path, import.meta.url), 'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
}
const plan = comparisonPlan(inputs, labels, policies);
const schedule = comparisonSchedule(inputs);
const labelMap = new Map(labels.map(row => [row.id, row]));
const perfect = schedule.map(row => ({ id: row.input.id, turns: [{ turn: 1, status: 'observed', decision: labelMap.get(row.caseId).expected }] }));

test('comparison freeze binds cases, expectations, policies, order and additional $2 budget', () => {
  assert.equal(corpusDigest(plan), freeze.planSha256);
  assert.equal(plan.config.maxCalls, 148);
  assert.equal(plan.reserveMicroUsd, 1_562_880);
  assert.ok(plan.reserveMicroUsd < plan.budget.authorizedMicroUsd);
  assert.equal(schedule.length, 148);
  for (let i = 0; i < 74; i++) {
    assert.equal(schedule[i * 2].arm, i % 2 ? 'v2' : 'v1');
    assert.equal(schedule[i * 2].caseId, schedule[i * 2 + 1].caseId);
    assert.notEqual(schedule[i * 2].arm, schedule[i * 2 + 1].arm);
  }
  assert.notEqual(corpusDigest(comparisonPlan(inputs, labels, { ...policies, v2: policies.v2 + '\nchange' })), freeze.planSha256);
  const changed = structuredClone(labels); changed[0].expected = { verdict: 'support', category: 'safeguarding' };
  assert.notEqual(corpusDigest(comparisonPlan(inputs, changed, policies)), freeze.planSha256);
  assert.throws(() => comparisonPlan(inputs.slice(1), labels, policies), /invalid-comparison-inputs/);
});

test('fresh wording is separate from development cases; known regressions are exact old records', async () => {
  const development = JSON.parse(await readFile(new URL('../evaluation/support-routing-v2/inputs.json', import.meta.url)));
  const original = JSON.parse(await readFile(new URL('../evaluation/claude-pilot-v1/inputs.json', import.meta.url)));
  const oldText = new Set([...development, ...original].map(row => row.text));
  for (const row of inputs) {
    if (labelMap.get(row.id).partition === 'fresh-draft') assert.equal(oldText.has(row.text), false);
    else assert.deepEqual(row, original.find(old => old.id === row.id));
  }
  assert.equal(labels.filter(row => row.partition === 'fresh-draft').length, 72);
  for (const locale of ['en', 'fr', 'es']) for (const age of ['6-8', '9-11', '12-15', 'unknown']) {
    assert.equal(inputs.filter(row => row.locale === locale && row.ageBand === age && labelMap.get(row.id).partition === 'fresh-draft').length, 6);
  }
});

test('paired runner follows frozen arm order, binds original context, and has no labels in its assessor interface', async () => {
  const calls = [], checkpoints = [];
  const assessors = Object.fromEntries(['v1', 'v2'].map(arm => [arm, async (...args) => {
    const row = schedule[calls.length];
    assert.equal(row.arm, arm);
    const [text, stage, profile, signal, context] = args;
    assert.equal(args.length, 5);
    assert.equal(text, row.input.text); assert.equal(stage, row.input.stage);
    assert.deepEqual(Object.keys(profile).sort(), ['ageBand', 'locale', 'task']);
    assert.deepEqual(context, { version: '1', requestInput: stage === 'input' ? text : row.input.requestInput });
    assert.equal(signal.aborted, false);
    calls.push(arm);
    return labelMap.get(row.caseId).expected;
  }]));
  const result = await runPairedComparison(inputs, { plan, assessors,
    save: async report => { checkpoints.push(report); }, signal: new AbortController().signal });
  assert.equal(result.status, 'completed'); assert.equal(calls.length, 148); assert.equal(checkpoints.length, 296);
  assert.equal(scoreComparison(inputs, labels, result.observations).diagnosticTargetsMet, true);
  const drift = structuredClone(inputs); drift[0].text += ' Changed.';
  await assert.rejects(runPairedComparison(drift, { plan, assessors, save: async () => {}, signal: new AbortController().signal }), /comparison-freeze-mismatch/);
  assert.equal(calls.length, 148);
});

test('paired scoring separates fresh cases, known regressions, improvements, regressions and incomplete pairs', () => {
  const score = scoreComparison(inputs, labels, perfect);
  assert.equal(score.paired['fresh-draft'].bothMatch, 72);
  assert.equal(score.paired['known-regression'].bothMatch, 2);
  assert.equal(score.diagnosticTargetsMet, true);
  const bad = structuredClone(perfect);
  bad[0].turns[0].decision = { verdict: 'support', category: 'safeguarding' };
  const improvement = scoreComparison(inputs, labels, bad);
  assert.equal(improvement.paired['fresh-draft'].improvements, 1);
  bad[0].turns[0].decision = labelMap.get(schedule[0].caseId).expected;
  bad[1].turns[0].decision = { verdict: 'support', category: 'safeguarding' };
  const regression = scoreComparison(inputs, labels, bad);
  assert.equal(regression.paired['fresh-draft'].regressions, 1);
  assert.equal(regression.diagnosticTargetsMet, false);
  bad[1].turns[0].decision = { verdict: 'unavailable', category: 'none' };
  assert.equal(scoreComparison(inputs, labels, bad).paired['fresh-draft'].incomplete, 1);
  assert.equal(scoreComparison(inputs, labels, []).diagnosticTargetsMet, false);
  assert.throws(() => scoreComparison(inputs, labels, [...perfect, perfect[0]]), /invalid-comparison-observations/);
});

test('runner stops both arms on mandatory unavailability or checkpoint failure', async () => {
  let calls = 0;
  const assess = async () => { calls++; return { verdict: 'unavailable', category: 'none' }; };
  const result = await runPairedComparison(inputs, { plan, assessors: { v1: assess, v2: assess }, save: async () => {}, signal: new AbortController().signal });
  assert.equal(result.status, 'unavailable'); assert.equal(calls, 1);
  await assert.rejects(runPairedComparison(inputs, { plan, assessors: { v1: assess, v2: assess }, save: async () => { throw new Error('private-storage-error'); }, signal: new AbortController().signal }), /checkpoint-failed/);
  assert.equal(calls, 1);
});
