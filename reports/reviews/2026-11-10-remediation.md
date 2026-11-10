# Engineering remediation of the November 10 review

This records repository changes following the review of
`7b815e5f69164f0a585546f73ef5d4728f2269fd`. The initial findings remain in
`2026-11-10-engineering-review.md` as a historical assessment, not a description
of the patched implementation.

Four engineering agents worked on disjoint files, with parent integration and a
second read-only context/API review. This was AI-assisted engineering, not work
performed or approved by any of the organizations in the unsent outreach drafts.

| Finding | Engineering change | Remaining qualification |
| --- | --- | --- |
| R1: punctuated email | Bounded identifier scanning recognizes punctuation-delimited examples; gateway regressions assert no remote call for recognized data. | Indirect, internationalized and novel identifiers still require privacy evaluation. |
| R2: indirect disclosure | Additional narrow EN/FR/ES home-harm patterns, age/locale coverage and zero-remote-call regression checks. | A phrase list is not semantic disclosure recognition; specialist-reviewed recall, ambiguity and over-support remain open. |
| R3: missing request context | Fresh frozen original-question envelope supplied to both stages and sent by the built-in HTTP/Claude adapters. Output checks without context fail closed. Concurrent requests are isolated. | Single-turn only; no conversation-history support or multi-turn safety claim. Custom detectors must actually use the context. |
| R4: missing support catalog | New explicit deployment projection rejects incomplete enabled-locale catalogs and inconsistent catalog/evidence/reviewer bindings; research helper remains clearly distinct. | No genuine independent catalog approvals or real UI/TTS qualification are bundled. Metadata cannot prove reviewer truth. |
| R5: benign content blocked | Narrow exact educational-warning and fictional-alias cases can proceed to mandatory semantic checks, with appended-PII/harm counterexamples. | This is not general negation, fiction, or quotation understanding. Broader over-refusal evaluation and language review remain open. |
| R6: holdout bounds | Input 4,000/output 8,000 code-point limits match runtime; whitespace is rejected; output cases require the original question. | Human labels, fresh holdout independence and execution remain separate requirements. |
| R7: limited age/live evidence | Draft generation policy addresses all four age profiles. Offline matrix checks 144 boundary cases across 12 age/language slices. | No new live-model or independently judged efficacy evidence; earlier six-case live scope is unchanged. |

## Compatibility and evidence handling

- Gateway client request/result protocol remains v1. Contextual detector wire
  protocol is now v2; existing detector servers must be updated before use.
- Four-argument input adapter calls remain supported. Output calls require
  `{version:'1',requestInput}` in the fifth argument. Both runtime and TypeScript
  regression checks cover this distinction.
- Historical fixed-output batch fixtures lack original questions. The paid runner
  now reports them unready and rejects execution before spending on a partial
  run. Historical reports were not rewritten. A new contextual corpus and budget
  are required for another paid run.
- The matrix uses explicit mocks and static experiment messages. It reports
  `semanticStatus: 'not-evaluated'` and zero live provider calls.
- The checked-in readiness manifest remains unchanged: all 12 gates pending.
  No independent approvals, provider permissions, production integration, or
  deployment readiness have been inferred from tests.

## Reproduction

Final local validation: **496 Node tests passed**, **11 Python tests passed**,
and **144/144 offline matrix cases passed** across 12 slices. The release checker
still reported `releaseblocked` with all 12 gates pending. `git diff --check`
passed. No live provider calls were used for this validation.

```sh
npm test
.venv/bin/python -m unittest discover -s python -p 'test_*.py'
npm run eval:scope
npm run --silent review:queue
git diff --check
```

The readiness command must still exit 1 with `releaseblocked`. Node/Python tests
and the scope matrix require no credentials or paid provider calls. No real child
data or production system was used. The outreach messages remain drafts; no
email was sent or scheduled as part of this remediation.
