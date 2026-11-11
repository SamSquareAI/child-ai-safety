import test from 'node:test';
import assert from 'node:assert/strict';
import { describeClaudeEnvelope } from '../evaluation/provider-envelope-diagnostics.mjs';
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const model = 'synthetic-model';
const envelope = (text, stop_reason = 'end_turn') => ({ type: 'message', role: 'assistant', model, stop_reason,
  content: [{ type: 'text', text }], id: 'PRIVATE_PROVIDER_ID', usage: { private: 'PRIVATE_USAGE' } });

test('distinguishes valid unavailable, non-JSON, invalid decision, refusal and token-limit metadata without content', () => {
  assert.equal(describeClaudeEnvelope(encode(envelope('{"verdict":"unavailable","category":"none"}')), model).assessment, 'valid-unavailable');
  const refusal = describeClaudeEnvelope(encode(envelope('PRIVATE_REFUSAL_TEXT', 'refusal')), model);
  assert.equal(refusal.stopReason, 'refusal'); assert.equal(refusal.assessment, 'invalid-json');
  assert.equal(describeClaudeEnvelope(encode(envelope('{"verdict":"allow","category":"harm"}')), model).assessment, 'invalid-assessment');
  assert.equal(describeClaudeEnvelope(encode(envelope('{"verdict":', 'max_tokens')), model).stopReason, 'max_tokens');
  assert.equal(describeClaudeEnvelope(encode(envelope('{"verdict":"allow","category":"none"}')), model).assessment, 'valid-allow');
  assert.doesNotMatch(JSON.stringify(refusal), /PRIVATE_|synthetic-model|content|usage/);
  assert.equal(Object.isFrozen(refusal), true);
});

test('bounded malformed bytes, unknown provider strings and absent text produce fixed diagnostics only', () => {
  assert.equal(describeClaudeEnvelope(new Uint8Array(16385), model).readable, false);
  assert.equal(describeClaudeEnvelope(new Uint8Array([255]), model).readable, false);
  const strange = describeClaudeEnvelope(encode({ model: 'PRIVATE_MODEL', stop_reason: 'PRIVATE_STOP', content: [] }), model);
  assert.equal(strange.stopReason, 'other'); assert.equal(strange.modelMatches, false);
  assert.equal(strange.assessment, 'not-single-text');
  assert.doesNotMatch(JSON.stringify(strange), /PRIVATE_/);
});
