import { createClaudeAssessmentAdapter } from '../dist/claude-assessment.js';
import { corpusDigest } from './corpus-digest.mjs';
import { runContextualAssessment } from './contextual-assessment-runner.mjs';

export function claudeHoldoutConfiguration({ model, apiVersion, systemPolicy, maxCalls, timeoutMs }) {
  const policySha256 = corpusDigest(systemPolicy);
  return {
    adapter: 'claude-messages-contextual-v1',
    model, apiVersion, policySha256, timeoutMs, maxCalls,
    maxOutputTokens: 128, maxRequestBytes: 65536, maxResponseBytes: 16384,
    capabilities: {
      protocolVersion: '1', id: 'claude-holdout', revision: policySha256.slice(0, 32),
      modality: 'text', locales: ['en', 'fr', 'es'],
      ageBands: ['6-8', '9-11', '12-15', 'unknown'], stages: ['input', 'output'],
    },
  };
}

/** Compose the exact assessment subset with a caller-supplied Claude transport. */
export async function runClaudeHoldout(cases, options) {
  const {
    assessmentSha256, configurationSha256, systemPolicy, apiKey, fetch, signal, save,
    model, apiVersion, maxCalls, timeoutMs,
  } = options;
  if (typeof save !== 'function') throw new TypeError('invalid-checkpoint-writer');
  if (corpusDigest(cases) !== assessmentSha256) throw new Error('assessment-freeze-mismatch');
  const configuration = claudeHoldoutConfiguration({ model, apiVersion, systemPolicy, maxCalls, timeoutMs });
  if (corpusDigest(configuration) !== configurationSha256) throw new Error('configuration-freeze-mismatch');

  const { adapter, policySha256, maxCalls: callLimit, ...adapterOptions } = configuration;
  const { assess } = createClaudeAssessmentAdapter({ ...adapterOptions, systemPolicy, apiKey, fetch });
  const bind = report => Object.freeze({
    ...report, adapter, model, apiVersion, policySha256, configurationSha256,
  });
  const report = await runContextualAssessment(cases, {
    assess, maxCalls: callLimit, timeoutMs, signal,
    save: report => save(bind(report)),
  });
  return bind(report);
}
