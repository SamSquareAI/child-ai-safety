# SamSquare Child AI Safety

**Status: research prototype, not production-ready.** This is a runtime orchestration contract, not a trained model, classifier, certification, or a guarantee of application safety. No npm package has been published.

The [developer preview](docs/DEVELOPER_PREVIEW.md) is open for contributions.
Run the synthetic demo locally to see how the gateway handles approved answers,
refusals, support responses, and detector outages.

```sh
npm ci --ignore-scripts
npm run --silent demo
```

The aim is to make child-specific policy behavior testable and auditable. Start with text, explicit permissions, local privacy checks, buffered output, fail-closed handling, and reproducible evaluations. Experimental bounded network adapters and a loopback reference service are included. No provider credentials, real child data, public playground, or deployable Koda integration is bundled. A [maintainer-observed Koda staging result](docs/KODA_STAGING_RESULT.md) documents one application integration using an earlier vendored revision.

## What works now

- A small TypeScript gateway with mandatory authorization/assessment stages and bundled runtime JSON Schema validation.
- Strict assessment validation and bounded text; malformed/unknown results do not allow delivery.
- Reauthorization before remote boundaries and before returning approved output.
- Request-scoped output assessment bound to the original learner question; no shared conversation buffer.
- Per-stage and overall deadlines, cancellation, and suppression of rejected/late candidates.
- Explicit detector capability declarations, pinned decision receipts, and a shared in-process admission controller.
- Immutable backend-provided age/locale/task context; no client request configuration.
- Synthetic examples across English, French, and Spanish, with **draft expected behavior**.
- Contract tests using fixture-oracle mocks. Application-specific baseline reports are maintained separately and are not included in this repository.
- A Python local evaluation client using the same JSON Schema, plus a bounded synthetic load harness.

Mock tests check that the engine honors the decisions supplied by its adapters. The live synthetic assessment and generation experiments below used draft labels that still need independent review. Use synthetic content for development.

## Run locally

The repository includes an [HTTPS detector adapter](docs/DETECTOR_ADAPTER.md),
an incomplete [local precheck](docs/LOCAL_POLICY.md), an authenticated
[loopback reference service](docs/REFERENCE_SERVICE.md), and an evidence-bound
[release readiness guard](docs/RELEASE_CHECKLIST.md). These are research components;
no qualified model or production approval is bundled. The integrated test exercises
the real gateway and HTTP service with a mock remote detector and synthetic data.

`npm run release:check` deliberately exits nonzero while the checked-in gates are
pending. Do not remove those gates to obtain a successful release check.

Prepare the [unreviewed response catalog](docs/RESPONSE_CATALOG_REVIEW.md) with
`npm run catalog:review`; all 27 EN/FR/ES draft messages still need safeguarding
and native-language review. This creates a review packet, never approvals.
Use the separate [frozen threshold checks](docs/THRESHOLD_CHECKS.md) to distinguish
complete observations from acceptable outcomes; critical failures cannot be
hidden by an aggregate pass rate. Neither command grants release authorization.

An [offline age/language matrix](docs/SCOPE_MATRIX.md) checks 144 scripted boundary
cases across all four age profiles and EN/FR/ES using mocks. Run
`node evaluation/scope-matrix.mjs` after building. It reports control-flow coverage,
not semantic accuracy, and makes no provider calls.

Trusted operators can inspect content-free [diagnostic snapshots](docs/DIAGNOSTICS.md).
The Python evaluator reports [action confusion and locale slices](docs/EVALUATION.md),
including failures and unavailability rather than counting them as refusals.

The experimental [Claude adapter](docs/CLAUDE_ADAPTER.md) has mock tests and a
[three-request live connection check](docs/CLAUDE_SMOKE_RESULT.md).
Its [first-run plan](docs/CLAUDE_EVALUATION_PLAN.md) documents the authorized budget
and provider prerequisites. `node scripts/claude-smoke.mjs` prints a dry-run plan;
it makes no API calls. Live execution requires explicit local credentials and
`--execute`, and remains separate from all automated tests.

The next [48-case draft batch](docs/CLAUDE_BATCH.md) covers input and output
assessment. Its default is also dry-run; paid execution waits for billing data
covering the first smoke run and shares the same USD 10 authorization.

The maintainer completed that batch using the authorized billing deferral:
[48/48 draft action/category matches](docs/CLAUDE_BATCH_RESULT.md), with no
unavailable responses. This is a small unreviewed synthetic baseline, not a safety
certification or held-out benchmark.

An experimental [plain-text delivery projection](docs/DELIVERY.md) separates
approved text from static refusal and support messages. The application catalog
requires independent safeguarding and language review. Mock pipeline tests
compose Claude assessment and generation wire adapters with authorization and
input/output checks; they do not establish live generation safety or Koda parity.

The [six-case live pipeline experiment](docs/LIVE_PIPELINE.md) is prepared with
an 18-call maximum and combined planning reserves below the existing USD 10 cap.
It defaults to dry-run. The [first live run](docs/LIVE_PIPELINE_RESULT.md)
completed six cases using 13 provider calls; all matched draft actions, including
simulated final consent denial. Rendering/narration remained test spies.

Requires Node.js 22 or later and npm. From this standalone repository:

```sh
npm ci --ignore-scripts
npm run preview:check
```

No paid services or API keys are needed for these tests. Generated `dist/` is ignored. The package is marked private to prevent accidental npm publication. Source is licensed under Apache-2.0. See the [contributor guide](CONTRIBUTING.md) and [license](LICENSE). Third-party providers, models, and datasets have their own terms.

## Integration contract

The backend must resolve a trusted profile, authority, and session, then configure `createGateway` with an explicit detector capability declaration and a shared admission controller. Capability declarations are compatibility checks, **not proof of detector qualification**. The `localAssess` callback must run locally and must not persist content. `assess` must be a qualified detector, never a fixture oracle or default allow function. `generate` must return a complete bounded string, not a stream. The callbacks are trusted code: this library cannot sandbox malicious adapters or prevent their private network side effects.

`responseId` is a reference to an application-owned response catalog, **not a ready-to-display message**. Missing catalog entries must produce a safe static fallback. Templates require safeguarding and native-language review. Results contain no raw blocked candidate or exception details. Applications must not log raw callbacks' inputs, outputs, errors, or detector evidence.

Use `createDeploymentDeliveryProjection` to check complete enabled-locale catalog
coverage and exact catalog/evidence/review bindings before deployment composition.
The older `createDeliveryProjection` (also named `createResearchDeliveryProjection`)
permits incomplete research catalogs. Neither API verifies reviewer truth or
qualifies messages; no externally approved catalog is included.

The fifth assessment callback argument is immutable single-turn context
`{version:'1',requestInput}`. Built-in detector transports send contextual wire
protocol v2; direct output assessment without the original question fails closed.
The gateway client protocol remains v1. History is not accepted; multi-turn safety
remains outside this implementation. Historical isolated-output experiments are
not contextual qualification evidence and their old batch runner cannot be
executed until a new corpus and budget are prepared.

Age `unknown` is passed explicitly: its restrictive policy must be supplied by the qualified assessment adapter. A band of `12-15` is not a legal under-13 determination. The engine does not verify parental identity or authority, bind a family to a credential, enforce quotas, guarantee atomic revocation/delivery, or validate rendered HTML/game data. These remain integration responsibilities. Final delivery authorization narrows a race; a real endpoint needs appropriate in-flight access coordination.

The default overall deadline is 15 seconds and the default per-stage deadline is 5 seconds. Adapters must bound transport bytes before parsing/allocating, honor cancellation, enforce cost budgets, and use server-fixed destinations. Input length checks cannot undo allocations already made by a caller. Abort cannot stop work in an adapter that ignores it; admission capacity stays occupied until its work settles. An indefinitely stuck adapter requires process recovery. No retries, arbitrary tools, network URL inputs, or streaming are provided. In-process limits are not distributed quotas or authenticated tenant isolation.

## Protocol and development tools

See [protocol v1 draft](docs/PROTOCOL.md) and [qualification notes](docs/QUALIFICATION.md). `handle` accepts only `{ "protocolVersion": "1", "input": "..." }`; authority and profile stay backend-owned. The bundled JSON Schema is the wire contract, not a deployed HTTP API. The service still has no real detector, HTTP authentication layer, distributed quotas, or production integration.

```sh
npm run load:synthetic -- --rate 100 --seconds 2
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
.venv/bin/python -m unittest discover -s python -p 'test_*.py'
.venv/bin/python python/evaluate.py --synthetic-demo
```

`npm run eval:synthetic` uses `python3` from your PATH; activate `.venv` first. The synthetic oracle intentionally reads fixture labels: it tests protocol plumbing and is not a classifier. The load harness runs in-process and does not measure HTTP, authentication, inference, or product capacity.

A new [144-case contextual Claude pilot](docs/CLAUDE_CONTEXTUAL_PILOT.md) freezes
public EN/FR/ES inputs and draft expectations before live execution. Its default
is dry-run; CI does not use provider credentials. The [completed live run](docs/CLAUDE_CONTEXTUAL_PILOT_RESULT.md) matched 142/144 draft actions, with two extra support interventions on benign English outputs. English benign completion missed the frozen target.

An [offline support-routing v2 follow-up](docs/SUPPORT_ROUTING_V2.md) adds an
explicit stage distinction and 108 new synthetic regression cases. Its targeted real-model comparison is reported separately below; these
regression tests alone do not measure policy efficacy.

A [paired policy comparison](docs/SUPPORT_POLICY_COMPARISON.md) separately freezes
72 fresh draft cases and two known regressions for both policies. Its default is
dry-run. The [first paired run](docs/SUPPORT_POLICY_COMPARISON_RESULT.md) stopped
after 57 requests. An explicitly frozen [continuation](docs/SUPPORT_POLICY_COMPARISON_CONTINUATION_RESULT.md)
completed the remaining schedule: v2 matched all 72 fresh draft cases and both
known regressions; v1 had five unavailable outcomes, so the combined diagnostic
completeness target remains unmet. This is targeted author-label evidence,
not an independent efficacy benchmark or production qualification.

## Next milestone

One owner-operated Koda staging request has now been verified, including a
content-free stage receipt and one allowance decrement. This is partial
application evidence; the full staging qualification remains open.
[Evidence and limits](docs/KODA_STAGING_RESULT.md)

1. Inventory each integrating application's routes and baseline, distinguishing source from deployment.
2. Have child-safeguarding and native-language reviewers approve policy definitions and fixture labels.
3. Select and qualify one real assessment adapter, with documented data handling.
4. Commission a separate held-out evaluation set using the [review and evaluation protocol](docs/HOLDOUT_PROTOCOL.md).
5. Complete staging narration/cache isolation, live fault and rollback evidence while preserving existing enforcement.

Do not replace live checks with this scaffold. See `docs/POLICY_DRAFT.md` and `docs/THREAT_MODEL.md`.
