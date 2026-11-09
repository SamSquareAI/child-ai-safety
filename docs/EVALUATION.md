# Local evaluation reports

Run from the repository root using the existing Python environment:

```sh
.venv/bin/python python/evaluate.py --synthetic-demo
.venv/bin/python python/evaluate.py --command /path/to/trusted-local-adapter
.venv/bin/python -m unittest discover -s python -p 'test_evaluate.py'
```

The CLI still reads `fixtures/scenarios.json`. The command receives the existing
JSON request over stdin, plus fixture locale and age-band arguments. If a fixture
has no locale (or a null locale), no locale argument is supplied; the evaluator
does not infer a language. The adapter's behavior in that situation is its own
configuration. The evaluator makes no network calls; adapter commands are trusted
local code and must be chosen accordingly. Use synthetic content only.

`--synthetic-demo` uses an oracle that reads fixture labels. Its scope remains
`SYNTHETIC_ORACLE_CONTRACT_ONLY`, and `evidence_notice` explicitly says it provides
**no safety evidence**. Even a perfect match tests protocol wiring only. A local
adapter comparison is also not safety certification, a population estimate, or
evidence that fixture labels have been independently reviewed. No confidence
intervals or safety claims are produced.

## Counts and denominators

Existing `protocolVersion`, `scope`, `total`, `matches`, and `cases` fields remain.
Each case contains its ID, expected action, actual action (null on failure),
outcome, and locale when present. Raw fixture text and adapter response content
are excluded from the report.

- `total` counts every evaluated fixture, including failures.
- `matches` counts exact action agreement with the fixture label, including an
  expected/actual `unavailable` pair. `mismatches` counts valid actions that differ.
- `valid_responses` counts schema-valid responses from successful adapter exits.
  `invalid_response` and `adapter_error` count cases without a valid action.
  Thus `total = matches + mismatches + invalid_response + adapter_error`.
- `refusal_responses` counts actual `refuse` actions, regardless of expected label.
  This is a protocol action count, not a finding that the refusal is appropriate
  or safe. `support_responses` counts actual `support` actions separately.
- `unavailable` counts only valid actual `unavailable` actions. It is never
  counted as a refusal or support response; execution/protocol failures are also
  kept separate. Neither unavailability nor failures count as successful
  refusals, including when a fixture expected refusal.
- `false_allows` counts actual `allow` when expected is `refuse`, `support`, or
  `unavailable`. Including expected unavailability makes fail-open outcomes
  visible. This describes disagreement with fixture labels, not independently
  established harmful content.

The CLI exits nonzero on execution/protocol failures. To also reject any label
mismatch, pass `--fail-on-mismatch` **before** `--command` (whose remaining
arguments belong to the adapter). This is an exact-action regression check;
passing it does not authorize release or certify a real detector.

`confusion_matrix` has expected-action rows and actual-action columns for all four
protocol actions (`allow`, `refuse`, `support`, `unavailable`), including zero cells.
Additional `invalid_response` and `adapter_error` columns retain failed samples.
Each row sums to its expected-action sample count; the entire matrix sums to
`total`. For example, expected `refuse` / actual `unavailable` is a mismatch in
the `unavailable` column, never a refusal match.

`per_action` reports expected sample count, actual response count, exact matches,
precision (matches / actual count), and recall (matches / expected count) for
each action. Expected counts include failures, so failures reduce recall.
Precision uses only responses that actually returned that action; consult failure
and unavailable counts alongside it.

Every rate is an object containing `numerator`, `denominator`, and `value`:

- `match_rate`: matches / total, including failures in the denominator.
- `false_allow_rate`: false allows / all fixtures expecting a non-allow action,
  including failures and unavailability in the denominator.
- Per-action precision and recall use the denominators described above.

Values are fractions, not percentages. A zero denominator produces JSON `null`,
never zero, NaN, or an implied perfect result. An empty fixture list has zero
counts and null rates. A low false-allow rate can coexist with many failures or
unavailable responses; it must not be interpreted alone as successful handling.

## Locale slices and failures

`by_locale` contains the same counts, matrix, and per-action metrics for each
locale present in the fixtures. `without_locale` reports the remaining cases,
including an empty summary when all cases have locales. Slice totals plus
`without_locale.total` equal the overall total. Rates are computed within each
slice; overall rates use overall counts, not an average of locale rates. These
small fixture slices do not establish language coverage or comparative safety.

Existing failure classification and CLI behavior are preserved: nonzero exits,
oversized responses, and schema-invalid responses are `invalid_response`;
OS errors, timeouts, and JSON decoding errors are `adapter_error`. These labels
are not detailed infrastructure diagnoses. The ten-second adapter timeout and
response byte limit remain unchanged. CLI exit status is 1 if any case has either
failure outcome, otherwise 0; valid mismatches and `unavailable` responses do not
change it. Unknown expected action labels are rejected rather than silently
excluded from reporting.
