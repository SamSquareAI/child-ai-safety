/** Incomplete, unreviewed LOCAL heuristic precheck; never a final detector.
 * No I/O, telemetry, credentials, persistence, or runtime imports. */
import type { Assess, Assessment, Profile } from "./gateway.js";

const ALLOW: Assessment = Object.freeze({ verdict: "allow", category: "none" });
const UNAVAILABLE: Assessment = Object.freeze({ verdict: "unavailable", category: "none" });
const SUPPORT: Assessment = Object.freeze({ verdict: "support", category: "safeguarding" });
const PRIVACY: Assessment = Object.freeze({ verdict: "refuse", category: "privacy" });
const HARM: Assessment = Object.freeze({ verdict: "refuse", category: "harm" });
const RELATIONAL: Assessment = Object.freeze({ verdict: "refuse", category: "relational" });

// Same code-point budgets as the gateway; cap UTF-16 before normalization/work.
const limits = { input: 4000, output: 8000 } as const;
function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\p{Cf}/gu, "")
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘ʼ]/gu, "'").replace(/[“”]/gu, '"');
}
function words(text: string): string {
  return ` ${(text.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ")} `;
}
function phrases(entries: readonly string[]): readonly string[] {
  return entries.map(entry => words(normalize(entry)));
}
const support = phrases([
  "I want to kill myself", "I want to end my life", "I am going to hurt myself",
  "I'm going to hurt myself", "my dad hits me", "my mother hits me",
  "my father hits me", "someone is touching my private parts",
  "je veux me suicider", "je veux mettre fin à mes jours", "je vais me faire du mal",
  "mon père me frappe", "ma mère me frappe", "on me touche les parties intimes",
  "quiero suicidarme", "quiero quitarme la vida", "voy a hacerme daño",
  "mi padre me pega", "mi mamá me pega", "alguien me toca las partes íntimas",
]);
const harmfulOutput = phrases([
  "you should drink bleach", "here is how to make a bomb", "you should kill yourself",
  "tu devrais boire de l'eau de javel", "voici comment fabriquer une bombe", "tu devrais te suicider",
  "deberías beber lejía", "así se fabrica una bomba", "deberías suicidarte",
]);
const relationalOutput = phrases([
  "don't tell your parents about us", "you don't need anyone but me", "I am your only real friend",
  "ne parle pas de nous à tes parents", "tu n'as besoin que de moi", "je suis ton seul vrai ami",
  "no les cuentes a tus padres lo nuestro", "solo me necesitas a mí", "soy tu único amigo de verdad",
]);
const nameCues = phrases([
  "my name is", "my full name is", "je m'appelle", "mon nom est", "mon nom complet est",
  "me llamo", "mi nombre es", "mi nombre completo es",
]);
const addressCues = phrases([
  "my address is", "I live at", "mon adresse est", "j'habite au", "j'habite à",
  "mi dirección es", "vivo en",
]);
const schoolCues = phrases([
  "my school is", "I go to school at", "mon école est", "je vais à l'école",
  "mi escuela es", "mi colegio es",
]);
const idCues = phrases([
  "my social security number is", "my passport number is", "my national id is",
  "mon numéro de sécurité sociale est", "mon numéro de passeport est",
  "mi número de seguridad social es", "mi número de pasaporte es", "mi dni es",
]);
const phoneCues = phrases([
  "my phone number is", "call me at", "mon numéro de téléphone est", "appelle moi au",
  "mi número de teléfono es", "llámame al",
]);
function hasPhrase(text: string, entries: readonly string[], checkNegation = false): boolean {
  return entries.some(entry => {
    let from = 0;
    for (;;) {
      const at = text.indexOf(entry, from);
      if (at < 0) return false;
      // Only immediate Spanish no/nunca is understood. Do not strip whole
      // sentences: a later affirmative disclosure must still be recognized.
      const prefix = text.slice(Math.max(0, at - 6), at);
      if (!checkNegation || !/(?:^| )(?:no|nunca)$/u.test(prefix)) return true;
      from = at + entry.length - 1;
    }
  });
}

// Value must immediately follow an explicit disclosure cue. This is deliberately
// narrow: it does not attempt general name/entity recognition or address parsing.
function valueAfter(text: string, cues: readonly string[], kind: "word" | "digit"): boolean {
  for (const cue of cues) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(cue, from);
      if (at < 0) break;
      const value = text.slice(at + cue.length, at + cue.length + 65).split(" ", 1)[0] ?? "";
      if (kind === "word" ? /^\p{L}{2,64}$/u.test(value) : /^[\p{L}\p{N}]{2,64}$/u.test(value) && /\p{N}/u.test(value)) return true;
      from = at + cue.length;
    }
  }
  return false;
}
function hasEmail(text: string): boolean {
  // Scan complete ASCII runs around each @, trimming opening single quotes
  // and trailing dots before bounding candidates. Runs stop at @, so across
  // the capped text each character is visited only a constant number of times.
  // This is deliberately address-shaped detection, not RFC mailbox validation.
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "@") continue;
    let start = at;
    while (start > 0 && /[a-z0-9.!#$%&'*+/=?^_`{|}~-]/u.test(text[start - 1]!)) start--;
    while (start < at && text[start] === "'") start++;
    const localLength = at - start;
    if (!localLength || localLength > 64) continue;
    let end = at + 1;
    while (end < text.length && /[a-z0-9.-]/u.test(text[end]!)) end++;
    // Trim by cursor rather than an unbounded suffix regex/backtracking search.
    while (end > at + 1 && text[end - 1] === ".") end--;
    if (end - at - 1 > 253) continue;
    const domain = text.slice(at + 1, end);
    const labels = domain.split(".");
    if (labels.length >= 2 && labels.every(label => label.length >= 1 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) && /^[a-z]{2,63}$/u.test(labels.at(-1) ?? "")) return true;
  }
  return false;
}

// Small positive grammars, not semantic inference. No arbitrary token gaps or
// removal of negation/fiction context. Missing paraphrases still need assessment.
function indirectDisclosure(text: string): boolean {
  return [
    / (?:an adult at home|someone at home|an adult in my house) (?:keeps hurting me|hurts me|is hurting me) /u,
    / (?:un adulte a la maison|quelqu un chez moi) (?:continue de me faire du mal|me fait du mal|me blesse) /u,
    / (?:un adulto en casa|alguien en casa) (?:sigue haciendome dano|me hace dano|me lastima) /u,
  ].some(pattern => pattern.test(text));
}

// Only complete, enumerated sentences are eligible for semantic follow-up.
// Never use these reductions for email, phone, address, school or ID checks.
function withoutSentences(text: string, sentences: readonly string[]): string {
  // Trim sentence edges only; retain punctuation and boundaries so a
  // prefix such as "Never ..." cannot exempt an appended affirmative clause.
  return text.split(/(?<=[.!?])\s+/u).map(sentence => {
    const candidate = sentence.trim().replace(/[.!?]$/u, "");
    return sentences.includes(candidate) ? "" : sentence;
  }).join(" ");
}
const educationalWarnings = [
  "never follow advice that says you should drink bleach",
  'never follow advice that says "you should drink bleach"',
  "ne suis jamais un conseil qui dit tu devrais boire de l'eau de javel",
  'ne suis jamais un conseil qui dit "tu devrais boire de l\'eau de javel"',
  "nunca sigas un consejo que diga deberias beber lejia",
  'nunca sigas un consejo que diga "deberias beber lejia"',
  "no deberias beber lejia", "no deberias suicidarte",
];
const fictionalIntroductions = [
  "for my story, my name is captain comet",
  "pour mon histoire, je m'appelle captain comet",
  "para mi historia, me llamo captain comet",
];
function hasPhone(text: string, tokenText: string): boolean {
  // Linear scan of whole runs: never test every suffix of a long digit string.
  const runs = text.match(/[+\p{Nd}][\p{Nd} ()/.-]*/gu) ?? [];
  const explicit = hasPhrase(tokenText, phoneCues);
  return runs.some(run => {
    if (run.length > 64) return false;
    const count = (run.match(/\p{Nd}/gu) ?? []).length;
    return (count >= 10 && count <= 15) || (explicit && count >= 7 && count <= 15);
  });
}
function validProfile(profile: Profile): boolean {
  return !!profile && ["en", "fr", "es"].includes(profile.locale) &&
    ["6-8", "9-11", "12-15", "unknown"].includes(profile.ageBand) && profile.task === "learning";
}

/** Assignable to Assess, for Options.localAssess only. All languages are scanned
 * regardless of profile.locale. Allow means continue to mandatory semantic
 * assessment, never permission to generate or deliver on this check alone. */
export const localAssess: Assess = async (text, stage, profile, signal): Promise<Assessment> => {
  if (!signal || signal.aborted || (stage !== "input" && stage !== "output") || !validProfile(profile)) return UNAVAILABLE;
  if (typeof text !== "string" || text.length > limits[stage] * 2 ||
      [...text].length > limits[stage]) return UNAVAILABLE;
  const normalized = normalize(text);
  // NFKC may expand characters; reject expansion rather than truncate evidence.
  if (normalized.length > limits[stage] * 2 || !normalized.trim()) return UNAVAILABLE;
  const tokenText = words(normalized);
  if (tokenText === "  ") return ALLOW;
  if (hasPhrase(tokenText, support, true) || indirectDisclosure(tokenText)) return SUPPORT;
  if (hasEmail(normalized) || hasPhone(normalized, tokenText) ||
      valueAfter(words(withoutSentences(normalized, fictionalIntroductions)), nameCues, "word") || valueAfter(tokenText, schoolCues, "word") ||
      valueAfter(tokenText, addressCues, "digit") || valueAfter(tokenText, idCues, "digit")) return PRIVACY;
  if (stage === "output") {
    if (hasPhrase(words(withoutSentences(normalized, educationalWarnings)), harmfulOutput)) return HARM;
    if (hasPhrase(tokenText, relationalOutput)) return RELATIONAL;
  }
  return ALLOW;
};
