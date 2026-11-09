# Bounded Claude assessment adapter

`src/claude-assessment.ts` exports `createClaudeAssessmentAdapter`, `ClaudeAssessmentConfig`, and `CLAUDE_ASSESSMENT_OUTPUT_CONTRACT`. The factory returns the same frozen `{ assess, capabilities }` interface as `createHttpAssessmentAdapter`. It reuses that adapter internally, with a private trusted transport translating its validated request into a Messages request. No package-root export is added by this change.

This is an assessment transport, not a generic moderation service or a qualified child-safety detector. Capabilities declare intended coverage; they grant neither permission to transmit data nor evidence of accuracy, suitability, or qualification. The parent gateway retains authorization, admission, policy decisions, and budget enforcement. There is no paid runner or budget manager here.

## Explicit trusted configuration

All eleven fields are required own data properties on a plain object. Unexpected fields, accessors, inherited configuration, and symbols are rejected. Configuration is for the trusted backend, never user request data. Configuration errors have fixed text without credentials or underlying exception messages. The adapter snapshots configuration and freezes copied capabilities.

| Field | Requirement |
| --- | --- |
| `apiKey` | 1–512 printable ASCII characters, excluding whitespace and controls; sent only in `x-api-key` |
| `model` | Explicit operator-selected model ID; 1–128 ASCII letters, digits, dots, underscores, or hyphens, starting with a letter or digit |
| `apiVersion` | Explicit real calendar date in `YYYY-MM-DD` form; sent in `anthropic-version` |
| `capabilities` | Existing protocol-v1 capabilities schema; both stages, declared locales and age bands |
| `systemPolicy` | Reviewed classification policy, at most 32,768 UTF-16 code units, containing the exported output contract verbatim |
| `timeoutMs` | Integer, 1–30,000 milliseconds, covering fetch and provider body reading |
| `maxOutputTokens` | Integer, 1–4,096; sent as `max_tokens` |
| `maxRequestBytes` | Integer, 1–65,536; actual serialized UTF-8 provider body cap, including system policy and JSON escaping |
| `maxResponseBytes` | Integer, 1–16,384; entire provider response envelope cap before parsing |
| `fetch` | Explicit trusted Fetch implementation honoring redirects, cancellation, and credential settings |

There is no model, API version, transport, policy, or credential default. Model syntax and API-version date validation do not establish provider availability, support, or alias stability. The operator must select and verify a concrete model ID and API version; the adapter does not resolve aliases or assert that a supplied identifier is immutable. The adapter never reads `.env`, environment variables, secret files, or SDK configuration. It makes no calls at construction.

The only destination is `https://api.anthropic.com/v1/messages`. No endpoint or custom-header option exists. Requests use POST, JSON content and accept headers, `redirect: "error"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, and `cache: "no-store"`. Supply a workspace-scoped key when required by the chosen API version/account; there is no workspace-header override.

## Policy and payload contract

The caller must include `CLAUDE_ASSESSMENT_OUTPUT_CONTRACT` verbatim in `systemPolicy`, alongside its own reviewed substantive classification rules. The constant demands exactly one JSON object containing only `verdict` and `category`, without Markdown or explanation. It specifies the existing combinations: `allow`/`unavailable` require `none`; `refuse`/`support` require `privacy`, `harm`, `safeguarding`, or `relational`. Including the constant is a syntactic guard, not verification that the rest of a policy is coherent or effective. No policy is silently supplied, appended, or inferred.

For example, trusted backend integration can construct the policy as:

```ts
const systemPolicy = `${reviewedClassificationRules}\n${CLAUDE_ASSESSMENT_OUTPUT_CONTRACT}`;
const adapter = createClaudeAssessmentAdapter({
  apiKey: explicitlySuppliedKey,
  model: operatorSelectedModelId,
  apiVersion: operatorSelectedApiVersion,
  capabilities: reviewedDeclaredCapabilities,
  systemPolicy,
  timeoutMs: 10_000,
  maxOutputTokens: 256,
  maxRequestBytes: 65_536,
  maxResponseBytes: 16_384,
  fetch: trustedFetch,
});
// Pass adapter.assess and adapter.capabilities to the existing parent integration.
```

The policy is the top-level `system` string, unchanged. Exactly one user message contains a JSON string with `profile`, `stage`, and `text`. They are data, separate from the system policy. This separation does not prove resistance to prompt injection. Input/output limits remain 4,000/8,000 Unicode code points, with schema-validated profiles and declared coverage enforced before transport.

The request explicitly sets `stream: false` and `thinking: { type: "disabled" }`. It supplies no tools, images, history, prompt caching, reasoning budget, or retry configuration. If the selected model/API version does not support this request shape, the assessment becomes unavailable. Each assessment makes at most one provider request. The request limit also applies to the internal generic request; both bounds must fit.

## Response and cancellation behavior

The response `model` must exactly match the configured model ID. Select an exact
available ID; alias-to-snapshot substitution fails closed and requires explicit
configuration review. Declare a detector revision that binds the chosen model,
classification policy and adapter version; a declared revision is not an attestation.

Only HTTP 200 JSON, without a redirect or unexpected response URL, is accepted. Error bodies are canceled without being read. `Content-Length`, when present, must be decimal, within the configured bound, and match actual bytes. The body reader copies chunks into a fixed-size buffer and rejects overflow before retaining an oversized chunk. It does not use provider `json()`, `text()`, or `arrayBuffer()` helpers. Invalid UTF-8, a BOM, malformed JSON, and empty/missing bodies fail closed.

The parsed envelope must have `type: "message"`, `role: "assistant"`, `stop_reason: "end_turn"`, and exactly one text block. Tool, thinking, refusal, multi-block, truncated, and other stop variants are rejected. Non-null `stop_details` or `stop_sequence`, top-level error/refusal fields, unexpected text-block fields, and nonempty citations are rejected conservatively. Optional null stop details and empty citations are accepted; ordinary envelope metadata such as usage is ignored, never returned. The text itself must parse directly as JSON and pass the existing `validAssessment` validator without stripping extra keys or coercing values. The generic adapter validates the extracted assessment again and returns only frozen verdict/category fields.

Every runtime failure yields exactly `{ verdict: "unavailable", category: "none" }`. No provider body, exception text, reasoning, diagnostic, or credential is incorporated into results or logged by this adapter. Caller abort and the outer deadline abort the transport and cancel pending body reads. Late responses from an uncooperative fetch are canceled; an uncooperative transport cannot be forced to undo external work already started. Cancellation and cleanup do not await remote cleanup promises.

## Validation status and references

No live provider validation has been performed. No real key or model was configured, no live calls were made, and the approved $10 ceiling was not exercised. Tests exclusively inject mock fetch implementations and a synthetic credential. They cover authentication and request shape, configuration and byte bounds, capability/input validation, all assessment combinations, provider response variants, errors, cancellation, timeout, late responses, and concurrency. Tests import the built module using the repository's existing convention; normal validation is `npm run build` followed by `node --test tests/claude-assessment.test.mjs`. During this scoped implementation, TypeScript was checked with `--noEmit` and tests used an in-memory source resolver to avoid generated-file edits.

Protocol implementation was checked against the official [Messages API](https://platform.claude.com/docs/en/api/messages/create), [API versioning](https://platform.claude.com/docs/en/api/versioning), and [authentication](https://platform.claude.com/docs/en/manage-claude/authentication) documentation. These describe top-level system instructions, Messages content/stop semantics, explicit version headers, and API-key authentication (including `x-api-key`). They do not establish classification quality or live compatibility for an operator-selected model/version.
