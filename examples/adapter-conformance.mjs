import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { CLAUDE_ASSESSMENT_OUTPUT_CONTRACT, createClaudeAssessmentAdapter, createHttpAssessmentAdapter } from '../dist/index.js';

const profile = { locale: 'en', ageBand: '9-11', task: 'learning' };
const context = { version: '1', requestInput: 'Why do rainbows have colors?' };
const candidate = 'Water droplets spread sunlight into different colors.';
const allow = { verdict: 'allow', category: 'none' };
const unavailable = { verdict: 'unavailable', category: 'none' };
const capabilities = {
  protocolVersion: '1', id: 'conformance-example', revision: '1', modality: 'text',
  locales: ['en'], ageBands: ['9-11'], stages: ['input', 'output'],
};

// The factory must use the injected transport. The decoder projects its own wire
// format to the assessment data, and reply wraps a decision in its response format.
export async function checkAdapter({ create, decode, reply }) {
  const timeoutMs = 100;
  const run = (fetch, selectedProfile = profile, requestContext = context) =>
    create({ fetch, timeoutMs, capabilities }).assess(
      candidate, 'output', selectedProfile, new AbortController().signal, requestContext,
    );

  const requests = [];
  assert.deepEqual(await run(async (_url, init) => {
    requests.push(decode(init.body));
    return reply(allow);
  }), allow);
  assert.deepEqual(requests, [{ stage: 'output', profile, text: candidate, context }]);

  let calls = 0;
  const countCall = async () => { calls++; return reply(allow); };
  assert.deepEqual(await run(countCall, { ...profile, locale: 'fr' }), unavailable);
  assert.deepEqual(await run(countCall, profile, null), unavailable);
  assert.equal(calls, 0);

  assert.deepEqual(await run(async () => reply({ ...allow, extra: true })), unavailable);
  assert.deepEqual(await run(async () => reply(unavailable)), unavailable);

  const timeouts = [];
  assert.deepEqual(await run(async (_url, { signal }) => {
    timeouts.push(signal);
    return new Promise(resolve => signal.addEventListener('abort', () => resolve(reply(allow)), { once: true }));
  }), unavailable);
  assert.equal(timeouts.length, 1);
  assert.equal(timeouts[0].aborted, true);

  return ['original question bound', 'unsupported locale blocked', 'missing context blocked',
    'malformed decision blocked', 'unavailable decision preserved', 'timeout aborted transport'];
}

async function main() {
  const bounds = { maxRequestBytes: 65536, maxResponseBytes: 16384 };
  const model = 'synthetic-conformance-model';
  const parse = body => JSON.parse(new TextDecoder().decode(body));
  const adapters = [
    ['HTTP', {
      create: options => createHttpAssessmentAdapter({ ...bounds, endpoint: 'https://detector.invalid/assess', ...options }),
      decode: body => {
        const { protocolVersion, ...assessment } = parse(body);
        assert.equal(protocolVersion, '2');
        return assessment;
      },
      reply: decision => Response.json(decision),
    }],
    ['Claude', {
      create: options => createClaudeAssessmentAdapter({
        ...bounds, apiKey: 'synthetic-placeholder', model, apiVersion: '2026-10-21',
        systemPolicy: CLAUDE_ASSESSMENT_OUTPUT_CONTRACT, maxOutputTokens: 128, ...options,
      }),
      decode: body => JSON.parse(parse(body).messages[0].content),
      reply: decision => Response.json({
        type: 'message', role: 'assistant', model, stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(decision) }],
      }),
    }],
  ];
  console.log('Detector adapter conformance · synthetic transport');
  for (const [name, adapter] of adapters) {
    console.log(`\n${name}\n${(await checkAdapter(adapter)).map(check => `  PASS  ${check}`).join('\n')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
