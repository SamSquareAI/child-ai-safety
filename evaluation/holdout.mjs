import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import protocol from '../src/protocol.schema.json' with { type: 'json' };

const fileLimit = 4 * 1024 * 1024;
export const ajv = new Ajv2020({ strict: true, ownProperties: true });
ajv.addSchema(protocol);
export const ref = name => ({ $ref: `${protocol.$id}#/$defs/${name}` });
export const record = properties => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
});
export const list = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const prose = maxLength => ({ type: 'string', maxLength, pattern: '\\S' });
const stages = ['input', 'output'];
// AJV maxLength counts Unicode code points, as the gateway does.
const textLimits = {
  input: protocol.$defs.request.properties.input.maxLength,
  output: protocol.$defs.result.properties.text.maxLength,
};
const actions = ['allow', 'refuse', 'support'];
const caseFields = {
  id: ref('identifier'), family: ref('identifier'), locale: ref('locale'),
  ageBand: ref('ageBand'), task: { const: 'learning' },
};
const validInput = ajv.compile({ oneOf: [
  record({
    ...caseFields, track: { const: 'assessment' }, stage: { const: 'input' }, text: prose(textLimits.input),
  }),
  record({
    ...caseFields, track: { const: 'assessment' }, stage: { const: 'output' },
    text: prose(textLimits.output), requestInput: prose(textLimits.input),
  }),
  record({ ...caseFields, track: { const: 'delivery' }, turns: list(prose(textLimits.input), 2, 32) }),
] });
const validReview = ajv.compile(record({
  id: ref('identifier'),
  adjudication: { const: 'approved' },
  reviewers: record({ safeguarding: ref('identifier'), language: ref('identifier') }),
  expectations: list(record({
    expected: ref('assessment'),
    severity: { enum: ['none', 'low', 'moderate', 'high', 'critical'] },
    rationale: prose(4000),
    visibleBehavior: prose(4000),
    prohibitedContent: list(prose(4000), 0, 16),
  }), 1, 32),
}));

function readRecords(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > fileLimit) throw new Error('invalid file');
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length !== stat.size) throw new Error('file size changed');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
    if (!Array.isArray(value) || value.length > 2000) throw new Error('invalid record list');
    return value;
  } finally {
    closeSync(fd);
  }
}

export function indexRecords(records, validate, file, errors) {
  const index = new Map();
  records.forEach((row, position) => {
    if (!validate(row)) {
      errors.push({ file, row: position + 1, issue: 'invalid-record' });
    } else if (index.has(row.id)) {
      errors.push({ file, row: position + 1, issue: 'duplicate-id' });
    } else {
      index.set(row.id, { row, position: position + 1 });
    }
  });
  return index;
}

export function checkHoldout(inputs, reviews, errors) {
  const cases = indexRecords(inputs, validInput, 'inputs', errors);
  const labels = indexRecords(reviews, validReview, 'review', errors);
  const pairs = [];
  const coverage = new Set();
  const families = { assessment: new Set(), delivery: new Set() };
  const counts = { assessment: 0, delivery: 0 };

  for (const [id, { position }] of labels) {
    if (!cases.has(id)) errors.push({ file: 'review', row: position, issue: 'unknown-case' });
  }
  for (const [id, { row: entry, position }] of cases) {
    const review = labels.get(id)?.row;
    if (!review) {
      errors.push({ file: 'inputs', row: position, issue: 'missing-review' });
      continue;
    }
    const expectedCount = entry.track === 'assessment' ? 1 : entry.turns.length;
    if (review.expectations.length !== expectedCount) {
      errors.push({ file: 'review', row: labels.get(id).position, issue: 'expectation-count' });
      continue;
    }
    pairs.push({ entry, expectations: review.expectations });
    const verdicts = review.expectations.map(item => item.expected.verdict);
    const slice = [entry.track, entry.locale, entry.ageBand];
    let group;
    if (entry.track === 'assessment') {
      if (actions.includes(verdicts[0])) group = [...slice, entry.stage, verdicts[0]];
    } else if (verdicts.every(verdict => verdict === 'allow')) {
      group = [...slice, 'benign'];
    } else if (verdicts[0] === 'allow' && verdicts.some(verdict => verdict === 'refuse' || verdict === 'support')) {
      group = [...slice, 'changes-with-context'];
    }
    if (group) coverage.add(group.join('/'));
    families[entry.track].add(entry.family);
    counts[entry.track]++;
  }

  const missingCoverage = [];
  for (const locale of protocol.$defs.locale.enum) {
    for (const age of protocol.$defs.ageBand.enum) {
      for (const stage of stages) {
        for (const action of actions) {
          const key = ['assessment', locale, age, stage, action].join('/');
          if (!coverage.has(key)) missingCoverage.push(key);
        }
      }
      for (const group of ['benign', 'changes-with-context']) {
        const key = ['delivery', locale, age, group].join('/');
        if (!coverage.has(key)) missingCoverage.push(key);
      }
    }
  }

  const report = {
    ok: errors.length === 0 && missingCoverage.length === 0,
    counts,
    scenarioFamilies: {
      assessment: families.assessment.size,
      delivery: families.delivery.size,
      total: new Set([...families.assessment, ...families.delivery]).size,
    },
    errors,
    missingCoverage,
  };
  return { report, pairs };
}

export function readHoldoutFiles(paths, names, errors) {
  return paths.map((path, index) => {
    try {
      return readRecords(path);
    } catch {
      errors.push({ file: names[index], issue: 'unreadable-or-invalid-json-list' });
      return [];
    }
  });
}
