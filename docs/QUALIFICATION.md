# Foundation qualification - November 9, 2026

## Later engineering increment on the same date

The foundation observations below describe the earlier checkpoint. The next
increment adds the reference HTTP transport, heuristic local precheck and generic
HTTPS adapter described in [ENGINEERING_STATUS](ENGINEERING_STATUS.md). Current
validation passes 296 Node tests and four Python tests; the 30-case Python oracle
run remains a plumbing check only. Node tests include real loopback HTTP and mock
remote inference, body deadlines, disconnect cancellation, credential revocation,
tenant admission, byte bounds and integrated delivery suppression. Production npm
dependency audit reports no known advisories at this checkpoint. No real remote
model, paid API, child data, Koda integration or independent safety review was used.
The production readiness command correctly exits 1 with pending gates.

## Earlier foundation checkpoint

Status: local prototype. No real classifier, remote model, child data, HTTP service, authenticated tenant onboarding, distributed quota, Koda integration, or paid API call was used. Capabilities are declared compatibility, not evidence of provider approval. A public safety/scale claim is not justified by these results.

## Checks performed

- TypeScript build and 78 Node tests: existing decision-propagation tests plus schema rejection, version/coverage validation, Unicode boundaries, bounded UTF-8 decoding, request deadline, permit lifecycle, shared tenant limits, and overload rejection.
- Four Python tests: independent validation of the same JSON Schema and adapter failure reporting.
- Python-to-Node synthetic fixture run: 30/30 action matches against an **oracle that reads those fixture labels**. This confirms cross-language plumbing only. No semantic detection improvement is measured; draft fixtures still need specialist review.
- Added pinned Ajv runtime dependency and npm lockfile. Production dependency audit returned zero known advisories at check time. This is not an audit of the whole application, the Python dependency set, or future vulnerability status.

## Synthetic load observation

Single local Node.js v24.14.1 process, fixed short text, two simulated assessment delays per allowed request, no network/inference/database, two-second samples. Open-loop scheduled arrivals with bounded total attempts; catch-up arrivals can burst when the local scheduler is delayed. These are observations, not a sustained-load or capacity qualification.

| Offered load | Concurrent limit | Simulated delay per assessment | Attempts | Allowed | Unavailable |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 requests/sec for 2 sec | 32 | 5 ms | 200 | 200 | 0 |
| 500 requests/sec for 2 sec | 4 | 10 ms | 1,000 | 332 | 668 |

The constrained run deliberately rejects work instead of building an unbounded waiting queue. Unavailable counts in this harness reflect synthetic overload; the general gateway response currently merges different unavailable causes. It must gain sanitized operational diagnostics before service operation.

The report includes all-attempt and allowed-only latency, scheduled-arrival p99, scheduler lag, and a final RSS snapshot (not peak memory). Fast rejections must not be presented as fast successful inference. Raw local run outputs stay in ignored `reports/private/`. Machine activity, instrumentation, and later code changes may change numbers. Reproduce rather than copying these into marketing.

```sh
npm run load:synthetic -- --rate 100 --seconds 2 --latency-ms 5 --concurrency 32
npm run load:synthetic -- --rate 500 --seconds 2 --latency-ms 10 --concurrency 4
```

No machine-independent throughput, real detector latency, safety pass rate, or production SLA is established. Longer soak tests, real transport/auth/state/inference, supported deployment targets, and failure injection are still required by ADR-001.

## Security/operational limitations

- Identity/consent callbacks remain trusted integration code. Body authority fields are rejected, but this does not authenticate configured tenant IDs or prove parental authority.
- Admission is per process. A clustered service needs coordinated tenant/billing limits, health management, and transactional revocation handling.
- Cancellation is cooperative; stuck work keeps its slot. Synchronous CPU work cannot be preempted by a JS timer.
- No child response catalog has been independently reviewed. Response IDs are not ready-to-display templates.
- No multi-turn context or history is implemented. No media or executable tool support is implied.
- No raw telemetry/persistence is added to the runtime. The evaluation command executes trusted local code and uses temporary stdout capture; it is not a child-facing service or a subprocess sandbox.
- JSON Schema compilation is trusted local initialization. Deployments disallowing dynamic compilation may need precompiled standalone validators; edge runtime compatibility has not been qualified.

## Next gate

Qualify one real assessment adapter with an explicit privacy/model-capability manifest and an independently reviewed holdout. Add sanitized reason metrics and a bounded authenticated reference transport in a test environment before external pilots. Preserve existing Koda enforcement. Do not turn the fixture oracle into a fallback detector or start sending real traffic to a shadow service.
