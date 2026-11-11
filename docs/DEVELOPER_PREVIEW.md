# Child AI Safety developer preview

SamSquare Child AI Safety is an open-source TypeScript gateway and evaluation toolkit for age-aware educational AI. The preview gives developers a way to exercise input and output assessment, consent boundaries, and localized response routing with synthetic data.

## Try it locally

From the repository root, with Node.js 22 or later:

```sh
npm ci --ignore-scripts
npm run --silent eval:rehearsal
npm test
```

The rehearsal verifies the pinned synthetic fixtures and draft response catalog, scores the local precheck, and exercises the gateway with simulated detector and generator responses. The JSON report includes approval, refusal, support, and outage outcomes. The commands need no API key. Use synthetic cases for development.

## Contribute

- Improve English, French, or Spanish wording and document regional or age-specific differences with invented examples.
- Add benign educational cases that exercise false refusals and show the intended behavior.
- Improve adapter examples or tooling for collecting content-free results from local evaluations.

Start with the contribution guide and open a focused issue or pull request. Use private reporting for vulnerability details. [Contribution guide](../CONTRIBUTING.md) · [Security policy](../SECURITY.md)

## Deployment status

This source preview supports local evaluation and integration development. A child-facing deployment still needs a qualified detector and provider configuration, verified consent and delivery on the deployed application, operational testing, and a tested rollback. The current repository records production evidence separately. [Next-phase plan](NEXT_PHASE_PLAN.md) · [Release checklist](RELEASE_CHECKLIST.md)
