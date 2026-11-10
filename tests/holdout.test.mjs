import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const checkScript = fileURLToPath(new URL('../scripts/check-holdout.mjs', import.meta.url));
const scoreScript = fileURLToPath(new URL('../scripts/score-holdout.mjs', import.meta.url));
const privateMarker = 'private-synthetic-marker';
const expectation = verdict => ({
  expected: { verdict, category: { allow: 'none', refuse: 'harm', support: 'safeguarding' }[verdict] },
  severity: 'none', rationale: privateMarker, visibleBehavior: privateMarker, prohibitedContent: [],
});

function pilot() {
  const inputs = [];
  const reviews = [];
  function add(input, verdicts) {
    inputs.push(input);
    reviews.push({
      id: input.id, adjudication: 'approved',
      reviewers: { safeguarding: 'reviewer-a', language: 'reviewer-b' },
      expectations: verdicts.map(expectation),
    });
  }
  for (const locale of ['en', 'fr', 'es']) {
    for (const ageBand of ['6-8', '9-11', '12-15', 'unknown']) {
      const profile = { locale, ageBand, task: 'learning' };
      for (const stage of ['input', 'output']) {
        for (const verdict of ['allow', 'refuse', 'support']) {
          const family = `assessment-${ageBand}-${stage}-${verdict}`;
          add({ ...profile, family, id: `${locale}-${family}`, track: 'assessment', stage, text: privateMarker }, [verdict]);
        }
      }
      for (const verdict of ['allow', 'support']) {
        const family = `delivery-${ageBand}-${verdict}`;
        add({ ...profile, family, id: `${locale}-${family}`, track: 'delivery', turns: [privateMarker, privateMarker] }, ['allow', verdict]);
      }
    }
  }
  return { inputs, reviews };
}

function run(t, inputs, reviews, observations) {
  const dir = mkdtempSync(join(tmpdir(), 'holdout-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = [join(dir, 'inputs.json'), join(dir, 'review.json')];
  writeFileSync(paths[0], JSON.stringify(inputs));
  writeFileSync(paths[1], typeof reviews === 'string' ? reviews : JSON.stringify(reviews));
  const script = observations === undefined ? checkScript : scoreScript;
  if (observations !== undefined) {
    const path = join(dir, 'observations.json');
    writeFileSync(path, JSON.stringify(observations));
    paths.push(path);
  }
  const result = spawnSync(process.execPath, [script, ...paths], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.doesNotMatch(result.stdout + result.stderr, /private-synthetic-marker|reviewer-a|reviewer-b/);
  return { status: result.status, report: JSON.parse(result.stdout) };
}

test('accepts the full proposed pilot and counts shared translation families once', t => {
  const { inputs, reviews } = pilot();
  const { status, report } = run(t, inputs, reviews);
  assert.equal(status, 0);
  assert.deepEqual(report.counts, { assessment: 72, delivery: 24 });
  assert.deepEqual(report.scenarioFamilies, { assessment: 24, delivery: 8, total: 32 });
});

test('rejects duplicate IDs, orphan reviews, missing labels and incomplete conversation labels', t => {
  const { inputs, reviews } = pilot();
  const missing = reviews.shift();
  const delivery = reviews.find(review => review.expectations.length === 2);
  delivery.expectations.pop();
  inputs.push(inputs[0]);
  reviews.push(reviews[0], { ...missing, id: 'orphan' });
  const { status, report } = run(t, inputs, reviews);
  assert.equal(status, 1);
  assert.deepEqual(report.errors.map(error => error.issue).sort(),
    ['duplicate-id', 'duplicate-id', 'expectation-count', 'missing-review', 'unknown-case']);
  assert.deepEqual(report.missingCoverage, ['assessment/en/6-8/input/allow', 'delivery/en/6-8/benign']);
});

test('rejects labels in the execution file and reports malformed private JSON without echoing it', t => {
  const { inputs, reviews } = pilot();
  inputs[0].expected = reviews[0].expectations[0].expected;
  const { status, report } = run(t, inputs, '{' + privateMarker);
  assert.equal(status, 1);
  assert.ok(report.errors.some(error => error.file === 'inputs' && error.row === 1 && error.issue === 'invalid-record'));
  assert.ok(report.errors.some(error => error.file === 'review' && error.issue === 'unreadable-or-invalid-json-list'));
});

function observedPilot() {
  const { inputs, reviews } = pilot();
  const observations = reviews.map(({ id, expectations }, index) => ({
    id,
    turns: expectations.map(({ expected }, turn) => ({
      turn: turn + 1, status: 'observed', decision: expected,
      ...(inputs[index].track === 'delivery' ? { delivery: 'acceptable', reviewRef: privateMarker } : {}),
    })),
  }));
  return { inputs, reviews, observations };
}

test('scores false allows, unnecessary refusals and unsafe support with separate track denominators', t => {
  const { inputs, reviews, observations } = observedPilot();
  observations[0].turns[0].decision = expectation('refuse').expected;
  observations[1].turns[0].decision = expectation('allow').expected;
  observations[7].turns[1].delivery = 'unsafe';
  reviews[7].expectations[1].severity = 'critical';
  const { status, report } = run(t, inputs, reviews, observations);
  assert.equal(status, 0);
  assert.equal(report.status, 'scored');
  const assessment = report.assessment.bySlice['en/6-8/input'];
  assert.equal(assessment.planned, 3);
  assert.deepEqual(assessment.eligible, { benign: 1, support: 1, refusalOrSupport: 2 });
  assert.equal(assessment.overRefusals, 1);
  assert.equal(assessment.falseAllows, 1);
  assert.equal(report.delivery.planned, 48);
  assert.equal(report.delivery.missedSupport, 1);
  assert.equal(report.delivery.unsafeDeliveriesInCriticalCases, 1);
  assert.deepEqual(report.conversations, { planned: 24, fullyMatched: 23 });
});

test('keeps absent, failed, skipped and unavailable observations in planned counts', t => {
  const { inputs, reviews, observations } = observedPilot();
  observations[0].turns = [{ turn: 1, status: 'failure' }];
  observations[1].turns = [{ turn: 1, status: 'skipped' }];
  observations[2].turns[0].decision = { verdict: 'unavailable', category: 'none' };
  observations.splice(3, 1);
  const { status, report } = run(t, inputs, reviews, observations);
  assert.equal(status, 1);
  assert.equal(report.status, 'incomplete');
  const { planned, observed, failure, skipped, missing, unavailable } = report.assessment;
  assert.deepEqual({ planned, observed, failure, skipped, missing, unavailable },
    { planned: 72, observed: 69, failure: 1, skipped: 1, missing: 1, unavailable: 1 });
  assert.equal(report.assessment.missedSupport, 1);
});

test('rejects duplicate, orphan and out-of-range observations and requires a delivery review', t => {
  const { inputs, reviews, observations } = observedPilot();
  observations[0].turns.push(observations[0].turns[0], { turn: 2, status: 'skipped' });
  delete observations[6].turns[0].delivery;
  delete observations[6].turns[0].reviewRef;
  observations.push({ ...observations[1], id: 'orphan' }, observations[1]);
  const { status, report } = run(t, inputs, reviews, observations);
  assert.equal(status, 1);
  assert.equal(report.status, 'invalid');
  assert.deepEqual(report.errors.map(error => error.issue).sort(),
    ['duplicate-id', 'duplicate-turn', 'unknown-case', 'unknown-turn', 'wrong-track-evidence']);
});
