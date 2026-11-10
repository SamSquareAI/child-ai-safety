# Draft response catalog review

Release remains **blocked**. All 27 EN/FR/ES messages in
`catalogs/draft-responses.json` are **UNREVIEWED**. Human qualification is explicitly
**pending**. No native-language, safeguarding, readability or age suitability
approval has occurred. This is a review aid, not a deployment configuration or
review evidence. No reviewer identities or approvals are generated.

The catalog contains exactly the nine static keys returned by
`requiredDeliveryResponseKeys(locale)` for each locale: refusal and support for
privacy, harm, safeguarding and relational categories, plus `unavailable.none`.
Each message is one shared draft scoped for review across **6-8, 9-11, 12-15 and
unknown**. These are intended review scopes, not validated age suitability or
age-specific variants. Unknown age has no inferred age or asserted qualification.

From the repository root, using existing built `dist/delivery.js` helpers:

```sh
node scripts/prepare-catalog-review.mjs > /tmp/child-ai-safety-catalog-review.json
node --test tests/catalog-review.test.mjs tests/delivery.test.mjs
```

The command runs offline, accepts no arguments, reads only the known checked-in
public draft and emits its JSON review packet to stdout. It performs no inference,
network, credential access, messaging or deployment. Redirect stdout to a local
review location as above. Errors use a fixed message, without input or exception
payloads. Package script wiring is left to the parent engineering task.

The exported `prepareCatalogReview` validates exact coverage, bounded nonempty
copy, draft version, UNREVIEWED/blocked/pending metadata and exact locale, age and
receipt scope. `REVIEW_SCOPE` pins a deliberately draft-only receipt; its policy
and detector identifiers do not describe a qualified deployment. A different
receipt or scope is rejected, even if supplied as a matching alternate expected
scope. The expected-scope argument can assert the current scope; it cannot expand
this draft's authorization. A new version or deployment scope requires deliberate
engineering changes and fresh human review.

The packet includes every message inside `catalogBinding`, the catalog version,
exact receipt, locale scope and canonical `deliveryCatalogSha256` digest. That
existing helper hashes JSON containing version, the ordered protocol/policy/
detector receipt, sorted locales and sorted key/text pairs. The digest is a
consistency binding, not an approval or signature. Age bands are explicit alongside
that binding and in every pending review; the delivery digest does **not** encode
age bands. Reviewers must inspect both. Output ordering is deterministic with no
clock values, randomness or machine paths. Text changes change the digest.

Six pending review requests cover safeguarding and native-language review for
each locale, each covering all four age bands and bound to the same receipt,
version and digest. Evidence is empty; reviewer identities and approval decisions
are absent. Packet type, metadata, `productionReady: false`, blocked release and
pending qualification label its status separately from child-facing copy.
`createDeploymentDeliveryProjection` rejects both the packet and its extracted
catalog binding. Reformatting this packet cannot supply the missing qualified
reviews and evidence. The research projection is used only to check delivery data
shape; its acceptance does not establish release readiness.

Qualified humans still need to assess each key and age band for clarity, tone,
regional language and safeguarding suitability. In particular, review whether the
longer FR/ES relational and safeguarding sentences are understandable to ages
6-8 and unknown-age users. Support drafts encourage a safe trusted adult who is
not involved in harm; they do not select a parent automatically. Privacy drafts
do not interpolate or repeat identifiers. Relational drafts state AI boundaries.
Unavailable drafts offer a quiet break and later learning retry. Reviewers must
verify that revisions preserve these properties without notification promises,
emergency monitoring or confidentiality promises, hotline numbers, punishment,
shame, blame, therapy or medical instructions. This document is an editorial
review brief, not clinical or legal qualification.

Actual review must happen outside this preparation command, against the exact
copy, digest, receipt, locale and age scope. Obtain genuine qualified reviewer
identities, independent decisions and evidence through the existing release
process. Any approval or evidence added later must be truthful and attributable;
this packet supplies none. All other release gates remain pending as applicable.
