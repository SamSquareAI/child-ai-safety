# Koda staging integration result

November 11, 2026 · Maintainer-observed integration evidence

An owner-operated iPhone test exercised one signed-in Koda Ask request through
the deployed, family-selected staging adapter. The recording showed the parental
gate completing, an answer appearing, and the allowance decreasing once. A
concurrent content-free execution receipt recorded an allow outcome, one local
input check, one remote input check, one generation call, one remote output
check, one local output check, and five gateway authorization callbacks. The
initial family-selection consent check is separate from those five callbacks.

The staging adapter preserved Koda's existing provider, moderation, authorization,
and allowance enforcement. It was enabled for one authenticated staging family;
production was not changed. An earlier owner recording showed that disabling
live AI blocked another question with the local unlock message.

## Evidence boundaries

| Check | Observation | Limit |
| --- | --- | --- |
| Signed-in staging request | Answer visible; additive gateway stages recorded; allowance decreased once | One English request, one owner-operated device; no accuracy estimate |
| Consent disabled | Local unlock message; no answer displayed | Separate visible toggle test; no live in-flight revocation claim |
| Runtime fault rehearsal | Actual staging adapter ran in workerd with synthetic dependencies; input outage prevented generation; output outage and late consent revocation withheld candidates | Injected failures, not observed live provider outages |
| Application checks | 19 targeted integration tests and application TypeScript checks passed | Run in Koda's application workspace, not this repository's CI |
| Log minimization | New receipt contains a random execution ID, fixed action and stage counters; temporary listener retained only those fields | Does not establish absence of content from every application, vendor, narration or cache path |

The application uses an earlier vendored gateway revision, not a deployment of
this repository's latest contextual detector contract. This result validates
that integration's control flow; it does not qualify the current source release
or a child-specific assessment model. The test's teaching tier is not trusted
policy age: the adapter supplies the explicit `unknown` age profile.

Private recordings, family references, receipt identifiers, deployed resource
identifiers and credentials are excluded from this report. Maintainer-held
application evidence supports this summary; the public source cannot reproduce
the signed-in device session. This is not an independent audit or a full
production-gate approval. Renderer/narration/cache isolation, live fault behavior,
and safety accuracy across age/language slices remain unresolved.

## Reproduce the portable boundaries

Run `npm run preview:check` for the gateway tests, adapter conformance examples,
offline scope matrix and synthetic delivery rehearsal. Those checks require no
credentials and do not reproduce the private Koda deployment.

For a new application, resolve consent and family identity on the server; select
staging traffic from authenticated state; retain existing enforcement; buffer
generated text until output checks finish; and verify the final renderer,
narrator and caches separately. Test rollback and injected failures before
expanding the scope. [Integration contract](../README.md#integration-contract)
· [Delivery boundary](DELIVERY.md) · [Production checklist](RELEASE_CHECKLIST.md)
