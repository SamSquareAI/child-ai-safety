import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Requirements are checker policy, not editable switches in the manifest.
export const GATES = Object.freeze({
  safeguarding: ['independent-specialist-review', 'escalation-and-response-catalog', 'consent-and-child-rights'],
  'native-language-review': ['independent-native-reviewers', 'all-locales-and-age-bands', 'cultural-and-crisis-responses'],
  'provider-child-use': ['written-child-use-eligibility', 'model-and-account-terms', 'approved-age-and-region-scope'],
  'provider-retention': ['retention-and-training-terms', 'deletion-and-subprocessors', 'data-minimization-and-residency'],
  'semantic-evaluation': ['independent-held-out-evaluation', 'preregistered-thresholds-and-results', 'benign-adversarial-multiturn-and-language-coverage', 'real-adapter-end-to-end'],
  'koda-staging': ['authorized-staging-only', 'consent-revocation-and-fail-closed', 'renderer-tts-cache-log-leak-checks', 'existing-enforcement-and-rollback'],
  multitenancy: ['authenticated-tenant-isolation', 'distributed-quotas-and-billing', 'revocation-races-and-cross-tenant-tests'],
  deployment: ['supported-runtime-and-configuration', 'secrets-observability-and-incident-owners', 'rollback-and-recovery'],
  load: ['real-transport-state-and-inference', 'sustained-load-soak-and-failure-injection', 'latency-memory-cost-and-overload-budgets'],
  security: ['independent-threat-and-security-review', 'dependency-and-supply-chain-review', 'findings-remediated-or-explicitly-accepted'],
  'public-disclosure': ['publicly-reachable-private-reporting-channel', 'monitored-owners-and-response-expectations', 'supported-versions-and-coordinated-disclosure'],
  provenance: ['source-and-artifact-digests', 'reproducible-build-and-dependency-record', 'signed-attestation-and-release-authority'],
});
const INDEPENDENT = new Set(['safeguarding', 'native-language-review', 'semantic-evaluation', 'security']);
const SHA = /^[a-f0-9]{64}$/;
const REVISION = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const isSha = value => typeof value === 'string' && SHA.test(value);
const isRevision = value => typeof value === 'string' && REVISION.test(value);
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() === value && value.length > 0 &&
  !/^(?:pending|unknown|tbd|todo|n\/a|placeholder)$/i.test(value);
const isDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Local consistency guard only. `now` is injectable for unit tests, never a CLI option. */
export async function checkReadiness(manifestPath, { mode = 'draft', now = new Date(), queue = false } = {}) {
  const errors = [];
  const reviewTasks = new Map();
  const fail = message => errors.push(message);
  const shape = (value, keys, label) => {
    if (!isObject(value)) { fail(`${label}: expected object`); return false; }
    for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label}: missing ${key}`);
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label}: unknown field ${key}`);
    return true;
  };
  const strings = (value, label) => {
    if (!Array.isArray(value) || !value.length || value.some(v => !isText(v)) || new Set(value).size !== value.length) {
      fail(`${label}: expected nonempty unique strings`);
      return false;
    }
    return true;
  };
  const person = (value, label) => {
    if (shape(value, ['name', 'role', 'organization'], label)) {
      for (const key of ['name', 'role', 'organization']) if (!isText(value[key])) fail(`${label}.${key}: required`);
    }
  };
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) fail('clock: invalid current time');
  if (!['draft', 'production'].includes(mode)) fail('mode: must be draft or production');
  const freshness = (issuedAt, expiresAt, label) => {
    if (!isDate(issuedAt) || !isDate(expiresAt)) { fail(`${label}: invalid UTC timestamps`); return; }
    const issued = Date.parse(issuedAt), expires = Date.parse(expiresAt);
    if (issued > nowMs || issued < nowMs - MAX_AGE_MS || expires <= nowMs || expires <= issued) {
      fail(`${label}: stale, expired, future-dated, or invalid validity interval`);
    }
  };
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch { fail('manifest: missing, unreadable, or invalid JSON'); }
  const finish = () => {
    const blockers = [...errors];
    if (mode !== 'production') blockers.unshift('draft mode never authorizes a production release');
    const result = { status: blockers.length ? 'releaseblocked' : 'ready', mode,
      gatesSatisfied: errors.length === 0, releaseBlocked: blockers.length > 0 };
    if (!queue) return { ...result, blockers };
    return {
      ...result,
      blockerCount: blockers.length,
      reviews: Object.entries(GATES).map(([id, required]) => ({
        id,
        independentReviewerRequired: INDEPENDENT.has(id),
        ...(reviewTasks.get(id) ?? {
          nextAction: 'add-gate-record', missingEvidenceCoverage: [...required],
        }),
      })),
    };
  };
  if (!shape(manifest, ['schemaVersion', 'mode', 'testOnly', 'release', 'gates'], 'manifest')) return finish();
  if (manifest.schemaVersion !== 1) fail('schemaVersion: expected 1');
  if (!['draft', 'production'].includes(manifest.mode)) fail('manifest.mode: invalid');
  if (typeof manifest.testOnly !== 'boolean') fail('manifest.testOnly: required boolean');
  if (mode === 'production' && (manifest.mode !== 'production' || manifest.testOnly !== false)) {
    fail('production requires a production manifest with testOnly=false');
  }
  const release = manifest.release;
  if (shape(release, ['version', 'sourceRevision', 'artifactSha256', 'scope'], 'release')) {
    if (!isText(release.version)) fail('release.version: required');
    if (!isRevision(release.sourceRevision)) fail('release.sourceRevision: full Git revision required');
    if (!isSha(release.artifactSha256)) fail('release.artifactSha256: SHA-256 required');
    const scope = release.scope;
    if (shape(scope, ['locales', 'ageBands', 'providers', 'deploymentTarget', 'policyVersion', 'detectorRevision', 'kodaRevision'], 'release.scope')) {
      for (const key of ['locales', 'ageBands', 'providers']) strings(scope[key], `release.scope.${key}`);
      for (const key of ['deploymentTarget', 'policyVersion', 'detectorRevision', 'kodaRevision']) {
        if (!isText(scope[key])) fail(`release.scope.${key}: required`);
      }
    }
  }
  const binding = (value, label) => {
    if (!isRevision(value.releaseRevision) || value.releaseRevision !== release?.sourceRevision ||
        !isSha(value.artifactSha256) || value.artifactSha256 !== release?.artifactSha256) {
      fail(`${label}: must bind the exact release revision and artifact digest`);
    }
    if (typeof value.testOnly !== 'boolean' || value.testOnly !== manifest.testOnly) fail(`${label}: testOnly must match manifest`);
    if (mode === 'production' && value.testOnly !== false) fail(`${label}: test-only records cannot approve production`);
  };
  // Bind scope as well: changes to supported populations/providers invalidate every record.
  const scopeSha256 = createHash('sha256').update(JSON.stringify(release?.scope ?? null)).digest('hex');
  const scopeBinding = (value, label) => {
    binding(value, label);
    if (value.scopeSha256 !== scopeSha256) fail(`${label}: scope digest mismatch`);
  };
  if (!Array.isArray(manifest.gates)) { fail('gates: expected array'); return finish(); }
  const ids = manifest.gates.map(gate => gate?.id);
  if (new Set(ids).size !== ids.length) fail('gates: duplicate IDs');
  for (const id of Object.keys(GATES)) if (!ids.includes(id)) fail(`gates: missing ${id}`);
  const root = await realpath(path.dirname(path.resolve(manifestPath)));
  for (const gate of manifest.gates) {
    const gateStart = errors.length;
    const label = `gate ${gate?.id}`;
    if (!shape(gate, ['id', 'status', 'owner', 'approval', 'evidence', 'notes'], label)) continue;
    if (typeof gate.id !== 'string' || !Object.hasOwn(GATES, gate.id)) { fail(`${label}: unknown ID`); continue; }
    if (typeof gate.notes !== 'string') fail(`${label}.notes: expected string`);
    if (gate.status !== 'approved') fail(`${label}: ${gate.status === 'pending' || gate.status === 'rejected' ? gate.status : 'invalid status'}`);
    const ownerStart = errors.length;
    person(gate.owner, `${label}.owner`);
    const ownerMissing = errors.length > ownerStart;
    const evidenceStart = errors.length;
    const evidenceIds = [], covered = new Set(), evidenceDates = [];
    if (!Array.isArray(gate.evidence) || gate.evidence.length === 0) fail(`${label}: missing evidence`);
    for (const evidence of Array.isArray(gate.evidence) ? gate.evidence : []) {
      const el = `${label}.evidence`;
      if (!shape(evidence, ['id', 'ref', 'sha256', 'issuedAt', 'expiresAt', 'releaseRevision', 'artifactSha256', 'scopeSha256', 'testOnly', 'covers'], el)) continue;
      if (typeof evidence.id !== 'string' || !/^[a-z][a-z0-9-]{2,80}$/.test(evidence.id)) fail(`${el}: invalid ID`);
      evidenceIds.push(evidence.id);
      freshness(evidence.issuedAt, evidence.expiresAt, el);
      evidenceDates.push(Date.parse(evidence.issuedAt));
      scopeBinding(evidence, el);
      if (strings(evidence.covers, `${el}.covers`)) {
        for (const check of evidence.covers) {
          if (!GATES[gate.id].includes(check)) fail(`${el}: unknown coverage ${check}`);
          covered.add(check);
        }
      }
      if (!isSha(evidence.sha256)) fail(`${el}: invalid SHA-256`);
      const ref = evidence.ref;
      if (typeof ref !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(ref) ||
          ref.split('/').some(segment => ['', '.', '..'].includes(segment))) {
        fail(`${el}: ref must be a stable relative local file path`);
        continue;
      }
      try {
        const target = await realpath(path.resolve(root, ref));
        if (!target.startsWith(`${root}${path.sep}`) || target === await realpath(manifestPath)) throw new Error('outside evidence root');
        const info = await stat(target);
        if (!info.isFile() || info.size === 0 || info.size > 10 * 1024 * 1024) throw new Error('invalid file');
        const bytes = await readFile(target);
        if (createHash('sha256').update(bytes).digest('hex') !== evidence.sha256) fail(`${el}: content digest mismatch`);
      } catch { fail(`${el}: missing, unreadable, empty, oversized, or escaping evidence file`); }
    }
    if (new Set(evidenceIds).size !== evidenceIds.length) fail(`${label}: duplicate evidence IDs`);
    for (const check of GATES[gate.id]) if (!covered.has(check)) fail(`${label}: missing coverage ${check}`);
    const evidenceNeedsWork = errors.length > evidenceStart;
    const approval = gate.approval;
    const approvalStart = errors.length;
    if (shape(approval, ['reviewer', 'decision', 'independent', 'approvedAt', 'expiresAt', 'releaseRevision', 'artifactSha256', 'scopeSha256', 'testOnly', 'evidenceIds', 'evidenceSha256'], `${label}.approval`)) {
      person(approval.reviewer, `${label}.approval.reviewer`);
      if (approval.decision !== 'approved') fail(`${label}: explicit approval required`);
      if (typeof approval.independent !== 'boolean' || (INDEPENDENT.has(gate.id) && approval.independent !== true)) fail(`${label}: independent approval required`);
      if (INDEPENDENT.has(gate.id) && approval.reviewer?.name === gate.owner?.name) fail(`${label}: reviewer must differ from owner`);
      freshness(approval.approvedAt, approval.expiresAt, `${label}.approval`);
      if (evidenceDates.some(date => date > Date.parse(approval.approvedAt))) fail(`${label}: approval predates evidence`);
      scopeBinding(approval, `${label}.approval`);
      if (approval.evidenceSha256 !== createHash('sha256').update(JSON.stringify(gate.evidence ?? null)).digest('hex')) {
        fail(`${label}: approval evidence-set digest mismatch`);
      }
      if (strings(approval.evidenceIds, `${label}.approval.evidenceIds`) &&
          (approval.evidenceIds.length !== evidenceIds.length || evidenceIds.some(id => !approval.evidenceIds.includes(id)))) {
        fail(`${label}: approval must reference every evidence ID and no others`);
      }
    }
    if (queue) {
      let nextAction = 'checks-pass';
      if (ids.indexOf(gate.id) !== ids.lastIndexOf(gate.id)) nextAction = 'resolve-duplicate-gate';
      else if (ownerMissing) nextAction = 'assign-owner';
      else if (evidenceNeedsWork) nextAction = 'collect-or-fix-evidence';
      else if (gate.status === 'rejected') nextAction = 'resolve-rejection';
      else if (gate.status !== 'approved' || errors.length > approvalStart) nextAction = 'record-or-refresh-review';
      else if (errors.length > gateStart) nextAction = 'fix-gate-record';
      reviewTasks.set(gate.id, {
        nextAction,
        missingEvidenceCoverage: GATES[gate.id].filter(check => !covered.has(check)),
      });
    }
  }
  return finish();
}

async function main() {
  const args = process.argv.slice(2);
  let manifestPath = fileURLToPath(new URL('../release/readiness.json', import.meta.url)), mode = 'draft';
  const seen = new Set();
  let queue = false;
  try {
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (seen.has(flag)) throw new Error('usage');
      seen.add(flag);
      if (flag === '--queue') {
        queue = true;
        continue;
      }
      const value = args[++i];
      if (!['--manifest', '--mode'].includes(flag) || !value || value.startsWith('--')) throw new Error('usage');
      if (flag === '--manifest') manifestPath = path.resolve(value);
      else mode = value;
    }
    const result = await checkReadiness(manifestPath, { mode, queue });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.releaseBlocked ? 1 : 0;
  } catch {
    console.log(JSON.stringify({ status: 'releaseblocked', releaseBlocked: true,
      blockers: ['Unable to check readiness. Usage: node scripts/check-readiness.mjs [--manifest PATH] [--mode draft|production] [--queue]'] }, null, 2));
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
