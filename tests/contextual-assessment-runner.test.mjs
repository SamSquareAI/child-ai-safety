import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { runContextualAssessment } from '../evaluation/contextual-assessment-runner.mjs';
import { validInput } from '../evaluation/holdout.mjs';

const allow = Object.freeze({ verdict: 'allow', category: 'none' });
const input = (id = 'input-case') => ({
  id, family: 'context', locale: 'en', ageBand: '9-11', task: 'learning',
  track: 'assessment', stage: 'input', text: 'PRIVATE_REQUEST',
});
const output = (id = 'output-case') => ({ ...input(id), stage: 'output', text: 'PRIVATE_CANDIDATE', requestInput: 'BOUND_REQUEST' });
const options = (overrides = {}) => ({
  maxCalls: 2, timeoutMs: 1000, signal: new AbortController().signal,
  assess: async () => allow, save: async () => {}, ...overrides,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('operator preflight binds the full freeze and matches the runner digest for the assessment subset', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'holdout-operator-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'inputs.json');
  const script = fileURLToPath(new URL('../scripts/plan-holdout-assessment.mjs', import.meta.url));
  const plan = (inputs, digest) => {
    writeFileSync(path, JSON.stringify(inputs), { mode: 0o600 });
    return spawnSync(process.execPath, [script, path, digest], { encoding: 'utf8' });
  };
  const assessment = [input(), output()];
  const { stage, text, ...sharedFields } = input('delivery-case');
  const delivery = { ...sharedFields, track: 'delivery', turns: ['PRIVATE_FIRST', 'PRIVATE_SECOND'] };
  const full = [assessment[0], delivery, assessment[1]];
  const digest = corpusDigest(full);
  const successful = plan(full, digest);
  assert.equal(successful.status, 0, successful.stderr);
  const run = await runContextualAssessment(assessment, options());
  assert.deepEqual(JSON.parse(successful.stdout), {
    status: 'inputs-verified', corpusSha256: digest, assessmentSha256: run.corpusSha256,
    assessmentCases: 2, assessmentInputCases: 1, assessmentOutputCases: 1, deliveryCases: 1,
  });

  const tampered = plan([assessment[0], { ...delivery, turns: ['PRIVATE_CHANGED', 'PRIVATE_SECOND'] }, assessment[1]], digest);
  assert.equal(tampered.status, 1);
  assert.equal(JSON.parse(tampered.stdout).errors[0].issue, 'frozen-corpus-digest-mismatch');
  const withLabel = [{ ...assessment[0], expected: allow }];
  const labeled = plan(withLabel, corpusDigest(withLabel));
  assert.equal(labeled.status, 1);
  assert.equal(JSON.parse(labeled.stdout).errors[0].issue, 'invalid-record');
  for (const result of [successful, tampered, labeled]) {
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_|BOUND_REQUEST/);
  }
});

// Deliberately no provider adapter, API key, network or paid runner imports.
test('binds both stages to the fifth Assess argument; checkpoints are scorer-compatible and content-free', async () => {
  const calls = [], checkpoints = [];
  const result = await runContextualAssessment([input(), output()], options({
    assess: async (...args) => { calls.push(args); return allow; },
    save: async report => { checkpoints.push(report); },
  }));
  assert.equal(result.status, 'completed');
  assert.equal(result.calls, 2);
  assert.equal(result.release, 'blocked');
  assert.equal(result.humanQualification, 'pending');
  assert.deepEqual(calls.map(args => args.slice(0, 3)), [
    ['PRIVATE_REQUEST', 'input', { ageBand: '9-11', locale: 'en', task: 'learning' }],
    ['PRIVATE_CANDIDATE', 'output', { ageBand: '9-11', locale: 'en', task: 'learning' }],
  ]);
  assert.deepEqual(calls.map(args => args[4]), [
    { version: '1', requestInput: 'PRIVATE_REQUEST' }, { version: '1', requestInput: 'BOUND_REQUEST' },
  ]);
  assert.ok(calls.every(args => args[3] instanceof AbortSignal && Object.isFrozen(args[2]) && Object.isFrozen(args[4])));
  assert.deepEqual(checkpoints.map(row => [row.calls, row.reason]), [
    [0, 'before-call'], [1, 'after-result'], [1, 'before-call'], [2, 'finished'],
  ]);
  assert.deepEqual(result.observations, ['input-case', 'output-case'].map(id => ({ id, turns: [{ turn: 1, status: 'observed', decision: allow }] })));
  assert.equal(checkpoints[0].observations[0].turns[0].status, 'skipped');
  const serialized = JSON.stringify(checkpoints);
  for (const raw of ['PRIVATE_REQUEST', 'PRIVATE_CANDIDATE', 'BOUND_REQUEST', 'reviewers', 'expectations', 'delivery']) {
    assert.equal(serialized.includes(raw), false);
  }
});

test('rejects labels, reviews, delivery, duplicate IDs, wrong limits and missing output request before any side effects', async () => {
  let calls = 0, saves = 0;
  const opt = options({ assess: async () => { calls++; return allow; }, save: async () => { saves++; } });
  const invalid = [
    [{ ...input(), expected: allow }], [{ ...input(), expectations: [] }],
    [{ ...input(), reviewers: { safeguarding: 'x', language: 'y' } }],
    [{ ...input(), label: 'allow' }], [{ ...input(), track: 'delivery', turns: ['a', 'b'] }],
    [input(), input()], [{ ...output(), requestInput: undefined }],
    [{ ...input(), requestInput: 'extra' }], [{ ...input(), text: 'x'.repeat(4001) }],
    [{ ...output(), text: 'x'.repeat(8001) }], [{ ...output(), requestInput: 'x'.repeat(4001) }],
    [], new Array(1),
  ];
  for (const cases of invalid) await assert.rejects(runContextualAssessment(cases, opt), /^Error: invalid-cases$/);
  assert.equal(calls, 0);
  assert.equal(saves, 0);
});

test('uses exact shared schema including Unicode codepoint bounds', async () => {
  const row = { ...output(), text: '😀'.repeat(8000), requestInput: '😀'.repeat(4000) };
  assert.equal(validInput(row), true);
  const result = await runContextualAssessment([row], options());
  assert.equal(result.status, 'completed');
});

test('budget preflight never runs a partial corpus', async () => {
  let calls = 0, saves = 0;
  await assert.rejects(runContextualAssessment([input(), output()], options({ maxCalls: 1,
    assess: async () => { calls++; return allow; }, save: async () => { saves++; },
  })), /^Error: call-budget-exceeded$/);
  assert.equal(calls, 0);
  assert.equal(saves, 0);
});

test('requires bounded integer maxCalls, explicit signal, assessor and persistence', async () => {
  for (const maxCalls of [undefined, 0, -1, 2001, 1.5, Infinity, '2']) {
    await assert.rejects(runContextualAssessment([input()], options({ maxCalls })), /^Error: invalid-options$/);
  }
  for (const invalid of [{ signal: undefined }, { signal: {} }, { save: undefined }, { assess: undefined }]) {
    await assert.rejects(runContextualAssessment([input()], options(invalid)), /^Error: invalid-options$/);
  }
  for (const timeoutMs of [undefined, 0, -1, 30001, 1.5, Infinity, '2']) {
    await assert.rejects(runContextualAssessment([input()], options({ timeoutMs })), /^Error: invalid-options$/);
  }
});

test('failed initial, after-result, and next before-call persistence prevent subsequent calls and sanitize exceptions', async () => {
  for (const failureAt of [1, 2, 3]) {
    let calls = 0, saves = 0;
    await assert.rejects(runContextualAssessment([input(), output()], options({
      assess: async () => { calls++; return allow; },
      save: async () => { if (++saves === failureAt) throw Error('PRIVATE_DISK_ERROR'); },
    })), error => {
      assert.equal(error.message, 'checkpoint-failed');
      assert.equal(error.cause, undefined);
      assert.equal(String(error.stack).includes('PRIVATE_DISK_ERROR'), false);
      return true;
    });
    assert.equal(calls, failureAt === 1 ? 0 : 1);
    assert.equal(saves, failureAt);
  }
});

test('awaits persistence before calling and snapshots all cases/options before first await', async () => {
  const entered = deferred(), resume = deferred(), calls = [];
  const cases = [input(), output()];
  const opt = options({
    assess: async (...args) => { calls.push(args); return allow; },
    save: async report => {
      if (report.calls === 0) { entered.resolve(); await resume.promise; }
      assert.ok(Object.isFrozen(report.observations[0].turns[0]));
    },
  });
  const running = runContextualAssessment(cases, opt);
  await entered.promise;
  assert.equal(calls.length, 0);
  cases[0].text = 'MUTATED';
  cases[1].requestInput = 'MUTATED';
  cases[1].id = 'changed';
  cases.push(input('third'));
  opt.assess = () => { throw Error('mutated assessor'); };
  opt.save = () => { throw Error('mutated save'); };
  opt.maxCalls = 1;
  opt.timeoutMs = 0;
  resume.resolve();
  const result = await running;
  assert.equal(result.status, 'completed');
  assert.equal(result.maxCalls, 2);
  assert.equal(result.timeoutMs, 1000);
  assert.equal(calls[0][0], 'PRIVATE_REQUEST');
  assert.equal(calls[1][4].requestInput, 'BOUND_REQUEST');
  assert.equal(result.observations[1].id, 'output-case');
});

test('concurrent executions isolate request contexts, observations and corpus digests', async () => {
  const gate = deferred(), entered = deferred();
  const a = output('a'), b = { ...output('b'), requestInput: 'different request' };
  const seen = [];
  const first = runContextualAssessment([a], options({ assess: async (...args) => {
    seen.push(args[4]); entered.resolve(); await gate.promise; return allow;
  } }));
  await entered.promise;
  const second = await runContextualAssessment([b], options({ assess: async (...args) => {
    seen.push(args[4]); return { verdict: 'refuse', category: 'harm' };
  } }));
  gate.resolve();
  const result = await first;
  assert.deepEqual(seen, [{ version: '1', requestInput: 'BOUND_REQUEST' }, { version: '1', requestInput: 'different request' }]);
  assert.notEqual(result.corpusSha256, second.corpusSha256);
  assert.equal(result.observations[0].turns[0].decision.verdict, 'allow');
  assert.equal(second.observations[0].turns[0].decision.verdict, 'refuse');
});

test('hash matches shared corpusDigest(originalInput), independent of key order, sensitive to case order and context', async () => {
  const rows = [input(), output()];
  const run = cases => runContextualAssessment(cases, options());
  const first = await run(rows);
  assert.equal(first.corpusSha256, corpusDigest(rows));
  const reordered = rows.map(row => Object.fromEntries(Object.entries(row).reverse()));
  assert.equal((await run(reordered)).corpusSha256, corpusDigest(rows));
  assert.equal(first.corpusSha256, corpusDigest(reordered));
  assert.notEqual((await run([...rows].reverse())).corpusSha256, first.corpusSha256);
  assert.notEqual((await run([input(), { ...output(), requestInput: 'changed' }])).corpusSha256, first.corpusSha256);
});

test('assessment exceptions, invalid decisions and unavailable stop without retry or raw metadata', async () => {
  for (const response of ['throw', null, { ...allow, candidate: 'PRIVATE_CANDIDATE' },
    { verdict: 'allow', category: 'harm' }, { verdict: 'unavailable', category: 'none' }]) {
    let calls = 0;
    const checkpoints = [];
    const result = await runContextualAssessment([input(), output()], options({
      assess: async () => { calls++; if (response === 'throw') throw Error('PRIVATE_EXCEPTION'); return response; },
      save: async row => checkpoints.push(row),
    }));
    const unavailable = response?.verdict === 'unavailable';
    assert.equal(result.status, unavailable ? 'unavailable' : 'failure');
    assert.equal(calls, 1);
    assert.equal(result.observations[0].turns[0].status, unavailable ? 'observed' : 'failure');
    assert.equal(result.observations[1].turns[0].status, 'skipped');
    assert.equal(JSON.stringify(checkpoints).includes('PRIVATE_'), false);
  }
});

test('rejects accessors without executing them; result getters cannot leak into evidence', async () => {
  let getterCalls = 0;
  const row = input();
  Object.defineProperty(row, 'text', { enumerable: true, get() { getterCalls++; return 'PRIVATE'; } });
  await assert.rejects(runContextualAssessment([row], options()), /^Error: invalid-cases$/);
  const raw = { category: 'none', get verdict() { getterCalls++; throw Error('PRIVATE'); } };
  const result = await runContextualAssessment([input()], options({ assess: async () => raw }));
  assert.equal(result.status, 'failure');
  assert.equal(getterCalls, 0);
});

test('pre-aborted and checkpoint-triggered cancellation prevent assessment', async () => {
  for (const before of [true, false]) {
    let calls = 0;
    const controller = new AbortController();
    if (before) controller.abort('PRIVATE_ABORT_REASON');
    const result = await runContextualAssessment([input(), output()], options({ signal: controller.signal,
      assess: async () => { calls++; return allow; }, save: async () => controller.abort('PRIVATE_ABORT_REASON'),
    }));
    assert.equal(result.status, 'cancelled');
    assert.equal(calls, 0);
    assert.ok(result.observations.every(row => row.turns[0].status === 'skipped'));
    assert.equal(JSON.stringify(result).includes('PRIVATE_ABORT_REASON'), false);
  }
});

test('in-flight cancellation stops promptly even for an uncooperative assessor; late rejection is consumed', async () => {
  const entered = deferred(), controller = new AbortController();
  let rejectLate, calls = 0;
  const running = runContextualAssessment([input(), output()], options({ signal: controller.signal,
    assess: () => { calls++; entered.resolve(); return new Promise((resolve, reject) => { rejectLate = reject; }); },
  }));
  await entered.promise;
  controller.abort('PRIVATE_ABORT_REASON');
  const result = await running;
  assert.equal(result.status, 'cancelled');
  assert.equal(calls, 1);
  assert.deepEqual(result.observations.map(row => row.turns[0].status), ['failure', 'skipped']);
  rejectLate(Error('PRIVATE_LATE_FAILURE'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
});

test('aborting after a successful result checkpoint prevents the next call', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await runContextualAssessment([input(), output()], options({ signal: controller.signal,
    assess: async () => { calls++; return allow; },
    save: async row => { if (row.reason === 'after-result') controller.abort(); },
  }));
  assert.equal(calls, 1);
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(result.observations.map(row => row.turns[0].status), ['observed', 'skipped']);
});

test('accepts the maximum call budget while rejecting oversized corpora before execution', async () => {
  assert.equal((await runContextualAssessment([input()], options({ maxCalls: 2000 }))).status, 'completed');
  let calls = 0;
  await assert.rejects(runContextualAssessment(Array.from({ length: 2001 }, (_, index) => input(`case-${index}`)),
    options({ maxCalls: 2000, assess: async () => { calls++; return allow; } })), /^Error: invalid-cases$/);
  assert.equal(calls, 0);
});

test('cancellation in the final checkpoint preserves the observed decision and remains blocked', async () => {
  const controller = new AbortController();
  const checkpoints = [];
  const result = await runContextualAssessment([input()], options({ signal: controller.signal,
    save: async row => { checkpoints.push(row); if (row.status === 'completed') controller.abort(); },
  }));
  assert.equal(result.status, 'cancelled');
  assert.equal(result.calls, 1);
  assert.equal(result.observations[0].turns[0].status, 'observed');
  assert.equal(checkpoints.at(-1), result);
  assert.equal(result.release, 'blocked');
});

test('timeout aborts an uncooperative assessor, stops further calls, and ignores late success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const parent = new AbortController(), entered = deferred(), late = deferred();
  let calls = 0, callSignal;
  const checkpoints = [];
  const running = runContextualAssessment([input(), output()], options({ timeoutMs: 10, signal: parent.signal,
    assess: async (text, stage, profile, signal) => { calls++; callSignal = signal; entered.resolve(); return late.promise; },
    save: async report => checkpoints.push(report),
  }));
  await entered.promise;
  assert.notEqual(callSignal, parent.signal);
  assert.equal(callSignal.aborted, false);
  t.mock.timers.tick(10);
  const result = await running;
  assert.equal(result.status, 'failure');
  assert.equal(result.reason, 'assessment-timeout');
  assert.equal(result.timeoutMs, 10);
  assert.equal(calls, 1);
  assert.equal(callSignal.aborted, true);
  assert.equal(parent.signal.aborted, false);
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
  assert.deepEqual(result.observations.map(row => row.turns[0].status), ['failure', 'skipped']);
  const saved = JSON.stringify(result), count = checkpoints.length;
  late.resolve(allow);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(result), saved);
  assert.equal(checkpoints.length, count);
  assert.ok(Object.isFrozen(result.observations[0].turns[0]));
});

test('timeout wins over an assessor rejection triggered by abort and consumes late rejection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const entered = deferred();
  const running = runContextualAssessment([input()], options({ timeoutMs: 1,
    assess: (text, stage, profile, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Error('PRIVATE_TIMEOUT_ERROR')), { once: true });
      entered.resolve();
    }),
  }));
  await entered.promise;
  t.mock.timers.tick(1);
  const result = await running;
  assert.equal(result.reason, 'assessment-timeout');
  assert.equal(JSON.stringify(result).includes('PRIVATE_TIMEOUT_ERROR'), false);
});

test('successful and failed calls clean up timers and caller listeners', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const fails of [false, true]) {
    const controller = new AbortController();
    let callSignal;
    const result = await runContextualAssessment([input()], options({ signal: controller.signal, timeoutMs: 30000,
      assess: async (text, stage, profile, signal) => {
        callSignal = signal;
        if (fails) throw Error('PRIVATE_FAILURE');
        return allow;
      },
    }));
    assert.equal(result.status, fails ? 'failure' : 'completed');
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    controller.abort();
    t.mock.timers.tick(30000);
    assert.equal(callSignal.aborted, false);
  }
});

test('pre-abort creates no per-call timer or caller listener; in-flight cancellation removes both', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pre = new AbortController();
  pre.abort();
  const result = await runContextualAssessment([input()], options({ signal: pre.signal }));
  assert.equal(result.calls, 0);
  assert.equal(getEventListeners(pre.signal, 'abort').length, 0);
  const controller = new AbortController(), entered = deferred();
  let aborts = 0;
  const running = runContextualAssessment([input()], options({ signal: controller.signal, timeoutMs: 25,
    assess: (text, stage, profile, signal) => {
      signal.addEventListener('abort', () => { aborts++; }, { once: true });
      entered.resolve();
      return new Promise(() => {});
    },
  }));
  await entered.promise;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  controller.abort('PRIVATE_REASON');
  const cancelled = await running;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(aborts, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  t.mock.timers.tick(25);
  assert.equal(cancelled.reason, 'aborted');
});
