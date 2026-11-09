# Contributing

This is an early research prototype. Discuss policy/API changes before a large contribution. All fixture labels and safety claims must describe their review status and limitations.

- Use synthetic examples only. Do not submit real child data, credentials, illegal imagery, or working attacks against unpatched deployed systems.
- Keep tests for orchestration behavior separate from evaluations of real detectors. Never report mock pass rates as detection accuracy.
- Run `npm ci --ignore-scripts` and `npm test` before proposing a change.
- Describe the threat addressed, expected behavior, evidence, and residual limitations.
- Preserve strict authorization, fail-closed handling, bounded execution, and output suppression.
- Do not add telemetry, persistence, provider calls, or dependencies without explicit design review.

Contributions must be material you have the right to provide under this repository's Apache-2.0 license. Imported policies, model weights, and datasets require separate license/provenance review.
