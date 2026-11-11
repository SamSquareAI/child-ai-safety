# GitHub peer review for Child AI Safety

November 11, 2026

The fastest improvement is a quickstart that shows four learner outcomes in one screen, followed by a report that compares the same cases across versions. Child AI Safety can specialize in age-aware support, consent-aware delivery, and language-specific evaluation. Those features give an education team a reason to try it alongside the general tools it already uses.

## Scope

I checked GitHub repository metadata and shallow-cloned five public projects to inspect their READMEs, examples, and selected implementation or documentation files. This is a source and contributor-experience comparison. Performance, detection accuracy, and deployed behavior require separate experiments. Star counts are a snapshot of GitHub interest, with different project ages and audiences. The baseline for Child AI Safety is source preview `v0.1.0-alpha.1`, commit `5660cfd`. [Child AI Safety release](https://github.com/SamSquareAI/child-ai-safety/releases/tag/v0.1.0-alpha.1)

| Peer | GitHub stars | What the source shows | What we can apply |
| --- | ---: | --- | --- |
| Promptfoo | 27,052 | The quickstart puts the CLI and first evaluation up front. Config files declare providers and assertions. The UI compares runs side by side, and the documentation shows how to use evaluations in CI. | Lead with an offline command and an example result. Export an aggregate comparison with counts and denominators. Add an optional synthetic interop example after the native report is stable. [README at b3603fa](https://github.com/promptfoo/promptfoo/blob/b3603fab85bb331da98a8b68ca442e1f4af7e368/README.md) · [Quickstart](https://www.promptfoo.dev/docs/getting-started/) |
| Guardrails AI | 7,600 | The framework composes validators into input and output guards. Validator code exposes explicit failure behavior. The README documents both validator authoring and a change in its validator distribution model. | Publish a narrow conformance kit for a new detector adapter, with examples of invalid responses, unavailable checks, and unsupported scope. Start with the maintained adapters already in the repo. [README at 06d0ff2](https://github.com/guardrails-ai/guardrails/blob/06d0ff2c5f9bcb493d976b76f885e37e41ce845d/README.md) · [Validator implementation](https://github.com/guardrails-ai/guardrails/blob/06d0ff2c5f9bcb493d976b76f885e37e41ce845d/guardrails/validator_base.py) |
| NVIDIA NeMo Guardrails | 7,474 | NeMo documents input, dialog, retrieval, execution, and output rails, with separate input and output configuration examples. It also documents deployment and tracing. | Draw the lifecycle of one Koda Ask request. Show where trusted profile, consent, local checks, remote checks, and final delivery fit. Reuse the existing TypeScript contract and expose only bounded operational metadata. [README at b6e2ac1](https://github.com/NVIDIA-NeMo/Guardrails/blob/b6e2ac1b4bdd96bae42dbb7d353d04ee7da3457b/README.md) · [Examples](https://github.com/NVIDIA-NeMo/Guardrails/tree/b6e2ac1b4bdd96bae42dbb7d353d04ee7da3457b/examples) |
| Inspect AI | 3,225 | Tasks separate the dataset, execution pipeline, and scorer. Structured logs and a viewer let researchers inspect results at sample level. | Make our existing inputs, observations, and scoring split visible in the quickstart. Show failed and skipped cases alongside decisions. Keep case content out of shared reports and use synthetic examples for any case-level viewer. [Tutorial at 67873ea](https://github.com/UKGovernmentBEIS/inspect_ai/blob/67873ea965f2d5acd46b2327ea17aecff30026c1/docs/tutorial.qmd) · [Log documentation](https://inspect.aisi.org.uk/eval-logs.html) |
| Protect AI LLM Guard | 3,219 | The README inventories input and output scanners by purpose and links to examples. GitHub marks the repository archived, and the maintainers state that its associated models are unmaintained. | Give adopters a single support matrix for capabilities, limitations, and fallback behavior. Use the archived project as a documentation reference. [README at 168c103](https://github.com/protectai/llm-guard/blob/168c1034ffdb33837e7ae6fd6a16b80567c1be03/README.md) |

KORA and recent child-centered moderation research are useful scope comparisons even though the table focuses on popular GitHub tools. They highlight emotional dependence, coercion, age-specific risks, and the limits of general moderation. Use their published taxonomies to check coverage. Record which categories have only synthetic demonstrations and which have evidence on the exact application path. [KORA](https://korabench.ai/) · [Mind the Alignment Gap](https://aclanthology.org/2026.woah-1.19/)

## What is already in place

- The preview has a provider-free rehearsal, a synthetic stdin example, Node and Python CI, a contribution guide, and three labeled starter issues. The missing onboarding step is a short example that starts with a learner question and ends with a visible outcome.
- The gateway already provides validated decisions, bounded execution, request-scoped output context, support and unavailable outcomes, and a final authorization check. The report should make those behaviors visible while preserving their existing contracts.
- The evaluation tools already keep cases and expected labels separate for independent runs and track failures, missing observations, and per-language slices. The gap is a convenient report and a repeatable comparison, with clear evidence labels for simulated and live runs.
- The production manifest remains blocked. A stronger quickstart and more contributor activity improve adoption. Production evidence still comes from the intended provider, deployed route, actual consent and delivery boundaries, and operational checks.

[Developer preview](DEVELOPER_PREVIEW.md) · [Evaluation guide](EVALUATION.md) · [Release checklist](RELEASE_CHECKLIST.md) · [Starter issues](https://github.com/SamSquareAI/child-ai-safety/labels/good%20first%20issue)

## Prioritized work

| Priority | Deliverable | Acceptance check |
| --- | --- | --- |
| 1 | A one-command, credential-free demo plus a shorter README opening. Show approved, refused, support, and unavailable examples as a compact table. Publish a captured example output and a diagram of the gateway. | A clean clone can reproduce all four outcomes on supported Node versions. CI verifies output shape. The README states which parts are simulated and links to existing starter issues. |
| 2 | A readable summary and version comparison for the existing rehearsal JSON. Start with Markdown or terminal text and retain JSON for tooling. | Reports show totals and denominators by locale, age, and stage. A comparison checks corpus and policy digests before presenting a change. Failed, skipped, and unavailable results stay visible. No prompts or candidate responses appear in shared output. |
| 3 | An adapter conformance example and support matrix covering the HTTP and Claude adapters. Include model identity, supported scope, data handling fields, and failure behavior. | A contributor can run the conformance example without credentials and verify context, timeout, unsupported profile, malformed response, and unavailable handling. The example distinguishes a compatible adapter from an evaluated deployment. |
| 4 | A small external interop example for one of Promptfoo or Inspect AI. Use the synthetic fixture runner as the boundary and keep this in the examples or evaluation layer. | The example reproduces a known synthetic result and checks which fields the external tool records. Core installs require no additional framework. |
| 5 | A staging evidence bundle for one Koda Ask route, in parallel with contributor work. | A staging operator demonstrates consent withdrawal, blocked display and narration, privacy-safe logs, overload behavior, and rollback on a pinned build. Document which production gates the evidence actually covers. |

I would start with priorities 1 and 2 for the next preview. Publish a short walkthrough with the four outcomes, release link, and one specific contribution request. The GitHub repository currently has no topics or homepage configured. Add descriptive topics and link to the preview or project documentation so the repo is easier to find and navigate. Track fresh-clone walkthrough feedback, useful issue reports, and first-time PRs alongside stars.

Keep the initial integration narrow. A general plugin marketplace, hosted dashboard, and dialogue language would add maintenance and security work. A static report, explicit adapter contract, and documented Koda staging path are smaller deliverables with direct acceptance checks.

## Draft post to share the project

We released the first developer preview of SamSquare Child AI Safety, an open-source toolkit for testing how educational AI handles questions from children.

The demo runs locally without an API key. It shows how the gateway handles a normal learning question, a refusal, a request for support, and a detector outage. It uses synthetic examples in English, French, and Spanish.

We’re looking for contributors to add learning examples, improve localized wording, and make the evaluation results easier to read.

[Try the preview](https://github.com/SamSquareAI/child-ai-safety/releases/tag/v0.1.0-alpha.1) · [Pick a starter issue](https://github.com/SamSquareAI/child-ai-safety/labels/good%20first%20issue)
