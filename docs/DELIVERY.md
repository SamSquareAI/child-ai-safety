# Plain-text delivery projection

`createDeliveryProjection` narrows a trusted gateway result into immutable
`{kind,format:'plain-text',text}` data shared by rendering and narration adapters.
It validates the result schema and exact expected policy/detector receipt. Allowed
results supply their approved text; refusals/support/unavailability resolve only
to a trusted reviewed static catalog or a trusted generic fallback. Blocked
candidates, detector evidence and exception messages are never accepted fields.
Catalog and receipt values are snapshotted; catalog accessors are rejected.

This helper performs no rendering, speech, logging, network or persistence. Call
it on results received over an authenticated trusted backend path, not arbitrary
client-supplied JSON: a matching receipt is not a cryptographic signature. A
forged schema-valid allow result can pass. Review templates independently; no
child-facing production catalog is supplied. A response ID alone is not a review.

Consumers must use plain-text APIs (`textContent` or native Text equivalents),
never `innerHTML` or untrusted Markdown/link execution. `plain-text` is a contract
label, not an HTML sanitizer. Narration must receive only the projection's text,
after current consent/authorization checks. Do not stream or cache raw generated
candidates while waiting for safety checks. The helper does not reauthenticate,
guarantee atomic delivery/revocation, clear logs/caches or undo speech already
played. Those controls belong to the actual Koda staging integration and require
its own tests. The included render/speech buffers are synthetic test spies only.

## Research and deployment configuration

The existing synchronous `createDeliveryProjection(config)` remains compatible.
Its explicit alias is `createResearchDeliveryProjection(config)`. **Research mode
permits empty/incomplete catalogs and a generic fallback**, including synthetic
experiments. Its success does not qualify a deployment or establish helpful
support delivery. Existing callers do not automatically gain strict checks.

Deployment composition must explicitly await
`createDeploymentDeliveryProjection(config)` before accepting traffic. This
separate constructor rejects invalid configuration with `TypeError` and supplies
no default approvals, catalog, locale scope, or review evidence. No production
catalog or independent review is supplied by this repository. **Release remains
blocked**; passing this consistency check is not release authorization.

The deployment configuration contains:

- `receipt`: the exact protocol/policy/detector receipt expected from the gateway.
- `enabledLocales`: an explicit, nonempty, duplicate-free subset of `en`, `fr`,
  `es`. Unsupported locales are rejected; no implicit English scope is used.
- `catalog`: exactly the runtime-schema static response keys for that scope.
  `requiredDeliveryResponseKeys(locale)` enumerates the valid keys. Each locale
  currently requires refusal and support for each of privacy, harm, safeguarding,
  relational, plus `unavailable.none` (nine messages). Every value must be nonblank
  and fit the existing 8,000-code-point/16,000-code-unit delivery bounds. Extra,
  wrong-locale, invalid, empty, and missing keys block configuration.
- `catalogVersion`: a protocol identifier, and `catalogSha256`: a lowercase hex
  SHA-256 computed with `await deliveryCatalogSha256({catalogVersion, receipt,
  enabledLocales, catalog})`. The canonical UTF-8 JSON binding is an array of
  version, `[protocolVersion, policyVersion, detectorId, detectorRevision]`, sorted
  locales, and sorted `[responseKey, exactText]` pairs. Text is not normalized.
- `authorRef`: the catalog author's reference. References throughout this API are
  bounded HTTPS URLs without credentials, or bounded `urn:namespace:identifier`
  references. They are not fetched or resolved by this helper.
- `evidence`: nonempty records `{id, ref, sha256, content}` with unique protocol
  identifier IDs, valid references, and the exact evidence text (at most 1,000,000
  UTF-16 code units per record). `sha256` must match the UTF-8 content digest.
  Supply trusted review artifacts, never child data or secrets. The helper does
  not read files or retrieve URLs; callers load authorized evidence themselves.
- `reviews`: nonempty records `{reviewerRef, independent, decision, role,
  evidenceId, evidenceSha256, catalogVersion, catalogSha256, locales}`. Explicit
  `independent: true` and `decision: 'approved'` are required. Reviewer references
  must differ from `authorRef`. Each record must name existing evidence with its
  exact digest and bind the exact catalog version/hash. Review locales must be a
  nonempty subset of enabled locales; both `safeguarding` and `native-language`
  roles must cover every enabled locale. All review/evidence fields are required;
  unknown fields are rejected. Up to 96 records of each kind are accepted.

Hash generation helps prepare a binding; it is not an approval. Changing a
message, version, receipt, or scope requires updating the binding and obtaining
review of that artifact and scope. Review evidence should establish appropriate
support meaning, including a safe adult who is not causing the harm. A reviewer
must assess that content; code does not infer it from an action/category label.
The checks establish structural consistency and digest equality only. They do
not verify identity, qualifications, independence, evidence truth, provenance,
signatures, freshness, or whether the referenced reviewer actually approved the
copy. An actor able to replace both artifacts and metadata can construct a
consistent false assertion. Authentic approval and artifact loading remain
trusted deployment responsibilities. All test approvals are synthetic fixtures.

The awaited constructor returns `project(candidate, locale)`. Pass the trusted
request's locale on **every call**; absent or disabled locale arguments throw.
Invalid results and receipt mismatches return the checked
`${locale}.unavailable.none` message. A static response for a different locale
also returns that fallback, even if the other locale is enabled. Matching support
and refusal results select their exact catalog messages. Allow results preserve
approved text, but the result protocol has no locale field for allow: the helper
cannot detect an answer in the wrong language or authenticate its request
association. The caller must bind the result to its trusted request context.
Configuration is copied before asynchronous hashing; later caller mutations
cannot change a constructed projection. Accessor configuration is rejected.

Actual UI/TTS, authorization, narration consent, cache and log paths still need
independent integration tests and specialist review. These unit tests establish
catalog coverage and projection behavior only; they do not establish helpful
meaning, language accuracy, actual child-facing delivery, or production safety.

New module exports are `createResearchDeliveryProjection`,
`createDeploymentDeliveryProjection`, `requiredDeliveryResponseKeys`,
`deliveryCatalogSha256`, and the types `DeliveryLocale`, `DeliveryEvidence`,
`DeliveryReview`, `DeploymentDeliveryConfig`. Package-root re-exports are a
separate integration change.
