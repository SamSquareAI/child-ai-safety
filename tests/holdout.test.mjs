import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-holdout.mjs', import.meta.url));
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

function run(t, inputs, reviews) {
  const dir = mkdtempSync(join(tmpdir(), 'holdout-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = [join(dir, 'inputs.json'), join(dir, 'review.json')];
  writeFileSync(paths[0], JSON.stringify(inputs));
  writeFileSync(paths[1], typeof reviews === 'string' ? reviews : JSON.stringify(reviews));
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
