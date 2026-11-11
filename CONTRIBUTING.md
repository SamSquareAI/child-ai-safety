# Contributing

SamSquare Child AI Safety is an early research prototype. A focused documentation correction, a synthetic regression test, or a reproducible contract bug is a good first contribution. Discuss policy and API changes before starting a large contribution.

## Set up locally

From the repository root, use Node.js 22 or later and npm:

```sh
npm ci --ignore-scripts
npm run preview:check
```

The preview check builds the TypeScript project, runs local tests with mocks,
checks adapter conformance, runs the offline scope matrix, and renders the
synthetic delivery rehearsal report and demo. It requires no provider credentials or paid services. Start with the [README](README.md) for repository scope, the [protocol draft](docs/PROTOCOL.md) for expected gateway behavior, and the [evaluation guide](docs/EVALUATION.md) for fixture and result conventions.

## Prepare a contribution

- Use synthetic examples only in issues, pull requests, logs, screenshots, and fixtures. Use placeholders for identifiers and credentials. Leave out real child data, personal information, secrets, illegal imagery, and working attacks against unpatched deployed systems.
- For a bug, provide the revision, runtime version, minimal local reproduction steps, and expected and observed behavior. For a proposal, describe the motivation, scope, and how the expected behavior could be checked locally.
- For changes to gateway behavior, describe the failure mode addressed and preserve strict authorization, fail-closed handling, bounded execution, and output suppression.
- Keep orchestration tests separate from detector evaluations. Report mock and fixture-oracle results as contract checks. State the review status of any changed fixture labels and describe what remains unverified.
- Seek explicit design review before adding telemetry, persistence, provider calls, or dependencies.

Run `npm run preview:check` before opening a pull request. For changes to the
Python evaluator, also run `.venv/bin/python -m unittest discover -s python -p 'test_*.py'` after the virtual-environment setup in the README. Include the commands you ran, their results, and any relevant checks you skipped. Link a related issue when one exists.

Contribute only material you have the right to provide under the repository's [Apache-2.0 license](LICENSE). Imported policies, model weights, and datasets require separate license and provenance review.

## Pick a first contribution

| Area | Start here | Include in the pull request |
| --- | --- | --- |
| Benign learning examples | `fixtures/scenarios.json`, `tests/gateway.test.mjs` | An invented question, locale/age/stage, draft expected action and why a filter could overblock it; no claim of expert label approval |
| Detector adapters | `examples/adapter-conformance.mjs`, `docs/DETECTOR_ADAPTER.md` | Injected-transport checks for context binding, malformed results, cancellation and unsupported scope; no credentials |
| Evaluation reports | `scripts/report-rehearsal.mjs`, `docs/EVALUATION.md` | A synthetic reproduction and explicit denominators, including failures and missing cases |
| Documentation | `docs/DEVELOPER_PREVIEW.md` | The command or behavior checked and the runtime used |

Public fixture edits can affect frozen evaluation digests. Follow the relevant
freeze protocol; do not rewrite private holdouts or refresh digests solely to
hide a mismatch. A fixture-oracle pass shows routing for supplied labels, not a
model's ability to make that decision. See the optional [Promptfoo
example](examples/promptfoo/README.md) for six credential-free routing cases.

For the support-routing follow-up, run `npm run eval:support-routing` and read
the [v2 scope and limits](docs/SUPPORT_ROUTING_V2.md). Preserve frozen v1 artifacts.
