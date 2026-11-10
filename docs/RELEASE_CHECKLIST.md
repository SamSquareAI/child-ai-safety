# Release readiness guard

This is a release guard, not a completed external review. The checked-in
`release/readiness.json` is a draft: all 12 gates are pending, release identity is
unset, and no owners, evidence or approvals have been invented. Existing local
tests, fixture-oracle matches and synthetic load observations do not qualify this
prototype for child use, a public safety claim, a pilot or production integration.

Run from the repository root (Node.js 22+; no added dependencies):

```sh
node scripts/check-readiness.mjs
node scripts/check-readiness.mjs --mode production --manifest release/readiness.json
node --test tests/readiness.test.mjs
```

The checker prints JSON with `status`, `mode`, `gatesSatisfied`, `releaseBlocked`
and `blockers`. Exit code is 1 whenever release-blocked, including every draft
run; exit code 0 is possible only for a complete production manifest checked with
explicit `--mode production`. The default is always draft, regardless of the
manifest's mode. Invalid arguments and unreadable or malformed manifests fail
closed. There is no network access, URL fetching, clock override CLI option,
test bypass, or approval command. The checker never modifies the manifest.

Run `npm run --silent review:queue` to get the next action for every gate,
whether it needs an independent reviewer, and which evidence coverage IDs are
missing. For a private manifest, append `-- --manifest /path/to/readiness.json`.
The queue shares the production check's exit status. Use `release:check` for
detailed validation errors. The queue omits names and evidence contents, and
it derives tasks from the manifest without recording approvals.

## External gates

Each row is required. Assign an accountable owner and obtain qualified review
for the exact candidate and intended population before recording approval.
`GATES` in `scripts/check-readiness.mjs` defines the fixed machine coverage IDs;
editing the manifest cannot remove requirements. Evidence must cover every ID
for its gate. A coverage label is a reviewer's claim, not proof of adequacy.

| Gate ID | Evidence and review required |
| --- | --- |
| `safeguarding` | Independent safeguarding specialist review of policy, child rights, parental consent, escalation and the actual response catalog. |
| `native-language-review` | Independent native-language reviewers for every intended locale and age band; cultural context and crisis/support responses. |
| `provider-child-use` | Written eligibility and applicable child-use terms for actual providers/models/accounts, ages and regions. Capability declarations do not establish permission. |
| `provider-retention` | Verified retention/training terms, deletion, subprocessors, residency and minimization for actual configurations and data paths. |
| `semantic-evaluation` | Independent held-out evaluation through real adapters end to end; thresholds fixed before evaluation; benign, adversarial, multi-turn and language/age coverage, uncertainty and failure analysis. Fixture labels/oracles are insufficient. |
| `koda-staging` | Authorized staging integration with actual Koda consent/revocation and fail-closed behavior; renderer, TTS, cache and log leakage checks; preserved existing enforcement and tested rollback. No real child traffic implied. |
| `multitenancy` | Authenticated tenant isolation, distributed quotas/billing and cross-tenant/revocation race tests. Per-process limits alone are insufficient. |
| `deployment` | Supported runtime/configuration, secrets management, observability, incident owners, recovery and rollback qualification. |
| `load` | Real transport, state and inference under sustained load, soak and failure injection; measured latency, memory, cost and overload budgets. Synthetic local load is insufficient. |
| `security` | Independent threat/security review, dependency and supply-chain review, and disposition of findings with accountable acceptance of residual risks. |
| `public-disclosure` | Actually available public entry point to private reporting, monitored owners, response expectations, supported versions and coordinated disclosure. A proposed URL or an unmonitored issue tracker is insufficient. No emergency-response promise. |
| `provenance` | Exact source/artifact digests, reproducible build and dependency records, signed attestation and authorized release authority. |

Safeguarding, native-language, semantic-evaluation and security approvals must
declare independence and name a reviewer different from the gate owner. Humans
must verify qualifications, actual independence and coverage of the entire scope.
Other gates still require a named reviewer and an explicit approval decision.

## Record format and evidence handling

Only the fields described here are accepted; omitted or unknown fields block.
Use `schemaVersion: 1`, `mode: "draft" | "production"`, boolean `testOnly`, a
`release` object and a `gates` array containing exactly one entry per gate ID.
`release: null`, null owners/approvals and empty evidence arrays intentionally
represent the current pending state and do not pass validation.

For a real candidate, `release` contains:

- `version`: the candidate version.
- `sourceRevision`: full lowercase Git revision (40 or 64 hex characters).
- `artifactSha256`: lowercase SHA-256 of the exact release artifact.
- `scope`: nonempty unique arrays `locales`, `ageBands`, `providers` and nonempty
  strings `deploymentTarget`, `policyVersion`, `detectorRevision`, `kodaRevision`.
  Identify provider model/account/configuration in the provider entries and
  supporting evidence. Enumerate all supported populations; never infer coverage.

Each gate contains `id`, `status` (`pending`, `rejected`, or `approved`), `owner`,
`approval`, `evidence` and string `notes`. Only `approved` can pass. An owner is
`{name, role, organization}` with nonempty strings; reviewers use the same shape.
Blank and obvious placeholder identities such as `TBD` are rejected.

Each evidence record contains all of:

- `id`: unique within its gate, 3–81 lowercase letters/digits/hyphens, starting
  with a letter; `ref`: stable relative local file path beneath the manifest's
  directory; `sha256`: lowercase SHA-256 of its nonempty file bytes.
- `issuedAt`, `expiresAt`: UTC timestamps exactly like
  `2026-11-09T12:00:00.000Z`. Issue time cannot be future-dated or older than
  90 days; expiry must be later than issue time and the current checker clock.
  Changed or older reviews require genuine reaffirmation, not rewritten dates.
- `releaseRevision`, `artifactSha256`: exact matches to the candidate.
- `scopeSha256`: SHA-256 of UTF-8 `JSON.stringify(release.scope)`.
- `testOnly`: boolean matching the manifest; `covers`: nonempty unique array of
  this gate's fixed coverage IDs. Across records, cover every required ID.

Use paths such as `evidence/<gate>/<immutable-record-id>.json`. The manifest
directory is the evidence root, even for an alternate `--manifest` path. Paths
allow letters, digits, underscore, dot, slash and hyphen; absolute paths, URLs,
empty/dot/parent segments, self-references and symlinks escaping the root fail.
Only regular files of 1 byte through 10 MiB are accepted. The checker hashes
bytes locally; it does not fetch linked contents, follow a disclosure URL, query
a provider, verify an external record ID or inspect evidence semantics. Materialize
access-controlled exports locally when checking restricted review records. Do not
commit child conversations, secrets, personal data or confidential provider terms.
Keep sanitized immutable evidence and protect the evidence directory from writes
during checks; file reads are not an atomic release snapshot.

Each approval contains `reviewer`, `decision: "approved"`, boolean `independent`,
`approvedAt`, `expiresAt`, `releaseRevision`, `artifactSha256`, `scopeSha256`,
`testOnly`, `evidenceIds` and `evidenceSha256`. Approval dates follow the same
90-day/nonfuture/unexpired rules and must not predate any referenced evidence.
`evidenceIds` names every evidence record in that gate exactly once and no others.
`evidenceSha256` is SHA-256 of UTF-8 `JSON.stringify(gate.evidence)`, binding the
approval to the entire evidence record set, including digests, coverage and dates.
These JSON hashes preserve object key and array order: compute from the parsed
manifest with Node's `JSON.stringify`; do not substitute pretty-printed JSON or
reorder bound objects without obtaining updated approval records.

## Production decision and limits

Production requires `--mode production`, manifest `mode: "production"`, and
`testOnly: false` at the manifest, every evidence record and every approval.
Changing the mode alone cannot approve pending gates or reuse test-only records.
The tests create complete **fabricated, test-only** manifests and evidence in OS
temporary directories, remove them afterward, and demonstrate all gates can
validate in draft while production remains blocked. No production approval
fixture is written into this repository.

A successful production check attests only that the supplied local records meet
this structural, binding, freshness and file-integrity policy at that instant.
It cannot establish truthful identities, specialist competence, independence,
authentic signatures, provider authorization, legal compliance, safety efficacy,
channel monitoring, reproducibility or actual deployed artifact identity. The
provenance gate requires signed attestations for human/trusted-tool verification;
this checker does not cryptographically verify them. Relabeling fabricated
records or editing checker policy is not a real approval. Protect release review,
manifest and checker changes through trusted repository/release controls.

Before a release, authorized maintainers must inspect the underlying reviews,
verify provenance and scope, resolve findings, ensure the checked artifact is the
one deployed, and run production mode as a mandatory release step in their own
release process. This change does not install CI/deployment enforcement or make
existing safety enforcement replaceable. Re-check after candidate, scope, evidence
or provider/configuration changes and before expiry. Until real external gates
are satisfied, keep the candidate blocked and record uncertainty as pending.
