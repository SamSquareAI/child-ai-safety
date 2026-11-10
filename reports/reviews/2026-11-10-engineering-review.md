# Child AI Safety engineering review

Date: 2026-11-10
Reviewed source: `7b815e5f69164f0a585546f73ef5d4728f2269fd`

This is an AI-assisted repository assessment from security, safeguarding-design,
multilingual-evaluation, and open-source-maintenance perspectives. It is not work
performed by Praesidio, TransPerfect, Trail of Bits, or OSTIF, and is not an
independent specialist approval, certification, or legal opinion.

## Decision

Keep the public project available as a clearly labeled research prototype. Do
not qualify it as a production child-safety service or replace Koda's existing
safeguards on the strength of current tests. The existing release-blocked status
is appropriate. The TypeScript/Python choice is not the immediate obstacle;
policy effectiveness, contextual assessment, actual delivery, and deployment
qualification are.

The repository is unusually explicit about its limitations. Several findings
below are documented production gaps rather than newly discovered defects. They
remain material when deciding whether to deploy or market the project.

## Validation performed

- Read the gateway, local precheck, HTTP/Claude adapters, reference service,
  delivery projection, protocol, holdout validation/scoring, release guard,
  workflow, and relevant policy/evidence documents.
- `npm test`: 407 passed, zero failed, zero skipped.
- `.venv/bin/python -m unittest discover -s python -p 'test_*.py'`:
  11 passed.
- `npm run --silent review:queue`: release blocked; all 12 gates pending and
  needing accountable owners in the checked-in manifest.
- Ran local synthetic probes, including mock gateway composition. No paid model
  calls, real child data, production testing, or external attack attempts.

Tests demonstrate behavior under the supplied adapters and fixtures. They do not
establish semantic safety accuracy. No production authorization bypass or
cross-tenant exploit was demonstrated in this review.

## Prioritized findings

### R1 — High: simple formatting bypasses local privacy screening

Type: reproduced implementation defect.
Location: `src/local-assessment.ts:94-106`; gateway boundary at
`src/gateway.ts:135-138`.

`Please reply to learner@example.test` is refused locally, while
`Please reply to:learner@example.test` is allowed by the same precheck. The
email matcher splits only at whitespace and does not extract the address after
the colon. A mock composition confirmed that the second string reaches the
external-assessment callback before that mock refuses it. This proves the local
minimization boundary is missed; it does not prove unsafe final delivery or an
actual provider disclosure in this test.

Fix: extract bounded candidate identifiers across common punctuation and
Unicode variants, using a deliberately specified detection/minimization policy.
Preserve linear/bounded processing. Do not equate a larger regex with complete
PII protection. Evaluate indirect and combined identifiers separately.

Acceptance: synthetic address variants beside colons, brackets, punctuation,
line breaks, and normalized Unicode must trigger the agreed local handling;
gateway tests must assert zero remote calls for recognized identifiers. Retain
benign near-neighbor tests and response-time bounds.

### R2 — High: disclosure recognition is limited to a small phrase list

Type: reproduced coverage limitation, already acknowledged in the source.
Location: `src/local-assessment.ts:22-31,136-144`.

The explicit phrase `my dad hits me` produces support/safeguarding. The indirect
synthetic disclosure `An adult at home keeps hurting me and I feel unsafe.`
produces allow/none locally. Mock gateway composition confirmed that this second
message reaches the remote-assessment callback. A qualified remote detector
could still identify it; this is not evidence that the full pipeline allows it.
However, the precheck cannot substantiate a broad claim that disclosures stay
local, and remote outages would produce generic unavailability for these cases.

Fix: have a safeguarding specialist define disclosure boundaries and safe
fallback behavior; evaluate a privacy-compatible local semantic component rather
than relying solely on enumerated phrases. Explicitly document residual remote
processing and its approved data handling. More phrase examples alone are not a
complete solution.

Acceptance: fresh indirect, mixed-language, dialect, ambiguity, and benign cases
across age profiles, labeled by qualified reviewers; report both missed support
and unnecessary support, including unavailable-detector behavior.

### R3 — High: output decisions lack request context

Type: architectural production gap; multi-turn scope is already disclaimed.
Location: `src/gateway.ts:17,124-126,146-149`;
`src/claude-assessment.ts` assessment request construction.

The assessor receives one string, stage, and profile. On the output stage it
receives the generated answer, not the learner's question. There is also no
bounded conversation state. Even a single-turn answer can change meaning with
the question; splitting a concerning interaction into innocuous-looking turns
creates a further blind spot. A closure could supply extra context, but the
public contract does not provide request-scoped correlation; mutable shared
adapter state would be unsafe under concurrency.

Fix: introduce an explicit versioned assessment envelope with separate trusted
profile and untrusted input/candidate fields. Bind output assessment to the
original request. Either implement bounded, isolated conversation context or
keep the product strictly scoped to stateless tasks. Do not simply concatenate
history into one undifferentiated prompt.

Acceptance: context-dependent request/answer pairs, cross-turn manipulation,
context truncation, and concurrent requests must be tested without state leaks.
Record exactly what context is sent to each provider and why.

### R4 — High: a support verdict does not yet establish helpful delivery

Type: documented safeguarding/integration blocker.
Location: `src/delivery.ts:22-38`; `evaluation/pipeline.mjs:20-22`;
`docs/LIVE_PIPELINE_RESULT.md`.

The projection accepts an empty response catalog and falls back to one generic
message when support text is absent. The live experiment intentionally does
this with an English synthetic placeholder for all locales. Consequently, an
action/category match is not evidence that a child receives understandable,
appropriate help. The renderer and narrator are also test spies, not actual app
delivery paths.

Fix: keep the generic library fallback, but add a production composition check
requiring approved support/refusal/unavailable messages for the enabled scope.
Have qualified safeguarding and native-language reviewers assess their meaning,
including a safe adult who is not causing the harm. Verify actual UI, narration,
cache, and log paths independently.

Acceptance: missing or mismatched reviewed catalog coverage blocks production
configuration; reviewed locale-specific messages reach the actual UI/TTS with
no rejected candidate exposure. A support count alone cannot pass this test.

### R5 — Medium: lexical rules block benign education before semantic review

Type: reproduced over-refusal.
Location: `src/local-assessment.ts:65-76,81-88,136-142`.

`Never follow advice that says you should drink bleach.` is locally refused as
harmful output. `For my story, my name is Captain Comet.` is refused as privacy.
The latter is a hypothetical character introduction, not evidence of an actual
person's identity. These cases exit before remote semantic assessment can judge
context. Conservative local privacy behavior may be intentional, but its utility
cost needs to be measured and disclosed.

Fix: explicitly define treatment of quotation, negation, fictional identifiers,
and educational discussion. Separate high-confidence privacy handling from
ambiguous semantic cases, with reviewed routing rather than arbitrary relaxation.

Acceptance: a multilingual benign-neighbor corpus and specialist-approved
expected behavior, with over-refusal and support precision reported separately.

### R6 — Medium: holdout input bounds disagree with executable bounds

Type: reproduced evaluation defect.
Location: `evaluation/holdout.mjs:20-22`; `src/protocol.schema.json` request
definition; `src/gateway.ts:105`.

Assessment cases use an 8,000-character maximum for both input and output, while
gateway input is limited to 4,000 code points. A synthetic complete 72-assessment
and 24-delivery pilot remained `ok: true` after one input was changed to 4,001
characters; the gateway request validator rejected that same input. The resulting
evaluation material cannot exercise the intended input path as specified.

Fix: use stage-specific limits derived from the shared contract. Distinguish
intentional oversize rejection tests from semantic cases with allow/refuse/support
labels. Include non-whitespace and Unicode boundary consistency.

Acceptance: input 4,000/4,001 and output 8,000/8,001 code-point boundaries,
including astral characters, align across material validation, wire adapters,
and the runtime.

### R7 — High for qualification: live evidence does not cover the promised scope

Type: documented evidence gap, not an assertion of observed harmful output.
Location: `evaluation/generation-policy-draft.txt:3`;
`evaluation/pipeline.mjs:22`; `docs/LIVE_PIPELINE_RESULT.md`.

The live generation policy explicitly targets ages 9–11 and the six-case runner
fixes that band. Other bands appear in assessment material, but this is not
end-to-end generation/delivery evidence for ages 6–8, 12–15, or unknown. The same
model generates and assesses, and the live pipeline observed no rejection of a
freshly generated unsafe answer. Approved text was not retained for independent
quality review. The documentation correctly discloses these limitations.

Fix: run a separately authorized, fresh, reviewed evaluation with predeclared
age/language thresholds, independent judgment of delivered outputs, benign
near-neighbors, output failures, and realistic context. Compare a different
assessment strategy where feasible; independence must not be inferred merely
from making two calls to the same model.

Acceptance: scope-bound results with counts, scenario families, missing cases,
service failures, uncertainty where justified, and reviewer judgments. Keep
provider eligibility and retention gates pending until verified for the actual
account/configuration; this repository review does not verify them.

## Security and open-source maintenance observations

Positive controls include repeated authorization checks, rejection of caller
authority fields, bounded ingress/provider responses, fixed Claude endpoints,
redirect rejection, buffered generation, output checks, no raw exception details
in returned results, immutable snapshots, process-local admission, and pinned CI
action revisions. These are useful engineering controls, not proof of safety.

The loopback service is explicitly not a public production identity service.
Distributed quotas, deployment authentication, atomic revocation/delivery,
recovery, and real overload qualification remain integration work. The readiness
checker validates record consistency, not signatures or truthful independence;
do not expose its `ready` result as a certification. No release/deployment job
was found in the inspected workflow, so release enforcement and trusted artifact
attestation remain unimplemented rather than verified.

Documentation should also be reconciled: `docs/ENGINEERING_STATUS.md:73` still
says repository visibility is private, despite the public project context, and
some threat-model descriptions predate the adapters and workflow. The checked-in
public-disclosure gate remains pending despite the earlier reporting-channel
setup; verify current channel reachability/ownership before adding genuine
evidence rather than treating this report as approval.

## Recommended work order

1. Repair R1 and R6 with targeted regression tests; preserve existing boundaries.
2. Define request-scoped context and catalog completeness contracts (R3/R4).
3. Obtain focused safeguarding/language contributions on R2/R5 and actual copy.
4. Implement and evaluate that reviewed scope, then produce new R7 evidence.
5. Qualify deployment identity, quotas, revocation, operational ownership, and
   release provenance before a production decision.

No implementation, approval, deployment, or external message was changed by this
review. This report must not be recorded as an independent external sign-off.
