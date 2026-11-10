# Local heuristic precheck — draft, incomplete and unreviewed

`src/local-assessment.ts` exports `localAssess`, using the existing `Assess`,
`Assessment`, and `Profile` contracts. Assign it to `Options.localAssess` when
assembling a gateway. It is exported through the package entry point; the
caller must still explicitly configure the local precheck. It is a deterministic
LOCAL-only precheck, never a standalone final safety detector. It performs no network calls, credentials access, logging,
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
2. Selected explicit abuse or self-harm statements and bounded indirect home-harm
   grammars return
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
- Bounded ASCII email-shaped candidates, including fullwidth forms normalized by
  NFKC and format-character removal. Complete runs in the implemented ASCII local
  and domain alphabets are scanned on either side of each `@`. Opening single
  quotes and trailing domain dots are trimmed before applying candidate bounds:
  1–64 local characters, 1–253 domain characters, 1–63 per domain label, and an
  alphabetic final label of 2–63 characters. Run scans stop at `@`; each character
  is visited a constant number of times across the length-capped text. Trimming
  uses cursors, not a search over every suffix. Common punctuation outside those
  alphabets (colon, square brackets, parentheses, double quotes, etc.) delimits
  candidates. This detects some embedded substrings and concatenated addresses,
  not all: without a delimiter, a following long local part can be absorbed into
  the preceding domain and the preceding domain into the next local run, making
  both candidates fail their bounds. Long alphabetic prefixes/suffixes can also
  hide otherwise address-shaped substrings. Oversized runs are not searched for
  every valid interior mailbox. Domains are not looked up. This is not RFC
  mailbox validation or coverage of every RFC-valid address; quoted local parts,
  address literals and internationalized addresses are outside the supported
  policy. Tests use invented `.invalid`/`.test` addresses.
- Whole numeric runs of 10–15 Unicode decimal digits with common phone
  separators; 7–9 digits require a selected phone disclosure cue. These are
  phone-shaped heuristics, not national numbering-plan validation.
- Selected explicit self-harm and abuse disclosures, plus clear output
  instructions and manipulative relationship phrases in each language. The
  source phrase tables specify actual coverage; synonyms are not inferred.
- A small positive home-harm grammar: EN subjects “an adult at home”, “someone
  at home”, “an adult in my house” immediately followed by “keeps hurting me”,
  “hurts me”, or “is hurting me”; FR subjects “un adulte à la maison”, “quelqu’un
  chez moi” followed by “continue de me faire du mal”, “me fait du mal”, or “me
  blesse”; ES subjects “un adulto en casa”, “alguien en casa” followed by “sigue
  haciéndome daño”, “me hace daño”, or “me lastima”. These positive forms can
  occur inside a longer statement; arbitrary intervening words are not accepted.
  Accent/format normalization and token boundaries apply. No locale or age band
  restricts these checks. Fear-only and novel indirect self-harm forms still miss.

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
before selected support phrases is handled per occurrence. Output harm handling
instead exempts only complete enumerated warning sentences, including the EN
“Never follow advice that says [you should drink bleach, optionally quoted]”
example and
specific FR/ES equivalents in the source. Straight/curly double quotes normalize
together. Two complete Spanish negative warning sentences are also enumerated.
The sentence must match exactly after normalization and edge trimming; interior
whitespace is not collapsed for these exceptions. A single optional final `.`, `!`, or `?` is removed; sentence separation requires punctuation followed
by whitespace. An appended affirmative clause or another harmful sentence is
still scanned. This is **not** general negation, quotation, fiction, or intent
understanding. Other educational warnings can still be over-refused.

For name cues only, three exact complete introductions (EN “For my story, my name
is Captain Comet” and the listed FR/ES templates using the same alias) continue
to semantic assessment. This is a finite synthetic-alias exception, not a fiction
classifier or evidence that arbitrary names are fictional. There is no general
fiction exemption. “My name is Captain
Comet” alone and fictional introductions with other names still trigger privacy.
Emails, phone-shaped runs, addresses, schools, and ID cues always scan the full
text; the name scan still checks all other sentences. No negation, quotation, or
fiction marker exempts those privacy checks. Support retains precedence and also
stops forwarding when identifiers are present. Coincidental real use of the
exact synthetic alias is an unresolved ambiguity; no general name recognition
or identity verification is claimed.

Coverage is deliberately incomplete. Implicit identifiers, nonnumeric addresses,
names without cues, email run-boundary/concatenation misses described above,
internationalized emails, spelled-out/obfuscated contacts,
other scripts/languages, slang, misspellings, indirect abuse or self-harm,
exploitation, multi-turn context, and new dangerous/manipulative paraphrases can
be missed. Phone-shaped numbers may also be dates, arithmetic, or reference
numbers. Name cues may describe fictional characters outside the exact exception.
Positive home-harm grammars inside denials or quotations can over-route to support; tests
explicitly record this unnecessary-support limitation. Novel subjects, verbs,
slang, dialect, fear-only statements, separated clauses and other mixed-language
combinations can miss. Unknown forms may reach the remote assessment adapter;
these heuristics cannot promise that all disclosures stay local. When that
adapter is unavailable, unknown inputs receive generic unavailability and cannot
generate; recognized disclosures route locally to support even during outages.
Provider data handling and approved localized support copy remain separate
unresolved qualification requirements. No accuracy, recall,
precision, fairness, developmental suitability, or production safety claim is
supported. Unknown examples such as “I wish I could disappear forever” are
explicit regression demonstrations of missed coverage, not benign labels.

The module and synthetic native-phrasing examples have **not** received
native-speaker, safeguarding, clinical, legal, or other independent expert
review. There is no certification. The release remains **blocked**. These bounded
R1/R2/R5 engineering mitigations do not close the review's requirements for specialist
labels, semantic coverage, precision/recall measurement, or independent review.
Tests establish implementation behavior for these examples only; translations and paraphrases are coverage cases, not an
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

Changes for this review are restricted to the module, its test file, the mock
HTTP composition test, and this document. Regression checks include zero remote
calls for recognized punctuated identifiers and indirect disclosures, EN/FR/ES
benign neighbors, appended privacy/harm counterexamples, all age bands, remaining
misses/over-support, and repeated worst-shape scans under a generous time budget.
Timing checks detect gross regressions; they are not a production load benchmark.
