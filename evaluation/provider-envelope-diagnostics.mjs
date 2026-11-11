import { validAssessment } from '../dist/protocol.js';

/** Content-free diagnostics only; never substitutes for adapter validation. */
export function describeClaudeEnvelope(bytes, expectedModel) {
  const empty = { readable: false, messageShape: false, modelMatches: false,
    stopReason: 'unknown', singleTextBlock: false, assessment: 'not-available' };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 16384) return Object.freeze(empty);
  try {
    const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const stops = ['end_turn', 'max_tokens', 'refusal', 'stop_sequence', 'tool_use', 'pause_turn'];
    const singleTextBlock = Array.isArray(raw?.content) && raw.content.length === 1 &&
      raw.content[0]?.type === 'text' && typeof raw.content[0].text === 'string';
    let assessment = 'not-single-text';
    if (singleTextBlock) {
      try {
        const decision = JSON.parse(raw.content[0].text);
        assessment = validAssessment(decision) ? `valid-${decision.verdict}` : 'invalid-assessment';
      } catch { assessment = 'invalid-json'; }
    }
    return Object.freeze({ readable: true, messageShape: raw?.type === 'message' && raw?.role === 'assistant',
      modelMatches: raw?.model === expectedModel, stopReason: stops.includes(raw?.stop_reason) ? raw.stop_reason : 'other',
      singleTextBlock, assessment });
  } catch { return Object.freeze(empty); }
}
