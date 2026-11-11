# Run the synthetic gateway in Promptfoo

From the repository root, use Node.js 22.22 or later:

```sh
npm ci --ignore-scripts
npm run --silent build
PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1 npm_config_ignore_scripts=true \
  npm exec --yes --package=promptfoo@0.125.1 -- promptfoo eval \
  -c examples/promptfoo/promptfooconfig.yaml --no-cache --no-progress-bar
```

The first run downloads the pinned Promptfoo CLI. The local provider sends six
public synthetic fixtures through the gateway and returns the action. It needs
no API key or model service. Expect four allows for benign French and Spanish
learning questions, one refusal, and one support response. The fixture runner
uses draft labels to simulate the assessor. A pass checks integration and
routing. Detector accuracy requires a separate evaluation.

To add a case, add a synthetic input to the public fixture file with a unique
ID, locale, age band, category, and expected action. Add its `fixtureId` and
`expectedAction` to the YAML test list, then rerun the command. Run `npm test`
for the repository's own tests. The Promptfoo evaluation uses only fixture IDs
in its table. [Fixture file](../../fixtures/scenarios.json) · [Contribution guide](../../CONTRIBUTING.md)
