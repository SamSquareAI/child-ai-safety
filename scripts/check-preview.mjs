import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-preview checks only. This command cannot grant deployment approval.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'child-ai-safety-preview-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Preview check failed: ${command} ${args.join(' ')}`);
  }
  return result.stdout;
}

try {
  if (process.argv.length !== 2) throw new Error('preview:check accepts no arguments');
  run(npm, ['test']);
  run(process.execPath, ['examples/adapter-conformance.mjs']);
  run(process.execPath, ['scripts/rehearse-session-boundaries.mjs']);
  run(process.execPath, ['scripts/rehearse-support-routing-v2.mjs']);
  run(process.execPath, ['scripts/eval-support-comparison.mjs', '--rehearse']);
  const matrix = JSON.parse(run(process.execPath, ['evaluation/scope-matrix.mjs'], true));
  if (!matrix.complete || matrix.failed !== 0 || matrix.executed !== matrix.planned) {
    throw new Error('Offline scope matrix is incomplete or failing');
  }
  console.log(`Offline scope matrix: ${matrix.passed}/${matrix.planned} scripted cases passed`);
  const report = run(process.execPath, ['scripts/eval-synthetic-delivery.mjs', '--rehearse'], true);
  const reportPath = join(temporary, 'rehearsal.json');
  writeFileSync(reportPath, report, { mode: 0o600 });
  run(process.execPath, ['scripts/report-rehearsal.mjs', reportPath]);
  run(process.execPath, ['scripts/eval-synthetic-delivery.mjs', '--demo']);
  console.log('Source-preview checks passed. No provider calls or production approval.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
