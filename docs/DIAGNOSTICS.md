# Process-local operational counters

Each gateway exposes `diagnostics()`: an immutable snapshot of saturating counters
by a fixed reason and fixed execution phase. It includes no text, category evidence,
exception messages, credential, tenant/application ID, request ID or arbitrary label.
The public decision protocol is unchanged; unavailable results stay generic.

Operators can distinguish authorization denial, capacity rejection, cancellation,
stage/request deadlines, callback exceptions, malformed assessments, detector
unavailability and invalid generation. Allow/refuse/support are separate outcomes.
Each completed request contributes exactly one outcome, including invalid `handle`
calls. A late callback settlement does not produce a second outcome. Counts are
local to the gateway instance and reset on restart; each counter saturates at
`Number.MAX_SAFE_INTEGER`. They are not durable audit records or billing meters.

The counters do not invoke exporters or log anything. Exporters belong to the
trusted operator integration; do not add them to public response bodies or expose
an unauthenticated metrics endpoint. Small-count activity can still be sensitive.
Apply access controls, retention and aggregation appropriate to the deployment.
Gateway instances themselves must be bounded; creating one per arbitrary client
would defeat the fixed-cardinality memory property across a service.

The last executing phase identifies where a failure was observed, not its root
cause. A remote adapter's `unavailable` verdict deliberately does not reveal whether
its provider was down, malformed, late or unqualified. Adapter diagnostics need an
equally bounded, reviewed contract before finer operational attribution is added.
Synchronous callback work can block timers; counters do not remedy that limitation.
