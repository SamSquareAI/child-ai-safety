# Koda session, cache and log checks — November 11, 2026

## Device observation

The owner’s approximately 58-second staging iPhone recording shows a signed-in
parent session, sign-out, and return to Ask with Live AI locked. The previous
answer is no longer visible. After the parental gate, the app explicitly requires
a grown-up sign-in before live AI can be enabled again.

This supports the local sign-out/unlock boundary in the observed session. It is
not an old-answer Listen replay test: there is no old answer to select. The video
does not show a new sign-in, cross-family isolation, or server revocation completion.
Private recordings and account identifiers are not published.

## Live staging probes

Four synthetic POST requests reached the staging Worker: Ask and voice, each
without credentials and with an invalid synthetic consent bearer. Ask without
credentials returned HTTP 200 with `ok: false` and `needsConsent: true`; the other
three returned HTTP 403. None returned generated text, approved narration or
audio, and none echoed the synthetic input canaries.

The filtered live tail captured these four requests plus one preliminary Ask
request. All five events had zero application console entries and zero
exceptions. No canary or synthetic credential appeared in those application
log fields. Raw tail events and request headers were not retained in the report.
The collector stopped after its bounded capture interval.

The deployed staging version was `f9c79033-deae-44f8-bcb4-8e767d2d2132`.
Initial Python-default-user-agent probes received edge HTML denials; those are
excluded from application-authentication evidence. The successful probes used
a native-style user agent and required no provider generation or paid model call.

## Cache gap found and local correction

Invalid-bearer denials had `Cache-Control: no-store` and `Pragma: no-cache`.
Credential-free Ask and voice denials had neither explicit header. No cache-hit
or Age header was observed, but absence of those headers is not a cache guarantee.

The private Koda integration source now sets no-store/no-cache on every bounded
content response through its shared family-response wrapper, including
credential-free denials. This overrides legacy public-cache headers on that API
wrapper. Public lesson assets use a separate handler. This is a local source fix;
it has NOT been deployed to staging or production and needs no new native build.

Regression coverage checks credential-free 200/403/503 responses and the actual
voice consent-denial route. A separate synthetic mobile test invalidates an old
session’s pending voice approval, then requests the same text with a new bearer
and requires fresh approval. It uses mocked credential and OS speech dependencies;
it is not a live Apple sign-out/regrant or multi-device test.

## Verification

The final affected Koda run passed 78 tests across five suites (voice replay,
family response barrier, device approval/rollout and subscription route). An
earlier run passed 68 tests across seven boundary suites before adding the
session-change replay case; those overlapping totals must not be added together.
Web and test TypeScript checks passed after the final changes. The open-source
repository source-preview checks also passed, with zero provider calls. Koda
source tests are in the private integration repository, not the public package.

## Limits and next checks

These live probes exercise missing/invalid credentials only, not authenticated
answers, the model provider, successful narration, or all log/exporter paths.
Zero sampled application logs does not establish provider retention, complete
telemetry erasure, CDN/OS cache erasure or absence of metadata elsewhere.
The source observability configuration is not independent verification of every
live logging setting. Local generation invalidation is not distributed revocation.

Next: deploy and repeat the cache-header probes in staging, then validate a fresh
signed-in session and narration approval using synthetic content. Keep production
qualification and activation separate. No family deletion, purchase, App Store
submission or production deployment occurred during these checks.
