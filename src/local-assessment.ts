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
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘ʼ]/gu, "'");
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
  // Each token and component is bounded before regex validation. ASCII email
  // coverage only, with fullwidth forms handled by NFKC; no DNS/network lookup.
  return text.split(/\s/u).some(raw => {
    if (raw.length > 320) return false;
    const token = raw.replace(/^[<("']+/u, "").replace(/[>)"',;:!?.]+$/u, "");
    const parts = token.split("@");
    if (parts.length !== 2) return false;
    const [local = "", domain = ""] = parts;
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/u.test(local)) return false;
    const labels = domain.split(".");
    return labels.length >= 2 && labels.every(label => label.length >= 1 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) && /^[a-z]{2,63}$/u.test(labels.at(-1) ?? "");
  });
}
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
  if (hasPhrase(tokenText, support, true)) return SUPPORT;
  if (hasEmail(normalized) || hasPhone(normalized, tokenText) ||
      valueAfter(tokenText, nameCues, "word") || valueAfter(tokenText, schoolCues, "word") ||
      valueAfter(tokenText, addressCues, "digit") || valueAfter(tokenText, idCues, "digit")) return PRIVACY;
  if (stage === "output") {
    if (hasPhrase(tokenText, harmfulOutput, true)) return HARM;
    if (hasPhrase(tokenText, relationalOutput)) return RELATIONAL;
  }
  return ALLOW;
};
