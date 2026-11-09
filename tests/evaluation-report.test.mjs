import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAssessments } from '../evaluation/report.mjs';

const verdicts = ['allow', 'refuse', 'support', 'unavailable'];
const category = verdict => ['allow', 'unavailable'].includes(verdict) ? 'none' : 'harm';
const fixture = (id, expected = 'allow', extra = {}) => ({
  id, family: 'SYNTHETIC FAMILY', locale: 'en', ageBand: '9-11', stage: 'input',
  text: 'SYNTHETIC TEXT MUST NOT APPEAR', expected, category: category(expected),
  labelStatus: 'unreviewed-draft', ...extra,
});
const observation = (id, verdict, extra = {}) => ({
  id, assessment: { verdict, category: category(verdict), ...extra },
});

test('every action pair and failure has explicit all-sample denominators', () => {
  const cases = [], observations = [];
  for (const expected of verdicts) {
    for (const actual of [...verdicts, 'missing', 'failure']) {
      const id = `${expected}-${actual}`;
      cases.push(fixture(id, expected));
      if (actual === 'failure') observations.push({ id, error: 'unavailable' });
      else if (actual !== 'missing') observations.push(observation(id, actual));
    }
  }
  const { overall: r } = summarizeAssessments(cases, observations);
  assert.equal(r.total, 24);
  assert.deepEqual(r.counts, { assessed: 16, missing: 4, failures: 4,
    unavailable: 4, refusals: 4, support: 4, allows: 4 });
  for (const row of Object.values(r.confusionMatrix)) {
    assert.deepEqual(Object.values(row), [1, 1, 1, 1, 1, 1]);
  }
  assert.deepEqual(r.falseAllows, { numerator: 3, denominator: 24, value: 3 / 24 });
  assert.deepEqual(r.overRefusals, { numerator: 1, denominator: 24, value: 1 / 24 });
  assert.deepEqual(r.supportMisses, { numerator: 5, denominator: 24, value: 5 / 24 });
  assert.deepEqual(r.conditionalRates.falseAllows, { numerator: 3, denominator: 18, value: 3 / 18 });
  assert.deepEqual(r.conditionalRates.overRefusals, { numerator: 1, denominator: 6, value: 1 / 6 });
  assert.deepEqual(r.conditionalRates.supportMisses, { numerator: 5, denominator: 6, value: 5 / 6 });
  assert.equal(r.actionMatches.numerator, 4);
  assert.equal(r.categoryExactMatches.numerator, 8);
  assert.equal(r.exactMatches.numerator, 4);
});

test('category agreement is separate from verdict and joint agreement', () => {
  const { overall: r } = summarizeAssessments([
    fixture('a', 'support'), fixture('b', 'refuse'), fixture('c', 'support'),
  ], [observation('a', 'support', { category: 'privacy' }),
    observation('b', 'support'), observation('c', 'support')]);
  assert.equal(r.actionMatches.numerator, 2);
  assert.equal(r.categoryExactMatches.numerator, 2);
  assert.equal(r.exactMatches.numerator, 1);
});

test('fixed slices partition samples and include empty groups', () => {
  const cases = [fixture('a', 'support'), fixture('b', 'allow', {
    locale: 'fr', ageBand: '6-8', stage: 'output',
  }), fixture('c', 'refuse', { locale: 'es', ageBand: 'unknown' })];
  const report = summarizeAssessments(cases, [observation('b', 'refuse'), observation('c', 'allow')]);
  assert.deepEqual(Object.keys(report.slices), ['locale', 'ageBand', 'stage']);
  assert.deepEqual(Object.keys(report.slices.locale), ['en', 'fr', 'es']);
  assert.deepEqual(Object.keys(report.slices.ageBand), ['6-8', '9-11', '12-15', 'unknown']);
  assert.deepEqual(Object.keys(report.slices.stage), ['input', 'output']);
  for (const group of Object.values(report.slices)) {
    assert.equal(Object.values(group).reduce((n, s) => n + s.total, 0), 3);
    for (const metric of ['falseAllows', 'overRefusals', 'supportMisses']) {
      assert.equal(Object.values(group).reduce((n, s) => n + s[metric].numerator, 0),
        report.overall[metric].numerator);
    }
  }
  assert.equal(report.slices.locale.en.supportMisses.value, 1);
  assert.equal(report.slices.ageBand['12-15'].actionMatches.value, null);
});

test('empty inputs and zero eligible denominators yield null, not NaN', () => {
  const empty = summarizeAssessments([], []);
  assert.equal(empty.overall.total, 0);
  for (const metric of ['actionMatches', 'categoryExactMatches', 'exactMatches',
    'falseAllows', 'overRefusals', 'supportMisses']) {
    assert.deepEqual(empty.overall[metric], { numerator: 0, denominator: 0, value: null });
  }
  const { overall } = summarizeAssessments([fixture('a')], []);
  assert.equal(overall.falseAllows.value, 0);
  assert.equal(overall.conditionalRates.falseAllows.value, null);
  assert.equal(overall.conditionalRates.supportMisses.value, null);
  assert.equal(JSON.stringify(empty).includes('NaN'), false);
});

test('duplicate case IDs and duplicate/unknown observation IDs are rejected', () => {
  assert.throws(() => summarizeAssessments([fixture('a'), fixture('a')], []), /Duplicate case/);
  assert.throws(() => summarizeAssessments([fixture('a')], [observation('a', 'allow'),
    { id: 'a', error: 'unavailable' }]), /Duplicate observation/);
  assert.throws(() => summarizeAssessments([], [observation('unknown', 'allow')]), /Unknown observation/);
});

test('assessment verdict/category pairs and exact observation shapes are strict', () => {
  const categories = ['none', 'privacy', 'harm', 'safeguarding', 'relational'];
  for (const verdict of verdicts) for (const cat of categories) {
    const run = () => summarizeAssessments([fixture('a')], [observation('a', verdict, { category: cat })]);
    const valid = ['allow', 'unavailable'].includes(verdict) ? cat === 'none' : cat !== 'none';
    if (valid) assert.doesNotThrow(run);
    else assert.throws(run, /Invalid observation/);
  }
  for (const item of [
    observation('a', 'bogus'), observation('a', 'allow', { category: 0 }),
    observation('a', 'allow', { extra: 'PAYLOAD' }),
    { id: 'a', assessment: { verdict: 'allow' } },
    { id: 'a', error: 'PAYLOAD' }, { id: 'a', error: 'unavailable', extra: 'PAYLOAD' },
    { ...observation('a', 'allow'), error: 'unavailable' },
    { id: 'a' }, null, [],
  ]) assert.throws(() => summarizeAssessments([fixture('a')], [item]), /Invalid observation/);
});

test('case schema rejects unsupported groups, extra keys, and non-draft labels', () => {
  for (const extra of [{ locale: '__proto__' }, { ageBand: 'adult' }, { stage: 'other' },
    { labelStatus: 'reviewed' }, { expected: 'allow', category: 'harm' },
    { category: 'bogus' }, { extra: 'PAYLOAD' }, { text: '' }, { id: 1 }]) {
    assert.throws(() => summarizeAssessments([fixture('a', 'allow', extra)], []), /Invalid draft case/);
  }
  assert.throws(() => summarizeAssessments(null, []), /arrays/);
  assert.throws(() => summarizeAssessments([], {}), /arrays/);
});

test('output is aggregate metadata only, deterministic, and does not mutate inputs', () => {
  const cases = [fixture('PRIVATE-ID', 'refuse', { family: 'PRIVATE-FAMILY' })];
  const observations = [observation('PRIVATE-ID', 'allow')];
  const before = JSON.stringify({ cases, observations });
  Object.freeze(cases[0]); Object.freeze(cases);
  Object.freeze(observations[0].assessment); Object.freeze(observations[0]); Object.freeze(observations);
  const report = summarizeAssessments(cases, observations);
  const output = JSON.stringify(report);
  for (const forbidden of ['PRIVATE-ID', 'PRIVATE-FAMILY', 'SYNTHETIC TEXT', 'assessment', 'error']) {
    assert.equal(output.includes(forbidden), false);
  }
  assert.deepEqual(Object.keys(report), ['schemaVersion', 'scope', 'labelStatus', 'notice', 'overall', 'slices']);
  assert.match(report.scope, /DRAFT_LABEL_COMPARISON_NOT_CERTIFICATION/);
  assert.match(report.notice, /no safety certification or safety evidence/);
  assert.equal(JSON.stringify({ cases, observations }), before);
  assert.deepEqual(summarizeAssessments(cases, observations), report);
  const malicious = { id: 'a', assessment: { verdict: 'allow', category: 'none' } };
  Object.defineProperty(malicious.assessment, 'category', { get() { throw new Error('PAYLOAD'); } });
  assert.throws(() => summarizeAssessments([fixture('a')], [malicious]), /^TypeError: Invalid observation$/);
});
