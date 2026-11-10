import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepareCatalogReview, REVIEW_SCOPE, serializeReviewPacket } from '../scripts/prepare-catalog-review.mjs';
import { requiredDeliveryResponseKeys, deliveryCatalogSha256, createDeploymentDeliveryProjection } from '../dist/delivery.js';
const draft = JSON.parse(await readFile(new URL('../catalogs/draft-responses.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(draft);

test('27 concrete drafts cover exactly nine runtime keys in each locale and all age scopes', async () => {
  const packet = await prepareCatalogReview(copy());
  assert.equal(Object.keys(packet.catalogBinding.catalog).length, 27);
  for (const locale of ['en', 'fr', 'es']) {
    const keys = requiredDeliveryResponseKeys(locale);
    assert.equal(keys.length, 9);
    for (const key of keys) {
      assert.equal(typeof packet.catalogBinding.catalog[key], 'string');
      assert.ok(packet.catalogBinding.catalog[key].trim().length > 20);
      assert.doesNotMatch(packet.catalogBinding.catalog[key], /UNREVIEWED|TODO|\{.*\}/);
    }
  }
  assert.deepEqual(packet.catalogBinding.ageBands, ['6-8', '9-11', '12-15', 'unknown']);
  assert.equal(packet.metadata.reviewStatus, 'UNREVIEWED');
  assert.equal(packet.releaseStatus, 'blocked');
  assert.equal(packet.humanQualification, 'pending');
  assert.equal(packet.productionReady, false);
  assert.deepEqual(packet.evidence, []);
  assert.equal(packet.reviews.length, 6);
  for (const review of packet.reviews) {
    assert.equal(review.status, 'pending');
    assert.equal(review.humanQualification, 'pending');
    assert.deepEqual(review.ageBands, packet.catalogBinding.ageBands);
    assert.deepEqual(review.receipt, packet.catalogBinding.receipt);
    assert.equal(review.catalogVersion, packet.catalogBinding.catalogVersion);
    assert.equal(review.catalogSha256, packet.catalogBinding.catalogSha256);
    assert.equal(Object.hasOwn(review, 'reviewerRef'), false);
    assert.equal(Object.hasOwn(review, 'decision'), false);
  }
});

test('every missing key, extra key and invalid copy blocks preparation', async () => {
  for (const key of Object.keys(draft.catalog)) {
    const d = copy(); delete d.catalog[key];
    await assert.rejects(prepareCatalogReview(d), TypeError, key);
  }
  for (const mutate of [
    d => { d.catalog['en.support.none'] = 'Extra'; },
    d => { d.catalog['de.support.harm'] = 'Extra'; },
    d => { d.catalog['en.support.harm'] = ' '; },
    d => { d.catalog['en.support.harm'] = 'x'.repeat(8001); },
    d => { d.metadata.reviewStatus = 'approved'; },
    d => { d.metadata.humanQualification = 'qualified'; },
    d => { d.metadata.releaseStatus = 'ready'; },
    d => { d.evidence = ['invented']; },
  ]) {
    const d = copy(); mutate(d); await assert.rejects(prepareCatalogReview(d), TypeError);
  }
});

test('locale, age, version and each exact receipt mismatch fail closed', async () => {
  const mutations = [
    d => { d.scope.enabledLocales.pop(); },
    d => { d.scope.enabledLocales.push('de'); },
    d => { d.scope.enabledLocales = ['en', 'en', 'es']; },
    d => { d.scope.ageBands.pop(); },
    d => { d.scope.ageBands.push('16-17'); },
    d => { d.catalogVersion = 'other-version'; },
    ...Object.keys(REVIEW_SCOPE.receipt).map(key => d => { d.scope.receipt[key] = 'different'; }),
    d => { d.scope.receipt.extra = 'unexpected'; },
  ];
  for (const mutate of mutations) {
    const d = copy(); mutate(d); await assert.rejects(prepareCatalogReview(d), TypeError);
  }
  const expected = structuredClone(REVIEW_SCOPE); expected.receipt.detectorRevision = 'different';
  await assert.rejects(prepareCatalogReview(copy(), expected), TypeError);
  // Matching a caller-supplied alternate scope is insufficient for this draft-only command.
  const d = copy(); d.scope = expected;
  await assert.rejects(prepareCatalogReview(d, expected), TypeError);
});

test('canonical catalog digest matches delivery helper and independent SHA-256; copy or receipt changes rebind', async () => {
  const packet = await prepareCatalogReview(copy());
  const b = packet.catalogBinding;
  const canonicalBytes = JSON.stringify([b.catalogVersion,
    ['protocolVersion', 'policyVersion', 'detectorId', 'detectorRevision'].map(k => b.receipt[k]),
    [...b.enabledLocales].sort(), Object.keys(b.catalog).sort().map(k => [k, b.catalog[k]])]);
  assert.equal(b.catalogSha256, createHash('sha256').update(canonicalBytes).digest('hex'));
  assert.equal(b.catalogSha256, await deliveryCatalogSha256(b));
  const reordered = copy(); reordered.catalog = Object.fromEntries(Object.entries(reordered.catalog).reverse());
  assert.equal(serializeReviewPacket(packet), serializeReviewPacket(await prepareCatalogReview(reordered)));
  const changed = copy(); changed.catalog['en.refuse.harm'] += ' Choose a learning topic.';
  assert.notEqual((await prepareCatalogReview(changed)).catalogBinding.catalogSha256, b.catalogSha256);
  for (const key of ['policyVersion', 'detectorId', 'detectorRevision']) {
    assert.notEqual(await deliveryCatalogSha256({ ...b, receipt: { ...b.receipt, [key]: 'different' } }), b.catalogSha256);
  }
  assert.notEqual(await deliveryCatalogSha256({ ...b, catalogVersion: 'different' }), b.catalogSha256);
});

test('review packet and extracted catalog cannot authorize deployment; no synthetic approvals needed', async () => {
  const packet = await prepareCatalogReview(copy());
  await assert.rejects(createDeploymentDeliveryProjection(packet), TypeError);
  await assert.rejects(createDeploymentDeliveryProjection(packet.catalogBinding), TypeError);
  await assert.rejects(createDeploymentDeliveryProjection({ ...packet.catalogBinding,
    evidence: packet.evidence, reviews: packet.reviews }), TypeError);
});

test('preparation snapshots input before hashing and refuses accessors without executing them', async () => {
  const d = copy(); const pending = prepareCatalogReview(d);
  d.catalog['en.refuse.harm'] = 'Changed';
  assert.equal((await pending).catalogBinding.catalog['en.refuse.harm'], draft.catalog['en.refuse.harm']);
  let accessed = false;
  const bad = copy(); Object.defineProperty(bad.catalog, 'en.refuse.harm', { get() { accessed = true; return 'secret'; } });
  await assert.rejects(prepareCatalogReview(bad), TypeError);
  assert.equal(accessed, false);
});

test('offline CLI deterministically emits only the public draft packet and sanitizes invalid arguments', async () => {
  const script = new URL('../scripts/prepare-catalog-review.mjs', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, [script.pathname, ...args], { encoding: 'utf8' });
  const result = run();
  assert.equal(result.status, 0); assert.equal(result.stderr, '');
  assert.equal(result.stdout, serializeReviewPacket(await prepareCatalogReview(copy())));
  assert.equal(run().stdout, result.stdout);
  const bad = run('--input=PRIVATE_TEST_MARKER');
  assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
  assert.doesNotMatch(bad.stderr, /PRIVATE_TEST_MARKER/);
});
