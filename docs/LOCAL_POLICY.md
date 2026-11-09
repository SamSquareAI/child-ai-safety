# Local heuristic precheck — draft, incomplete and unreviewed

`src/local-assessment.ts` exports `localAssess`, using the existing `Assess`,
`Assessment`, and `Profile` contracts. Assign it to `Options.localAssess` when
assembling a gateway. This change does not wire or export it through the package
entry point. It is a deterministic LOCAL-only precheck, never a standalone final
safety detector. It performs no network calls, credentials access, logging,
telemetry, persistence, or runtime imports. No Koda code, private data, or existing
fixtures were imported or copied.

**An `allow` result means only that no implemented heuristic matched. Mandatory
semantic assessment must follow on both input and output.** Unknown and indirect
cases can return allow despite serious risk. Do not use this module as the
semantic `assess` adapter or substitute it for an unavailable detector. The
existing gateway enforces the separate semantic stage and suppresses generation
or delivery if that stage is unavailable. Tests use a semantic stub only to
verify orchestration, not to qualify a detector.

## Decisions and precedence

1. Aborted, malformed, unsupported, blank, or oversized work returns
   `unavailable/none`. Input is limited to 4,000 Unicode code points; output to
   8,000, with an earlier UTF-16 bound. No truncation is used.
2. Selected explicit abuse or self-harm statements return
   `support/safeguarding` on either stage, even when identifiers are present.
   Examples include “my dad hits me”, “je veux me suicider”, and
   “voy a hacerme daño”. This stops external forwarding in the gateway.
3. Obvious supported identifiers return `refuse/privacy` on either stage.
4. Selected clear dangerous output phrases return `refuse/harm`; selected clear
   secrecy, isolation, or exclusive-dependence output phrases return
   `refuse/relational`. These particular rules apply only to output. Input still
   requires semantic interpretation.
5. Everything else returns `allow/none` **to continue mandatory semantic checks**.

Only verdict and category are returned, in immutable objects. No raw evidence,
matched identifiers, offsets, explanation, or child response text is emitted.
Support is a routing decision, not clinical advice or an emergency service.
Response references require separately reviewed localized support content; this
module does not contact parents or authorities or promise monitoring.

## Implemented coverage

All EN/FR/ES patterns are checked regardless of configured locale. All supported
age bands, including unknown, receive the same narrow precheck; this is not an
age-appropriate policy qualification.

- Explicit first-person name and school cues followed immediately by a word;
  numeric-first addresses and identifier cues followed immediately by a token
  containing a number. Examples: “my name is”, “mon école est”, “mi dirección
  es”, and “mi número de pasaporte es”. No identity verification is attempted.
- Bounded ASCII email syntax, including fullwidth forms normalized by NFKC.
  Domains are not looked up. Invented `.invalid` addresses are used in tests.
- Whole numeric runs of 10–15 Unicode decimal digits with common phone
  separators; 7–9 digits require a selected phone disclosure cue. These are
  phone-shaped heuristics, not national numbering-plan validation.
- Selected explicit self-harm and abuse disclosures, plus clear output
  instructions and manipulative relationship phrases in each language. The
  source phrase tables specify actual coverage; synonyms are not inferred.

Normalization uses NFKC, lowercase, format-character removal, accent folding,
Unicode letter/number tokens, and apostrophe/whitespace normalization. Matching
uses word boundaries through token separation, not English-only `\b`. Regexes
use simple scans or bounded components without recursive/nested ambiguous
quantifiers. Raw and normalized lengths are capped; excessive normalization
expansion returns unavailable. No dictionaries, external models, or per-user
state are loaded. Token matching can cross punctuation and sentence boundaries.

## Context and limitations

Ordinary science about blood and “act as a teacher” prompts remain eligible for
semantic assessment. Individual words such as blood, suicide, school, or phone
are not refusal triggers. Negative tests cover EN/FR/ES teaching, privacy
education, and selected negated statements. Immediate Spanish `no`/`nunca`
before selected support/harm phrases is handled per occurrence. This is **not**
general negation, quotation, fiction, or intent understanding. Quoted examples,
sarcasm, indirect speech, and punctuation changes can produce false positives.

Coverage is deliberately incomplete. Implicit identifiers, nonnumeric addresses,
names without cues, internationalized emails, spelled-out/obfuscated contacts,
other scripts/languages, slang, misspellings, indirect abuse or self-harm,
exploitation, multi-turn context, and new dangerous/manipulative paraphrases can
be missed. Phone-shaped numbers may also be dates, arithmetic, or reference
numbers. Name cues may describe fictional characters. No accuracy, recall,
precision, fairness, developmental suitability, or production safety claim is
supported. Unknown examples such as “I wish I could disappear forever” are
explicit regression demonstrations of missed coverage, not benign labels.

The module and synthetic native-phrasing examples have **not** received
native-speaker, safeguarding, clinical, legal, or other independent expert
review. There is no certification. Tests establish implementation behavior for
these examples only; translations and paraphrases are coverage cases, not an
independent evaluation corpus or proof of generalization. No real child data is
needed or permitted by this test design.

## Local verification

With the checkout's existing dependencies installed, run without network access:

```sh
npm run build
node --test tests/local-assessment.test.mjs
node --test tests/*.test.mjs
```

Tests cover positive disclosures and selected paraphrases, benign and negated
examples, output-only rules, precedence, cross-locale scanning, all profile
bands, Unicode normalization and boundaries, invalid/aborted work, bounded
adversarial shapes, deterministic evidence-free schema-compatible decisions,
and real local-precheck integration with mandatory semantic-stage stubs. They
do not use credentials, external providers, or existing fixture labels to make
local decisions. Existing gateway tests retain their own contract-only fixtures.

Changes are restricted to the module, its new test file, and this document.
No commit or push is part of this work. The parent/user handles all commits,
authored as `asamassekou10`.
