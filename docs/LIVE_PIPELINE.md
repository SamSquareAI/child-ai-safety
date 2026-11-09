# Live generation pipeline experiment

`node scripts/claude-pipeline.mjs` prints a dry-run plan. `--execute` requires a
local `ANTHROPIC_API_KEY`, a clean committed checkout and the exact verified
private reports for the first 3 and next 48 calls. No credential is read by tests.
There is no automatic execution from imports or CI.

Six synthetic cases exercise three benign learning questions (EN/FR/ES), one
harmful request, one disclosure and one simulated final consent revocation.
Age profile is 9–11 only. These are unreviewed draft cases, not held-out evaluation.
The generator and classifier use the same model; their correlated failures are
not independent safety assurance. Generation policy is a separate draft.

Each permitted interaction has input assessment, generation and output assessment,
with local checks and authorization between boundaries. At most 18 provider calls
are reserved, conservatively accounting for every call at the larger generation
limit of 256 output tokens. The shared USD 10 authorization retains USD 6.59328
of prior planning reserves and adds USD 2.44224, totaling USD 9.03552. These are
planning allowances, not invoices or a provider-enforced spend cap. Billing
reconciliation remains deferred at the maintainer's request. No retries, model
fallback or reservation reset is supported. Pricing expires seven days after
November 9, 2026; a one-shot exclusive file prevents duplicate runs.

The script buffers generated candidates only in process memory. It writes only
case IDs, counts, actions, diagnostic counters and delivery metadata to ignored
`reports/private/claude-pipeline.json`. It does not write or print answer text,
prompts, secrets or raw provider errors. Checkpoints precede the first call and
follow each case. A persistence failure prevents more work; an unexpected
unavailable result stops the batch. Output refusal is possible and must be
reviewed, rather than interpreting any benign input as guaranteed approval.

Render and speech are **in-memory spies**, using the shared delivery projection.
The revocation case denies the fifth authorization check, before final delivery;
the report says whether that boundary was actually reached. If an earlier refusal
prevents reaching it, this is not a completed revocation test. Likewise, input
refusal should prevent generation. The runner exits nonzero for mismatches,
missing cases or an unexercised final-revocation boundary.

This experiment does not install Koda, synthesize real speech, test actual browser
rendering/caches/logs, authenticate a real parent, verify age, or demonstrate
distributed/atomic revocation. Its synthetic authorization always permits work
except the deliberate revocation case. Do not reuse that callback in production.
All independent review, provider privacy/child-use and Koda staging gates remain
pending. A perfect six-case result is not evidence of a population safety rate.
