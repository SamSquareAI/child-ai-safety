# Bounded HTTP assessment adapter

`src/http-assessment.ts` provides `createHttpAssessmentAdapter`, returning an `assess: Assess` callback and an immutable `capabilities: Capabilities` snapshot. It uses the existing gateway types and `validAssessment`. It does not change the gateway, public index, or canonical client protocol.

This is a **proposed detector adapter protocol**, not an implementation of any vendor API. No vendor compatibility, detector accuracy, child suitability, privacy approval, retention guarantee, or production qualification is claimed. Capability declarations describe configured compatibility only. Tests use synthetic responses and injected fetch implementations; no external calls, credentials, paid APIs, or real child content are needed.

## Trusted configuration

Run `npm run --silent test:adapters` to exercise the HTTP and Claude adapters
with simulated transport. The example checks that the original question
reaches output assessment, unsupported locale and missing context stop before
transport, and malformed results, provider unavailability, and deadlines
return the unavailable decision.

To test a new adapter, import `checkAdapter` from
`examples/adapter-conformance.mjs`. Supply a factory that accepts the injected
`fetch`, deadline, and capability declaration. Supply a request decoder that
projects the wire body to `{ stage, profile, text, context }` and a response
factory that wraps the supplied decision in the adapter's wire format. The
example passes synthetic inputs and expects the factory to honor the injected
transport. These checks establish contract behavior for the supplied adapter.

| Adapter | Destination | Scope | Data handling to verify before deployment |
| --- | --- | --- | --- |
| HTTP | Backend-configured HTTPS endpoint | Text input and output, with explicit locale and age coverage | Operator ownership, retention, access, deletion and transport authentication |
| Claude | Fixed Messages API endpoint with explicit model and API version | Text input and output, with explicit locale and age coverage | Actual provider account and endpoint settings, child-use scope, retention and exceptions |

All configuration comes from trusted backend code. Never populate it from user requests or expose endpoint selection to a caller. Construction validates the configuration at runtime and rejects unknown properties, accessors, inherited configuration, invalid capabilities, invalid bounds, and invalid transport types. Endpoint, bounds, transport, and capability declarations are snapshotted at construction.

```ts
import { createHttpAssessmentAdapter } from "./http-assessment.js";

// Illustrative configuration only. The reserved .invalid host is not a service.
const adapter = createHttpAssessmentAdapter({
  endpoint: "https://detector.invalid/assess",
  capabilities: {
    protocolVersion: "1",
    id: "configured-detector",
    revision: "reviewed-revision",
    modality: "text",
    locales: ["en"],
    ageBands: ["9-11"],
    stages: ["input", "output"],
  },
  timeoutMs: 2000,
  maxRequestBytes: 65536,
  maxResponseBytes: 1024,
});

// In trusted gateway options, use:
// detector: adapter.capabilities,
// assess: adapter.assess,
// Keep the mandatory localAssess callback and existing admission/authorization checks.
```

Import the built module directly (`dist/http-assessment.js`) when working with this repository. No package entry point or package export is added.

Required bounds are integers: `timeoutMs` is 1–30,000, `maxRequestBytes` is 1–65,536, and `maxResponseBytes` is 1–16,384. There are no default bounds. Too-small budgets safely make assessments unavailable. Text is limited to 4,000 Unicode code points at input and 8,000 at output, must be a nonblank string, and must also fit the configured UTF-8 JSON request byte budget. Type and code-unit checks bound work before code-point counting and serialization. The fixed protocol fields/profile bound serialization overhead even when the configured request budget is small. Stage and profile are validated at runtime; undeclared locale/age coverage fails closed without a call or fallback.

The endpoint must be an explicitly configured absolute `https://` URL, at most 2,048 characters. URL credentials (including empty userinfo), fragments, whitespace, and backslashes are rejected. The adapter never derives a URL from text, profile, response fields, or caller data. It has no environment/file-secret discovery or authentication configuration. Deployments requiring authentication need a separately reviewed integration; do not place secrets in URL query strings.

This is a trusted destination restriction, not a DNS/IP egress firewall. Deployment owners must control endpoint selection, DNS, proxies, and allowed network destinations. An injected `fetch` is trusted code and must implement Fetch security settings and cancellation correctly; the default is the runtime's Fetch implementation. An injected implementation can bypass network behavior, so it is not a sandbox boundary.

## Proposed contextual detector wire protocol v2

The adapter POSTs UTF-8 JSON with exactly these fields:

```json
{
  "protocolVersion": "2",
  "text": "Synthetic learning exercise.",
  "stage": "input",
  "profile": { "ageBand": "9-11", "locale": "en", "task": "learning" },
  "context": { "version": "1", "requestInput": "Synthetic learning exercise." }
}
```

`stage` is `input` or `output`. The profile is the backend-resolved existing `Profile`. This request differs from the gateway client request `{protocolVersion,input}`, which remains protocol v1. The detector request has changed incompatibly from the old isolated-text proposal: an integrating detector must accept v2 and assess the candidate together with `context.requestInput`.

The gateway creates a fresh immutable `{version:'1',requestInput}` per request and passes it as the fifth `Assess` argument. The original input is bounded to 4,000 nonblank code points and is separately authorized and locally checked before remote transmission. Context is copied from own data properties, never a mutable adapter-global variable. Direct input assessment may omit context (its text is the original question); direct output assessment without valid context fails closed before network access. Input context must match the assessed input. Exact request byte caps include both text and context.

Tenant identity, authorization, policy receipts, conversational history, and evidence are not sent. This is a strictly single-turn contract. Caller-supplied `history` or context fields in a gateway wire request are rejected. Do not concatenate an unreviewed conversation into this field or claim multi-turn protection. Trusted custom callbacks must consume the context correctly; the gateway cannot prove they use it.

The detector must return HTTP **200** with `Content-Type: application/json` (optionally `charset=utf-8`, including a quoted charset), and a body containing exactly the existing `Assessment`:

```json
{"verdict":"allow","category":"none"}
```

All existing verdict/category rules apply. `allow` and `unavailable` require category `none`; `refuse` and `support` require `privacy`, `harm`, `safeguarding`, or `relational`. No response wrapper, extra keys, type coercion, vendor labels, or evidence is accepted. `validAssessment` performs exact shared-schema validation. Successful results are copied and frozen.

## Bounds and failure behavior

Fetch uses `redirect: "error"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, and `cache: "no-store"`, with only JSON content/accept headers. It rejects redirected responses and a nonempty response URL differing from the configured destination. There are no retries, provider fallback, response/error-body logs, or adapter telemetry. Non-200 bodies are canceled without reading them.

Responses are read as a byte stream into a single buffer no larger than `maxResponseBytes`. Each chunk is checked against the remaining budget **before copying**. The adapter never uses unbounded `response.text()`, `response.json()`, or `response.arrayBuffer()`. Only after the complete bounded body is collected does it decode fatal UTF-8 and parse JSON. Invalid/truncated UTF-8, a BOM, malformed JSON, a missing body, unsupported content type, oversized chunks/total body, stream failures, and invalid assessments fail closed. If present, Content-Length must be decimal, within budget, and match the collected byte length; it never replaces the streaming limit. Encoded/compressed responses whose Content-Length differs from decoded bytes consequently fail closed; configure the detector to return uncompressed JSON.

The deadline covers fetch, response streaming, decoding, and validation. The earlier of caller cancellation and configured timeout aborts the derived transport signal and settles the callback as `{verdict:"unavailable",category:"none"}`. Pre-aborted or invalid caller signals prevent fetch. Cleanup removes the caller listener, clears the timer, aborts the transport, and requests stream cancellation without waiting indefinitely for cleanup. Late responses after cancellation are discarded and their bodies canceled. Errors and rejection reasons are never returned or logged.

The callback deadline is bounded even for a test transport that ignores cancellation. This cannot force a noncooperating transport or remote computation to stop; production transports must honor the signal. Returning an unavailable assessment does not prove outstanding external work stopped. JavaScript timers cannot preempt synchronous work; the byte limits bound adapter decoding/parsing allocations, but the Fetch runtime's own network buffers, headers, decompression, and incoming chunk allocation remain outside this adapter's control. Use deployment egress/admission/resource limits as well.

## Local verification

```sh
npm run build
node --test tests/http-assessment.test.mjs
```

The dedicated tests inject every transport, avoid global fetch replacement, and use disjoint local fixtures. They exercise runtime configuration rejection, capability snapshots, both stages and Unicode limits, exact request/response byte boundaries, shared assessment validation, malformed/status/redirect/stream failures, cancellation, deadlines, cleanup, and independent concurrent calls. They establish adapter plumbing and failure behavior only; they do not qualify a detector or measure real inference performance.
