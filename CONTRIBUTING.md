# Contributing

SamSquare Child AI Safety is an early research prototype. A focused documentation correction, a synthetic regression test, or a reproducible contract bug is a good first contribution. Discuss policy and API changes before starting a large contribution.

## Set up locally

From the repository root, use Node.js 22 or later and npm:

```sh
npm ci --ignore-scripts
npm test
```

The default suite builds the TypeScript project and runs local tests with mocks. It requires no provider credentials or paid services. Start with the [README](README.md) for repository scope, the [protocol draft](docs/PROTOCOL.md) for expected gateway behavior, and the [evaluation guide](docs/EVALUATION.md) for fixture and result conventions.

## Prepare a contribution

- Use synthetic examples only in issues, pull requests, logs, screenshots, and fixtures. Use placeholders for identifiers and credentials. Leave out real child data, personal information, secrets, illegal imagery, and working attacks against unpatched deployed systems.
- For a bug, provide the revision, runtime version, minimal local reproduction steps, and expected and observed behavior. For a proposal, describe the motivation, scope, and how the expected behavior could be checked locally.
- For changes to gateway behavior, describe the failure mode addressed and preserve strict authorization, fail-closed handling, bounded execution, and output suppression.
- Keep orchestration tests separate from detector evaluations. Report mock and fixture-oracle results as contract checks. State the review status of any changed fixture labels and describe what remains unverified.
- Seek explicit design review before adding telemetry, persistence, provider calls, or dependencies.

Run `npm test` before opening a pull request. Include the commands you ran, their results, and any relevant checks you skipped. Link a related issue when one exists.

Contribute only material you have the right to provide under the repository's [Apache-2.0 license](LICENSE). Imported policies, model weights, and datasets require separate license and provenance review.
