import { corpusDigest } from './corpus-digest.mjs';
import { ajv, ref, validInput } from './holdout.mjs';

const validDecision = ajv.compile(ref('assessment'));
const fail = code => { throw new Error(code); };
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// Copy data descriptors only: no getters, toJSON hooks, symbols or shared objects.
function snapshotCases(cases) {
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > 2000 ||
      Reflect.ownKeys(cases).length !== cases.length + 1) fail('invalid-cases');
  const seen = new Set();
  const copy = [];
  for (let index = 0; index < cases.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(cases, String(index));
    const row = slot?.value;
    if (!row || ![Object.prototype, null].includes(Object.getPrototypeOf(row))) fail('invalid-cases');
    const keys = Reflect.ownKeys(row);
    if (keys.length > 9 || keys.some(key => typeof key !== 'string')) fail('invalid-cases');
    const item = Object.create(null);
    for (const key of keys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(row, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable ||
          typeof descriptor.value !== 'string' || descriptor.value.length > 16000) fail('invalid-cases');
      item[key] = descriptor.value;
    }
    if (!validInput(item) || item.track !== 'assessment' || seen.has(item.id)) fail('invalid-cases');
    seen.add(item.id);
    copy.push(Object.freeze(item));
  }
  return Object.freeze(copy);
}

function decisionSnapshot(raw) {
  try {
    if (!raw || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
    const keys = Reflect.ownKeys(raw);
    if (keys.length !== 2 || !keys.includes('verdict') || !keys.includes('category')) return null;
    const decision = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') return null;
      decision[key] = descriptor.value;
    }
    return validDecision(decision) ? Object.freeze(decision) : null;
  } catch { return null; }
}

// Abort promptly even if the injected assessor ignores its signal. A late result
// is consumed but can never update observations or start another call.
async function assessOnce(assess, entry, parent, timeoutMs) {
  const controller = new AbortController();
  const signal = controller.signal;
  let onAbort, timer;
  const stopped = new Promise(resolve => {
    onAbort = () => {
      controller.abort();
      resolve({ kind: 'cancelled' });
    };
    parent.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });
  try {
    if (parent.aborted) { onAbort(); return { kind: 'cancelled' }; }
    const profile = Object.freeze({ ageBand: entry.ageBand, locale: entry.locale, task: entry.task });
    const context = Object.freeze({ version: '1', requestInput: entry.stage === 'input' ? entry.text : entry.requestInput });
    const work = (async () => {
      try {
        const raw = await assess(entry.text, entry.stage, profile, signal, context);
        if (signal.aborted) return { kind: 'failure' };
        const decision = decisionSnapshot(raw);
        return decision ? { kind: 'observed', decision } : { kind: 'failure' };
      } catch { return { kind: 'failure' }; }
    })();
    return await Promise.race([stopped, work]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', onAbort);
  }
}

/** Offline/injected utility only. No provider, CLI, filesystem or retry logic. */
export async function runContextualAssessment(cases, options) {
  let entries, assess, save, signal, maxCalls, timeoutMs;
  try {
    ({ assess, save, signal, maxCalls, timeoutMs } = options);
    if (typeof assess !== 'function' || typeof save !== 'function' || !(signal instanceof AbortSignal) ||
        !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 2000 ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('invalid-options');
  } catch { fail('invalid-options'); }
  // Everything supplied by the caller is copied/captured before the first await.
  try { entries = snapshotCases(cases); } catch { fail('invalid-cases'); }
  if (entries.length > maxCalls) fail('call-budget-exceeded');
  const corpusSha256 = corpusDigest(entries);
  let calls = 0;
  const observations = entries.map(entry => ({ id: entry.id, turns: [{ turn: 1, status: 'skipped' }] }));
  const report = (status, reason) => freeze({
    version: '1', corpusSha256, maxCalls, timeoutMs, calls, status, reason,
    release: 'blocked', humanQualification: 'pending',
    observations: observations.map(row => ({ id: row.id, turns: row.turns.map(turn => ({ ...turn,
      ...(turn.decision ? { decision: { ...turn.decision } } : {}),
    })) })),
  });
  const checkpoint = async (status, reason) => {
    const snapshot = report(status, reason);
    try { await save(snapshot); } catch { fail('checkpoint-failed'); }
    return snapshot;
  };
  for (let index = 0; index < entries.length; index++) {
    if (signal.aborted) return checkpoint('cancelled', 'aborted');
    await checkpoint('running', 'before-call');
    if (signal.aborted) return checkpoint('cancelled', 'aborted');
    calls++;
    const result = await assessOnce(assess, entries[index], signal, timeoutMs);
    if (signal.aborted || result.kind === 'cancelled') {
      observations[index].turns = [{ turn: 1, status: 'failure' }];
      return checkpoint('cancelled', 'aborted');
    }
    if (result.kind === 'failure' || result.kind === 'timeout') {
      observations[index].turns = [{ turn: 1, status: 'failure' }];
      return checkpoint('failure', result.kind === 'timeout' ? 'assessment-timeout' : 'assessment-failed');
    }
    observations[index].turns = [{ turn: 1, status: 'observed', decision: result.decision }];
    if (result.decision.verdict === 'unavailable') return checkpoint('unavailable', 'assessment-unavailable');
    const last = index === entries.length - 1;
    const saved = await checkpoint(last ? 'completed' : 'running', last ? 'finished' : 'after-result');
    if (last) return signal.aborted ? checkpoint('cancelled', 'aborted') : saved;
  }
}
