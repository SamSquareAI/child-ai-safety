import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClaudeAssessmentAdapter, CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { prepareContinuation, runContinuation, mergeContinuation } from '../evaluation/support-comparison-continuation.mjs';
import { describeClaudeEnvelope } from '../evaluation/provider-envelope-diagnostics.mjs';
import { comparisonPlan, runPairedComparison, scoreComparison } from '../evaluation/support-comparison.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = new URL('../evaluation/support-comparison-v1/', import.meta.url);
const initialDirectory = join(root, 'reports/private/support-comparison-v1');
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--dry-run', '--execute', '--rehearse', '--continue', '--rehearse-continuation'].includes(arg))) throw new Error('invalid-mode');
  const inputs = JSON.parse(await readFile(new URL('inputs.json', folder)));
  const expectations = JSON.parse(await readFile(new URL('expectations.json', folder)));
  const policies = {};
  for (const [arm, path] of [['v1', 'evaluation/claude-policy-draft.txt'], ['v2', 'evaluation/support-routing-v2/policy-draft.txt']]) {
    policies[arm] = `${await readFile(join(root, path), 'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
  }
  const plan = comparisonPlan(inputs, expectations, policies);
  const freeze = JSON.parse(await readFile(new URL('freeze.json', folder)));
  if (corpusDigest(plan) !== freeze.planSha256) throw new Error('comparison-freeze-mismatch');
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const continuing = ['--continue', '--rehearse-continuation'].includes(args[0]);
  const execute = ['--execute', '--continue'].includes(args[0]), rehearse = ['--rehearse', '--rehearse-continuation'].includes(args[0]);
  const directory = continuing ? initialDirectory + '-continuation-1' : initialDirectory;
  let continuation = null, previousCheckpoint = null, previousSummary = null;
  if (continuing) {
    previousCheckpoint = JSON.parse(await readFile(join(initialDirectory, 'checkpoint.json')));
    previousSummary = JSON.parse(await readFile(join(initialDirectory, 'summary.json')));
    continuation = prepareContinuation(inputs, expectations, plan, freeze, previousCheckpoint, previousSummary);
    const frozenContinuation = JSON.parse(await readFile(new URL('continuation-1.json', folder)));
    if (corpusDigest(continuation) !== frozenContinuation.planSha256) throw new Error('continuation-freeze-mismatch');
  }
  const callLimit = continuation?.maxCalls ?? plan.config.maxCalls;
  if (!execute && !rehearse) {
    console.log(JSON.stringify({ ...plan, sourceRevision, executed: false }, null, 2)); return;
  }
  if (execute) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('missing-local-key');
    const age = Date.now() - Date.parse(`${plan.budget.pricingChecked}T00:00:00Z`);
    if (age < 0 || age > 7 * 86400000) throw new Error('pricing-review-expired');
    if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('commit-evaluation-before-execution');
    await mkdir(join(root, 'reports/private'), { recursive: true, mode: 0o700 });
    await mkdir(directory, { mode: 0o700 });
  }
  const metrics = { calls: 0, statuses: [], latencyMs: [], inputTokens: 0, outputTokens: 0, usageRecords: 0, envelopeDiagnostics: [] };
  async function persist(name, value) {
    if (!execute) return;
    const temporary = join(directory, `${name}.tmp`), file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, join(directory, `${name}.json`));
    const parent = await open(directory); try { await parent.sync(); } finally { await parent.close(); }
  }
  await persist('reservation', { ...plan, sourceRevision, freezeSha256: corpusDigest(freeze),
    authorizedAdditionalMaximumUSD: 2, continuation, reservedAt: new Date().toISOString() });
  const controller = new AbortController(), stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const transport = async (url, init) => {
    if (url !== 'https://api.anthropic.com/v1/messages' || !(init.body instanceof Uint8Array) ||
        init.body.byteLength > plan.config.maxRequestBytes || metrics.calls >= callLimit) throw new Error('transport-bound');
    metrics.calls++;
    const start = performance.now();
    try {
      const response = await fetch(url, init);
      metrics.statuses.push(response.status);
      if (continuing && response.status !== 200) controller.abort();
      if (response.status !== 200 || response.redirected || response.url !== url) {
        await response.body?.cancel(); return new Response(null, { status: response.status });
      }
      if (!response.body) throw new Error('empty-response');
      const reader = response.body.getReader(), bytes = new Uint8Array(plan.config.maxResponseBytes);
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          if (value.byteLength > bytes.length - length || init.signal.aborted) throw new Error('response-bound');
          bytes.set(value, length); length += value.byteLength;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const data = bytes.subarray(0, length);
      metrics.envelopeDiagnostics.push(describeClaudeEnvelope(data, plan.config.model));
      const usage = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)).usage;
      if (usage && ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) {
        metrics.inputTokens += usage.input_tokens; metrics.outputTokens += usage.output_tokens; metrics.usageRecords++;
      }
      const headers = new Headers(response.headers);
      headers.delete('content-encoding'); headers.set('content-length', String(length));
      return new Response(data, { status: 200, headers });
    } catch (error) {
      if (continuing && !init.signal.aborted) controller.abort();
      throw error;
    } finally { metrics.latencyMs.push(Math.round(performance.now() - start)); }
  };
  try {
    const assessors = {};
    const labelMap = new Map(expectations.map(row => [row.id, row]));
    let scriptedCalls = 0;
    for (const arm of ['v1', 'v2']) {
      const { maxCalls, ...config } = plan.config;
      assessors[arm] = createClaudeAssessmentAdapter({
        ...config, systemPolicy: policies[arm], apiKey: execute ? process.env.ANTHROPIC_API_KEY : 'offline-synthetic',
        capabilities: { protocolVersion: '1', id: 'paired-comparison', revision: plan.policySha256[arm].slice(0, 32), modality: 'text',
          locales: ['en', 'fr', 'es'], ageBands: ['6-8', '9-11', '12-15', 'unknown'], stages: ['input', 'output'] },
        fetch: execute ? transport : async (_url, init) => {
          // Explicit fixture oracle: this checks wiring, not either model policy.
          scriptedCalls++;
          const wire = JSON.parse(new TextDecoder().decode(init.body));
          if (wire.system !== policies[arm]) throw new Error('policy-mismatch');
          const payload = JSON.parse(wire.messages[0].content);
          const row = inputs.find(row => row.text === payload.text && row.stage === payload.stage &&
            row.locale === payload.profile.locale && row.ageBand === payload.profile.ageBand);
          if (!row || payload.context.requestInput !== (row.stage === 'input' ? row.text : row.requestInput)) throw new Error('context-mismatch');
          return Response.json({ type: 'message', role: 'assistant', model: plan.config.model, stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify(labelMap.get(row.id).expected) }] });
        },
      }).assess;
    }
    let checkpoints = 0;
    const save = async checkpoint => { checkpoints++; await persist('checkpoint', { sourceRevision, freezeSha256: corpusDigest(freeze), continuation, metrics, checkpoint }); };
    const run = continuing
      ? await runContinuation(inputs, { basePlan: plan, continuation, assessors, signal: controller.signal, save })
      : await runPairedComparison(inputs, { plan, assessors, signal: controller.signal, save });
    const observations = continuing ? mergeContinuation(inputs, continuation, previousCheckpoint.checkpoint.observations, run.observations) : run.observations;
    const score = scoreComparison(inputs, expectations, observations);
    const sorted = [...metrics.latencyMs].sort((a, b) => a - b);
    const summary = {
      mode: execute ? 'live-paired-public-draft' : 'offline-fixture-oracle', sourceRevision,
      freezeSha256: corpusDigest(freeze), plan, continuation, status: run.status, metrics, checkpoints, scriptedCalls,
      ...(continuing ? { combinedCalls: continuation.parentCalls + metrics.calls } : {}),
      latency: { p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? null, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null },
      tokenUsageComplete: execute && metrics.usageRecords === metrics.calls,
      tokenCostEstimateUSD: execute && metrics.usageRecords === metrics.calls
        ? (metrics.inputTokens * 0.1 + metrics.outputTokens * 0.5) / 1_000_000 : null,
      billingReconciled: false, score,
    };
    await persist('summary', summary);
    console.log(JSON.stringify({ mode: summary.mode, status: run.status, liveCalls: metrics.calls, scriptedCalls, checkpoints,
      paired: score.paired, diagnosticTargetsMet: score.diagnosticTargetsMet,
      ...(execute ? { report: join(directory, 'summary.json') } : {}) }, null, 2));
    if (run.status !== 'completed') process.exitCode = 1;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
try { await main(); }
catch (error) {
  const safe = ['invalid-mode', 'comparison-freeze-mismatch', 'continuation-freeze-mismatch', 'invalid-continuation-parent', 'missing-local-key', 'pricing-review-expired', 'commit-evaluation-before-execution', 'budget-exceeded', 'checkpoint-failed'];
  console.error(JSON.stringify({ status: 'stopped', reason: error.code === 'EEXIST' ? 'one-shot-run-already-reserved' :
    safe.includes(error.message) ? error.message : 'preflight-or-execution-failed', retry: false }));
  process.exitCode = 1;
}
