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
    if (scenario.mode === 'timeout') {
      assert.equal(report.diagnostics.counts.stage_timeout, 1);
      assert.equal(report.cancelled, true);
      await report.settled;
      await Promise.resolve();
      const permit = report.admission.acquire('synthetic-demo');
      assert.ok(permit);
      permit();
    }
  });
}
