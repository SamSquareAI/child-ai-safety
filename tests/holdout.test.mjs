import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGateway } from '../dist/gateway.js';
import { createAdmissionController } from '../dist/admission.js';
import { ajv, ref } from '../evaluation/holdout.mjs';

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
          add({ ...profile, family, id: `${locale}-${family}`, track: 'assessment', stage, text: privateMarker,
            ...(stage === 'output' ? { requestInput: 'Synthetic original learner question' } : {}),
          }, [verdict]);
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

const validWireInput = ajv.compile(ref('request'));
const validWireOutput = ajv.compile(ref('result'));
const textSlots = [
  { name: 'assessment input', limit: 4000, matches: row => row.track === 'assessment' && row.stage === 'input' },
  { name: 'assessment output', limit: 8000, matches: row => row.track === 'assessment' && row.stage === 'output' },
  { name: 'delivery', limit: 4000, matches: row => row.track === 'delivery' },
];

function replaceMatrixText(inputs, slot, text) {
  const rows = [];
  inputs.forEach((row, index) => {
    if (!slot.matches(row)) return;
    rows.push(index + 1);
    if (row.track === 'assessment') row.text = text;
    else row.turns = row.turns.map(() => text);
  });
  return rows;
}

function assertMatrixResult(result, rows, accepted) {
  const { status, report } = result;
  assert.equal(status, accepted ? 0 : 1);
  assert.equal(report.ok, accepted);
  if (accepted) {
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.missingCoverage, []);
    assert.deepEqual(report.counts, { assessment: 72, delivery: 24 });
  } else {
    assert.deepEqual(report.errors.filter(error => error.file === 'inputs'),
      rows.map(row => ({ file: 'inputs', row, issue: 'invalid-record' })));
    assert.equal(report.missingCoverage.length, rows.length);
  }
}

async function runBoundaryGateway(text, stage) {
  // Local synthetic adapters only; this checks runtime bounds, not semantic safety.
  const calls = [];
  const allow = { verdict: 'allow', category: 'none' };
  const requestInput = stage === 'output' ? 'Synthetic question' : text;
  const assess = kind => async (_, checkedStage, _profile, _signal, context) => {
    assert.deepEqual(context, { version: '1', requestInput });
    assert.equal(Object.isFrozen(context), true);
    calls.push(`${kind}:${checkedStage}`);
    return allow;
  };
  const gateway = createGateway({
    profile: { locale: 'en', ageBand: '9-11', task: 'learning' },
    policyVersion: 'draft-0',
    authority: { tenantId: 'synthetic-tenant', applicationId: 'synthetic-app' },
    admission: createAdmissionController({ maxConcurrent: 8, maxPerTenant: 4 }),
    detector: {
      protocolVersion: '1', id: 'fixture-oracle', revision: 'draft-0', modality: 'text',
      locales: ['en', 'fr', 'es'], ageBands: ['6-8', '9-11', '12-15', 'unknown'], stages: ['input', 'output'],
    },
    authorize: async () => true,
    localAssess: assess('local'),
    assess: assess('remote'),
    generate: async () => stage === 'output' ? text : 'Synthetic answer',
  });
  return { result: await gateway.run(requestInput), calls };
}

for (const slot of textSlots) {
  for (const [encoding, character] of [['ASCII', 'x'], ['astral', '😀']]) {
    for (const delta of [-1, 0, 1]) {
      test(`${slot.name}: complete matrix at ${slot.limit + delta} ${encoding} code points`, async t => {
        const { inputs, reviews } = pilot();
        const text = character.repeat(slot.limit + delta);
        assert.equal([...text].length, slot.limit + delta);
        const rows = replaceMatrixText(inputs, slot, text);
        const accepted = delta <= 0;
        assertMatrixResult(run(t, inputs, reviews), rows, accepted);
        const output = slot.name === 'assessment output';
        const wireValid = output
          ? validWireOutput({ protocolVersion: '1', action: 'allow', policyVersion: 'draft-0',
            detectorId: 'fixture-oracle', detectorRevision: 'draft-0', text })
          : validWireInput({ protocolVersion: '1', input: text });
        assert.equal(wireValid, accepted);
        const { result, calls } = await runBoundaryGateway(text, output ? 'output' : 'input');
        assert.equal(result.action, accepted ? 'allow' : 'unavailable');
        if (!accepted) assert.equal(calls.includes(output ? 'remote:output' : 'remote:input'), false);
      });
    }
  }
  for (const text of ['', ' ', '\t\r\n', '\u00a0', '\u2003', '\ufeff', ' \t\u00a0\u2003\ufeff\r\n']) {
    test(`${slot.name}: rejects blank ${JSON.stringify(text)} throughout the complete matrix`, async t => {
      const { inputs, reviews } = pilot();
      const rows = replaceMatrixText(inputs, slot, text);
      assertMatrixResult(run(t, inputs, reviews), rows, false);
      const output = slot.name === 'assessment output';
      const { result, calls } = await runBoundaryGateway(text, output ? 'output' : 'input');
      assert.equal(result.action, 'unavailable');
      assert.equal(calls.includes(output ? 'remote:output' : 'remote:input'), false);
    });
  }
  test(`${slot.name}: accepts surrounding Unicode whitespace with nonblank content`, t => {
    const { inputs, reviews } = pilot();
    const rows = replaceMatrixText(inputs, slot, '\ufeff\u2003 😀 \t\r\n');
    assertMatrixResult(run(t, inputs, reviews), rows, true);
  });
}

test('rejects a blank or oversized delivery turn in either position without discarding the other turn', t => {
  for (const position of [0, 1]) {
    for (const text of ['\u00a0\t', '😀'.repeat(4001)]) {
      const { inputs, reviews } = pilot();
      const index = inputs.findIndex(row => row.track === 'delivery');
      inputs[index].turns[position] = text;
      assertMatrixResult(run(t, inputs, reviews), [index + 1], false);
    }
  }
});

for (const [encoding, character] of [['ASCII', 'x'], ['astral', '😀']]) {
  for (const length of [3999, 4000, 4001]) {
    test(`output requestInput: complete matrix at ${length} ${encoding} code points`, t => {
      const { inputs, reviews } = pilot();
      const rows = [];
      const requestInput = character.repeat(length);
      inputs.forEach((row, index) => {
        if (row.stage !== 'output') return;
        row.requestInput = requestInput;
        rows.push(index + 1);
      });
      assert.equal([...requestInput].length, length);
      assertMatrixResult(run(t, inputs, reviews), rows, length <= 4000);
    });
  }
}

for (const [name, value] of [
  ['missing', undefined], ['empty', ''], ['ASCII whitespace', ' \t\r\n'],
  ['Unicode whitespace', '\ufeff\u2003\u00a0'], ['null', null], ['number', 4000],
  ['object', { text: 'Synthetic question' }], ['array', ['Synthetic question']],
]) {
  test(`output requestInput: rejects ${name} throughout the complete matrix`, t => {
    const { inputs, reviews } = pilot();
    const rows = [];
    inputs.forEach((row, index) => {
      if (row.stage !== 'output') return;
      if (value === undefined) delete row.requestInput;
      else row.requestInput = value;
      rows.push(index + 1);
    });
    assertMatrixResult(run(t, inputs, reviews), rows, false);
  });
}

test('output requestInput permits surrounding whitespace and stays separate from candidate text', t => {
  const { inputs, reviews } = pilot();
  const rows = [];
  inputs.forEach((row, index) => {
    if (row.stage !== 'output') return;
    row.requestInput = '\ufeff Synthetic original question 😀 \t';
    row.text = 'A distinct synthetic generated answer';
    rows.push(index + 1);
  });
  assertMatrixResult(run(t, inputs, reviews), rows, true);
});

for (const slot of [textSlots[0], textSlots[2]]) {
  test(`${slot.name}: rejects the output-only requestInput field throughout the complete matrix`, t => {
    const { inputs, reviews } = pilot();
    const rows = [];
    inputs.forEach((row, index) => {
      if (!slot.matches(row)) return;
      row.requestInput = 'Unexpected synthetic context';
      rows.push(index + 1);
    });
    assertMatrixResult(run(t, inputs, reviews), rows, false);
  });
}

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
