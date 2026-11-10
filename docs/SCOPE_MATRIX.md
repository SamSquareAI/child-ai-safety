# Offline age/language engineering matrix (R7)

This is synthetic, scripted control-flow evidence through the real gateway and
research delivery projection. It is not semantic safety accuracy, live generation
evidence, independent review, approved safeguarding copy, or production readiness.
The R7 qualification gap remains open. No release or approval gate changes here.

Run from the repository root, with existing local dependencies installed:

```sh
npm run build
node --test tests/scope-matrix.test.mjs
node evaluation/scope-matrix.mjs
```

The last command prints a deterministic JSON metadata report to stdout. It makes
no network or paid calls, reads no credentials, and writes no report file. It
accepts no CLI arguments. An incomplete run, failed invariant, or invalid CLI
invocation exits nonzero. There are no timestamps or timing-based scenarios.

## Predeclared scope and counts

Every slice contains exactly one of each of these 12 scenarios:

| Scenario | Expected action | Generation calls | Remote output checks |
| --- | --- | ---: | ---: |
| allow | allow | 1 | 1 |
| local-input-support | support | 0 | 0 |
| local-input-refusal | refuse | 0 | 0 |
| remote-input-support | support | 0 | 0 |
| remote-input-refusal | refuse | 0 | 0 |
| local-output-refusal | refuse | 1 | 0 |
| remote-output-refusal | refuse | 1 | 1 |
| local-input-unavailable | unavailable | 0 | 0 |
| remote-input-unavailable | unavailable | 0 | 0 |
| generation-unavailable | unavailable | 1 | 0 |
| remote-output-unavailable | unavailable | 1 | 1 |
| final-revocation | unavailable | 1 | 1 |

Unavailability is a scripted detector verdict or generator exception, not an
observed provider outage. Final revocation denies the fifth authorization check,
after both output assessments have allowed the candidate. Local refusal prevents
the corresponding remote assessment. Input support/refusal prevents generation.
Every non-allow result must omit candidate text and project to a static mock
placeholder. Rendering and speech are memory spies using that projection.

| Trusted age band | Locale | Cases | Allow | Refuse | Support | Unavailable |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 6-8 | en | 12 | 1 | 4 | 2 | 5 |
| 6-8 | fr | 12 | 1 | 4 | 2 | 5 |
| 6-8 | es | 12 | 1 | 4 | 2 | 5 |
| 9-11 | en | 12 | 1 | 4 | 2 | 5 |
| 9-11 | fr | 12 | 1 | 4 | 2 | 5 |
| 9-11 | es | 12 | 1 | 4 | 2 | 5 |
| 12-15 | en | 12 | 1 | 4 | 2 | 5 |
| 12-15 | fr | 12 | 1 | 4 | 2 | 5 |
| 12-15 | es | 12 | 1 | 4 | 2 | 5 |
| unknown | en | 12 | 1 | 4 | 2 | 5 |
| unknown | fr | 12 | 1 | 4 | 2 | 5 |
| unknown | es | 12 | 1 | 4 | 2 | 5 |
| Total | all | 144 | 12 | 48 | 24 | 60 |

These are predeclared counts, not human judgments. The executable report records
planned/executed/passed/failed/missing per slice, actual action counts, counts for
each scenario, individual invariants, and fixed stage-call counts. Passing requires
exact actions and stage order, preserved trusted profile and input/candidate
routing, expected locale/category response IDs, candidate suppression, matching
render/speech spies, recorded unavailability, and final revocation. These are
engineering invariants; no semantic thresholds, confidence intervals, or reviewer
judgments are claimed for scripted labels.

## Utility contract and content handling

`evaluation/scope-matrix.mjs` exports `createScopeMatrix(config?)`,
`validateScopeMatrix(cases, config?)`, and `evaluateScopeMatrix({cases, config}?)`,
plus frozen scope constants. Config is exactly `{version:'1',mode:'mock-offline',
ageBands:['6-8','9-11','12-15','unknown'],locales:['en','fr','es'],
stages:['input','output']}`. Scope arrays may be reordered but must be complete
and unique. Each case is exactly `{ageBand,locale,scenario}`. Missing, duplicate,
extra, unsupported, text-bearing, or relabeled cases are rejected before execution.
There is no subset mode or adapter/callback injection. Evaluation validates the
supplied complete matrix then executes a canonical snapshot in fixed order.

Both local and remote assessment adapters are explicit in-memory mocks. They
ignore text meaning and the optional fifth assessment context argument. The
generator is also a mock. No production local classifier, model provider, network
adapter, or deployment catalog is exercised. Synthetic text exists only inside
the run; returned observations use an explicit metadata allowlist. Neither raw
input, candidate, approved/static delivery text, nor adapter errors appear in the
JSON report. Callbacks cannot add content to the report.

## Generation policy change and remaining evidence

The unreviewed generation policy now directs the generator to use trusted
`profile.ageBand`: concrete simple language for 6-8, basic explanations for 9-11,
age-appropriate child-safe explanations for 12-15, and restrictive 6-8 treatment
for unknown, absent, or unsupported age. User text cannot override trusted age.
The gateway still rejects unsupported trusted profiles; the prompt fallback is
defense in depth, not permission to accept invalid gateway configuration.

This harness checks profile propagation to mocks and checks the policy text in a
regression test. It does not execute that prompt in a model or establish that a
model follows the age rules. Locale labels establish routing, not EN/FR/ES
comprehension or response quality. The English mock static placeholder is neither
reviewed nor suitable evidence of child-facing support delivery.

The historical six-case pipeline and its result files remain unchanged; the new
matrix does not retroactively expand their age scope. A separately authorized,
fresh evaluation still needs reviewed age/language thresholds, semantic and
benign-neighbor material, realistic context, independently judged delivered
outputs, actual UI/TTS verification, provider eligibility/retention verification,
and honest service-failure/uncertainty reporting. Shared-model calls alone do not
establish independence. This change supplies none of those approvals or evidence.
