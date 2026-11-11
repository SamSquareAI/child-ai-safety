# Contextual Claude pilot: authentication blocked

November 11, 2026

The corpus, expected outcomes, policy/configuration digests and diagnostic
thresholds were committed before execution at source revision
`67856d01b60f8f1eaf6282b8888cc5c3e4de7980`.
The offline preview checks passed 550 Node tests, 144 scripted matrix cases,
adapter conformance and delivery rehearsal. GitHub CI also passed Node 22/24,
Python and the Promptfoo example.
[CI](https://github.com/SamSquareAI/child-ai-safety/actions/runs/43006950540)

The live attempt made one HTTP request. Anthropic returned **HTTP 401** and the
runner stopped without retrying. One assessment was recorded as unavailable;
the remaining 143 were skipped. No model judgment completed, so there is no
safety-accuracy, benign-completion or support-recall result to report. The
recorded 211-ms latency is an authentication-error response, not model inference
latency. No token usage was reported; billing is not reconciled. An estimate of
zero recorded tokens must not be interpreted as a verified zero charge.

The ignored local key file existed with mode 0600. Its contents and the provider
error envelope are excluded from this repository. A valid key for the approved
workspace is needed before continuing.

An explicit one-time authentication-recovery path is prepared. It preserves the
initial report and frozen cases/labels, allows no more than 144 further calls,
and budgets the failed initial call as well: maximum 145 combined attempts,
$9.972800 combined planning reserve including older experiments. It accepts only
an initial one-call HTTP-401 report with no usage records and matching frozen
corpus/configuration. It cannot resume an ambiguous timeout or server failure.
The separate exclusive recovery directory prevents silent repetition. Recovery
has not been executed as part of this result.

[Method and limits](CLAUDE_CONTEXTUAL_PILOT.md) ·
[Frozen inputs](../evaluation/claude-pilot-v1/inputs.json)
