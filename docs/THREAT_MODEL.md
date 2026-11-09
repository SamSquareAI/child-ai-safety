# Initial threat model

Assets: child privacy and wellbeing, parent permissions, account isolation, provider credentials, service availability, repository integrity. Adversaries include abusive adults, malicious direct API callers, accidental disclosures, injected content, compromised dependencies, and failing services. Model/detector output is untrusted data.

| Threat | Prototype control | Still required before integration |
| --- | --- | --- |
| Caller skips UI gate | Mandatory authorization callback | Bind authenticated family/device and authoritative consent; verify expiry/revocation |
| Consent revoked during work | Rechecks at remote boundaries and delivery | Application-level in-flight coordination and race tests |
| Detector timeout or malformed output | Strict schema, deadline, fail closed | Qualified provider implementation, health controls, real transport limits |
| Raw candidate leaks | Approved output only; fixed response references | Renderer/TTS/network response tests, no candidate logs/caches |
| PII forwarded | Local stage precedes external assessment | Effective multilingual detection, minimization, evidence on indirect identifiers |
| Classifier fooled | No claimed semantic protection in scaffold | Held-out adversarial and benign evals; specialist-reviewed policy |
| Prompt injection causes actions | No tools or arbitrary endpoint configuration in core | Provider tool disabling, endpoint allowlists, output schemas, sandboxed rendering |
| Callback mutates profile | Immutable copied primitive profile | Trusted callback implementations; gateway is not a plugin sandbox |
| Abuse causes cost/DoS | Bounded strings, per-stage timeout | Byte limits at ingress, durable quotas, concurrency limits, overall budget/deadline |
| CI/supply chain compromise | No network adapter or publish workflow yet | Lockfile, scans, pinned actions, provenance, trusted publishing, branch protection |
| Review data becomes privacy leak | Synthetic fixtures only; no telemetry in core | Incident access/retention process and sanitized aggregate reporting |

No protection is claimed for arbitrary adult APIs, model weights, malicious adapters, images, audio, or a browser that directly calls a provider. No inherited Koda credentials or production configuration are part of this project. No production exploit attempts are authorized by these documents.
