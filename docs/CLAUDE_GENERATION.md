# Experimental bounded Claude generation

`createClaudeGenerator(config)` returns an `Options.generate` callback. Its text
is an **unapproved candidate**. Pass it only into the complete gateway, which must
perform local/remote output assessment and final authorization before delivery.
Do not send the callback's return value directly to a UI, narrator or cache.

All configuration is explicit trusted backend data: `apiKey`, `model`,
`apiVersion`, `systemPolicy`, `timeoutMs`, `maxOutputTokens`, `maxRequestBytes`,
`maxResponseBytes`, and injected `fetch`. No environment lookup, default model,
default child policy or template is supplied. Runtime configuration is validated
and copied into a closure; errors do not reveal supplied secrets.

The only destination is `https://api.anthropic.com/v1/messages`. Authentication
uses `x-api-key`, with an explicit `anthropic-version`. The system policy is
separate from JSON user data containing only input and the trusted profile.
Requests use no tools, images, history, caching, automatic retries or streaming;
thinking is explicitly disabled. Model/version compatibility must be tested for
the selected account. Policy separation alone does not prevent prompt injection.

Request bytes are bounded before fetch. The provider response is read into a
bounded byte buffer, with strict UTF-8/JSON validation and Content-Length checks
when supplied. Only a matching-model assistant message, completed with `end_turn`,
containing one nonempty text block of at most 8,000 Unicode code points is accepted.
Refusal, truncation, reasoning/tool blocks, nonempty citations, redirects, malformed
envelopes and provider errors fail closed. Maximum response configuration is
65,536 bytes; request configuration is at most 65,536 bytes, stage deadline at
most 30 seconds, and output-token configuration at most 4,096 tokens.

Failure returns `null`, which the gateway rejects as invalid generation. No raw
provider exception, rejected envelope, credential or fallback answer is returned.
Caller abort and deadline settle the callback and abort transport/body reads.
Late responses are discarded and canceled. This cannot forcibly terminate a
noncooperating network implementation or synchronous JavaScript work; deployment
resource/egress limits remain required. Timeouts can still incur provider costs.

Dedicated mock tests cover configuration, wire shape, input and byte boundaries,
Unicode, envelope parsing, refusal/truncation, HTTP/stream failures, cancellation,
deadlines, late bodies and concurrency. Pipeline tests compose both Claude
adapters with the gateway and delivery projection using injected synthetic
responses. No live generation test, child data or Koda integration was performed.

Protocol references used for this implementation are the official
[Messages API](https://platform.claude.com/docs/en/api/messages/create),
[authentication](https://platform.claude.com/docs/en/manage-claude/authentication),
and [versioning](https://platform.claude.com/docs/en/api/versioning) documentation.
The existing live baseline classified authored inputs/outputs; it is not evidence
for generation quality or full-pipeline safety.
