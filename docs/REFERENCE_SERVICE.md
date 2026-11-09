# Local reference service

`services/reference-server.mjs` binds only to `127.0.0.1`. Build the package first.
It exports a factory for tests and trusted backend integrations, not a public server launcher.
There is no default generator, safety detector, account database or consent grant.

Configure each credential with a SHA-256 digest of a cryptographically random bearer
token, a tenant/application binding, and a server-owned gateway `handle` callback.
Never embed these tokens in a mobile/web client. Keep credential storage outside Git.
The exported digest helper is for high-entropy tokens, not human passwords.

`POST /v1/generate` accepts only the versioned request schema. Authentication and
per-tenant/global admission precede body processing. Request bytes, headers,
connections, response bytes and elapsed work are bounded. Browser origins,
compressed bodies, ambiguous authentication and unsupported protocols are rejected.
Responses are buffered, validated, non-cacheable JSON. Provider exceptions never
become HTTP bodies. `/healthz` reports only `reference-only`; it does not prove that
an upstream model is healthy or qualified. There is no raw-content logging.

`revokeCredential(id)` aborts active work and denies future requests for that key.
This is process-local credential revocation, **not parental consent revocation**.
Header limits are enforced without silently discarding headers. Early rejections
close unfinished uploads, and shutdown closes partial connections and prevents
startup races. The service rechecks deadline/revocation after result serialization;
it still cannot preempt synchronous trusted callback code.
Consent must still be resolved by the gateway authorization callback. Revocation
cannot retract already delivered bytes. A stuck callback retains its admission slot
until it settles; process isolation/restart and bounded provider clients are needed
for operational recovery. Multiple keys for one tenant share its admission budget.

Tests use synthetic tokens, mock assessment and generation, and real loopback HTTP.
They establish transport behavior, not semantic safety or production capacity.

Before public hosting, add reviewed TLS ingress, distributed authenticated identity
and quotas, credential rotation/storage, consent-state coordination, metadata-only
operational diagnostics, deployment/resource isolation, incident ownership and
real transport/inference load qualification. Do not expose this reference listener
through a public tunnel or treat it as a ready SaaS deployment.
