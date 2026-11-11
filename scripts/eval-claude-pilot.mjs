import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CLAUDE_ASSESSMENT_OUTPUT_CONTRACT } from '../dist/claude-assessment.js';
import { runClaudeHoldout } from '../evaluation/claude-holdout.mjs';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { pilotPlan, PILOT_LIMITS, scorePilot } from '../evaluation/claude-pilot.mjs';
import { pipelineBudget } from '../evaluation/pipeline-budget.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = new URL('../evaluation/claude-pilot-v1/', import.meta.url);
const directory = join(root, 'reports/private/claude-contextual-pilot-v1');
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--dry-run', '--execute'].includes(arg))) throw new Error('invalid-mode');
  const inputs = JSON.parse(await readFile(new URL('inputs.json', folder), 'utf8'));
  const systemPolicy = `${await readFile(new URL('../evaluation/claude-policy-draft.txt', import.meta.url), 'utf8')}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
  const plan = pilotPlan(inputs, systemPolicy);
  const freeze = JSON.parse(await readFile(new URL('freeze.json', folder), 'utf8'));
  const expectations = JSON.parse(await readFile(new URL('expectations.json', folder), 'utf8'));
  if (freeze.planSha256 !== corpusDigest(plan) || freeze.expectationsSha256 !== corpusDigest(expectations)) {
    throw new Error('pilot-freeze-mismatch');
  }
  // Validate the scorer inputs before any transport, without passing labels to the assessor.
  scorePilot(inputs, expectations, []);
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (args[0] !== '--execute') {
    console.log(JSON.stringify({ ...plan, freezeSha256: corpusDigest(freeze), sourceRevision, executed: false }, null, 2));
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('missing-local-key');
  const age = Date.now() - Date.parse(`${plan.pricingChecked}T00:00:00Z`);
  if (age < 0 || age > 7 * 86400000) throw new Error('pricing-review-expired');
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim()) {
    throw new Error('commit-evaluation-before-execution');
  }
  const previous = pipelineBudget(
    await readFile(join(root, 'reports/private/claude-smoke.json')),
    await readFile(join(root, 'reports/private/claude-batch.json')),
  );
  if (previous.totalReservedMicroUsd !== PILOT_LIMITS.previousReserveMicroUsd) throw new Error('prior-budget-mismatch');
  await mkdir(join(root, 'reports/private'), { recursive: true, mode: 0o700 });
  // Exclusive one-shot directory: failed/ambiguous calls must never be silently retried.
  await mkdir(directory, { mode: 0o700 });
  const metrics = { calls: 0, statuses: [], latencyMs: [], inputTokens: 0, outputTokens: 0, usageRecords: 0 };
  async function persist(name, value) {
    const path = join(directory, `${name}.tmp`);
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
    finally { await file.close(); }
    await rename(path, join(directory, `${name}.json`));
    const parent = await open(directory);
    try { await parent.sync(); } finally { await parent.close(); }
  }
  await persist('reservation', { ...plan, sourceRevision, freezeSha256: corpusDigest(freeze), reservedAt: new Date().toISOString() });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const transport = async (url, init) => {
    if (url !== 'https://api.anthropic.com/v1/messages' || !(init.body instanceof Uint8Array) ||
        init.body.byteLength > PILOT_LIMITS.maxRequestBytes || metrics.calls >= plan.maxCalls) throw new Error('transport-bound');
    metrics.calls++;
    const start = performance.now();
    try {
      const response = await fetch(url, init);
      metrics.statuses.push(response.status);
      if (response.status !== 200 || response.redirected || response.url !== url) {
        await response.body?.cancel();
        return new Response(null, { status: response.status });
      }
      if (!response.body) throw new Error('empty-provider-body');
      const reader = response.body.getReader();
      const bytes = new Uint8Array(PILOT_LIMITS.maxResponseBytes);
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength > bytes.length - length || init.signal.aborted) throw new Error('response-bound');
          bytes.set(value, length); length += value.byteLength;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const data = bytes.subarray(0, length);
      const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
      const usage = envelope.usage;
      if (usage && ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) {
        metrics.inputTokens += usage.input_tokens; metrics.outputTokens += usage.output_tokens; metrics.usageRecords++;
      }
      const headers = new Headers(response.headers);
      headers.delete('content-encoding'); headers.set('content-length', String(length));
      return new Response(data, { status: response.status, headers });
    } finally { metrics.latencyMs.push(Math.round(performance.now() - start)); }
  };
  try {
    const run = await runClaudeHoldout(inputs, {
      ...plan, systemPolicy, apiKey: process.env.ANTHROPIC_API_KEY,
      // Pass only the adapter configuration fields accepted by the composition.
      fetch: transport, signal: controller.signal,
      save: checkpoint => persist('checkpoint', { mode: 'live-public-draft-pilot', sourceRevision, freezeSha256: corpusDigest(freeze), metrics, checkpoint }),
    });
    const score = scorePilot(inputs, expectations, run.observations);
    const sorted = [...metrics.latencyMs].sort((a, b) => a - b);
    const summary = {
      mode: 'live-public-draft-pilot', sourceRevision, freezeSha256: corpusDigest(freeze),
      status: run.status, model: plan.model, assessmentSha256: plan.assessmentSha256,
      configurationSha256: plan.configurationSha256, metrics,
      latency: { p50Ms: sorted[Math.ceil(sorted.length * 0.50) - 1] ?? null, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null },
      tokenCostEstimateUSD: (metrics.inputTokens * 0.1 + metrics.outputTokens * 0.5) / 1_000_000,
      billingReconciled: false, score,
    };
    await persist('summary', summary);
    console.log(JSON.stringify({ report: join(directory, 'summary.json'), status: run.status, calls: metrics.calls,
      actionMatches: score.overall.actionMatches, diagnosticThresholdsMet: score.diagnosticThresholdsMet }));
    if (run.status !== 'completed') process.exitCode = 1;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
try { await main(); }
catch (error) {
  const safe = ['invalid-mode', 'pilot-freeze-mismatch', 'missing-local-key', 'pricing-review-expired',
    'commit-evaluation-before-execution', 'prior-budget-mismatch', 'budget-exceeded', 'checkpoint-failed'];
  console.error(JSON.stringify({ status: 'stopped', reason: error.code === 'EEXIST' ? 'one-shot-run-already-reserved' :
    safe.includes(error.message) ? error.message : 'preflight-or-execution-failed', retry: false }));
  process.exitCode = 1;
}
