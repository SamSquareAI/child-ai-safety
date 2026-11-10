# Initial threat model

Assets: child privacy and wellbeing, parent permissions, account isolation, provider credentials, service availability, repository integrity. Adversaries include abusive adults, malicious direct API callers, accidental disclosures, injected content, compromised dependencies, and failing services. Model/detector output is untrusted data.

| Threat | Prototype control | Still required before integration |
| --- | --- | --- |
| Caller skips UI gate | Mandatory authorization callback | Bind authenticated family/device and authoritative consent; verify expiry/revocation |
| Consent revoked during work | Rechecks at remote boundaries and delivery | Application-level in-flight coordination and race tests |
| Detector timeout or malformed output | Strict schema, deadline, fail closed | Qualified provider implementation, health controls, real transport limits |
| Raw candidate leaks | Approved output only; fixed response references | Renderer/TTS/network response tests, no candidate logs/caches |
| PII forwarded | Bounded local identifier checks precede external assessment, including punctuation regressions | Effective multilingual detection, minimization, evidence on indirect identifiers; phrase coverage is incomplete |
| Classifier fooled | Original-question context bound to each single-turn output check; no claimed semantic qualification | Held-out adversarial and benign evals; specialist-reviewed policy; conversation safety is unsupported |
| Prompt injection causes actions | No tools or arbitrary endpoint configuration in core | Provider tool disabling, endpoint allowlists, output schemas, sandboxed rendering |
| Callback mutates profile | Immutable copied primitive profile | Trusted callback implementations; gateway is not a plugin sandbox |
| Abuse causes cost/DoS | Bounded strings, per-stage timeout | Byte limits at ingress, durable quotas, concurrency limits, overall budget/deadline |
| CI/supply chain compromise | Lockfile, pinned read-only CI, bounded fixed-destination adapters; no publish workflow | Continuous dependency/secret scans, verified release provenance, trusted publishing and protected review/release controls |
| Review data becomes privacy leak | Synthetic fixtures only; no telemetry in core | Incident access/retention process and sanitized aggregate reporting |

No protection is claimed for arbitrary adult APIs, model weights, malicious adapters, images, audio, or a browser that directly calls a provider. No inherited Koda credentials or production configuration are part of this project. No production exploit attempts are authorized by these documents.
