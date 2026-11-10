import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {AGE_BANDS, LOCALES, SCENARIOS, DEFAULT_CONFIG, createScopeMatrix,
  validateScopeMatrix, evaluateScopeMatrix} from '../evaluation/scope-matrix.mjs';

test('complete offline matrix exercises every age/locale through the real gateway', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network forbidden in offline matrix'); };
  let report;
  try { report = await evaluateScopeMatrix(); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(report.evidenceKind, 'synthetic-offline-mock-control-flow');
  assert.equal(report.semanticStatus, 'not-evaluated');
  assert.equal(report.independentReview, false);
  assert.equal(report.liveProviderCalls, 0);
  assert.equal(report.generationPolicyExecuted, false);
  assert.equal(report.actualUiOrTtsExercised, false);
  assert.equal(report.planned, 144);
  assert.equal(report.executed, 144);
  assert.equal(report.passed, 144);
  assert.equal(report.failed, 0);
  assert.equal(report.complete, true);
  assert.deepEqual(report.actions, {allow: 12, refuse: 48, support: 24, unavailable: 60});
  assert.equal(report.slices.length, 12);
  for (const ageBand of AGE_BANDS) for (const locale of LOCALES) {
    const slice = report.slices.find(s => s.ageBand === ageBand && s.locale === locale);
    assert.deepEqual({...slice, ageBand: undefined, locale: undefined}, {
      ageBand: undefined, locale: undefined, planned: 12, executed: 12, passed: 12,
      failed: 0, missing: [], actions: {allow: 1, refuse: 4, support: 2, unavailable: 5},
      scenarios: Object.fromEntries(SCENARIOS.map(s => [s, 1])),
    });
    const rows = report.observations.filter(r => r.ageBand === ageBand && r.locale === locale);
    assert.equal(rows.length, 12);
    for (const row of rows) {
      assert.equal(row.passed, true, `${ageBand}/${locale}/${row.scenario}`);
      assert.ok(Object.values(row.checks).every(Boolean));
      assert.equal(row.calls.generate, ['allow', 'local-output-refusal', 'remote-output-refusal',
        'generation-unavailable', 'remote-output-unavailable', 'final-revocation'].includes(row.scenario) ? 1 : 0);
      assert.equal(row.calls['remote-output'], ['allow', 'remote-output-refusal',
        'remote-output-unavailable', 'final-revocation'].includes(row.scenario) ? 1 : 0);
      assert.equal(row.deliveryKind, row.scenario === 'allow' ? 'approved' : 'static');
    }
    for (const scenario of ['local-input-support', 'local-input-refusal', 'local-input-unavailable']) {
      assert.equal(rows.find(r => r.scenario === scenario).calls['remote-input'], 0);
    }
    const revoked = rows.find(r => r.scenario === 'final-revocation');
    assert.equal(revoked.calls.authorize, 5);
    assert.equal(revoked.calls['remote-output'], 1);
    assert.equal(revoked.action, 'unavailable');
  }
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /SYNTHETIC_SCOPE_|PRIVATE_ERROR|requestInput|responseId/);
  // Each observation is a fixed metadata-only shape; no raw candidate/result/view.
  for (const row of report.observations) assert.deepEqual(Object.keys(row).sort(),
    ['action', 'ageBand', 'calls', 'checks', 'deliveryKind', 'expectedAction', 'locale', 'passed', 'scenario']);
});

test('reports are deterministic and cell ordering cannot alter execution', async () => {
  const first = await evaluateScopeMatrix();
  const second = await evaluateScopeMatrix({cases: createScopeMatrix().reverse(), config: {
    ...DEFAULT_CONFIG, ageBands: [...AGE_BANDS].reverse(), locales: [...LOCALES].reverse(),
  }});
  assert.deepEqual(first, second);
});

test('incomplete, duplicate, mislabeled and text-bearing matrices fail before execution', async () => {
  const complete = createScopeMatrix();
  const matrices = [null, [], complete.slice(1), [...complete, complete[0]],
    complete.map((c, i) => i === 1 ? {...complete[0]} : c),
    complete.map(c => c.ageBand === 'unknown' ? {...c, ageBand: 'adult'} : c),
    complete.map(c => c.locale === 'fr' ? {...c, locale: 'de'} : c),
    complete.map((c, i) => i === 0 ? {...c, scenario: 'invented'} : c),
    complete.map((c, i) => i === 0 ? {...c, input: 'RAW_TEXT_MUST_NOT_LEAK'} : c),
    complete.map((c, i) => i === 0 ? {...c, expectedAction: 'allow'} : c),
  ];
  for (const cases of matrices) {
    assert.throws(() => validateScopeMatrix(cases), /Invalid or incomplete offline/);
    await assert.rejects(evaluateScopeMatrix({cases}), /Invalid or incomplete offline/);
  }
});

test('incomplete or non-mock config and adapter injection are rejected', async () => {
  const sparseBands = [...AGE_BANDS];
  delete sparseBands[3];
  for (const config of [null, {}, {...DEFAULT_CONFIG, mode: 'live'}, {...DEFAULT_CONFIG, version: '2'},
    {...DEFAULT_CONFIG, ageBands: ['9-11']}, {...DEFAULT_CONFIG, locales: ['en']},
    {...DEFAULT_CONFIG, stages: ['input']}, {...DEFAULT_CONFIG, stages: ['output', 'output']},
    {...DEFAULT_CONFIG, locales: ['en', 'fr', 'fr']}, {...DEFAULT_CONFIG, ageBands: [...AGE_BANDS, 'adult']},
    {...DEFAULT_CONFIG, ageBands: sparseBands},
    {...DEFAULT_CONFIG, assess: async () => ({verdict: 'allow', category: 'none'})},
  ]) {
    assert.throws(() => createScopeMatrix(config), /Invalid or incomplete offline/);
    await assert.rejects(evaluateScopeMatrix({config}), /Invalid or incomplete offline/);
  }
  await assert.rejects(evaluateScopeMatrix({generator: () => 'RAW_TEXT_MUST_NOT_LEAK'}),
    /Invalid or incomplete offline/);
  await assert.rejects(evaluateScopeMatrix(null), /Invalid or incomplete offline/);
  const config = {...DEFAULT_CONFIG};
  Object.defineProperty(config, 'mode', {get() { throw new Error('RAW_TEXT_MUST_NOT_LEAK'); }});
  assert.throws(() => createScopeMatrix(config), /Invalid or incomplete offline/);
});

test('CLI emits only the metadata report and rejects scope/adapter flags', () => {
  const cwd = new URL('..', import.meta.url);
  const result = spawnSync(process.execPath, ['evaluation/scope-matrix.mjs'], {cwd, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).passed, 144);
  assert.doesNotMatch(result.stdout, /SYNTHETIC_SCOPE_/);
  const invalid = spawnSync(process.execPath, ['evaluation/scope-matrix.mjs', '--live'], {cwd, encoding: 'utf8'});
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
});

test('generation policy declares trusted age bands and restrictive unknown handling', async () => {
  const policy = await readFile(new URL('../evaluation/generation-policy-draft.txt', import.meta.url), 'utf8');
  assert.match(policy, /trusted backend profile\.ageBand/);
  for (const band of AGE_BANDS) assert.ok(policy.includes(`- ${band}:`));
  assert.match(policy, /unknown: use the restrictive 6-8 constraints/);
  assert.match(policy, /absent or unsupported trusted ageBand/);
  assert.doesNotMatch(policy, /suitable for ages 9–11/);
  // This checks policy wiring text only; no model executes or judges these instructions.
});
