# Engineering status — November 9, 2026

## Implemented foundation

The portable TypeScript core, shared protocol/runtime validators, Python evaluation
client, bounded admission and synthetic load harness are implemented. The second
increment adds a fixed-endpoint HTTPS assessment adapter, bounded EN/FR/ES heuristic
prechecks, authenticated loopback transport, in-flight credential revocation and
composition tests. Tests use synthetic content and no paid inference.

The next increment adds fixed-cardinality, content-free diagnostic snapshots,
transport cleanup/deadline/startup-shutdown hardening, and Python action-confusion
reports with explicit denominators, locale slices and optional mismatch failure.
Unavailable responses are kept separate from refusals. These changes improve
observability and evaluation plumbing; they do not establish detector efficacy.

The 48-case input/output draft assessment batch and metadata report tools are
implemented. The maintainer authorized billing deferral and completed all 48
calls: all HTTP 200, with 48/48 draft action/category matches. The combined
planning reserve is USD 6.59328 under the existing USD 10 authorization; actual
charges remain unreconciled. No independent safety approval is claimed. See
CLAUDE_BATCH_RESULT.md for denominators and limitations.

The generation-to-delivery foundation now includes an experimental bounded Claude
generator and a receipt-checked plain-text delivery projection. Mock composition
tests cover assessment/generation order, rejected-output suppression and final
authorization denial. The generator produces unapproved candidates only; it is
not a direct renderer or narrator API. No paid generation experiment or Koda
renderer/TTS integration has been performed for this increment.

The explicit six-case live pipeline runner is now prepared and passes offline
tests. It binds both prior live reports and reserves at most 18 further calls;
combined planning reserves total USD 9.03552 under the original USD 10 cap.
It records only metadata and tests synthetic consent with render/speech spies.
The first live execution completed six cases with 13 HTTP-200 calls and six draft
action matches. Final simulated consent denial was exercised; no live output
refusal or actual Koda renderer/TTS integration was observed. See
LIVE_PIPELINE_RESULT.md for the evidence and remaining limits.

The release checklist is executable: pending, missing, stale, changed or unbound
evidence blocks release. This verifies record consistency, not the truth of an
approval. No independent review or provider authorization is inferred from tests.

## Remaining engineering and qualification

1. Claude is selected for the first synthetic evaluation, with a USD 10 total cap.
   The experimental Claude Messages adapter and one-shot dry-run/smoke command
   are implemented with a checked model ID and conservative planning allowance.
   The maintainer completed three benign live input checks (EN/FR/ES), all HTTP
   200 with valid assessments. Broader semantic evaluation and actual billing
   reconciliation remain pending. Qualify a real detector and generator with documented child-use eligibility
   and project-specific privacy terms. Implement their actual authenticated wire
   adapters behind the existing interface. A generic HTTPS JSON adapter is not a
   vendor integration. Obtain a cost cap before hosted evaluation runs.
2. Have specialists review the canonical policy and response catalog; have native
   reviewers assess each supported population/language. Define held-out evaluation
   thresholds before measuring. Include over-refusal and multi-turn attacks; the
   current single-string contract does not support conversation safety claims.
3. Build deployment identity, consent coordination, distributed quotas and billing,
   metadata-diagnostics export, operational revocation and recovery. The reference
   service demonstrates boundaries in one process; it is not that infrastructure.
4. Integrate in Koda staging with existing enforcement intact. Verify consent,
   render/TTS/cache/log boundaries, error handling and rollback using disposable
   synthetic accounts. No Koda production traffic has been connected.
5. Qualify real transport/state/inference under sustained load and failure
   injection. Select runtime isolation and scaling from these measurements.
6. Complete independent security review, disclosure-channel ownership and exact
   artifact provenance. Record genuine scoped evidence in the release manifest.

Public SaaS launch, claims of child safety, and replacement of Koda enforcement
remain blocked. Kubernetes, a language rewrite, multi-region active-active, custom
model training and executable customer plugins remain deferred per ADR-001.
The repository is public; Apache-2.0 licensing and public visibility do not imply
launch readiness. This status is an implementation ledger, not a completion certificate.

## November 10 engineering review remediation

The local precheck now recognizes bounded punctuation-separated email patterns
and additional EN/FR/ES home-harm disclosures, with narrow benign-warning and
fictional-alias handling. These are bounded heuristic mitigations, not semantic
coverage or safeguarding approval. Residual misses and over-support are tested
and described in LOCAL_POLICY.md.

Output assessments now receive a fresh immutable original-question context via
the fifth callback argument. Built-in HTTP/Claude adapters validate and transmit
that context; missing output context is unavailable before a network request.
The detector wire proposal is v2 while client request/result protocol remains v1.
No shared history or multi-turn safety support is introduced.

The explicit deployment delivery projection checks complete enabled-locale
catalog coverage and hash-bound review/evidence records, but cannot authenticate
reviewers or approve message meaning. No independently reviewed catalog is
bundled. Holdout input/output bounds now align with runtime limits and output
assessment cases require the original question. The historical isolated-output
batch cannot be executed against the new contextual adapter without a new corpus
and budget; old results are unchanged historical evidence.

The generation policy now addresses all four trusted age profiles. The new
offline scope matrix exercises 144 scripted control-flow cases across 12
age/language slices, with metadata-only reports. This does not expand the prior
live generation experiment or establish policy compliance in a model. All
independent policy, language, live semantic, provider and deployment gates remain
pending; no email, production configuration or approval was changed.


## November 11 staging and contributor-preview update

The [sanitized Koda staging result](KODA_STAGING_RESULT.md) records a verified
owner-operated request through an earlier vendored gateway revision, including
stage counters, visible response and a single allowance decrement. Separate
workerd rehearsals cover injected input/output outages and late consent
revocation. This is partial integration evidence, not approval of the whole
staging gate or the latest contextual detector contract.

`npm run preview:check` now consolidates the existing Node tests, adapter
conformance, scope matrix, delivery rehearsal/report and demo into one offline
command used by CI. Python and Promptfoo remain separate CI jobs. Production
readiness records remain unchanged.


## November 11 contextual live-model pilot

The frozen public 144-case contextual Claude pilot completed after one initial
HTTP-401 authentication failure and an explicit credential recovery. All 144
recovery calls returned HTTP 200. Draft action/category agreement was 142/144;
no false allows were observed among 72 draft non-allow cases, and draft support
recall was 12/12. Two English supportive outputs received support routing instead
of allow, reducing English benign completion to 22/24 and missing the fixed 95%
per-locale target. These correlated, author-labeled cases are diagnostic evidence,
not independent safety qualification. See [results](CLAUDE_CONTEXTUAL_PILOT_RESULT.md)
for slices, cost/latency estimates, and limitations. Production records and Koda
configuration remain unchanged.


## November 11 support-routing v2 follow-up

A separate draft policy distinguishes input disclosures from helpful output
candidates, inadequate support, harmful advice, coercion and privacy extraction.
The 108-case EN/FR/ES regression set and its explicit fixture-oracle rehearsal
exercise contextual adapter transport with no credentials or provider calls.
Gateway branch tests preserve input support short-circuiting, non-allow candidate
suppression, static projection and final authorization. Frozen v1 artifacts are
unchanged. No model-quality improvement or production qualification is inferred.
See [support-routing v2](SUPPORT_ROUTING_V2.md).


## November 11 paired support-policy comparison: incomplete

The separately authorized USD 2 comparison froze 72 freshly worded targeted
cases and two known regressions, with both policies assessed on each case and
alternating first-arm order. The run stopped at request 57: HTTP 200 but no
usable assessment accepted by the strict adapter for `v1-cmp-no-help-fr-6-8`.
No automatic retry was made. There are 28 complete fresh pairs, one paired
improvement, zero observed regressions, and 46 incomplete pairs including both
known regressions. Harm/coercion/privacy families were not reached; no broad
safety or efficacy conclusion is supported. The usage-based estimate is about
USD 0.0091, not reconciled billing. See [incomplete results](SUPPORT_POLICY_COMPARISON_RESULT.md).


## November 11 explicit paired continuation

A separately frozen continuation preserved all 28 completed pairs and reran both
arms for the 46 unfinished pairs. It made 92 calls, for 149 combined attempts
under the same additional USD 2 cap (USD 1.573440 conservative reserve). V2 matched
72/72 fresh draft actions/categories and 2/2 known regressions, with no unavailable
outcomes. V1 matched 65/72 fresh cases, with five explicit abstentions and one
allow on an inadequate-support candidate, and 0/2 known regressions. Among usable
pairs there were two fresh-case improvements, two known-case improvements and
no observed regressions. Five pairs remain incomplete under the original scoring
rules, so the combined diagnostic target was not declared met. The usage-based
estimate for both attempts is about USD 0.023626; billing is unreconciled. No
production deployment or approval changed. [Result and limitations](SUPPORT_POLICY_COMPARISON_CONTINUATION_RESULT.md)


## November 11 Koda delivery-boundary source audit

The application source now includes local-consent invalidation for pending AI
and dynamic narration, abort races around header/fetch/body waits, no dynamic
child-text/audio replay cache, and fixed development warning text. Koda's local
application checks passed 158 tests across 17 suites plus web/test/mobile type
checks. These client fixes are not deployed or installed and are not part of
this repository's gateway package. Physical device, live cache/log, remote
revocation and deployed narration acceptance remain pending. [Scoped evidence](KODA_DELIVERY_BOUNDARIES.md)


## November 11 subsequent staging iPhone installation

The owner authorized the updated local staging build. The Release build and
strict signature verification passed; bundle checks confirmed staging and the
new invalidation code. Installation and foreground process launch succeeded on
the paired iPhone 15 Plus. No production backend deployment or App Store
submission occurred. Lock-during-Listen acceptance remains pending; process
launch does not establish UI, profile retention or native race correctness.


## November 11 scoped device narration acceptance

The owner supplied a recording of the updated staging iPhone app receiving an
Ask answer, starting narration and locking Live AI. The narration control returns
to Listen, recorded audio goes silent at the lock transition, and no restart is
observed during the remaining roughly 5.5 seconds. This supports the scoped
local-lock-during-active-speech acceptance check. Delayed-response/approval,
cross-session cache, live telemetry and remote-revocation acceptance remain
pending; no production gate was marked complete. [Evidence limits](KODA_DELIVERY_BOUNDARIES.md)


## November 11 scoped pending-Ask device acceptance

A second owner recording shows Live AI being locked while Ask is still loading.
The app displays its local unlock-required message, withholds a generated answer
and starts no narration during the recorded interval. This supports the scoped
client-side pending-Ask lock check, alongside the prior active-speech check.
Remote processing cancellation and later server allowance accounting are not
established by the recording. Cross-session/live telemetry checks and production
qualification remain separate. [Evidence limits](KODA_DELIVERY_BOUNDARIES.md)
