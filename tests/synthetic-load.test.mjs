import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('the synthetic load report accounts for every scheduled arrival', () => {
  const rate = 5;
  const seconds = 1;
  const script = fileURLToPath(new URL('../scripts/load.mjs', import.meta.url));
  const result = execFileSync(process.execPath, [
    script, '--rate', String(rate), '--seconds', String(seconds), '--concurrency', '2',
  ], { encoding: 'utf8', timeout: 10_000 });
  const report = JSON.parse(result);
  assert.equal(report.scope, 'IN_PROCESS_SYNTHETIC_NO_HTTP_NO_DETECTOR');
  assert.equal(report.attempted, rate * seconds);
  assert.ok(Number.isInteger(report.allowed) && report.allowed >= 0);
  assert.ok(Number.isInteger(report.unavailable) && report.unavailable >= 0);
  assert.equal(report.allowed + report.unavailable, report.attempted);
});
