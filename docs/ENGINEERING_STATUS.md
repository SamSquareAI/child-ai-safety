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

The release checklist is executable: pending, missing, stale, changed or unbound
evidence blocks release. This verifies record consistency, not the truth of an
approval. No independent review or provider authorization is inferred from tests.

## Remaining engineering and qualification

1. Claude is selected for the first synthetic evaluation, with a USD 10 total cap.
   The experimental Claude Messages adapter and one-shot dry-run/smoke command
   are implemented with a checked model ID and conservative planning allowance.
   Credential transfer, live validation and actual billing reconciliation remain
   pending. Qualify a real detector and generator with documented child-use eligibility
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
Repository visibility remains private; Apache-2.0 licensing does not imply launch
readiness. This status is an implementation ledger, not a completion certificate.
