import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { indexRecords, readHoldoutFiles, validInput } from '../evaluation/holdout.mjs';

const [inputPath, expectedDigest, ...extra] = process.argv.slice(2);
if (!inputPath || !/^[a-f0-9]{64}$/u.test(expectedDigest ?? '') || extra.length) {
  console.error('Usage: npm run holdout:plan-assessment -- <case-inputs.json> <frozen-corpus-sha256>');
  process.exitCode = 2;
} else {
  const errors = [];
  const [inputs] = readHoldoutFiles([inputPath], ['inputs'], errors);
  indexRecords(inputs, validInput, 'inputs', errors);
  const assessment = inputs.filter(row => row?.track === 'assessment');
  if (errors.length === 0 && corpusDigest(inputs) !== expectedDigest) {
    errors.push({ file: 'inputs', issue: 'frozen-corpus-digest-mismatch' });
  }
  if (errors.length === 0 && assessment.length === 0) {
    errors.push({ file: 'inputs', issue: 'missing-assessment-cases' });
  }
  if (errors.length) {
    console.log(JSON.stringify({ status: 'invalid', errors }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      status: 'inputs-verified',
      corpusSha256: expectedDigest,
      assessmentSha256: corpusDigest(assessment),
      assessmentCases: assessment.length,
      assessmentInputCases: assessment.filter(row => row.stage === 'input').length,
      assessmentOutputCases: assessment.filter(row => row.stage === 'output').length,
      deliveryCases: inputs.length - assessment.length,
    }, null, 2));
  }
}
