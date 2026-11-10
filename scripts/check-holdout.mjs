import { checkHoldout, readHoldoutFiles } from '../evaluation/holdout.mjs';

const paths = process.argv.slice(2);
if (paths.length !== 2) {
  console.error('Usage: npm run holdout:check -- <case-inputs.json> <review-key.json>');
  process.exitCode = 2;
} else {
  const errors = [];
  const records = readHoldoutFiles(paths, ['inputs', 'review'], errors);
  const { report } = checkHoldout(...records, errors);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
