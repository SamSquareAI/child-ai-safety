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
