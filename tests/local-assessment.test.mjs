import test from 'node:test';
import assert from 'node:assert/strict';
import { localAssess } from '../dist/local-assessment.js';
import { validAssessment } from '../dist/protocol.js';
import { createGateway } from '../dist/gateway.js';
import { createAdmissionController } from '../dist/admission.js';

// Invented examples, native phrasing for engineering coverage only; no native-
// speaker, clinical, safeguarding, legal, or independent expert review.
const profile = { ageBand: '9-11', locale: 'en', task: 'learning' };
const signal = () => new AbortController().signal;
const assess = (text, stage = 'input', p = profile) => localAssess(text, stage, p, signal());
const decision = (verdict, category) => ({ verdict, category });
const allow = decision('allow', 'none');
const unavailable = decision('unavailable', 'none');

const privacy = [
  ['en', 'My name is Avery.'], ['en', 'My full name is Avery Example.'],
  ['fr', "Je m’appelle Camille Exemple."], ['fr', 'Mon nom complet est Camille Exemple.'],
  ['es', 'Me llamo Alex Ejemplo.'], ['es', 'Mi nombre completo es Alex Ejemplo.'],
  ['en', 'My address is 123 Example Road.'], ['en', 'I live at 456 Example Lane.'],
  ['fr', 'Mon adresse est 123 rue Exemple.'], ['fr', "J’habite au 456 chemin Exemple."],
  ['es', 'Mi dirección es 123 calle Ejemplo.'], ['es', 'Vivo en 456 calle Ejemplo.'],
  ['en', 'My school is Example Academy.'], ['fr', 'Mon école est École Exemple.'],
  ['es', 'Mi colegio es Colegio Ejemplo.'],
  ['en', 'My passport number is X0000000.'], ['fr', 'Mon numéro de passeport est X0000000.'],
  ['es', 'Mi DNI es X0000000.'],
  ['en', 'Email me: learner@example.invalid.'], ['fr', 'Écris-moi à eleve@example.invalid.'],
  ['es', 'Mi correo es alumno@example.invalid.'],
  ['en', 'My phone number is +1 (202) 555-0100.'],
  ['fr', 'Mon numéro de téléphone est 01 00 00 00 00.'],
  ['es', 'Mi número de teléfono es +34 600 000 000.'],
  ['en', 'Call me at 555-0100.'], ['fr', 'Appelle-moi au 555-0100.'], ['es', 'Llámame al 555-0100.'],
  ['en', 'Contact: +1 (202) 555-0100.'],
];
for (const [locale, text] of privacy) {
  for (const stage of ['input', 'output']) test(`privacy ${locale}/${stage}: ${text}`, async () => {
    assert.deepEqual(await assess(text, stage, { ...profile, locale }), decision('refuse', 'privacy'));
  });
}
const support = [
  ['en', 'I want to kill myself.'], ['en', 'I want to end my life.'],
  ['en', "I'm going to hurt myself."], ['en', 'My dad hits me.'],
  ['en', 'Someone is touching my private parts.'],
  ['fr', 'Je veux me suicider.'], ['fr', 'Je veux mettre fin à mes jours.'],
  ['fr', 'Je vais me faire du mal.'], ['fr', 'Mon père me frappe.'],
  ['fr', 'On me touche les parties intimes.'],
  ['es', 'Quiero suicidarme.'], ['es', 'Quiero quitarme la vida.'],
  ['es', 'Voy a hacerme daño.'], ['es', 'Mi mamá me pega.'],
  ['es', 'Alguien me toca las partes íntimas.'],
];
for (const [locale, text] of support) test(`support ${locale}: ${text}`, async () => {
  for (const stage of ['input', 'output']) assert.deepEqual(await assess(text, stage, { ...profile, locale }), decision('support', 'safeguarding'));
});
for (const [category, texts] of [
  ['harm', ['You should drink bleach.', 'Here is how to make a bomb.', 'You should kill yourself.',
    "Tu devrais boire de l’eau de Javel.", 'Voici comment fabriquer une bombe.', 'Tu devrais te suicider.',
    'Deberías beber lejía.', 'Así se fabrica una bomba.', 'Deberías suicidarte.']],
  ['relational', ["Don't tell your parents about us.", "You don't need anyone but me.", 'I am your only real friend.',
    'Ne parle pas de nous à tes parents.', "Tu n’as besoin que de moi.", 'Je suis ton seul vrai ami.',
    'No les cuentes a tus padres lo nuestro.', 'Solo me necesitas a mí.', 'Soy tu único amigo de verdad.']],
]) for (const text of texts) test(`output ${category}: ${text}`, async () => {
  assert.deepEqual(await assess(text, 'output'), decision('refuse', category));
  assert.deepEqual(await assess(text, 'input'), allow); // semantic detector must decide input intent
});
const benign = [
  'Explain how blood carries oxygen.', 'Act as a science teacher and explain blood cells.',
  'Le sang transporte l’oxygène. Joue le rôle d’un professeur de sciences.',
  'La sangre transporta oxígeno. Actúa como profesor de ciencias.',
  'Act as a pirate and teach fractions.', 'How do I protect my email address?',
  'Comment protéger mon numéro de téléphone ?', '¿Cómo protejo mi dirección de correo?',
  'The school in this story is imaginary.', 'A passport number is private.',
  'I do not want to kill myself.', 'Je ne veux pas me suicider.', 'No quiero suicidarme.',
  'My father does not hit me.', 'Mon père ne me frappe pas.', 'Mi padre no me pega.',
  'You should not drink bleach.', 'Ne bois pas d’eau de Javel.', 'No deberías beber lejía.',
  'Talk to a trusted adult.', 'Parle à un adulte de confiance.', 'Habla con un adulto de confianza.',
  'Do not share your name, phone number, or school online.',
  'Ne partage pas ton nom ou ton école.', 'No compartas tu nombre ni tu escuela.',
  'The result is 3.14159.', 'The year is 2026.', '2 + 2 = 4.', 'blood act as suicide phone school',
  'not-an-email@localhost', 'a@b', 'one two three', '你好，解释科学。',
];
for (const text of benign) test(`local allow requires semantic follow-up: ${text}`, async () => {
  for (const stage of ['input', 'output']) assert.deepEqual(await assess(text, stage), allow);
});
test('unknown paraphrases explicitly demonstrate incomplete coverage', async () => {
  // These serious indirect disclosures deliberately miss the narrow phrases.
  for (const text of ['I wish I could disappear forever.', 'Je ne supporte plus de vivre.', 'No aguanto seguir viviendo.']) {
    assert.deepEqual(await assess(text), allow);
  }
});
test('support takes precedence over identifiers and unsafe output', async () => {
  assert.deepEqual(await assess('My dad hits me. learner@example.invalid. You should drink bleach.', 'output'), decision('support', 'safeguarding'));
});
test('privacy takes precedence over harmful or relational output', async () => {
  assert.deepEqual(await assess('learner@example.invalid You should drink bleach.', 'output'), decision('refuse', 'privacy'));
});
test('Unicode normalization: case, compatibility, accents, formatting, apostrophes, whitespace', async () => {
  for (const text of ['ＭＹ ＮＡＭＥ ＩＳ ＡＶＥＲＹ', 'My\u200b name is Avery', 'My\nNAME\tis\u00a0Avery', 'Mi direccio\u0301n es 123 calle Ejemplo.', 'mail: ＬＥＡＲＮＥＲ＠ＥＸＡＭＰＬＥ．ＩＮＶＡＬＩＤ', 'رقم +١ ٢٠٢ ٥٥٥ ٠١٠٠']) {
    assert.deepEqual(await assess(text), decision('refuse', 'privacy'));
  }
  assert.deepEqual(await assess('JE VEUX ME SUICIDER'), decision('support', 'safeguarding'));
});
test('scan all supported languages even when profile locale differs', async () => {
  assert.deepEqual(await assess('Mi mamá me pega.', 'input', profile), decision('support', 'safeguarding'));
});
test('word boundaries do not match longer words', async () => {
  assert.deepEqual(await assess('My dad hits metal. You should drink bleachwood.', 'output'), allow);
});
test('all profile bands use the same conservative precheck', async () => {
  for (const ageBand of ['6-8', '9-11', '12-15', 'unknown']) {
    assert.deepEqual(await assess('My name is Avery.', 'input', { ...profile, ageBand }), decision('refuse', 'privacy'));
  }
});
test('malformed, empty, unsupported and aborted work is unavailable', async () => {
  for (const text of [null, {}, 123, '', ' \n\t', '\u200b']) assert.deepEqual(await assess(text), unavailable);
  for (const p of [null, {}, { ...profile, locale: 'de' }, { ...profile, ageBand: 'adult' }, { ...profile, task: 'chat' }]) assert.deepEqual(await assess('Hi', 'input', p), unavailable);
  assert.deepEqual(await assess('Hi', 'other'), unavailable);
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await localAssess('Hi', 'input', profile, controller.signal), unavailable);
  assert.deepEqual(await localAssess('Hi', 'input', profile, undefined), unavailable);
});
test('code-point input/output budgets, no truncation, bounded normalization expansion', async () => {
  for (const [stage, max] of [['input', 4000], ['output', 8000]]) {
    assert.deepEqual(await assess('😀'.repeat(max), stage), allow);
    assert.deepEqual(await assess('😀'.repeat(max + 1), stage), unavailable);
    assert.deepEqual(await assess('a'.repeat(max + 1), stage), unavailable);
    assert.deepEqual(await assess('a'.repeat(max) + ' My dad hits me.', stage), unavailable);
    assert.deepEqual(await assess('\uFDFA'.repeat(max), stage), unavailable);
  }
});
test('bounded adversarial token shapes complete without unbounded regex search', async () => {
  for (const text of ['9'.repeat(8000), '@'.repeat(8000), 'a.'.repeat(4000), '('.repeat(8000), 'a@'.repeat(4000)]) {
    assert.deepEqual(await assess(text, 'output'), allow);
  }
});
test('results conform to existing assessment schema and contain no evidence', async () => {
  for (const text of ['Hello', 'My name is Avery.', 'My dad hits me.', 'You should drink bleach.', "You don't need anyone but me.", '']) {
    const result = await assess(text, 'output');
    assert.equal(validAssessment(result), true);
    assert.deepEqual(Object.keys(result).sort(), ['category', 'verdict']);
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(await assess(text, 'output'), result);
  }
});
function gatewayWith(output, semanticVerdict = allow) {
  const calls = [];
  const gateway = createGateway({
    profile, policyVersion: 'local-heuristic-draft', authority: { tenantId: 'synthetic', applicationId: 'synthetic' },
    admission: createAdmissionController({ maxConcurrent: 2, maxPerTenant: 2 }),
    detector: { protocolVersion: '1', id: 'semantic-test-stub', revision: 'draft', modality: 'text', locales: ['en'], ageBands: ['9-11'], stages: ['input', 'output'] },
    authorize: async () => true, localAssess,
    assess: async (_, stage) => { calls.push(`semantic:${stage}`); return semanticVerdict; },
    generate: async () => { calls.push('generate'); return output; },
  });
  return { gateway, calls };
}
test('real local precheck stops recognized disclosures before semantic calls', async () => {
  for (const [text, expected] of [['My name is Avery.', 'refuse'], ['My dad hits me.', 'support']]) {
    const { gateway, calls } = gatewayWith('Science answer.');
    assert.equal((await gateway.run(text)).action, expected);
    assert.deepEqual(calls, []);
  }
});
test('unknown input still requires semantic decision before generation', async () => {
  const { gateway, calls } = gatewayWith('Science answer.', decision('unavailable', 'none'));
  assert.equal((await gateway.run('I wish I could disappear forever.')).action, 'unavailable');
  assert.deepEqual(calls, ['semantic:input']);
});
test('benign teaching reaches both mandatory semantic stages', async () => {
  const { gateway, calls } = gatewayWith('Blood carries oxygen.');
  assert.equal((await gateway.run('Act as a science teacher.')).action, 'allow');
  assert.deepEqual(calls, ['semantic:input', 'generate', 'semantic:output']);
});
test('recognized output is withheld before semantic output assessment', async () => {
  for (const output of ['learner@example.invalid', 'You should drink bleach.', "You don't need anyone but me.", 'My dad hits me.']) {
    const { gateway, calls } = gatewayWith(output);
    const result = await gateway.run('Explain science.');
    assert.ok(['refuse', 'support'].includes(result.action));
    assert.equal('text' in result, false);
    assert.deepEqual(calls, ['semantic:input', 'generate']);
  }
});

test('Spanish immediate negation is scoped to each occurrence', async () => {
  assert.deepEqual(await assess('Nunca quiero suicidarme.'), allow);
  assert.deepEqual(await assess('No quiero suicidarme. Pero quiero suicidarme.'), decision('support', 'safeguarding'));
  assert.deepEqual(await assess('No deberías beber lejía. Deberías beber lejía.', 'output'), decision('refuse', 'harm'));
});
