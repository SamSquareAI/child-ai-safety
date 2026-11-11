import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixtures = JSON.parse(readFileSync(new URL('../../fixtures/scenarios.json', import.meta.url), 'utf8'));
const runner = fileURLToPath(new URL('../fixture-runner.mjs', import.meta.url));

export default class SyntheticGatewayProvider {
  id() {
    return 'child-ai-safety:synthetic-fixtures';
  }

  async callApi(prompt) {
    const fixture = fixtures.find(row => row.id === prompt && (row.stage ?? 'input') === 'input');
    if (!fixture) return { error: 'Choose a known synthetic input fixture ID.' };

    try {
      const result = JSON.parse(execFileSync(process.execPath, [
        runner, '--synthetic-oracle', '--locale', fixture.locale, '--age-band', fixture.ageBand,
      ], {
        input: JSON.stringify({ protocolVersion: '1', input: fixture.text }),
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 32768,
      }));
      return { output: result.action };
    } catch {
      return { error: 'The local fixture runner failed. Build the gateway first.' };
    }
  }
}
