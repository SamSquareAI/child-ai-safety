import assert from 'node:assert/strict';
import test from 'node:test';
import { createGateway, createAdmissionController } from '../dist/index.js';
import { scenarios, runScenario } from '../demo/scenarios.mjs';
import { readFile } from 'node:fs/promises';

const { catalog } = JSON.parse(await readFile(new URL('../catalogs/draft-responses.json', import.meta.url), 'utf8'));
for (const scenario of scenarios) {
  test('browser fixture preserves gateway delivery rules: ' + scenario.id, async () => {
    const report = await runScenario(scenario, createGateway, createAdmissionController);
    assert.equal(report.result.action, scenario.action);
    if (scenario.action === 'allow') {
      assert.equal(report.result.text, scenario.answer);
      assert.equal(report.diagnostics.counts.allowed, 1);
    } else {
      assert.equal('text' in report.result, false);
      assert.ok(catalog[report.result.responseId]);
      assert.equal(report.diagnostics.counts.allowed, 0);
    }
    assert.equal(report.generationCalls, scenario.mode === 'refusal' ? 0 : 1);
    if (scenario.mode === 'revocation') assert.equal(report.diagnostics.counts.authorization_denied, 1);
    if (scenario.mode === 'outage') assert.equal(report.diagnostics.counts.detector_unavailable, 1);
    if (scenario.mode === 'malformed') assert.equal(report.diagnostics.counts.invalid_assessment, 1);
  });
}

test('browser demo announces outcome, resets result language, and preserves keyboard focus', async () => {
  const [html, mainJs, css] = await Promise.all([
    readFile(new URL('../demo/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../demo/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../demo/style.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="result"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.doesNotMatch(html, /id="trace"[^>]*aria-live/);
  assert.match(mainJs, /restoreFocus/);
  assert.match(mainJs, /if \(restoreFocus\) button\.focus\(\)/);
  assert.match(mainJs, /result\.removeAttribute\('lang'\)/);
  assert.match(css, /\.next > \* \{ min-width: 0; \}/);
});
