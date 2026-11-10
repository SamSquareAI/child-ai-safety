# Protocol v1 draft and runtime boundaries

Status: local prototype contract. No public HTTP endpoint, authenticated SaaS service, real detector, or qualification certificate exists. Breaking changes are expected before a stable release.

The canonical schema is `src/protocol.schema.json` (JSON Schema 2020-12). The TypeScript runtime uses Ajv; the Python client uses jsonschema against the **same file**. No user-provided or remotely resolved schemas are accepted. Validation does not coerce fields or silently drop unknown properties.

## Wire request

```json
{"protocolVersion":"1","input":"Explain a pattern."}
```

Only these two fields are allowed. A request cannot select tenant, parent consent, policy, model, age, or provider endpoints. Those must be resolved by the integrating backend. The request context configured through the library is trusted application code, not independently verified identity. `handle` is a method, not an HTTP service. `decodeRequest` optionally decodes at most 16 KiB of UTF-8 JSON; a real service must also bound ingress before collecting the body.

Text limits are 4,000 Unicode code points for input and 8,000 for generated output. Blank text is rejected. Objects/arrays are not generation output. Internal stage and final result checks are distinct from safe rendering. JSON Schema does not decide whether content is appropriate.

## Trusted configuration

- Authority: server-owned `tenantId` and `applicationId`, with bounded identifier syntax. This release does not authenticate either field; the host must bind them to verified credentials.
- Profile: supported age band, locale, and task. `unknown` is not a guarantee of restrictive behavior; a qualified detector/policy must support that band or construction fails.
- Policy version: bounded string, not a number or an arbitrary object coerced to text.
- Detector: declared identifier, revision, text modality, both input/output stages, and explicit supported ages/locales. Missing coverage fails construction; there is no fallback to a different profile/provider. A capability declaration is not external verification of detector accuracy, retention, or approval.
- Callbacks: authorization, local assessment, external/self-hosted assessment, generation. These are trusted code, not customer-uploaded plugins.
- Admission controller: explicitly shared by gateway instances to bound work per process and per tenant. Applications belonging to the same tenant share that tenant's limit.

Profile/capability data is copied and frozen at construction. The authorization callback must consult current authoritative state at each boundary. An immutable profile snapshot does not solve changing age/consent state or legal verification. The host must invalidate/rebuild stale instances appropriately.

Assessment callbacks additionally receive an immutable fifth argument:
`{version:'1',requestInput:string}`. It binds each input/output decision to the
original question for that specific `run` invocation. The built-in HTTP and Claude
adapters validate and transmit it using detector wire protocol v2; the client
request/result protocol above remains v1. Direct output adapter calls without
context are unavailable. This is single-turn only: history is not accepted from
clients and no conversation state is maintained in shared callbacks.

## Wire results

Every result includes `protocolVersion`, `policyVersion`, `detectorId`, and `detectorRevision`. These are version references, not signed attestations. Only `allow` includes approved text. All other actions include a bounded response reference; no candidate text, detector evidence, error stack, or account identifier is returned.

```json
{
  "protocolVersion":"1",
  "policyVersion":"draft-0",
  "detectorId":"synthetic",
  "detectorRevision":"0",
  "action":"refuse",
  "responseId":"en.refuse.privacy"
}
```

The response catalog remains application-owned and requires safeguarding/native-language review. The action and response-reference prefix must agree. `unavailable` uses category `none`; supported refusals/support references use a non-`none` category. No HTTP status mapping is implemented yet; the future transport must distinguish malformed requests, safe policy decisions, authentication failures, and infrastructure unavailability.

## Deadlines and admission

Defaults: 5-second per-stage maximum, 15-second overall request deadline. Each stage receives only its remaining budget. Caller cancellation propagates through active stages; no generation starts after an expired budget. Mandatory failures suppress candidates. JavaScript deadlines cannot interrupt synchronous CPU loops; process isolation is still needed for untrusted parsing/code.

Admission is immediate and rejects excess work with an unavailable response; there is no unbounded waiting queue. Limits are in-process, not durable quotas, billing reservations, or distributed tenant isolation. Overload/refusal does not leak the input.

An adapter that ignores cancellation retains its permit until its promise settles. This protects the outstanding-work bound but can exhaust availability; a never-settling adapter needs health monitoring and process recovery. Aborting a promise cannot undo a remote side effect. The final authorization check narrows but does not eliminate the revocation/delivery race.

## Evaluation tools

The Python client executes a trusted local adapter command without a shell, supplies locale/age as **local test configuration**, sends only the wire request, and independently validates the returned envelope. It reports IDs/action outcomes and never includes raw fixture text in its report. Local adapter stdout is transiently captured in a temporary file; this developer tool is not suitable for real child content and does not sandbox a malicious command or its descendants. Adapter timeout is ten seconds. A full dataset run is not an end-to-end latency measurement.

`examples/fixture-runner.mjs` requires `--synthetic-oracle`. It intentionally looks up fixture labels and can return input content in output-stage test scenarios. It is deliberately not a detector, policy implementation, or deployable server. Do not reuse it as an adapter for Koda or a customer's app. A 30/30 match only confirms fixture/protocol wiring.

The load script uses fixed synthetic content and mocked allow decisions. Its output distinguishes all-attempt latency from allowed-request latency, reports scheduled-arrival latency and scheduler lag, and labels its scope. It does not test network/authentication latency, actual inference, policy quality, distributed limits, or large-scale safety.
