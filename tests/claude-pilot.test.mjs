import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pilotPlan, scorePilot } from '../evaluation/claude-pilot.mjs';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';

const inputs = JSON.parse(await readFile(new URL('../evaluation/claude-pilot-v1/inputs.json', import.meta.url)));
const expectations = JSON.parse(await readFile(new URL('../evaluation/claude-pilot-v1/expectations.json', import.meta.url)));
const policy = `${await readFile(new URL('../evaluation/claude-policy-draft.txt', import.meta.url), 'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
const frozen = JSON.parse(await readFile(new URL('../evaluation/claude-pilot-v1/freeze.json', import.meta.url)));
const observations = expectations.map(row => ({ id: row.id, turns: [{ turn: 1, status: 'observed', decision: row.expected }] }));

test('public pilot is frozen before execution and fits the remaining authorized reserve', () => {
  const plan = pilotPlan(inputs, policy);
  assert.equal(corpusDigest(plan), frozen.planSha256);
  assert.equal(corpusDigest(expectations), frozen.expectationsSha256);
  assert.equal(plan.totalReservedMicroUsd, 9_966_336);
  assert.ok(plan.totalReservedMicroUsd < plan.limits.authorizedMicroUsd);
  assert.equal(plan.independentEvaluation, false);
  assert.equal(plan.productionQualified, false);
  assert.throws(() => pilotPlan([...inputs, inputs[0]], policy), /invalid-pilot-inputs/);
  assert.notEqual(corpusDigest(pilotPlan(inputs, policy + '\nchanged')), frozen.planSha256);
  for (const locale of ['en', 'fr', 'es']) for (const age of ['6-8', '9-11', '12-15', 'unknown']) {
    assert.equal(inputs.filter(row => row.locale === locale && row.ageBand === age).length, 12);
  }
});

test('scorer counts false allows, false refusals, support misses and unavailability separately', () => {
  const perfect = scorePilot(inputs, expectations, observations);
  assert.equal(perfect.overall.planned, 144);
  assert.equal(perfect.scenarioFamilies, 12);
  assert.equal(perfect.overall.benignCompletion.denominator, 72);
  assert.equal(perfect.overall.supportRecall.denominator, 12);
  assert.equal(perfect.diagnosticThresholdsMet, true);
  const changed = structuredClone(observations);
  const critical = expectations.findIndex(row => row.severity === 'critical');
  changed[critical].turns[0].decision = { verdict: 'allow', category: 'none' };
  const benign = expectations.findIndex(row => row.expected.verdict === 'allow');
  changed[benign].turns[0].decision = { verdict: 'refuse', category: 'harm' };
  const support = expectations.findIndex(row => row.expected.verdict === 'support');
  changed[support].turns[0].decision = { verdict: 'unavailable', category: 'none' };
  const result = scorePilot(inputs, expectations, changed);
  assert.equal(result.overall.criticalFalseAllows.numerator, 1);
  assert.equal(result.overall.falseAllows.numerator, 1);
  assert.equal(result.overall.falseRefusals.numerator, 1);
  assert.equal(result.overall.unavailable, 1);
  assert.equal(result.overall.supportRecall.numerator, 11);
  assert.equal(result.diagnosticThresholdsMet, false);
  assert.equal(result.mismatches.length, 3);
});

test('missing, duplicate and malformed observations cannot produce a passing diagnostic', () => {
  assert.equal(scorePilot(inputs, expectations, []).overall.missing, 144);
  assert.equal(scorePilot(inputs, expectations, []).diagnosticThresholdsMet, false);
  assert.throws(() => scorePilot(inputs, expectations, [...observations, observations[0]]), /invalid-pilot-records/);
  const bad = structuredClone(observations);
  bad[0].turns[0].decision = { verdict: 'allow', category: 'harm' };
  assert.throws(() => scorePilot(inputs, expectations, bad), /invalid-pilot-observation/);
  const extra = structuredClone(observations); extra[0].id = 'unknown-case';
  assert.throws(() => scorePilot(inputs, expectations, extra), /unknown-pilot-case/);
  const key = structuredClone(expectations); key[0].labelStatus = 'approved';
  assert.throws(() => scorePilot(inputs, key, observations), /invalid-pilot-expectation/);
});
