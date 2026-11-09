# First Claude evaluation — preparation

Provider selected by the maintainer: Claude. Authorized maximum for the first
evaluation run: **USD 10 total**. The maintainer has now completed the
[three-request smoke run](CLAUDE_SMOKE_RESULT.md); actual billing is not reconciled.
No Anthropic API key was available in the agent process when checked. The
maintainer selected Ship Safe, and approved creation of a three-hour Default
workspace key through the Console. Its value was redacted from tool output and
was supplied locally by the maintainer for the smoke run. This is not approval
for later recurring spend or production traffic.

## Preconditions for executing the batch

1. Configure a workspace-scoped evaluation API key through local secret management
   or the process environment (`ANTHROPIC_API_KEY`). Never paste a key into chat,
   GitHub, an issue, a command argument or the report. An unscoped key may require
   the workspace header; this initial adapter targets a workspace-scoped key.
2. Select the exact available model ID and explicit API version. Check model
   behavior, eligibility and current pricing. Do not silently substitute an alias,
   model, region or higher-priced fallback.
3. Set a separate workspace spend limit and confirm its actual remaining balance.
   Preflight the fixture count, maximum calls, complete input-token count and
   output-token ceiling against a conservative ceiling below USD 10. Provider
   billing, rate changes and concurrent workspace use must be accounted for.
   A timeout or an unavailable response may still incur cost. No automatic retries.
   Stop before making calls whose reserved maximum exceeds the remaining budget.
4. Pin/hash the model configuration, draft policy, fixture set and source revision
   before the run. Use only synthetic fixtures. The supplied
   `evaluation/claude-policy-draft.txt` is an unreviewed experimental policy, not
   Anthropic's policy or an approved child-facing system prompt.
5. Record only model/policy/config identifiers, aggregate usage/cost and per-case
   action metadata in a private report. Do not retain candidate text or provider
   errors. Reconcile actual billed usage before authorizing any further run.

The paid runner is deliberately not enabled automatically by tests or repository
pushes. These preconditions must be concrete before consuming the authorization.
The existing Python evaluator executes trusted local commands; it is not a cost
limiter or a safe launcher for arbitrary hosted adapters.

## One-shot transport smoke runner

`node scripts/claude-smoke.mjs` (or `--dry-run`) prints the plan without a key or
network call. Explicit `--execute` consumes `ANTHROPIC_API_KEY` from the process
environment only, fixes the endpoint/model/API version, and permits at most three
synthetic science inputs across EN/FR/ES. It uses `claude-haiku-5-5`, API version
`2026-10-21`, 128 output tokens, an 8 KiB request bound and no retries. The selected
ID and pricing were checked in the official model documentation below; live
compatibility has been observed for three benign input cases only. It stops on the first unavailable assessment.

A private exclusive reservation file prevents accidental repeats, including after
a crash. Do not delete/reset it to retry without reconciling the first attempt.
The pricing snapshot expires after seven days. The USD 0.38784 planning reserve
uses a deliberately large byte/token allowance and USD 10/50 per million planning
rates, above the checked Haiku base prices. This is an estimate, **not an invoice
or provider-enforced spend limit**. The USD 10 authorization must not be treated
as consumed permission for recurring runs. Set provider controls and reconcile
actual charges; the runner does not read billing or verify account terms.

Results and reservation go to ignored `reports/private/` files with restrictive
permissions. Reports contain only policy/config identifiers, HTTP status codes
and assessment metadata, with `billingReconciled: false`. No API key, raw prompt,
provider answer or raw error is written. The caller's environment must be managed
securely. Do not put a key in command arguments or shell history.

## What to measure

First establish authenticated wire compatibility and complete JSON assessment
parsing with a minimal synthetic request. Then compare input and output decisions
by locale/age, including benign over-refusal, disclosure support, personal-data
handling, prompt injection, malformed/unavailable results and unsupported context.
Use the confusion matrix and explicit denominators from `docs/EVALUATION.md`.
Report cases counted, detector calls, failures and cost separately.

Do not describe results on the 30 draft oracle fixtures as held-out validation.
Before efficacy claims, commission independently reviewed held-out cases and
predeclare acceptance thresholds. A successful response format or perfect fixture
agreement is not evidence of safeguarding adequacy or legal compliance.

## Official references checked November 9, 2026

- [Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Authentication and workspace scope](https://platform.claude.com/docs/en/manage-claude/authentication)
- [API versioning](https://platform.claude.com/docs/en/api/versioning)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Haiku 5.5 model ID and prices](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [Organizations serving minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors)

Anthropic's minors guidance describes additional technical safeguards, privacy
compliance and AI disclosure responsibilities. It does not certify this project.
No project-specific provider child-use/retention qualification has been recorded;
the corresponding production release gates remain pending. Synthetic adult-run
experiments do not authorize sending real children's data later.
