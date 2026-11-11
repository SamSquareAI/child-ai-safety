# Optional durable session authority reference

This is an opt-in same-host SQLite authority for the loopback reference service.
It persists session identities, tenant/application bindings, bearer digests,
expiry and irreversible revocation tombstones. It stores no prompts, answers,
raw bearers or child profiles. It does not implement Apple sign-in, parent consent,
a public account API or a multi-region identity platform.

The portable TypeScript gateway remains unchanged. This service adapter uses
Node's experimental `node:sqlite` API and requires Node 22.13 or later on a POSIX
host. CI tests the current Node 22 and 24 releases. The database lives outside the
repository in an existing operator-owned directory with mode 0700. The adapter
requires a regular owner-only database file, rejects a direct symlink, and creates
new files with mode 0600. Filesystem ancestors, backups and host administration
are trusted. Do not use a shared network filesystem as an assumed distributed store.

## Trusted backend wiring

```js
import {createSqliteSessionAuthority} from './services/sqlite-session-authority.mjs';
import {createReferenceService} from './services/reference-server.mjs';

const authority = createSqliteSessionAuthority({path: privateAbsoluteDatabasePath});
// During explicit new-session issuance ONLY:
// authority.issue({id, tenantId, applicationId, digest, expiresAt});
// Generate a high-entropy bearer in the trusted backend; store only its digest.

const service = createReferenceService({
  credentials: serverOwnedCredentialHandlers,
  credentialAuthority: identity => authority.isActive(identity),
});
```

The variables above must come from trusted backend configuration. Never accept
handler mappings or tenant identity from the learner's request. `issue` inserts a
new identity and rejects duplicate IDs/digests, including revoked IDs. It must not
be called automatically to recreate credentials from an old deployment snapshot.
A replacement session needs a new ID and bearer. Expiry uses the trusted host wall
clock; clock integrity and synchronization are operational prerequisites.

`authority.revoke(id)` persists a tombstone before returning. Other connections
and processes sharing the database observe it on subsequent authority reads.
Missing, mismatched, expired or revoked sessions are denied. Read/store errors
fail closed. No positive authorization cache is used. SQLite uses WAL and FULL
synchronization with a bounded busy wait. Back up and restore the database and WAL
consistently; restoring an old authority snapshot could restore old access.

## HTTP delivery checks

When configured, the reference transport checks authority before body processing,
again before handler invocation and after result serialization before sending
content. Every check shares the request deadline and cancellation signal.
Only literal `true` authorizes. Initial denial returns 401; failed checks or
revocation during work return 503 without candidate content. Errors remain fixed
and sanitized. Responses retain `Cache-Control: no-store`.

Timed-out authority work that ignores cancellation retains admission capacity
until settlement. Synchronous SQLite operations cannot be interrupted by an
AbortSignal; the elapsed deadline is rechecked after the operation. Unconfigured
listeners retain the explicitly documented process-local behavior.

This is a point-in-time authorization check, not an atomic distributed
revoke-and-deliver transaction. A revocation after the final read cannot retract
bytes sent afterward. Revocation in another process does not proactively cancel
inference or speech in this process. Add a qualified coordination/notification
protocol if tighter propagation or delivery guarantees are required. There are
no claims of instantaneous global revocation or provider-work cancellation.

## Verification

```sh
npm run --silent build
node --test tests/durable-session-authority.test.mjs tests/service.test.mjs
npm run preview:check
```

The tests cover independent authority connections, a separate Node process,
reopening persisted tombstones, two loopback HTTP listeners, stale credential
configuration after listener restart, a new session on the restored policy,
expiry during work, authority unavailability, revocation during serialization,
strict approval semantics, hung-authority deadlines/admission recovery, file
permissions and symlink rejection. Content and credentials are synthetic.

These checks qualify the tested local reference behavior only. SQLite is an
experimental optional reference, not the production distributed backend. Koda,
Cloudflare, actual Apple sessions, replication, disaster recovery, host durability
under power loss, multi-region consistency and production rollout remain separate.
No production release gate is completed by this adapter.
