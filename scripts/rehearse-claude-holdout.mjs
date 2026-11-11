import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { claudeHoldoutConfiguration, runClaudeHoldout } from '../evaluation/claude-holdout.mjs';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { indexRecords, readHoldoutFiles, validInput } from '../evaluation/holdout.mjs';

const [inputsPath, freezePath, policyPath, reportDir, ...extra] = process.argv.slice(2);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

async function rehearse() {
  const errors = [];
  const [inputs] = readHoldoutFiles([inputsPath], ['inputs'], errors);
  indexRecords(inputs, validInput, 'inputs', errors);
  if (errors.length) throw new Error('invalid-inputs');

  const freeze = JSON.parse(await readFile(freezePath, 'utf8'));
  const { corpusSha256, assessmentSha256, configurationSha256, model, apiVersion, maxCalls, timeoutMs } = freeze;
  const systemPolicy = await readFile(policyPath, 'utf8');
  const config = { model, apiVersion, maxCalls, timeoutMs, systemPolicy };
  if (!digest(corpusSha256) || corpusDigest(inputs) !== corpusSha256) throw new Error('corpus-freeze-mismatch');
  const cases = inputs.filter(row => row.track === 'assessment');
  if (!cases.length || !digest(assessmentSha256) || corpusDigest(cases) !== assessmentSha256) {
    throw new Error('assessment-freeze-mismatch');
  }
  if (!digest(configurationSha256) || corpusDigest(claudeHoldoutConfiguration(config)) !== configurationSha256) {
    throw new Error('configuration-freeze-mismatch');
  }

  if (reportDir) await mkdir(reportDir, { mode: 0o700 });
  const save = async checkpoint => {
    if (!reportDir) return;
    const temporary = join(reportDir, 'checkpoint.tmp');
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify({ mode: 'offline-simulation', corpusSha256, checkpoint }) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(reportDir, 'checkpoint.json'));
    const directory = await open(reportDir);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  };
  let simulatedRequests = 0;
  const report = await runClaudeHoldout(cases, {
    ...config, assessmentSha256, configurationSha256, save,
    apiKey: 'offline-simulation', signal: new AbortController().signal,
    fetch: async () => {
      simulatedRequests++;
      return Response.json({
        type: 'message', role: 'assistant', model, stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"verdict":"allow","category":"none"}' }],
      });
    },
  });
  console.log(JSON.stringify({
    mode: 'offline-simulation', status: report.status, corpusSha256, assessmentSha256,
    configurationSha256, assessmentCases: cases.length, simulatedRequests, checkpointWritten: Boolean(reportDir),
  }, null, 2));
  if (report.status !== 'completed') process.exitCode = 1;
}

if (!inputsPath || !freezePath || !policyPath || extra.length) {
  console.error('Usage: npm run holdout:rehearse-claude -- INPUTS.json FREEZE.json POLICY.txt [NEW_REPORT_DIRECTORY]');
  process.exitCode = 2;
} else {
  try {
    await rehearse();
  } catch (error) {
    const reasons = ['invalid-inputs', 'corpus-freeze-mismatch', 'assessment-freeze-mismatch',
      'configuration-freeze-mismatch', 'invalid-options', 'call-budget-exceeded', 'checkpoint-failed'];
    const reason = reasons.includes(error.message) ? error.message :
      error.code === 'EEXIST' ? 'report-directory-exists' : 'invalid-configuration-or-storage';
    console.error(JSON.stringify({ mode: 'offline-simulation', status: 'failed', reason }));
    process.exitCode = 1;
  }
}
