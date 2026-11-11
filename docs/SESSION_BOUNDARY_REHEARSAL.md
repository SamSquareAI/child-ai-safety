# Synthetic session-boundary rehearsal

Run from the repository root with Node.js 22 or later:

```sh
npm ci --ignore-scripts
npm run eval:session-boundaries
```

This builds the package and exercises the actual reference HTTP service over
loopback with synthetic gateway assessment/generation adapters. It uses no model,
API key, environment-file loader, Koda account, production endpoint or paid service.
It is also included in `npm run preview:check`.

## Checks

| Check | What the rehearsal asserts |
| --- | --- |
| Wire authority spoof | A body-supplied tenant is rejected before gateway work. |
| In-flight revocation | While a synthetic generator is paused, credential revocation makes the HTTP request unavailable without returning the candidate. |
| Retired bearer reuse | Further requests with that bearer receive HTTP 401 and do not invoke its generator again. |
| Session and tenant separation | A new credential for the same tenant and an independent tenant credential receive only their respective handler's result while the retired request is outstanding. |
| Policy rollback cutover | Revoking the candidate-policy credential while its output assessment is paused suppresses its answer; the replacement credential returns a result bearing the restored policy version. |
| Replacement startup | A replacement listener provisioned with only the current credential rejects the retired bearer and serves the restored policy. |

Every observed HTTP response must have `Cache-Control: no-store`. The command
prints only scope, fixed check identifiers, pass flags and explicit limitations.
It does not print bearer values, request text, generated candidates or raw errors.
Tests verify the report shape, six completed checks, canary absence in output,
and rejection of unsupported command arguments.

The first run passed all six checks. The report states `providerCalls: 0`,
`productionQualified: false`, `revocationScope: process-local` and
`restartCredentialSource: explicit-synthetic-configuration`.

## What this does not establish

This is a reference-service composition rehearsal, not deployed Koda or
multi-region qualification. Revocation is process-local; this service does not
persist a revocation database. The restart check deliberately provisions a new
listener without the old key. Reloading an obsolete credential configuration
could re-enable that key. A production identity store must authoritatively
exclude or reject retired credentials across replicas and restarts.

The rollback is a local credential/handler cutover between immutable gateway
configurations. It does not roll back Cloudflare deployments, databases, queues,
quotas, billing state or external provider work. Paused adapters are synthetic;
this does not measure provider cancellation or delivery latency. Revocation
cannot retract content already delivered. No model safety efficacy, durable
consent, OS cache erasure, cross-family Koda behavior or production readiness
is inferred.

Before using the same design in a hosted deployment, separately test revocation
propagation, concurrent replacement sessions, restart from the authoritative
credential store, isolation across replicas, and rollback with actual resources.
Keep the Koda device observations and this local evidence separate.
