import {pathToFileURL} from 'node:url';
import {createGateway} from '../dist/gateway.js';
import {createAdmissionController} from '../dist/admission.js';
import {createDeliveryProjection} from '../dist/delivery.js';

// All decisions below are scripted by scenario, never inferred from text.
export const AGE_BANDS = Object.freeze(['6-8', '9-11', '12-15', 'unknown']);
export const LOCALES = Object.freeze(['en', 'fr', 'es']);
const STAGES = Object.freeze(['input', 'output']);
const fullTrace = Object.freeze([
  'authorize', 'local-input', 'authorize', 'remote-input', 'authorize',
  'generate', 'local-output', 'authorize', 'remote-output', 'authorize',
]);
const specs = Object.freeze([
  ['allow', null, 'allow', 'none', 10],
  ['local-input-support', 'local-input', 'support', 'safeguarding', 2],
  ['local-input-refusal', 'local-input', 'refuse', 'privacy', 2],
  ['remote-input-support', 'remote-input', 'support', 'safeguarding', 4],
  ['remote-input-refusal', 'remote-input', 'refuse', 'harm', 4],
  ['local-output-refusal', 'local-output', 'refuse', 'privacy', 7],
  ['remote-output-refusal', 'remote-output', 'refuse', 'harm', 9],
  ['local-input-unavailable', 'local-input', 'unavailable', 'none', 2],
  ['remote-input-unavailable', 'remote-input', 'unavailable', 'none', 4],
  ['generation-unavailable', 'generate', 'unavailable', 'none', 6],
  ['remote-output-unavailable', 'remote-output', 'unavailable', 'none', 9],
  ['final-revocation', 'final-authorization', 'unavailable', 'none', 10],
].map(([id, stopAt, action, category, traceLength]) =>
  Object.freeze({id, stopAt, action, category, traceLength})));
export const SCENARIOS = Object.freeze(specs.map(s => s.id));
export const DEFAULT_CONFIG = Object.freeze({
  version: '1', mode: 'mock-offline', ageBands: AGE_BANDS, locales: LOCALES, stages: STAGES,
});
const invalid = () => { throw new TypeError('Invalid or incomplete offline scope matrix/configuration'); };
const shape = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    return d && Object.hasOwn(d, 'value');
  });
const exactSet = (value, expected) => Array.isArray(value) && value.length === expected.length &&
  new Set(value).size === expected.length && expected.every(v => value.includes(v));
const keyOf = c => `${c.ageBand}/${c.locale}/${c.scenario}`;

function validateConfig(config) {
  if (!shape(config, ['version', 'mode', 'ageBands', 'locales', 'stages']) ||
      config.version !== '1' || config.mode !== 'mock-offline' ||
      !exactSet(config.ageBands, AGE_BANDS) || !exactSet(config.locales, LOCALES) ||
      !exactSet(config.stages, STAGES)) invalid();
}

export function createScopeMatrix(config = DEFAULT_CONFIG) {
  validateConfig(config);
  return AGE_BANDS.flatMap(ageBand => LOCALES.flatMap(locale =>
    SCENARIOS.map(scenario => ({ageBand, locale, scenario}))));
}

/** Reject missing/duplicate/extra cells, partial scope, callbacks and raw text. */
export function validateScopeMatrix(cases, config = DEFAULT_CONFIG) {
  validateConfig(config);
  if (!Array.isArray(cases) || cases.length !== AGE_BANDS.length * LOCALES.length * SCENARIOS.length) invalid();
  const seen = new Set();
  for (const item of cases) {
    if (!shape(item, ['ageBand', 'locale', 'scenario']) || !AGE_BANDS.includes(item.ageBand) ||
        !LOCALES.includes(item.locale) || !SCENARIOS.includes(item.scenario) || seen.has(keyOf(item))) invalid();
    seen.add(keyOf(item));
  }
  return true;
}

const countActions = rows => Object.fromEntries(['allow', 'refuse', 'support', 'unavailable']
  .map(action => [action, rows.filter(row => row.action === action).length]));
const countCalls = trace => Object.fromEntries(fullTrace.filter((v, i, a) => a.indexOf(v) === i)
  .map(name => [name, trace.filter(v => v === name).length]));

async function exercise(item, admission) {
  const spec = specs.find(s => s.id === item.scenario);
  const profile = {ageBand: item.ageBand, locale: item.locale, task: 'learning'};
  const input = `SYNTHETIC_SCOPE_REQUEST:${keyOf(item)}`;
  const candidate = `SYNTHETIC_SCOPE_CANDIDATE:${keyOf(item)}`;
  const fallback = 'SYNTHETIC_SCOPE_STATIC_PLACEHOLDER';
  const receipt = {protocolVersion: '1', policyVersion: 'scope-mock-1',
    detectorId: 'explicit-scripted-mock', detectorRevision: '1'};
  const trace = [];
  let authorizationChecks = 0;
  let profilePreserved = true;
  let textBound = true;
  const inspectProfile = p => {
    profilePreserved &&= p.ageBand === item.ageBand && p.locale === item.locale &&
      p.task === 'learning' && Object.isFrozen(p);
  };
  // Explicit mock local and remote adapters. Optional Assess context is ignored.
  const mockAssess = source => async (text, stage, p) => {
    const boundary = `${source}-${stage}`;
    trace.push(boundary);
    inspectProfile(p);
    textBound &&= text === (stage === 'input' ? input : candidate);
    return spec.stopAt === boundary ? {verdict: spec.action, category: spec.category} :
      {verdict: 'allow', category: 'none'};
  };
  const gateway = createGateway({profile, policyVersion: receipt.policyVersion,
    authority: {tenantId: 'synthetic-scope', applicationId: 'offline-matrix'}, admission,
    detector: {protocolVersion: '1', id: receipt.detectorId, revision: receipt.detectorRevision,
      modality: 'text', ageBands: [...AGE_BANDS], locales: [...LOCALES], stages: [...STAGES]},
    authorize: async () => {
      trace.push('authorize'); authorizationChecks++;
      return !(spec.stopAt === 'final-authorization' && authorizationChecks === 5);
    },
    localAssess: mockAssess('local'), assess: mockAssess('remote'),
    generate: async (text, p) => {
      trace.push('generate'); inspectProfile(p); textBound &&= text === input;
      if (spec.stopAt === 'generate') throw new Error('SYNTHETIC_SCOPE_PRIVATE_ERROR');
      return candidate;
    },
  });
  const result = await gateway.run(input);
  // Research projection and memory spies only; no UI/TTS or reviewed copy.
  const project = createDeliveryProjection({receipt, catalog: {}, fallbackText: fallback});
  const view = project(result);
  const rendered = view.text;
  const spoken = view.text;
  const expectedTrace = fullTrace.slice(0, spec.traceLength);
  const diagnostics = gateway.diagnostics();
  const checks = {
    expectedAction: result.action === spec.action,
    exactStageOrder: JSON.stringify(trace) === JSON.stringify(expectedTrace),
    trustedProfilePreserved: profilePreserved,
    requestCandidateBound: textBound,
    expectedResponseId: spec.action === 'allow' ||
      result.responseId === `${item.locale}.${spec.action}.${spec.category}`,
    candidateSuppressed: spec.action === 'allow' ? result.text === candidate &&
      view.kind === 'approved' && rendered === candidate :
      !Object.hasOwn(result, 'text') && view.kind === 'static' && rendered === fallback && spoken === fallback,
    renderSpeechAgree: rendered === spoken,
    finalRevocation: spec.stopAt !== 'final-authorization' ||
      (authorizationChecks === 5 && diagnostics.byPhase.authorization.authorization_denied === 1),
    unavailabilityRecorded: spec.action !== 'unavailable' ||
      diagnostics.counts.detector_unavailable + diagnostics.counts.adapter_error +
        diagnostics.counts.authorization_denied === 1,
  };
  // Deliberate allowlist: no input, candidate, rendered text, exceptions or provider data.
  return {...item, expectedAction: spec.action, action: result.action,
    calls: countCalls(trace), deliveryKind: view.kind, checks,
    passed: Object.values(checks).every(Boolean)};
}

/** No provider/client/callback injection: this harness is exclusively offline. */
export async function evaluateScopeMatrix(options = {}) {
  if (!shape(options, Object.keys(options ?? {})) ||
      Object.keys(options).some(key => !['cases', 'config'].includes(key))) invalid();
  const config = options.config === undefined ? DEFAULT_CONFIG : options.config;
  const cases = options.cases === undefined ? createScopeMatrix(config) : options.cases;
  validateScopeMatrix(cases, config);
  // Snapshot before the first await; execute in canonical order even if cells were reordered.
  const cells = createScopeMatrix(config);
  const admission = createAdmissionController({maxConcurrent: 1, maxPerTenant: 1});
  const observations = [];
  for (const item of cells) observations.push(await exercise(item, admission));
  const slices = AGE_BANDS.flatMap(ageBand => LOCALES.map(locale => {
    const rows = observations.filter(r => r.ageBand === ageBand && r.locale === locale);
    return {ageBand, locale, planned: SCENARIOS.length, executed: rows.length,
      passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length,
      missing: SCENARIOS.filter(scenario => !rows.some(r => r.scenario === scenario)),
      actions: countActions(rows),
      scenarios: Object.fromEntries(SCENARIOS.map(s => [s, rows.filter(r => r.scenario === s).length]))};
  }));
  return {
    version: '1', evidenceKind: 'synthetic-offline-mock-control-flow',
    semanticStatus: 'not-evaluated', independentReview: false, liveProviderCalls: 0,
    generationPolicyExecuted: false, actualUiOrTtsExercised: false,
    scope: {ageBands: [...AGE_BANDS], locales: [...LOCALES], stages: [...STAGES], scenarios: [...SCENARIOS]},
    planned: cells.length, executed: observations.length,
    passed: observations.filter(r => r.passed).length, failed: observations.filter(r => !r.passed).length,
    complete: slices.every(s => s.missing.length === 0 && s.executed === s.planned),
    actions: countActions(observations), slices, observations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('This offline harness accepts no CLI arguments.\n');
    process.exitCode = 1;
  } else {
    try {
      const report = await evaluateScopeMatrix();
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.complete || report.failed) process.exitCode = 1;
    } catch {
      process.stderr.write('Offline scope matrix failed; no raw details retained.\n');
      process.exitCode = 1;
    }
  }
}
