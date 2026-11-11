import { readFile } from 'node:fs/promises';
import { localAssess } from '../dist/local-assessment.js';
import { corpusDigest } from '../evaluation/corpus-digest.mjs';
import { summarizeAssessments } from '../evaluation/report.mjs';

const cases = JSON.parse(await readFile(new URL('../evaluation/adversarial-draft.json', import.meta.url), 'utf8'));
summarizeAssessments(cases, []);

const signal = new AbortController().signal;
const observations = [];
const differences = [];
for (const item of cases) {
  const profile = Object.freeze({ locale: item.locale, ageBand: item.ageBand, task: 'learning' });
  const assessment = await localAssess(item.text, item.stage, profile, signal);
  observations.push({ id: item.id, assessment });
  if (assessment.verdict !== item.expected || assessment.category !== item.category) {
    differences.push({
      id: item.id,
      family: item.family,
      locale: item.locale,
      stage: item.stage,
      draft: { verdict: item.expected, category: item.category },
      observed: assessment,
    });
  }
}

const { overall, slices } = summarizeAssessments(cases, observations);
console.log(JSON.stringify({
  scope: 'local-precheck-only',
  labelStatus: 'unreviewed-draft',
  allowMeaning: 'Continue to mandatory assessment',
  productionQualified: false,
  corpusSha256: corpusDigest(cases),
  scenarioFamilies: new Set(cases.map(item => item.family)).size,
  overall,
  slices,
  differences,
}, null, 2));
