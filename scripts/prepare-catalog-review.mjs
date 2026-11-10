import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  requiredDeliveryResponseKeys, deliveryCatalogSha256, createResearchDeliveryProjection,
} from '../dist/delivery.js';

// Deliberately draft-only: changing actual deployment scope requires a new review.
export const REVIEW_SCOPE = Object.freeze({
  enabledLocales: Object.freeze(['en', 'fr', 'es']),
  ageBands: Object.freeze(['6-8', '9-11', '12-15', 'unknown']),
  receipt: Object.freeze({ protocolVersion: '1', policyVersion: 'unreviewed-draft-policy',
    detectorId: 'unreviewed-draft-detector', detectorRevision: 'unreviewed-draft-revision' }),
});
const fail = () => { throw new TypeError('Invalid UNREVIEWED catalog or mismatched review scope'); };
const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const serializeReviewPacket = packet => `${JSON.stringify(canonical(packet), null, 2)}\n`;

/** Offline consistency preparation only. No evidence, identity or approval is created. */
export async function prepareCatalogReview(draft, expectedScope = REVIEW_SCOPE) {
  // Work on JSON data only, without invoking caller-supplied accessors/toJSON.
  function jsonData(value) {
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
    if (!value || typeof value !== 'object'
      || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) fail();
    const result = Array.isArray(value) ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || key === '__proto__' || !Object.hasOwn(descriptor, 'value')) fail();
      result[key] = jsonData(descriptor.value);
    }
    return result;
  }
  const d = JSON.parse(JSON.stringify(jsonData(draft)));
  const expected = JSON.parse(JSON.stringify(jsonData(expectedScope)));
  if (!shape(d, ['catalogVersion', 'metadata', 'scope', 'catalog'])
    || d.catalogVersion !== 'unreviewed-draft-1'
    || !shape(d.metadata, ['reviewStatus', 'releaseStatus', 'humanQualification', 'ageScopeNote'])
    || d.metadata.reviewStatus !== 'UNREVIEWED' || d.metadata.releaseStatus !== 'blocked'
    || d.metadata.humanQualification !== 'pending'
    || typeof d.metadata.ageScopeNote !== 'string' || !d.metadata.ageScopeNote.trim()
    || !isDeepStrictEqual(d.scope, expected)
    || !isDeepStrictEqual(expected, JSON.parse(JSON.stringify(REVIEW_SCOPE)))
    || !d.catalog || typeof d.catalog !== 'object' || Array.isArray(d.catalog)) fail();
  const keys = d.scope.enabledLocales.flatMap(requiredDeliveryResponseKeys).sort();
  if (!isDeepStrictEqual(Object.keys(d.catalog).sort(), keys)) fail();
  // Existing delivery helper checks exact receipt shape and bounded plain text.
  createResearchDeliveryProjection({ receipt: d.scope.receipt, catalog: d.catalog,
    fallbackText: d.catalog['en.unavailable.none'] });
  const binding = { catalogVersion: d.catalogVersion, receipt: d.scope.receipt,
    enabledLocales: d.scope.enabledLocales, catalog: d.catalog };
  const catalogSha256 = await deliveryCatalogSha256(binding);
  return canonical({
    packetType: 'UNREVIEWED_RESPONSE_CATALOG_REVIEW_ONLY', packetVersion: 1,
    productionReady: false, releaseStatus: 'blocked', humanQualification: 'pending',
    metadata: d.metadata,
    catalogBinding: { ...binding, catalogSha256, ageBands: d.scope.ageBands,
      ageScopeBindingNote: 'Age bands are explicit review scope; the delivery catalog hash does not encode age bands.' },
    evidence: [],
    reviews: d.scope.enabledLocales.flatMap(locale => ['safeguarding', 'native-language'].map(role => ({
      locale, role, ageBands: d.scope.ageBands, status: 'pending', humanQualification: 'pending',
      catalogVersion: d.catalogVersion, catalogSha256, receipt: d.scope.receipt,
    }))),
  });
}

// No arbitrary input paths, environment values, credentials, network or error payloads.
// stdout contains only the checked-in public draft and fixed review metadata.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) fail();
    const draft = JSON.parse(await readFile(new URL('../catalogs/draft-responses.json', import.meta.url), 'utf8'));
    process.stdout.write(serializeReviewPacket(await prepareCatalogReview(draft)));
  } catch {
    process.stderr.write('Draft catalog review preparation failed; check local draft coverage and scope.\n');
    process.exitCode = 1;
  }
}
