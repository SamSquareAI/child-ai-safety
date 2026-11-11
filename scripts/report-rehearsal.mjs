import { readFile } from 'node:fs/promises';

const [first, second, ...extra] = process.argv.slice(2);
const scope = {
  locale: ['en', 'fr', 'es'],
  ageBand: ['6-8', '9-11', '12-15', 'unknown'],
  stage: ['input', 'output'],
};
const actions = ['allow', 'refuse', 'support', 'unavailable'];
const digest = /^[a-f0-9]{64}$/u;

function row(summary) {
  const values = [
    summary?.total, summary?.exactMatches?.numerator,
    ...['allows', 'refusals', 'support', 'unavailable', 'failures', 'missing']
      .map(key => summary?.counts?.[key]),
  ];
  if (values.some(n => !Number.isSafeInteger(n) || n < 0) ||
      values[0] !== summary.exactMatches.denominator || values[1] > values[0] ||
      values.slice(2).reduce((sum, n) => sum + n, 0) !== values[0]) {
    throw new Error('Invalid assessment counts');
  }
  return values;
}

function outcomes(observations) {
  if (!Array.isArray(observations) || observations.some(item => !actions.includes(item?.action))) {
    throw new Error('Invalid delivery outcomes');
  }
  return actions.map(action => observations.filter(item => item.action === action).length);
}

async function load(path) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  const { assessment } = report;
  const bindings = [
    report.corpusSha256, assessment?.catalogSha256, assessment?.configurationSha256,
    assessment?.run?.corpusSha256,
  ];
  if (report.scope !== 'offline-fixture-oracle-delivery' || report.productionQualified !== false ||
      report.corpusSha256 !== assessment?.corpusSha256 ||
      bindings.some(value => typeof value !== 'string' || !digest.test(value))) {
    throw new Error('Expected an offline rehearsal report');
  }
  const { overall, slices } = assessment.scores;
  return {
    bindings,
    assessments: [
      ['All cases', row(overall)],
      ...Object.entries(scope).flatMap(([dimension, labels]) =>
        labels.map(label => [label, row(slices?.[dimension]?.[label])])),
    ],
    delivery: [outcomes(report.observations), outcomes(report.outages)],
  };
}

function render(report, baseline) {
  if (baseline && report.bindings.some((value, index) => value !== baseline.bindings[index])) {
    throw new Error('Cannot compare different corpus, catalog, or fixture configuration digests');
  }
  const cells = (values, earlier) => values.map((value, index) => {
    const old = earlier?.[index];
    return old !== undefined && old !== value ? `${old} → ${value}` : value;
  }).join(' | ');
  return [
    '# Child AI Safety rehearsal',
    '',
    baseline ? 'Baseline → current · public synthetic cases · simulated delivery' :
      'Public synthetic cases · simulated delivery',
    '',
    '| Local precheck | Planned | Draft matches | Continue | Refuse | Support | Unavailable | Failed | Missing |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.assessments.map(([label, values], index) =>
      `| ${label} | ${cells(values, baseline?.assessments[index][1])} |`),
    '',
    '| Simulated delivery | Approved | Refused | Support | Unavailable |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.delivery.map((values, index) =>
      `| ${['Normal', 'Detector unavailable'][index]} | ${cells(values, baseline?.delivery[index])} |`),
    '',
    'Continue means the local precheck defers the decision to the mandatory detector.',
  ].join('\n');
}

if (!first || extra.length) {
  console.error('Usage: npm run --silent eval:report -- REPORT.json [CURRENT.json]');
  process.exitCode = 2;
} else {
  try {
    const earlier = await load(first);
    console.log(second ? render(await load(second), earlier) : render(earlier));
  } catch (error) {
    const known = ['Invalid assessment counts', 'Invalid delivery outcomes', 'Expected an offline rehearsal report',
      'Cannot compare different corpus, catalog, or fixture configuration digests'];
    console.error(known.includes(error.message) ? error.message : 'Unable to read rehearsal report');
    process.exitCode = 1;
  }
}
