# Koda delivery boundaries: source audit and local verification

November 11, 2026 · Application source candidate, not deployed evidence

This follow-up examined native live-AI transport and narration plus the Ask
staging and voice response/log boundaries. It found a local consent-lifecycle gap
and fixed it in the Koda application workspace. The fixes are not bundled in this
open-source gateway. A later local staging build was installed as recorded below;
no production rollout occurred.

## Findings addressed in application source

- Locking live AI cleared consent without immediately invalidating active dynamic
  speech or pending requests. A shared process-local generation/listener signal
  now invalidates pending work synchronously before asynchronous credential
  cleanup. Consent replacement and sign-out use the same boundary.
- Shared transport could send after a credential lookup returned no bearer or
  finish after local consent withdrawal. It now requires the bearer, rejects
  stale work, aborts pending transport, and races cancellation against header
  lookup/fetch/body decoding so a transport that ignores abort cannot hold the
  UI indefinitely. Late output is withheld before it initiates response-driven
  quota-cache writes. Request options specify no-store and disallow redirects.
- Legacy dynamic narration cached results using child text as a key. That cache
  was removed. Every dynamic replay now needs a fresh server decision. Consent
  invalidation cancels approval requests, stops dynamic speech and blocks late
  native voice selection. Fixed app-authored safety guidance remains available
  without live AI consent.
- A development warning included a caller-supplied voice key. It now uses a fixed
  message. The tested staging receipts contain a random execution ID and bounded
  action/stage counters rather than questions, candidates or family identifiers.

These changes preserve the existing moderation and authorization stages. No
classifier qualification, provider permission, or production approval is inferred.
A local invalidation signal does not revoke an already issued bearer everywhere,
unsend a provider request or undo audio already heard.

## Verification performed

The application workspace passed **158 tests across 17 Vitest suites**: 106
focused boundary tests and 52 adjacent transport, erasure, narration and staging
tests. The tests use actual application modules with synthetic network, storage,
provider and native OS dependencies. Application/web-test TypeScript checks and
mobile TypeScript checks passed.

Covered behaviors include withdrawal during headers/fetch/body decoding; ignored
abort signals; stopping active speech; withdrawal during device voice selection;
fresh legacy-audio replay approval; static safety copy remaining available;
same-family final response checks; moderation denial/outage; rejected output
absent from tested JSON and console calls; and no-store response headers. The
canaries are synthetic. These tests do not inspect every live telemetry or vendor
path and do not establish native OS cancellation or physical cache erasure.

The test count belongs to Koda's application workspace. This repository's CI runs
its own gateway tests and cannot reproduce the private application's device
session. The earlier [owner-operated staging result](KODA_STAGING_RESULT.md)
predates these source fixes and is not post-fix device acceptance evidence.

## Deployment status and remaining work

The source-audit stage made no deployment or device installation. Subsequently,
the owner authorized a local staging iPhone build and installation. Xcode's
Release build succeeded and strict/deep signature verification passed. The
compiled bundle contained the staging host, cancellation fence and invalidation
subscription. Device speech is enabled for this staging build.

The app installed on the paired iPhone 15 Plus and the device tooling reported a
successful foreground process launch with an Ask deep-link payload. No uninstall,
App Store submission, production backend deployment, purchase, family deletion
or paid model call was performed. A successful launch does not prove the screen
rendered, that profile state was retained, or that the native speech race is
resolved. The owner-operated lock-during-Listen check is pending.

The next staging acceptance should use synthetic canaries to check locking AI
while an answer or voice approval is delayed, stopping current dynamic speech,
sign-out/regrant, cross-session audio replay and preserved static guidance.
Inspect actual backend/CDN/OS cache and log paths. Verify narration receives only
approved text in the deployed renderer, and rehearse rollback. Remote-session
revocation still depends on server checks and any notification mechanism; the
local signal is not a distributed revocation protocol.

The production release gates remain pending. This is scoped source and local
integration evidence, not completion of the full Koda staging gate.
