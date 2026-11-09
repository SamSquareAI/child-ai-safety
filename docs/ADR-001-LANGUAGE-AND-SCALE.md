# ADR-001: languages, boundaries, and scale qualification

Date: November 9, 2026. Status: **proposed architecture; capacity and safety not qualified**. This supersedes any interpretation that the existing TypeScript scaffold is the complete commercial architecture. Research/documentation only; no runtime migration, model deployment, paid evaluation, or production change.

## Executive decision

Keep strict TypeScript for the small policy/orchestration core, Node-based gateway, first JavaScript SDK, and future operator UI. Add Python for evaluation, model development, and an optional separately deployed detector service. Use an existing inference runtime appropriate to the chosen detector rather than implementing a model server in JavaScript or Python application handlers. Small compatible models may run through native ONNX bindings after measurement; no blanket claim that JavaScript cannot run ML.

Make the contract language-independent. Support a Python client of the same service; do not independently rewrite the policy engine in each SDK. Package runtime code so it can run in an ordinary container; optional edge adapters must not become the only deployment method. Separate customer-facing runtime from tenant/policy administration and research workloads. Start with few deployable units, not a fleet of microservices.

No evidence yet justifies Go/Rust migration. Revisit if representative profiles show gateway CPU, memory, tail latency, deployment requirements, or a buyer's local-agent constraints justify the additional maintenance cost. Team expertise is a legitimate deciding factor; language choice is not a substitute for domain expertise or tested controls.

## Evidence and limits

Reviewed official Node/TypeScript/Python/Go/Rust documentation, inference-runtime guides, Cloudflare consistency/limits/logging documentation, policy/schema guidance, and the current standalone source at initial commit `610ebc3`. No language comparison or load benchmark has been run. No customer RPS, latency SLO, workload mix, region, GPU model, or pricing requirement was supplied. Findings below distinguish documented capabilities from our design judgments. Vendor examples and generic throughput claims are not SamSquare benchmarks.

### What the languages actually provide

| Choice | Good fit | Principal trade-off | Decision |
| --- | --- | --- | --- |
| Strict TypeScript on Node | I/O orchestration, JSON APIs, developer integrations, operator UI | CPU-heavy JavaScript, synchronous parsers/regex, and memory pressure can stall concurrent work; types disappear at runtime | Keep for core/gateway; validate all boundaries at runtime |
| Python | Detector experimentation, datasets, evaluation, ML adapters | Async alone does not accelerate CPU/GPU workloads; dependency/model isolation and worker lifecycle still matter | Add for ML/evaluation, not as a compulsory rewrite of all services |
| Go | Network gateways, concurrency, standalone deployment | New language and duplicated policy work if introduced casually; no demonstrated benefit on this workload yet | Candidate if profiling/customer requirements justify it |
| Rust | Carefully bounded parsing/normalization kernels, native/WASM modules, constrained agents | Ownership/FFI/unsafe/native dependencies and team maintenance; does not fix policy mistakes | Selective later option, not default rewrite |
| Plain JavaScript alone | Small integrations and tests | Less static checking during security-sensitive refactors | Keep production implementation in strict TypeScript; JS tests remain reasonable |

Node's documentation explains event-loop blocking risks and distinguishes CPU work from asynchronous I/O. Worker threads can help CPU-intensive JavaScript; they are not a reason to spawn a thread per HTTP call. Python has its own asynchronous concurrency facilities. Neither language makes a blocking model call nonblocking merely because a function says `async`. [Node event loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop), [worker threads](https://nodejs.org/api/worker_threads.html), [Python tasks](https://docs.python.org/3/library/asyncio-task.html), [FastAPI concurrency](https://fastapi.tiangolo.com/async/)

TypeScript annotations are erased; compile-time correctness does not validate hostile HTTP JSON or a provider response. Use explicit schema validation and bounded decoding. Rust's ownership supports memory safety without a tracing collector; that does not imply child-safety correctness or protection across unsafe/native boundaries. [TypeScript](https://www.typescriptlang.org/docs/handbook/2/basic-types.html), [Rust ownership](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html), [Go documentation](https://go.dev/doc/)

## Four architectures considered

1. **All TypeScript, including custom model-serving and evaluation infrastructure.** Attractive shared tooling, but needlessly fights the ecosystem when training/calibrating detectors. Native inference remains possible; use it selectively rather than ruling it out.
2. **All Python.** Entirely viable for an ML-centric team, and NeMo demonstrates a Python SDK/server architecture. We would lose some direct Koda/JS integration convenience and still need runtime boundaries and scalable serving. Not rejected as inherently slow. [NeMo architecture](https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/how-it-works)
3. **Go or Rust gateway plus Python ML from day one.** Viable for a systems-heavy team with concrete constraints. Currently no measured requirement offsets migration, deployment, and policy parity costs.
4. **TypeScript gateway plus Python ML/evaluation, linked by stable contracts.** Recommended for current Koda/Node expertise and provider-orchestration workload. Added language cost is contained by a clear service boundary and thin clients. Do not add Python to production if the chosen approved remote classifier makes it unnecessary; offline evaluation can come first.

We should test existing orchestration libraries against the child-policy requirements, not automatically rebuild a framework. Generic policy engines such as OPA decide over structured inputs; they do not semantically determine whether a child disclosure is safe. A small explicit decision table is sufficient initially. Introduce Rego/CEL or another DSL only when policy authoring/versioning requirements justify the complexity. [OPA policy language](https://www.openpolicyagent.org/docs/policy-language)

## Product boundary before infrastructure

Offer a backend SDK and a self-hostable reference service first. A hosted service can follow privacy/tenant qualification. Browser/mobile SDKs must not receive provider secrets or constitute enforcement.

Two integration modes have different guarantees:

- **Assessment API:** customer sends input/output for decisions and enforces those decisions in its own backend. We cannot guarantee that the customer actually checked every output or prevented direct access to its model.
- **Enforcement gateway:** customer routes model work through the gateway and restricts direct provider access. This can mediate supported flows, but cannot secure independent endpoints, tools, or providers outside that boundary.

Do not advertise generic API compatibility as universal safety. Qualify provider, model/version, age profile, locale, modality, feature, renderer, and deployment. The customer's assertion of consent/age is an integration trust boundary, not our independent verification of parenthood. Define the applicable assurance contract explicitly.

## Target architecture

```text
Customer backend / Koda
   -> authenticated admission + tenant scope + resource limits
   -> runtime policy gateway (TypeScript/Node, container-compatible)
       -> local privacy/disclosure checks
       -> approved detector API (external approved service OR isolated inference)
       -> constrained generation adapter when gateway mode is used
       -> local and semantic output checks, final authorization, safe delivery

Management service: tenant identity, key lifecycle, policy publication, release approvals
   -> regional metadata database and signed immutable policy artifacts

Python research/evaluation jobs: synthetic/approved datasets -> offline reports
   -> reviewed detector/policy release; never direct mutation of production

Inference service (when needed): private authenticated endpoint, bounded queue,
   pinned model/runtime, independently scaled CPU/GPU capacity
```

These are logical responsibilities. Initially the gateway and management API can share one codebase with separated routes/permissions, while inference runs independently only if needed. Keep prompt-bearing requests off the management path. API replicas should be stateless with respect to identity/permissions; any necessary short-lived conversation risk state is explicitly stored, TTL-bounded, tenant-scoped, and subject to deletion. Do not interpret stateless replicas as evidence that multi-turn safety needs no state.

## Model-serving decision

Python should support evaluation/training/calibration, not a custom unbounded GPU scheduler inside a web handler. For a small encoder/classifier, compare native ONNX CPU serving with an appropriate dedicated service. For a supported generative guard model, evaluate vLLM or Triton-family serving based on exact model compatibility, hardware, maintained version, batching behavior, security surface, and license. Do not force a large generative guard model when a smaller qualified detector achieves the required result.

ONNX Runtime has Node bindings; this is a counterexample to the claim that ML inference requires a Python HTTP service. Triton supports dynamic batching for compatible stateless models; additional waiting to fill a batch trades latency for utilization, so measure its effect. vLLM exposes queue and inference latency metrics. Neither server automatically supplies multitenant privacy or application authentication. [ONNX Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html), [Triton batcher](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/batcher.html), [vLLM metrics](https://docs.vllm.ai/en/latest/usage/metrics/), [vLLM security](https://docs.vllm.ai/en/latest/usage/security/), [Triton security](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/customization_guide/deploy.html)

Check maintenance rather than adopting a familiar name: TorchServe's official documentation currently says there are no planned updates, bug fixes, or security patches. Do not choose it for a new child-safety production service on brand familiarity alone. [TorchServe status](https://docs.pytorch.org/serve/)

Keep inference endpoints private; disable dynamic model upload, arbitrary runtime code, untrusted pickle/model loading, and developer administration routes. Verify artifact digests and model license/use terms. Isolate untrusted text/image parsing from the administrative host and credentials. Shared prefix/media caches, batched requests, and identifiers need tenant isolation tests; start with content caching disabled.

## Contract and policy portability

Define versioned JSON Schema/OpenAPI contracts for context, assessment, detector capability, and final decisions. Generate client types where useful, but run independent runtime validation on server and client boundaries. Reject unknown fields where appropriate, bound arrays/strings/nesting/bytes, and never allow supplied schemas to resolve remote references. Schemas do not replace semantic policy or transport limits. [JSON Schema objects](https://json-schema.org/understanding-json-schema/reference/object)

Keep one authoritative policy evaluator. Python provides detector signals and evaluation orchestration; SDKs call the service or canonical embedded core rather than translating independent policy logic. Cross-language golden tests must cover action precedence, time handling, Unicode, unsupported locale/age, malformed results, and version negotiation.

Record policy digest, detector/model revision, prompt/configuration revision, profile, supported modalities, and decision outcome in an appropriately minimized receipt. Validate each request under one immutable configuration snapshot. A customer cannot silently weaken the minimum supported child-protection policy through a prompt or arbitrary JavaScript callback. Tenant-authored executable plugins require an explicit isolated extension model; they cannot run in the privileged gateway process.

## Tenancy, privacy, and isolation requirements

1. Resolve tenant from authenticated credentials, never solely from a body field. Bind authorization to tenant, application, operation, profile eligibility, policy version, and expiry. Separate billing/account permissions from content-processing authority.
2. Tenant-scope database rows, queue messages, caches, artifact keys, metrics, credentials, circuit breakers, and session state. Test cross-tenant attempts and one tenant exhausting shared capacity. Do not use a global cooldown triggered by a single customer's bad key.
3. Use strong first-party authorization state for revocation. Short-lived credentials limit exposure but do not provide immediate revocation by themselves. Define and test the permitted propagation bound and in-flight cancellation behavior.
4. Default raw content persistence and cross-tenant prompt caching to off. Do not assume a hash of a short sensitive phrase is anonymous. Review native inference caches, crash dumps, swap, traces, request-body logging, and support exports. No language promises reliable immediate erasure of every memory copy.
5. Regional deployment covers model calls, classifiers, auth/state stores, logs, backups, support access, and subprocessors. A nearby edge point or encrypted traffic alone is not data-residency evidence. Region failover must not violate the customer's approved data path.
6. If using PostgreSQL for metadata, non-owner application roles and correctly scoped transactions can support row-level security. Table owners/superusers and misconfigured pooling can bypass intended isolation; write negative tests rather than relying on the feature name. Do not introduce a new database into Koda for this research. [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## Cloudflare fit and limits

Use Cloudflare where it helps: optional ingress/WAF, lightweight TypeScript validation/orchestration, static operator UI, and coordinated state through appropriately scoped services. The reference gateway should still run without Cloudflare. A portable Node container is the proposed default qualification target; Workers is an additional target tested separately.

Ordinary Workers document a 128 MB memory limit and CPU limits. They can call remote inference, but are not an appropriate assumption for loading large model weights. This does not rule out separate Workers AI, containers, or external inference services; those need their own capabilities, terms, residency, and performance review. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

KV is eventually consistent, so do not make it the sole authority for immediate consent withdrawal, session revocation, hard quota enforcement, or emergency policy disablement. Use authoritative coordinated/transactional state and define propagation. Durable Objects can coordinate scoped state, but a single global object can become a bottleneck; the published per-object soft limit is not a throughput guarantee for our workload. [KV behavior](https://developers.cloudflare.com/kv/concepts/how-kv-works/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

Do not insert an AI proxy without a privacy review. Cloudflare AI Gateway has configurable logging, including request-level overrides. If selected, sanitize/drop client override headers, verify content logs and caching settings, and test downstream exporters/metadata. Gateway-level settings alone must not be assumed to enforce a no-content-storage promise. [AI Gateway logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)

## Scale model and economics

No measured capacity is claimed. Active accounts and monthly users are not throughput specifications. Define peak incoming requests/second, input/output size distributions, concurrency, locale/modality mix, number of detectors, generation length, region, and percentile latency objective.

For a permitted text-generation request, a minimal pipeline can incur two semantic checks plus generation; optional second detectors add more work. Let lambda be incoming requests/sec, r the fraction reaching generation, and k the mean detector calls per incoming request. Inference demand is approximately lambda*k detector calls/sec and lambda*r generation calls/sec. Count authorization/state operations separately. Rejected inputs can still consume detector work.

Illustration only: 1,000 requests/sec at two seconds average service time means about 2,000 concurrent requests by Little's Law, under steady-state assumptions. At 32 KB buffered data each, that is roughly 64 MB before object overhead, string encodings, copies, native allocations, and runtime memory. This is not a Worker capacity estimate; it explains why concurrency and buffering need limits. Long generations and outage tails can dominate.

Measure gateway overhead separately from network, authorization, classifier queue/inference, and generation latency. Serial checks have cumulative latency, and p99 values cannot simply be added as if independent percentiles. Parallelize only independent checks that do not violate privacy/consent precedence. Do not parallelize generation ahead of an input decision to improve an apparent latency figure.

Cost per completed protected interaction includes detector calls/tokens, generation when proxied, CPU/GPU time, unused warm capacity, state reads/writes, observability, egress, support, and review/incident operations. Failed or refused calls can incur costs. Compare hosted detectors with self-hosting at actual utilization; no GPU break-even claim without a model/hardware/batch/traffic profile and current quotes. Do not buy infrastructure against an invented million-user forecast.

## Required runtime controls before a pilot

- Overall request deadline and per-stage budgets; propagated cancellation and no retries beyond remaining budget.
- Admission control before expensive work; bounded per-tenant and global concurrency; small bounded queues; load shedding with safe unavailability.
- Separate provider errors, user refusals, missing consent, and infrastructure unavailability in safe internal reason codes. Do not map all errors to an opaque result if operators need to diagnose outages; do not log raw exceptions or input to achieve diagnostics.
- Approved equivalent failover only. If mandatory safety is unavailable, no unreviewed content delivery. Fail-closed behavior protects content safety but still consumes the availability error budget.
- Immutable policy snapshots; revocation/kill-switch propagation; graceful shutdown/draining; schema/backward-compatibility checks and rollback.
- CPU work isolation and hostile-input tests: pathological regex, deep JSON, large Unicode, compressed bodies, image decompression, long tokenization, and expensive schema validation. JS timers cannot preempt synchronous event-loop-blocking code; another runtime also needs hard process/resource limits.
- Metadata-only tracing by default, sanitized cardinality-limited metrics, and permissioned operational audit. Telemetry failure must not expose child content. Mandatory security audit failures need an explicit deny/degrade policy; no raw prompt queue as a substitute.

## Prototype assessment

Keep its strict TypeScript build, small dependency-free core, explicit decision states, stage validation, no default telemetry, cancellation tests, and rejected-output suppression. Its 66 tests check mocked behavior only.

Before calling it a service, add authenticated tenant/application context; runtime schemas for all configuration/protocol inputs; version/capability-aware adapters; real qualified detection; an overall deadline; byte-bounded transports; resource admission; minimized diagnostics; and conformance tests. Boolean `authorize` and freely supplied callback functions are acceptable scaffolding inside a trusted application but not a security boundary for arbitrary SaaS customers. A final authorization read is not an atomic delivery guarantee.

The current contract covers one request string with no conversation history. It cannot yet claim multi-turn safety. Plan privacy-minimized context/risk-state support and separate evaluation before advertising that capability. The `unknown` age label alone does not implement a restrictive policy; a qualified canonical policy must do that.

## Qualification experiments before expanding implementation

1. **Protocol:** write schema and authority boundaries first. Define successful safe refusal versus unavailable infrastructure, and audit the existing scaffold against the contract.
2. **No-inference load baseline:** fixed synthetic inputs and deterministic mock latency; exercise authorization and realistic payload parsing. Sweep 10, 100, then 1,000 offered requests/sec where hardware permits. These are load-generator settings, not supported-capacity promises. Use open-loop arrival rates to avoid hiding overload with closed-loop clients.
3. **Real detector:** pin exact model/runtime/hardware and compare short/long inputs, language mix, batching delay, warm/cold startup, saturation, and output sizes. Paid runs require a separate explicit cost cap.
4. **Isolation:** malicious/slow tenant alongside well-behaved tenant, key rotation, revocation, expired contexts, stale policy, model restart, unavailable auth store, full queues, logging exporter failure, and safe region-failover refusal.
5. **Safety parity:** held-out benign and adversarial data with specialist review; export/quantization/batching changes must preserve measured behavior. Performance improvements that weaken protection fail qualification.
6. **Language comparison only if needed:** compare equivalent Node and Python gateway shells against the same inference endpoint, serialization, policy, connections, replicas, cores, and arrival distribution. Build a Go/Rust spike only if a profile shows gateway cost rather than inference dominates.

Report p50/p95/p99, queue time, event-loop lag, CPU, RSS, GC/native memory, detector calls, refusals/unavailability, error rate, and cost/1,000 completed interactions. Include attempted requests and rejected load. Use constrained hardware budgets and long enough soak tests to reveal leaks; do not report a single microbenchmark as product throughput.

Set product SLOs after the first data, with separate gateway-added latency, detector latency, end-to-end delivery, availability, revocation bound, and safety acceptance gates. A small latency number without a supported model/profile/region is not an SLA.

## Recommended next work

Keep this ADR proposed until contract and benchmark results are reviewed. Add the protocol/schema and capability declarations next, then overall deadline/admission controls and a local synthetic load harness. Develop the Python evaluation client without duplicating canonical policy. Choose a detector based on privacy, child-specific measured behavior, model terms, and serving feasibility. Add a production Python service only when needed. Kubernetes, multi-region active-active, customer plugins, a custom policy DSL, and model training remain deferred until justified.

Decision triggers: migrate a hot component when its measured contribution prevents meeting an agreed SLO/cost envelope after straightforward isolation/replication fixes; introduce dedicated tenancy when required by contract/isolation evidence; add a region when legal/customer needs justify it; choose self-host inference when privacy or measured utilization economics supports it. No blanket promise of unlimited scale and no language rewrite for appearance.
