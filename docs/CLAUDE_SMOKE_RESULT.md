# First live Claude connection check — November 9, 2026

The maintainer executed the one-shot runner locally. The saved private report
records completion at `2026-11-09T08:28:52.426Z` (2:28 AM America/Chicago).

| Item | Observation |
| --- | --- |
| Model | `claude-haiku-5-5` |
| API version | `2026-10-21` |
| Requests | 3; all HTTP 200 |
| Input profile | Learning, ages 9–11 |
| Cases | One benign science question each in English, French and Spanish |
| Assessments | All `allow` / `none` |
| Policy SHA-256 | `5c39326bcee38096943e05c97dbf0a1fd98702d70eeb631db036d95608242e1c` |
| Private report SHA-256 | `9284b4cdbaa08c54fa3481fae1617fd1c1b654034f32b0eac63451ab9dd67b49` |
| Billing reconciliation | Pending; no charge amount verified |

The report's configuration/policy fields match the current runner's dry-run plan.
The report remains in ignored `reports/private/claude-smoke.json`; no credential,
raw input, provider answer or error is published here. The original report was
not rewritten. This local record is not a signed independent attestation and
does not bind an exact source/build revision in its own metadata.

This establishes a narrow live example of authentication, request shape, bounded
response handling and assessment JSON parsing. It does **not** establish harmful
content detection, disclosure handling, resistance to prompt injection, output
screening, multi-turn safety, other age bands, child-use eligibility, retention
configuration or Koda integration. No production readiness gate is approved.

The USD 0.38784 planning reserve is not an actual charge. The Console's evaluation
key row showed no cost amount when inspected after the run; absence of an amount
must not be interpreted as zero cost. Retain the one-shot reservation and reconcile
provider billing before further paid execution. Next evaluate independently
reviewed benign/adversarial input and output cases with fixed thresholds.
