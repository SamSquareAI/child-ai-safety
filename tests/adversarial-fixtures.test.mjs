import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Data integrity only. Never compare these draft labels with a detector as if
// they were independently reviewed ground truth. No runtime/provider imports.
const fixtureUrl = new URL('../evaluation/adversarial-draft.json', import.meta.url);
const bytes = await readFile(fixtureUrl);
const cases = JSON.parse(bytes.toString('utf8'));
const fields = ['id', 'family', 'locale', 'ageBand', 'stage', 'text', 'expected', 'category', 'labelStatus'].sort();
const locales = ['en', 'fr', 'es'];
const ages = ['6-8', '9-11', '12-15', 'unknown'];
const families = [
  'education-science', 'body-health', 'creativity-roleplay', 'prompt-injection-input',
  'personal-data-input', 'abuse-disclosure', 'self-harm-disclosure', 'harmful-request',
  'science-output', 'body-health-output', 'supportive-response', 'overrefusal-control',
  'personal-data-output', 'harmful-output', 'coercive-relational-output', 'prompt-injection-output',
];
const count = predicate => cases.filter(predicate).length;

function validateCase(item) {
  assert.ok(item !== null && typeof item === 'object' && !Array.isArray(item));
  assert.deepEqual(Object.keys(item).sort(), fields);
  assert.equal(typeof item.id, 'string');
  assert.match(item.id, /^draft-(?:en|fr|es)-(?:0[1-9]|1[0-6])$/u);
  assert.equal(typeof item.family, 'string');
  assert.ok(item.family.length >= 1 && item.family.length <= 64);
  assert.ok(families.includes(item.family));
  assert.ok(locales.includes(item.locale));
  assert.ok(item.id.startsWith(`draft-${item.locale}-`));
  assert.ok(ages.includes(item.ageBand));
  assert.ok(['input', 'output'].includes(item.stage));
  assert.equal(typeof item.text, 'string');
  const limit = item.stage === 'input' ? 4000 : 8000;
  assert.ok(item.text.length <= limit * 2);
  assert.ok(item.text.trim().length > 0 && [...item.text].length <= limit);
  assert.equal(item.text.isWellFormed(), true);
  assert.doesNotMatch(item.text, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u);
  assert.ok(['allow', 'refuse', 'support'].includes(item.expected));
  assert.ok(['none', 'privacy', 'harm', 'safeguarding', 'relational'].includes(item.category));
  assert.equal(item.expected === 'allow', item.category === 'none');
  assert.equal(item.labelStatus, 'unreviewed-draft');
}

test('bounded JSON array contains exactly 48 distinct draft cases', () => {
  assert.ok(bytes.byteLength <= 128 * 1024);
  assert.ok(Array.isArray(cases));
  assert.equal(cases.length, 48);
  assert.equal(new Set(cases.map(item => item.id)).size, 48);
  assert.equal(new Set(cases.map(item => item.text)).size, 48);
});
test('each case has exactly the permitted fields, enums, draft status, and text bounds', () => {
  for (const item of cases) validateCase(item);
});
test('locale and stage margins are balanced, including within each locale', () => {
  for (const locale of locales) {
    assert.equal(count(item => item.locale === locale), 16);
    for (const stage of ['input', 'output']) assert.equal(count(item => item.locale === locale && item.stage === stage), 8);
  }
  for (const stage of ['input', 'output']) assert.equal(count(item => item.stage === stage), 24);
});
test('all four age bands are represented in every locale and both stages', () => {
  for (const ageBand of ages) {
    assert.equal(count(item => item.ageBand === ageBand), 12);
    for (const locale of locales) {
      assert.equal(count(item => item.ageBand === ageBand && item.locale === locale), 4);
      for (const stage of ['input', 'output']) assert.equal(count(item => item.ageBand === ageBand && item.locale === locale && item.stage === stage), 2);
    }
  }
});
test('all targeted families appear once per locale; translations are correlated', () => {
  assert.deepEqual([...new Set(cases.map(item => item.family))].sort(), [...families].sort());
  for (const family of families) {
    const group = cases.filter(item => item.family === family);
    assert.equal(group.length, 3);
    assert.deepEqual(group.map(item => item.locale).sort(), [...locales].sort());
    for (const key of ['ageBand', 'stage', 'expected', 'category']) assert.equal(new Set(group.map(item => item[key])).size, 1);
  }
});
test('draft label margins and support/refusal distinctions remain explicit', () => {
  assert.equal(count(item => item.expected === 'allow'), 21);
  assert.equal(count(item => item.expected === 'refuse'), 21);
  assert.equal(count(item => item.expected === 'support'), 6);
  for (const item of cases.filter(item => item.expected === 'support')) {
    assert.equal(item.category, 'safeguarding');
    assert.equal(item.stage, 'input');
  }
  for (const locale of locales) {
    const supportive = cases.find(item => item.locale === locale && item.family === 'supportive-response');
    assert.equal(supportive.stage, 'output');
    assert.equal(supportive.expected, 'allow');
    assert.equal(supportive.category, 'none');
    const harmful = cases.find(item => item.locale === locale && item.family === 'harmful-output');
    assert.equal(harmful.stage, 'output');
    assert.equal(harmful.expected, 'refuse');
    assert.equal(harmful.category, 'harm');
  }
});
test('invented personal-data examples carry SYNTHETIC markers and reserved email domains', () => {
  const personal = cases.filter(item => item.family.startsWith('personal-data-'));
  assert.equal(personal.length, 6);
  for (const item of personal) {
    assert.match(item.text, /\bSYNTHETIC\b/u);
    const emails = (item.text.match(/[a-z0-9-]+@[a-z0-9.-]+/gu) ?? []).map(email=>email.replace(/\.+$/u,''));
    assert.equal(emails.length, 1);
    assert.ok(emails[0].endsWith('@example.invalid'));
    assert.equal(item.expected, 'refuse');
    assert.equal(item.category, 'privacy');
  }
});
test('strict validator rejects missing/extra fields, invalid enums, and oversized or empty text', () => {
  const base = cases[0];
  const missing = { ...base }; delete missing.labelStatus;
  for (const invalid of [null, [], missing, { ...base, extra: true },
    { ...base, id: 'draft-fr-01' }, { ...base, locale: 'de' },
    { ...base, ageBand: 'adult' }, { ...base, stage: 'both' },
    { ...base, expected: 'unavailable' }, { ...base, category: 'other' },
    { ...base, expected: 'allow', category: 'harm' },
    { ...base, expected: 'support', category: 'none' },
    { ...base, labelStatus: 'reviewed' }, { ...base, text: '   ' },
    { ...base, text: '😀'.repeat(4001) }, { ...base, stage: 'output', text: 'a'.repeat(8001) },
    { ...base, text: '\uD800' }, { ...base, text: '\u0000' },
  ]) assert.throws(() => validateCase(invalid));
});
