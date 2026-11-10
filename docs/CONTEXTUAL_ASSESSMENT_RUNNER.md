# Contextual assessment runner

`evaluation/contextual-assessment-runner.mjs` exports
`runContextualAssessment(cases, { assess, save, signal, maxCalls, timeoutMs })`.
It is an offline/injected execution utility for preparing fresh assessment
observations. There is no executable CLI, provider construction, credential
lookup, network transport, automatic retry, resume, or paid-run authorization.
The existing paid runner is unchanged.

**Release remains blocked; human qualification is explicitly pending.** Mock
results provide engineering checks, not independent assessment evidence. No paid
run is authorized by this utility or its tests. The caller is responsible for
ensuring injected functions stay within separately authorized execution scope.

## Accepted inputs and execution

Pass a nonempty array of at most 2,000 unique assessment-track cases. Each case
must satisfy the exact exported `validInput` schema from `evaluation/holdout.mjs`.
Delivery cases, labels, expectations, reviewer records, extra fields, duplicate
IDs, accessors, non-data objects and missing output context are rejected.
Input text and output `requestInput` allow at most 4,000 Unicode code points;
output candidate text allows at most 8,000. Snapshot storage is bounded before
schema validation. The runner copies all cases and captures options before its
first await. Caller mutations and concurrent runs cannot change that snapshot.
The abort signal intentionally remains live.

`maxCalls` is mandatory and must be an integer from 1 through 2,000. If the corpus
exceeds the budget, execution rejects before persistence or assessment: it never
runs a budget-limited subset. Every valid case consumes at most one call.
`timeoutMs` is also mandatory: an integer from 1 through 30,000, applied to each
assessment call. `signal` must be an explicit `AbortSignal`; `assess` and `save`
are mandatory functions. All calls execute sequentially.

The assessor receives the existing five-argument `Assess` interface:

```js
assess(text, stage, { ageBand, locale, task }, signal, {
  version: '1',
  requestInput: stage === 'input' ? text : caseInput.requestInput,
});
```

The signal passed to `assess` comes from a fresh per-call `AbortController`
linked to the caller's signal. The profile and context are immutable, fresh per
call. The runner accepts only
an exact protocol assessment decision (`verdict`, `category`); it copies those
two validated enum values into evidence. It never retains provider envelopes,
raw candidates, raw requests or exception strings in reports/checkpoints.
Case identifiers are retained as required by the scorer; choose non-sensitive
identifiers. The caller still supplies raw case content to the injected assessor.

## Persistence and cancellation

`save(report)` must durably persist the supplied immutable content-free report
before resolving. The runner awaits a checkpoint before **each** call, then
awaits another checkpoint after **each** result. The first checkpoint lists all
cases as skipped. The pre-call checkpoint shows the number of calls already
started; the call count increments only after that checkpoint succeeds. This is
an execution fence, not an exactly-once or crash-resume protocol.

A failed checkpoint rejects with the fixed error `checkpoint-failed`, with no
raw error or cause attached, and prevents every subsequent assessment call.
This includes failure before the first call (zero calls), after any result, and
before a later call. A post-call persistence failure may leave a completed call
whose result was not durably saved; the utility must not be used as permission
to retry it automatically. Persistence is caller-owned; untrusted or indefinitely
hanging persistence cannot be made durable by this runner.

Aborting before execution persists a cancelled report without assessment calls.
Aborting during a call marks that attempted case as failure, leaves subsequent
cases skipped, persists cancellation, and stops. It races the assessment against
the abort signal, consumes late results/rejections, and does not allow late work
to update evidence. The injected assessor must cooperate with the signal to
stop its underlying work. Cancellation cannot undo an already started call or
an external side effect. Use the supplied controller for explicit cancellation.

Each call races its `timeoutMs` timer even if the assessor ignores abort. A
timeout aborts the per-call signal, records a failure with the fixed reason
`assessment-timeout`, persists it, and prevents subsequent calls without retry.
Timers and caller abort listeners are cleaned up when each call finishes.
Late results and rejections cannot change frozen reports or trigger checkpoints.
Timeout and cancellation are **not proof that an external provider stopped**.
As with any in-process JavaScript timer, this cannot interrupt synchronously
blocked JavaScript; injected assessors must yield to the event loop. The call
timeout does not bound the caller's persistence implementation.

Thrown assessments, malformed decisions and `unavailable` decisions stop the
run immediately without retries. An unavailable decision remains an observed
protocol decision so the scorer can count unavailability; the run status is
`unavailable`. Cancellation and failure leave all unattempted cases skipped.
An observation already checkpointed before cancellation remains observed.

## Reports and scorer integration

Reports contain `version`, `corpusSha256`, `maxCalls`, `timeoutMs`, `calls`, `status`, `reason`,
`release: 'blocked'`, `humanQualification: 'pending'`, and `observations`.
Run statuses are `running` (checkpoints), `completed`, `cancelled`, `failure`,
and `unavailable`. Reasons are fixed strings. Validation rejects with fixed
`invalid-options`, `invalid-cases`, or `call-budget-exceeded` errors. No original
validation exception is attached.

Each observation has the scorer-compatible form:

```json
{"id":"case-id","turns":[{"turn":1,"status":"observed","decision":{"verdict":"allow","category":"none"}}]}
```

Failed or unattempted cases instead have only `turn` and `status: 'failure'` or
`'skipped'`. Supply the **`report.observations` array**, not the report envelope,
as the observations JSON input to `holdout:score`. Reviewer expectations must
remain in the separately controlled review key and are never accepted here.
No reviewer record, delivery judgment, review approval or fabricated expected
answer is created. `completed` means the bounded execution completed, not that
its decisions passed scoring or qualification.

`corpusSha256` uses shared `corpusDigest` from `evaluation/corpus-digest.mjs` on
the validated snapshot. It matches `corpusDigest(originalInput)`: object key
order is canonicalized and array order is preserved. Changes to case order,
request context, or any other case field change the binding. This aligns with
the threshold CLI corpus binding. The digest does not authenticate provenance,
bind the implementation/model/source, prove label blindness of an injected
assessor, or establish independence. Exact model/revision, source/prompt,
configuration, evidence provenance, reviewer independence, and human
qualification remain the qualification owner's responsibility.

## Offline test

```sh
node --test tests/contextual-assessment-runner.test.mjs
```

Tests use only mocks and in-memory checkpoints, with no actual API calls.
They exercise context binding, strict label rejection and Unicode bounds,
zero-call budget preflight, persistence fences, snapshot and concurrent
isolation, shared digest compatibility, sanitized decision/error metadata,
fail-closed stopping, bounded per-call timeouts, timer/listener cleanup, and
explicit cancellation including late rejection.
Parent integration owns package exports and scripts; none are introduced here.
