import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { checkReadiness, GATES } from '../scripts/check-readiness.mjs';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const sha = value => createHash('sha256').update(value).digest('hex');
const hashJson = value => sha(JSON.stringify(value));
const checker = fileURLToPath(new URL('../scripts/check-readiness.mjs', import.meta.url));
const checkedIn = fileURLToPath(new URL('../release/readiness.json', import.meta.url));
const run = (manifest, options = {}) => checkReadiness(manifest, { now: NOW, ...options });

// Entirely invented records for validator tests. Never saved to the checkout,
// never used as production approvals, and deliberately marked testOnly at every layer.
async function fixture(t, now = NOW) {
  const dir = await mkdtemp(path.join(tmpdir(), 'readiness-TEST-ONLY-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'evidence'));
  const issuedAt = new Date(now.getTime() - 60_000).toISOString();
  const approvedAt = new Date(now.getTime() - 30_000).toISOString();
  const expiresAt = new Date(now.getTime() + 86_400_000).toISOString();
  const release = { version: 'TEST-ONLY-0.0.0', sourceRevision: 'a'.repeat(40), artifactSha256: sha('TEST ONLY ARTIFACT'),
    scope: { locales: ['en'], ageBands: ['9-11'], providers: ['TEST ONLY PROVIDER'], deploymentTarget: 'TEST ONLY TEMP DIRECTORY',
      policyVersion: 'TEST-ONLY-policy', detectorRevision: 'TEST-ONLY-detector', kodaRevision: 'TEST-ONLY-koda' } };
  const binding = { releaseRevision: release.sourceRevision, artifactSha256: release.artifactSha256,
    scopeSha256: hashJson(release.scope), testOnly: true };
  const gates = [];
  for (const [id, covers] of Object.entries(GATES)) {
    const content = `TEST ONLY: fabricated ${id} evidence; no external review occurred.\n`;
    const ref = `evidence/${id}.txt`;
    await writeFile(path.join(dir, ref), content);
    const evidence = [{ id: `${id}-test-record`, ref, sha256: sha(content), issuedAt, expiresAt, ...binding, covers: [...covers] }];
    gates.push({ id, status: 'approved', owner: { name: 'TEST ONLY owner', role: 'TEST ONLY maintainer', organization: 'TEST ONLY organization' },
      approval: { reviewer: { name: 'TEST ONLY reviewer', role: 'TEST ONLY specialist', organization: 'TEST ONLY review organization' },
        decision: 'approved', independent: true, approvedAt, expiresAt, ...binding,
        evidenceIds: evidence.map(e => e.id), evidenceSha256: hashJson(evidence) },
      evidence, notes: 'TEST ONLY: synthetic validator fixture, not a real approval.' });
  }
  const manifest = { schemaVersion: 1, mode: 'draft', testOnly: true, release, gates };
  const manifestPath = path.join(dir, 'readiness.json');
  const save = () => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await save();
  return { dir, manifest, manifestPath, save };
}

test('review queue routes missing owners, evidence and approval without printing record details', async t => {
  const { manifest, manifestPath, save } = await fixture(t);
  manifest.gates.find(gate => gate.id === 'safeguarding').owner = null;
  manifest.gates.find(gate => gate.id === 'native-language-review').evidence = [];
  manifest.gates.find(gate => gate.id === 'security').approval = null;
  await save();
  const result = await run(manifestPath, { queue: true });
  const reviews = Object.fromEntries(result.reviews.map(review => [review.id, review]));
  assert.equal(result.releaseBlocked, true);
  assert.equal(reviews.safeguarding.nextAction, 'assign-owner');
  assert.equal(reviews.safeguarding.independentReviewerRequired, true);
  assert.equal(reviews['native-language-review'].nextAction, 'collect-or-fix-evidence');
  assert.deepEqual(reviews['native-language-review'].missingEvidenceCoverage, GATES['native-language-review']);
  assert.equal(reviews.security.nextAction, 'record-or-refresh-review');
  assert.equal(reviews.deployment.nextAction, 'checks-pass');
  assert.doesNotMatch(JSON.stringify(result), /TEST ONLY|evidence\/.*\.txt/);
});

test('repository manifest is draft, has every gate pending and no invented approvals', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(checkedIn, 'utf8'));
  assert.equal(manifest.mode, 'draft');
  assert.equal(manifest.testOnly, false);
  assert.equal(manifest.release, null);
  assert.deepEqual(manifest.gates.map(g => g.id).sort(), Object.keys(GATES).sort());
  for (const gate of manifest.gates) {
    assert.equal(gate.status, 'pending'); assert.equal(gate.owner, null);
    assert.equal(gate.approval, null); assert.deepEqual(gate.evidence, []);
  }
  for (const mode of ['draft', 'production']) {
    const result = await run(checkedIn, { mode });
    assert.equal(result.releaseBlocked, true); assert.equal(result.gatesSatisfied, false);
  }
});

test('all gates validate only with complete synthetic local data; draft still exits blocked', async t => {
  const f = await fixture(t, new Date());
  const result = await checkReadiness(f.manifestPath);
  assert.equal(result.gatesSatisfied, true, result.blockers.join('\n'));
  assert.equal(result.status, 'releaseblocked'); assert.equal(result.releaseBlocked, true);
  assert.deepEqual(result.blockers, ['draft mode never authorizes a production release']);
  const cli = spawnSync(process.execPath, [checker, '--manifest', f.manifestPath], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.equal(JSON.parse(cli.stdout).gatesSatisfied, true);
});

test('test-only records cannot authorize production even when manifest mode is changed', async t => {
  const f = await fixture(t);
  for (const manifestMode of ['draft', 'production']) {
    f.manifest.mode = manifestMode;
    await f.save();
    const result = await run(f.manifestPath, { mode: 'production' });
    assert.equal(result.releaseBlocked, true); assert.equal(result.gatesSatisfied, false);
    assert.match(result.blockers.join('\n'), /testOnly=false|test-only records/);
  }
  // Relabeling the top level alone cannot turn test approvals into real ones.
  f.manifest.testOnly = false;
  await f.save();
  assert.equal((await run(f.manifestPath, { mode: 'production' })).releaseBlocked, true);
});

const invalidCases = {
  'missing gate': m => m.gates.pop(),
  'duplicate gate': m => m.gates.push(structuredClone(m.gates[0])),
  'unknown gate': m => { m.gates[0].id = 'invented'; },
  'non-string gate ID': m => { m.gates[0].id = ['safeguarding']; },
  'pending status': m => { m.gates[0].status = 'pending'; },
  'rejected status': m => { m.gates[0].status = 'rejected'; },
  'invalid status': m => { m.gates[0].status = 'passed'; },
  'missing evidence': m => { m.gates[0].evidence = []; },
  'invalid digest': m => { m.gates[0].evidence[0].sha256 = 'bad'; },
  'mismatched digest': m => { m.gates[0].evidence[0].sha256 = '0'.repeat(64); },
  'stale evidence': m => { m.gates[0].evidence[0].issuedAt = '2026-01-01T00:00:00.000Z'; },
  'expired evidence': m => { m.gates[0].evidence[0].expiresAt = NOW.toISOString(); },
  'future evidence': m => { m.gates[0].evidence[0].issuedAt = '2026-11-10T00:00:00.000Z'; },
  'invalid calendar date': m => { m.gates[0].evidence[0].issuedAt = '2026-02-30T00:00:00.000Z'; },
  'invalid timestamp': m => { m.gates[0].evidence[0].issuedAt = 'yesterday'; },
  'expired approval': m => { m.gates[0].approval.expiresAt = NOW.toISOString(); },
  'stale approval': m => { m.gates[0].approval.approvedAt = '2026-01-01T00:00:00.000Z'; },
  'future approval': m => { m.gates[0].approval.approvedAt = '2026-11-10T00:00:00.000Z'; },
  'approval predates evidence': m => { m.gates[0].approval.approvedAt = '2026-11-09T11:00:00.000Z'; },
  'wrong evidence release': m => { m.gates[0].evidence[0].releaseRevision = 'b'.repeat(40); },
  'wrong approval artifact': m => { m.gates[0].approval.artifactSha256 = 'b'.repeat(64); },
  'changed scope': m => { m.release.scope.locales.push('fr'); },
  'wrong approval scope': m => { m.gates[0].approval.scopeSha256 = 'b'.repeat(64); },
  'mutated evidence set': m => { m.gates[0].evidence[0].expiresAt = '2026-11-11T12:00:00.000Z'; },
  'missing coverage': m => { m.gates[0].evidence[0].covers.pop(); },
  'unknown coverage': m => { m.gates[0].evidence[0].covers.push('invented'); },
  'empty provider scope': m => { m.release.scope.providers = []; },
  'duplicate locale scope': m => { m.release.scope.locales.push('en'); },
  'placeholder metadata': m => { m.gates[0].owner.name = 'TBD'; },
  'blank reviewer': m => { m.gates[0].approval.reviewer.organization = ''; },
  'no explicit approval': m => { m.gates[0].approval.decision = 'pending'; },
  'no independent reviewer': m => { m.gates[0].approval.independent = false; },
  'self review': m => { m.gates[0].approval.reviewer.name = m.gates[0].owner.name; },
  'wrong evidence approval': m => { m.gates[0].approval.evidenceIds = ['invented']; },
  'duplicate evidence': m => { m.gates[0].evidence.push(structuredClone(m.gates[0].evidence[0])); },
  'unknown schema version': m => { m.schemaVersion = 2; },
  'unknown manifest field': m => { m.allowTestProduction = true; },
  'invalid mode': m => { m.mode = 'test'; },
  'nonboolean test marker': m => { m.testOnly = 'false'; },
  'missing file': m => { m.gates[0].evidence[0].ref = 'evidence/missing.txt'; },
  'URL ref': m => { m.gates[0].evidence[0].ref = 'https://example.invalid/approval'; },
  'absolute ref': m => { m.gates[0].evidence[0].ref = '/tmp/approval'; },
  'parent traversal': m => { m.gates[0].evidence[0].ref = '../approval'; },
  'manifest as evidence': m => { m.gates[0].evidence[0].ref = 'readiness.json'; },
};
test('invalid and incomplete records cannot satisfy gates', async t => {
  for (const [name, mutate] of Object.entries(invalidCases)) await t.test(name, async t => {
    const f = await fixture(t); mutate(f.manifest);
    // Keep the synthetic evidence-set binding consistent so it cannot mask the
    // independent validation under test (except the binding-mutation test).
    if (name !== 'mutated evidence set') {
      for (const gate of f.manifest.gates) gate.approval.evidenceSha256 = hashJson(gate.evidence);
    }
    await f.save();
    const result = await run(f.manifestPath);
    assert.equal(result.gatesSatisfied, false, JSON.stringify(result));
    assert.equal(result.releaseBlocked, true);
  });
});

test('every required field is mandatory at each metadata layer', async t => {
  const f = await fixture(t);
  const original = structuredClone(f.manifest);
  const objects = [[], ['release'], ['release', 'scope'], ['gates', 0], ['gates', 0, 'owner'],
    ['gates', 0, 'evidence', 0], ['gates', 0, 'approval'], ['gates', 0, 'approval', 'reviewer']];
  for (const keys of objects) {
    const object = keys.reduce((value, key) => value[key], original);
    for (const key of Object.keys(object)) {
      const changed = structuredClone(original);
      delete keys.reduce((value, part) => value[part], changed)[key];
      await writeFile(f.manifestPath, JSON.stringify(changed));
      const result = await run(f.manifestPath);
      assert.equal(result.gatesSatisfied, false, `accepted missing ${[...keys, key].join('.')}`);
    }
  }
});

test('changed bytes, empty evidence and symlink escape fail local evidence checks', async t => {
  const f = await fixture(t);
  const target = path.join(f.dir, f.manifest.gates[0].evidence[0].ref);
  for (const content of ['Changed TEST ONLY content', '']) {
    await writeFile(target, content);
    assert.equal((await run(f.manifestPath)).gatesSatisfied, false);
  }
  const outside = await mkdtemp(path.join(tmpdir(), 'readiness-OUTSIDE-TEST-ONLY-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'record'), 'TEST ONLY outside evidence');
  await symlink(path.join(outside, 'record'), path.join(f.dir, 'evidence', 'escape'));
  f.manifest.gates[0].evidence[0].ref = 'evidence/escape';
  f.manifest.gates[0].evidence[0].sha256 = sha('TEST ONLY outside evidence');
  f.manifest.gates[0].approval.evidenceSha256 = hashJson(f.manifest.gates[0].evidence);
  await f.save();
  assert.match((await run(f.manifestPath)).blockers.join('\n'), /escaping evidence file/);
});

test('missing/malformed manifests, invalid clock and CLI options fail closed', async t => {
  const f = await fixture(t);
  assert.equal((await run(path.join(f.dir, 'absent.json'))).releaseBlocked, true);
  for (const text of ['{', 'null', '[]', '{"schemaVersion":1}']) {
    await writeFile(f.manifestPath, text);
    assert.equal((await run(f.manifestPath)).gatesSatisfied, false);
  }
  await f.save();
  assert.equal((await run(f.manifestPath, { now: new Date(NaN) })).gatesSatisfied, false);
  for (const args of [[], ['--mode', 'production'], ['--mode', 'test'], ['--allow-test-production'],
    ['--now', NOW.toISOString()], ['--mode'], ['--mode', 'draft', '--mode', 'production']]) {
    const cli = spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8' });
    assert.equal(cli.status, 1); assert.equal(JSON.parse(cli.stdout).releaseBlocked, true);
  }
});
