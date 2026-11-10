# Reviewer brief for the first independent holdout

We are commissioning a synthetic evaluation of how Child AI Safety handles
learner input, generated answers, and requests for help. The assignment is
to write and label fresh cases, review the proposed evaluation criteria, and
review what the gateway delivers once the corpus is frozen. The
[holdout protocol](HOLDOUT_PROTOCOL.md) governs the split and scoring.

## Assign the work

| Role | Deliverable |
| --- | --- |
| Corpus custodian, separate from gateway and prompt tuning | Maintain the private case files, assign scenario-family IDs, check overlap with exposed cases, and freeze the corpus and split. |
| Independent child safeguarding reviewer | Review the [draft policy](POLICY_DRAFT.md), label cases and severity, approve support expectations, and adjudicate disputed labels with the language reviewers. |
| Native-language reviewer for each of English, French, and Spanish | Review language, cultural context, and age appropriateness. Record each locale's labels and any unresolved cases. |
| Evaluation operator | Pin the gateway and provider configuration, collect observations without labels, and give the frozen observations to the custodian for scoring. |

The custodian may arrange separate authors. Reviewers should disclose prior
involvement with prompt tuning or exposed cases so the custodian can assign
independent review. Confirm scope, access, expected effort, and any fee before
reviewers begin.

## Scope the pilot

Start with two review batches. The proposed counts below are for a coverage
pilot. Reviewers can change them before the freeze and should set larger sample
requirements for any claim about real-world rates.

- **Assessment:** 72 fixed-text cases. For each locale and each age profile
  (6–8, 9–11, 12–15, and unknown), include one expected allow, refusal, and
  support case at both the input and output stages. Include plausible benign
  near-neighbors, privacy risks, ambiguous language, and harmful model output.
- **Delivery:** 24 scripted conversations. For each locale and age profile,
  include one benign learning conversation and one conversation where the
  expected delivery changes as context accumulates. Distribute manipulation,
  disclosure, and privacy risks across the latter group. Score the relevant
  turns as well as the whole conversation.
- **Boundaries:** Separately document reproducible cases for a mandatory check
  timing out, a malformed check result, and consent withdrawal before delivery.
  The engineering operator can exercise these with controlled faults.

Record the number of distinct scenario families in each batch. Related
translations or paraphrases belong to the same family. Avoid real child
conversations, direct identifiers, or sensitive media. Send the private corpus
only through the access-controlled channel selected by the custodian.

## Hand off the frozen materials

Use separate private files so the execution operator can run cases without
seeing expected answers.

| Material | Minimum contents |
| --- | --- |
| Case inputs | Case ID, family ID, locale, age profile, task, stage, synthetic text or scripted turns. |
| Review key | Case ID and turn where applicable, expected action and category, severity, acceptable learner-visible behavior, prohibited content, rationale, reviewer references, and adjudication status. |
| Freeze record | Custodian and reviewer assignments, scope and exclusions, overlap check, hashes of inputs and labels, per-slice denominators, thresholds and hard stops, exact policy/model/adapter versions, source commit, execution limits, and approval date. |
| Observation record | Case ID and turn, observed action or failure, delivery outcome, and private review reference for output judged by the reviewers. |

Before provider execution, the custodian confirms both review tracks have
approved labels, the operator can execute from the input file alone, and
unresolved items and their effect on coverage are recorded. The safeguarding
and language reviewers approve thresholds before seeing results. The
maintainer approves the provider, budget, and handling of temporary output
before a paid run. Record each approval with its scope and date.
