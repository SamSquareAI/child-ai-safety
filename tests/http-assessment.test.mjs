import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpAssessmentAdapter } from '../dist/http-assessment.js';
import { validAssessment } from '../dist/protocol.js';

// All transports are injected. No sockets, real providers, environment, or credentials.
const capabilities = () => ({ protocolVersion: '1', id: 'synthetic-http', revision: '0', modality: 'text',
  locales: ['en'], ageBands: ['9-11'], stages: ['input', 'output'] });
const profile = { ageBand: '9-11', locale: 'en', task: 'learning' };
const allow = { verdict: 'allow', category: 'none' };
const unavailable = { verdict: 'unavailable', category: 'none' };
const encode = value => new TextEncoder().encode(value);
const response = (body = JSON.stringify(allow), init = {}) => new Response(body,
  { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const config = (overrides = {}) => ({ endpoint: 'https://detector.invalid/assess', capabilities: capabilities(),
  timeoutMs: 200, maxRequestBytes: 65536, maxResponseBytes: 1024,
  fetch: async () => response(), ...overrides });
const run = (adapter, text = 'Synthetic exercise.', stage = 'input', p = profile, signal = new AbortController().signal) =>
  adapter.assess(text, stage, p, signal);
const adapter = overrides => createHttpAssessmentAdapter(config(overrides));

// Disjoint tests: no global fetch replacement or shared mutable gateway fixtures.
test('fixed endpoint, exact proposed wire request and restrictive fetch settings', async () => {
  let calls = 0;
  const a = adapter({ fetch: async (url, init) => {
    calls++;
    assert.equal(url, 'https://detector.invalid/assess');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.cache, 'no-store');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json', Accept: 'application/json' });
    assert.equal(init.signal.aborted, false);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(init.body)), {
      protocolVersion: '1', text: 'Synthetic 🐻', stage: 'output', profile
    });
    return response();
  } });
  assert.deepEqual(await run(a, 'Synthetic 🐻', 'output'), allow);
  assert.equal(calls, 1);
});

test('trusted config rejects invalid endpoints without invoking transport', () => {
  let calls = 0;
  for (const endpoint of [undefined, null, 1, '', '/relative', 'http://detector.invalid', 'file:///tmp/a',
    'https://user:pass@detector.invalid/a', 'https://user@detector.invalid', 'https://@detector.invalid',
    'https://detector.invalid/#fragment', 'https://detector.invalid/\npath', ' https://detector.invalid',
    'https://detector.invalid\\@other.invalid', 'https://', `https://detector.invalid/${'x'.repeat(2048)}`]) {
    assert.throws(() => adapter({ endpoint, fetch: async () => { calls++; return response(); } }), TypeError);
  }
  assert.equal(calls, 0);
});

test('mandatory bounds and explicit schema-validated capabilities reject runtime misconfiguration', () => {
  for (const name of ['timeoutMs', 'maxRequestBytes', 'maxResponseBytes']) {
    for (const value of [undefined, null, '10', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => adapter({ [name]: value }), TypeError);
    }
  }
  for (const delta of [{ protocolVersion: '2' }, { id: '' }, { revision: 1 }, { modality: 'image' },
    { locales: [] }, { locales: ['en', 'en'] }, { ageBands: ['adult'] }, { stages: ['input'] }, { qualified: true }]) {
    assert.throws(() => adapter({ capabilities: { ...capabilities(), ...delta } }), TypeError);
  }
  for (const value of [undefined, null, [], 'detector']) assert.throws(() => adapter({ capabilities: value }), TypeError);
  for (const fetch of [null, 1, 'fetch', {}]) assert.throws(() => adapter({ fetch }), TypeError);
  assert.throws(() => adapter({ endpointFromRequest: true }), TypeError);
  for (const value of [undefined, null, [], Object.create(config())]) {
    assert.throws(() => createHttpAssessmentAdapter(value), TypeError);
  }
  let got = false;
  const c = config();
  Object.defineProperty(c, 'endpoint', { get() { got = true; throw Error('not evaluated'); } });
  assert.throws(() => createHttpAssessmentAdapter(c), TypeError);
  assert.equal(got, false);
});

test('snapshots configuration and freezes capability arrays', async () => {
  const c = config(); const a = createHttpAssessmentAdapter(c);
  c.endpoint = 'https://other.invalid'; c.timeoutMs = 1; c.maxResponseBytes = 1;
  c.capabilities.locales.length = 0; c.capabilities.revision = 'changed';
  c.fetch = async () => { throw Error('mutated'); };
  assert.equal(a.capabilities.revision, '0');
  assert.deepEqual(a.capabilities.locales, ['en']);
  for (const value of [a, a.capabilities, a.capabilities.locales, a.capabilities.ageBands, a.capabilities.stages]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.deepEqual(await run(a), allow);
});

test('invalid request types, unsupported coverage and blank/oversized text never fetch', async () => {
  let calls = 0;
  const a = adapter({ fetch: async () => { calls++; return response(); } });
  for (const text of [null, 1, {}, [], '', ' \n\t', 'x'.repeat(4001), '🐻'.repeat(4001)]) {
    assert.deepEqual(await run(a, text), unavailable);
  }
  for (const stage of [null, {}, 'INPUT', 'other']) assert.deepEqual(await run(a, 'x', stage), unavailable);
  for (const p of [null, {}, { ...profile, locale: 'fr' }, { ...profile, ageBand: '6-8' },
    { ...profile, task: 'other' }, { ...profile, endpoint: 'https://other.invalid' }]) {
    assert.deepEqual(await run(a, 'x', 'input', p), unavailable);
  }
  assert.deepEqual(await run(a, 'x'.repeat(8001), 'output'), unavailable);
  assert.deepEqual(await run(a, 'x', 'input', profile, {}), unavailable);
  assert.equal(calls, 0);
});

test('stage code-point limits and serialized UTF-8 request byte limits are exact', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return response(); };
  const a = adapter({ fetch });
  assert.deepEqual(await run(a, '🐻'.repeat(4000)), allow);
  assert.deepEqual(await run(a, '🐻'.repeat(8000), 'output'), allow);
  const text = 'é\n🐻';
  const size = encode(JSON.stringify({ protocolVersion: '1', text, stage: 'input', profile })).byteLength;
  assert.deepEqual(await run(adapter({ fetch, maxRequestBytes: size }), text), allow);
  assert.deepEqual(await run(adapter({ fetch, maxRequestBytes: size - 1 }), text), unavailable);
  assert.equal(calls, 3);
});

test('all schema-valid assessments pass exactly; invalid combinations and extras fail closed', async () => {
  for (const verdict of ['allow', 'refuse', 'support', 'unavailable']) {
    for (const category of ['none', 'privacy', 'harm', 'safeguarding', 'relational']) {
      const value = { verdict, category };
      const actual = await run(adapter({ fetch: async () => response(JSON.stringify(value)) }));
      assert.deepEqual(actual, validAssessment(value) ? value : unavailable);
      assert.equal(Object.isFrozen(actual), true);
    }
  }
  for (const value of [null, [], true, 'allow', { verdict: 'allow' }, { ...allow, evidence: 'hidden' },
    { verdict: 'ALLOW', category: 'none' }, { verdict: 1, category: 'none' },
    { ...allow, protocolVersion: '1' }, { assessment: allow }]) {
    assert.deepEqual(await run(adapter({ fetch: async () => response(JSON.stringify(value)) })), unavailable);
  }
});

test('bounded streaming UTF-8 JSON handles split chunks and exact response byte boundary', async () => {
  const bytes = encode(JSON.stringify(allow));
  const fetch = async () => response(new ReadableStream({ start(c) {
    for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close();
  } }));
  assert.deepEqual(await run(adapter({ fetch, maxResponseBytes: bytes.length })), allow);
  assert.deepEqual(await run(adapter({ fetch, maxResponseBytes: bytes.length - 1 })), unavailable);
  // Split a multibyte UTF-8 whitespace-like character inside an invalid assessment value.
  assert.deepEqual(await run(adapter({ fetch: async () => response(encode('{"verdict":"é","category":"none"}')) })), unavailable);
});

test('oversize response cancels before retaining oversized chunk or reading remainder', async () => {
  let pulls = 0, canceled = false;
  const body = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(1025)); },
    cancel() { canceled = true; } }, { highWaterMark: 0 });
  assert.deepEqual(await run(adapter({ fetch: async () => response(body) })), unavailable);
  assert.equal(pulls, 1); assert.equal(canceled, true);
});

test('content-length is only an early bound; streaming size is authoritative', async () => {
  const bytes = encode(JSON.stringify(allow));
  for (const length of ['1025', '-1', 'no', '1', `${bytes.length + 1}`, '999999999999999999999999']) {
    assert.deepEqual(await run(adapter({ fetch: async () => response(bytes, {
      headers: { 'content-type': 'application/json', 'content-length': length }
    }) })), unavailable);
  }
  assert.deepEqual(await run(adapter({ fetch: async () => response(bytes, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': `${bytes.length}` }
  }) })), allow);
  let pulls = 0, canceled = false;
  const body = new ReadableStream({ pull() { pulls++; }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  assert.deepEqual(await run(adapter({ fetch: async () => response(body, {
    headers: { 'content-type': 'application/json', 'content-length': '1025' }
  }) })), unavailable);
  assert.equal(pulls, 0); assert.equal(canceled, true);
});

test('malformed JSON, invalid UTF-8, empty bodies and unsupported media types fail closed', async () => {
  for (const body of ['', '{', `${JSON.stringify(allow)} trailing`, Uint8Array.of(255),
    Uint8Array.of(0xc3, 0x28), Uint8Array.of(0xe2, 0x82), '\ufeff' + JSON.stringify(allow)]) {
    assert.deepEqual(await run(adapter({ fetch: async () => response(body) })), unavailable);
  }
  for (const type of ['', 'text/plain', 'application/json; charset=latin1', 'application/json; extra=true']) {
    assert.deepEqual(await run(adapter({ fetch: async () => response(undefined, { headers: { 'content-type': type } }) })), unavailable);
  }
  assert.deepEqual(await run(adapter({ fetch: async () => response(null) })), unavailable);
});

test('non-200 statuses and redirects never read error bodies or retry', async () => {
  let calls = 0;
  for (const status of [201, 204, 301, 302, 307, 308, 400, 401, 429, 500, 503]) {
    let pulls = 0, canceled = false;
    const body = new ReadableStream({ pull() { pulls++; }, cancel() { canceled = true; } }, { highWaterMark: 0 });
    const r = status === 204 ? new Response(null, { status }) : response(body, { status });
    assert.deepEqual(await run(adapter({ fetch: async () => { calls++; return r; } })), unavailable);
    assert.equal(pulls, 0);
    if (status !== 204) assert.equal(canceled, true);
  }
  assert.equal(calls, 11);
  for (const properties of [{ redirected: true }, { url: 'https://other.invalid/assess' }]) {
    const r = response();
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(r, key, { value });
    assert.deepEqual(await run(adapter({ fetch: async () => r })), unavailable);
  }
});

test('fetch failures, malformed transport objects and stream errors are sanitized without retry', async () => {
  let calls = 0;
  for (const fetch of [async () => { throw Error('SYNTHETIC_PRIVATE_ERROR'); }, () => { throw Error('sync'); },
    async () => null, async () => ({}), async () => response(new ReadableStream({ start(c) { c.error(Error('private')); } }))]) {
    const result = await run(adapter({ fetch: (...args) => { calls++; return fetch(...args); } }));
    assert.deepEqual(result, unavailable);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  assert.equal(calls, 5);
});

test('pre-aborted caller never starts fetch', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  assert.deepEqual(await run(adapter({ fetch: async () => { calls++; return response(); } }), 'x', 'input', profile, controller.signal), unavailable);
  assert.equal(calls, 0);
});

test('caller abort bounds an uncooperative fetch and cancels its late response', async () => {
  const controller = new AbortController(); let finish, signal;
  const a = adapter({ fetch: (_url, init) => { signal = init.signal; return new Promise(r => { finish = r; }); } });
  const pending = run(a, 'x', 'input', profile, controller.signal);
  controller.abort();
  assert.deepEqual(await pending, unavailable); assert.equal(signal.aborted, true);
  let canceled = false;
  finish(response(new ReadableStream({ cancel() { canceled = true; } })));
  await new Promise(r => setImmediate(r));
  assert.equal(canceled, true);
});

test('mandatory deadline settles even when fetch ignores AbortSignal', async () => {
  let signal;
  const a = adapter({ timeoutMs: 15, fetch: (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  const start = performance.now();
  assert.deepEqual(await run(a), unavailable);
  assert.equal(signal.aborted, true);
  assert.ok(performance.now() - start < 1000);
});

test('deadline covers pending response reads and cancels the stream', async () => {
  let canceled = false, signal;
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { canceled = true; } });
  assert.deepEqual(await run(adapter({ timeoutMs: 15, fetch: async (_url, init) => {
    signal = init.signal; return response(body);
  } })), unavailable);
  assert.equal(signal.aborted, true); assert.equal(canceled, true);
});

test('caller abort also cancels pending body reads; successful calls remove caller listener', async () => {
  const controller = new AbortController(); let entered;
  const ready = new Promise(r => { entered = r; }); let canceled = false;
  const pending = run(adapter({ fetch: async () => response(new ReadableStream({
    pull() { entered(); return new Promise(() => {}); }, cancel() { canceled = true; }
  })) }), 'x', 'input', profile, controller.signal);
  await ready; controller.abort();
  assert.deepEqual(await pending, unavailable); assert.equal(canceled, true);
  const parent = new AbortController(); let added = 0, removed = 0;
  const add = parent.signal.addEventListener.bind(parent.signal);
  const remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.addEventListener = (...args) => { added++; add(...args); };
  parent.signal.removeEventListener = (...args) => { removed++; remove(...args); };
  assert.deepEqual(await run(adapter(), 'x', 'input', profile, parent.signal), allow);
  assert.equal(added, 1); assert.equal(removed, 1);
});

test('concurrent assessments have independent cancellation', async () => {
  const a = adapter({ fetch: async (_url, init) => {
    const { text } = JSON.parse(new TextDecoder().decode(init.body));
    return text === 'pending' ? new Promise(() => {}) : response();
  } });
  const controller = new AbortController();
  const pending = run(a, 'pending', 'input', profile, controller.signal);
  assert.deepEqual(await run(a), allow);
  controller.abort(); assert.deepEqual(await pending, unavailable);
});
