# SamSquare Child AI Safety

**Status: research prototype, not production-ready.** This is a runtime orchestration contract, not a trained model, classifier, certification, or claim that any application has adopted it. No npm package has been published.

The aim is to make child-specific policy behavior testable and auditable. Start with text, explicit permissions, local privacy checks, buffered output, fail-closed handling, and reproducible evaluations. No provider credentials, network implementation, child data, persistence, telemetry, public playground, or live Koda integration is included.

## What works now

- A small TypeScript gateway with mandatory authorization/assessment stages and bundled runtime JSON Schema validation.
- Strict assessment validation and bounded text; malformed/unknown results do not allow delivery.
- Reauthorization before remote boundaries and before returning approved output.
- Per-stage and overall deadlines, cancellation, and suppression of rejected/late candidates.
- Explicit detector capability declarations, pinned decision receipts, and a shared in-process admission controller.
- Immutable backend-provided age/locale/task context; no client request configuration.
- Thirty synthetic examples across English/French/Spanish, with **draft expected behavior**.
- Contract tests using fixture-oracle mocks. Application-specific baseline reports are maintained separately and are not included in this repository.
- A Python local evaluation client using the same JSON Schema, plus a bounded synthetic load harness.

**Passing mock tests is not evidence of semantic safety.** Tests show the engine honors decisions supplied by mocks. No real detector is selected, no specialist has reviewed these fixtures, and there is no end-to-end or provider evaluation yet. No real child content should be used for development.

## Run locally

Requires Node.js 22 or later and npm. From this standalone repository:

```sh
npm ci --ignore-scripts
npm test
```

No paid services or API keys are needed for these tests. Generated `dist/` is ignored. The package is marked private to prevent accidental npm publication. Source is licensed under Apache-2.0; see LICENSE. Third-party providers, models, and datasets have their own terms and are not included or relicensed here.

## Integration contract

The backend must resolve a trusted profile, authority, and session, then configure `createGateway` with an explicit detector capability declaration and a shared admission controller. Capability declarations are compatibility checks, **not proof of detector qualification**. The `localAssess` callback must run locally and must not persist content. `assess` must be a qualified detector, never a fixture oracle or default allow function. `generate` must return a complete bounded string, not a stream. The callbacks are trusted code: this library cannot sandbox malicious adapters or prevent their private network side effects.

`responseId` is a reference to an application-owned response catalog, **not a ready-to-display message**. Missing catalog entries must produce a safe static fallback. Templates require safeguarding and native-language review. Results contain no raw blocked candidate or exception details. Applications must not log raw callbacks' inputs, outputs, errors, or detector evidence.

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

## Next milestone

1. Inventory each integrating application's routes and baseline, distinguishing source from deployment.
2. Have child-safeguarding and native-language reviewers approve policy definitions and fixture labels.
3. Select and qualify one real assessment adapter, with documented data handling.
4. Build a separate held-out evaluation set, including benign context, manipulation, and multi-turn scenarios.
5. Integrate one text path in staging while preserving every existing mandatory safeguard.

Do not replace live checks with this scaffold. See `docs/POLICY_DRAFT.md` and `docs/THREAT_MODEL.md`.
