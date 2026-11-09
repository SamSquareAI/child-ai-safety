# First live draft-case batch — November 9, 2026

The maintainer executed the bounded runner locally. Report completion:
`2026-11-09T08:51:40.847Z` (2:51 AM America/Chicago).

All 48 provider calls returned HTTP 200 and schema-valid assessments. Recomputing
the summary from the saved observations matches the recorded report exactly.
The fixture digest matches the current draft corpus. No additional calls were
made while verifying this result.

| Draft expected action | Observed allow | Observed refuse | Observed support |
| --- | ---: | ---: | ---: |
| Allow | 21 | 0 | 0 |
| Refuse | 0 | 21 | 0 |
| Support | 0 | 0 | 6 |

Action and category agreement: 48/48. False allows relative to draft labels:
0/27 expected-nonallow cases. Over-refusals: 0/21 expected-allow cases. Missed
support: 0/6 expected-support cases. There were no missing, unavailable or failed
observations. Each locale has 16/16 exact matches; each age-band slice has 12/12;
input and authored-output slices each have 24/24. Slices overlap and are not
independent experiments or a full cross-product of ages, locales and categories.

## Reproducibility metadata

- Model: `claude-haiku-5-5`; API version: `2026-10-21`.
- Source revision: `15e8b720e9eca52da4f1a37cc14e91f2a649f1f2`.
- Fixture SHA-256: `4f94581aca04a40659f758c0ae7f4b2a86dfa313860cc2d1f08232642c46f4f2`.
- Policy SHA-256: `5c39326bcee38096943e05c97dbf0a1fd98702d70eeb631db036d95608242e1c`.
- Private report SHA-256: `27d6a4f59e3dac6e25851e2b90d8c9f0af828dc91d25247fadf59a28269ce37c`.

Original evidence remains in ignored `reports/private/claude-batch.json`. No key,
raw provider answer or raw error is included in this published summary. Billing
reconciliation was explicitly deferred by the maintainer; the USD 6.59328 combined
planning reserve is not an actual billed amount or provider-enforced limit.

## Interpretation and next gates

This is agreement with 48 **unreviewed synthetic draft labels**, not a 100% safety
score. The developer-authored cases and policy are not an independent held-out
benchmark; translations are correlated, samples small and the attacks limited.
The result does not justify a population-level failure rate or certification.
Output checks classified authored examples; they did not screen freshly generated
model answers. Multi-turn conversation, media, actual child traffic, Koda consent,
rendering, TTS, cache/log leakage and production deployment were not tested here.

Preserve this baseline without tuning its labels to claim improvement. Next
commission independent safeguarding/native-language review and build a separately
held-out set, then test real generation through the complete gateway in staging.
Provider child-use/privacy qualification and all production release gates remain
pending; this result does not approve any of them.
