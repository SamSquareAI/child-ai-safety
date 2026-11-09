/** Orchestration contract only. Adapters must supply actual safety judgments.
 * No network, telemetry export, persistence, templates, or provider SDK is included. */
import { validAssessment, validAuthority, validCapabilities, validIdentifier, validProfile, validRequest } from "./protocol.js";
import type { Admission } from "./admission.js";
export type Locale = "en" | "fr" | "es";
export type AgeBand = "6-8" | "9-11" | "12-15" | "unknown";
export type Category = "none" | "privacy" | "harm" | "safeguarding" | "relational";
export type Verdict = "allow" | "refuse" | "support" | "unavailable";
export type Assessment = Readonly<{ verdict: Verdict; category: Category }>;
export type Profile = Readonly<{ ageBand: AgeBand; locale: Locale; task: "learning" }>;
export type Stage = "input" | "output";
export type Capabilities = Readonly<{ protocolVersion: "1"; id: string; revision: string; modality: "text"; locales: readonly Locale[]; ageBands: readonly AgeBand[]; stages: readonly Stage[] }>;
export type Receipt = Readonly<{ protocolVersion: "1"; policyVersion: string; detectorId: string; detectorRevision: string }>;
export type Result = Receipt & (
  | Readonly<{ action: "allow"; text: string }>
  | Readonly<{ action: "refuse" | "support" | "unavailable"; responseId: string }>);
export type Assess = (text: string, stage: Stage, profile: Profile, signal: AbortSignal) => Promise<unknown>;
const reasons = ["allowed", "refused", "supported", "invalid_request", "cancelled", "capacity", "authorization_denied", "stage_timeout", "request_timeout", "adapter_error", "invalid_assessment", "detector_unavailable", "invalid_generation"] as const;
const phases = ["request", "authorization", "local_input", "remote_input", "generation", "local_output", "remote_output", "delivery"] as const;
export type DiagnosticReason = typeof reasons[number];
export type DiagnosticPhase = typeof phases[number];
export type Diagnostics = Readonly<{ counts: Readonly<Record<DiagnosticReason, number>>; byPhase: Readonly<Record<DiagnosticPhase, Readonly<Record<DiagnosticReason, number>>>> }>;
// Internal typed failures: never classify arbitrary adapter exception strings.
class GatewayFailure extends Error {
  constructor(readonly reason: DiagnosticReason) { super("unavailable"); }
}
export type Options = {
  /** Backend-resolved profile; never populate directly from a request body. */
  profile: Profile;
  policyVersion: string;
  /** Trusted backend identity, never taken from the wire request body. */
  authority: Readonly<{ tenantId: string; applicationId: string }>;
  detector: Capabilities;
  /** Shared process-wide controller; distributed deployment needs extra controls. */
  admission: Admission;
  authorize: (signal: AbortSignal) => Promise<unknown>;
  /** Mandatory local-only check. No provider calls or persistence allowed. */
  localAssess: Assess;
  /** Mandatory approved remote or self-hosted safety check. */
  assess: Assess;
  generate: (text: string, profile: Profile, signal: AbortSignal) => Promise<unknown>;
  stageTimeoutMs?: number;
  requestTimeoutMs?: number;
};
// JSON Schema counts Unicode code points, not JavaScript UTF-16 code units.
const validText = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max * 2 && x.trim().length > 0 && [...x].length <= max;

/** Trusted adapters must honor AbortSignal. A timeout suppresses delivery but
 * cannot forcibly undo external work performed by a non-cooperating adapter. */
async function bounded<T>(fn: (signal: AbortSignal) => Promise<T>, timeout: number, parent: AbortSignal, pending: Set<Promise<unknown>>, deadlineReason: "stage_timeout" | "request_timeout"): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectAbort = () => { ctrl.abort(); reject(new GatewayFailure(deadlineReason)); }; });
  parent?.addEventListener("abort", rejectAbort, { once: true });
  try {
    if (parent?.aborted) throw new Error("unavailable");
    timer = setTimeout(rejectAbort, timeout);
    const work = Promise.resolve().then(() => {
      if (ctrl.signal.aborted || parent.aborted) throw new Error("unavailable");
      return fn(ctrl.signal);
    });
    pending.add(work);
    void work.then(() => pending.delete(work), () => pending.delete(work));
    return await Promise.race([work, stopped]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    parent?.removeEventListener("abort", rejectAbort);
    ctrl.abort();
  }
}

export function createGateway(options: Options) {
  if (!options || !options.profile) throw new TypeError("Trusted gateway configuration required");
  if (!validProfile(options.profile) || !validIdentifier(options.policyVersion) || !validAuthority(options.authority)) {
    throw new TypeError("Unsupported policy configuration");
  }
  const profile = Object.freeze({ ageBand: options.profile.ageBand, locale: options.profile.locale, task: options.profile.task });
  if (!validCapabilities(options.detector)) throw new TypeError("Unsupported detector capabilities");
  const detector = Object.freeze({ ...options.detector,
    locales: Object.freeze([...options.detector.locales]), ageBands: Object.freeze([...options.detector.ageBands]), stages: Object.freeze([...options.detector.stages]) });
  if (!detector.locales.includes(profile.locale) || !detector.ageBands.includes(profile.ageBand)) throw new TypeError("Unsupported detector profile");
  if (!options.admission || typeof options.admission.acquire !== "function") throw new TypeError("Shared admission controller required");
  const { admission } = options;
  const tenantId = options.authority.tenantId;
  const { authorize, localAssess, assess, generate, policyVersion } = options;
  if ([authorize, localAssess, assess, generate].some(fn => typeof fn !== "function")) throw new TypeError("All safety stages are mandatory");
  const timeout = options.stageTimeoutMs ?? 5000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new TypeError("Invalid timeout");
  const requestTimeout = options.requestTimeoutMs ?? 15000;
  if (!Number.isInteger(requestTimeout) || requestTimeout < 1 || requestTimeout > 120000) throw new TypeError("Invalid request timeout");
  const receipt: Receipt = Object.freeze({ protocolVersion: "1", policyVersion, detectorId: detector.id, detectorRevision: detector.revision });
  const stop = (action: "refuse" | "support" | "unavailable", category: Category = "none"): Result =>
    Object.freeze({ ...receipt, action, responseId: `${profile.locale}.${action}.${category}` });
  const emptyCounts = () => Object.fromEntries(reasons.map(reason => [reason, 0])) as Record<DiagnosticReason, number>;
  const counts = emptyCounts();
  const byPhase = Object.fromEntries(phases.map(phase => [phase, emptyCounts()])) as Record<DiagnosticPhase, Record<DiagnosticReason, number>>;
  const record = (reason: DiagnosticReason, phase: DiagnosticPhase) => {
    counts[reason] = Math.min(Number.MAX_SAFE_INTEGER, counts[reason] + 1);
    byPhase[phase][reason] = Math.min(Number.MAX_SAFE_INTEGER, byPhase[phase][reason] + 1);
  };
  async function run(input: unknown, signal?: AbortSignal): Promise<Result> {
      let phase: DiagnosticPhase = "request";
      const unavailable = (reason: DiagnosticReason) => { record(reason, phase); return stop("unavailable"); };
      if (!validText(input, 4000)) return unavailable("invalid_request");
      if (signal?.aborted) return unavailable("cancelled");
      const release = admission.acquire(tenantId);
      if (!release) return unavailable("capacity");
      const controller = new AbortController();
      const started = performance.now();
      const timer = setTimeout(() => controller.abort(), requestTimeout);
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const pending = new Set<Promise<unknown>>();
      const call = <T>(fn: (s: AbortSignal) => Promise<T>) => {
        const remaining = requestTimeout - (performance.now() - started);
        if (remaining <= 0 || controller.signal.aborted) return Promise.reject<T>(new Error("unavailable"));
        return bounded(fn, Math.min(timeout, remaining), controller.signal, pending, remaining <= timeout ? "request_timeout" : "stage_timeout");
      };
      const permitted = async () => {
        phase = "authorization";
        if (await call(authorize) !== true) throw new GatewayFailure("authorization_denied");
      };
      const inspect = async (fn: Assess, text: string, stage: Stage, diagnosticPhase: DiagnosticPhase) => {
        phase = diagnosticPhase;
        const raw = await call(s => fn(text, stage, profile, s));
        if (!validAssessment(raw)) return unavailable("invalid_assessment");
        const assessed = raw as Assessment;
        if (assessed.verdict === "unavailable") return unavailable("detector_unavailable");
        if (assessed.verdict === "refuse" || assessed.verdict === "support") record(assessed.verdict === "refuse" ? "refused" : "supported", phase);
        return assessed.verdict === "allow" ? null : stop(assessed.verdict, assessed.category);
      };
      try {
        await permitted();
        const localIn = await inspect(localAssess, input, "input", "local_input");
        if (localIn) return localIn;
        await permitted();
        const remoteIn = await inspect(assess, input, "input", "remote_input");
        if (remoteIn) return remoteIn;
        await permitted();
        phase = "generation";
        const output = await call(s => generate(input, profile, s));
        if (!validText(output, 8000)) return unavailable("invalid_generation");
        // Local output checks precede remote assessment to avoid forwarding
        // detected identifiers or disclosures to a second service.
        const localOut = await inspect(localAssess, output, "output", "local_output");
        if (localOut) return localOut;
        await permitted();
        const remoteOut = await inspect(assess, output, "output", "remote_output");
        if (remoteOut) return remoteOut;
        await permitted();
        phase = "delivery";
        if (controller.signal.aborted || performance.now() - started >= requestTimeout) return unavailable(signal?.aborted ? "cancelled" : "request_timeout");
        record("allowed", phase);
        return Object.freeze({ ...receipt, action: "allow", text: output });
      } catch (error) {
        // Never serialize adapter errors, raw candidates, or detector evidence.
        return unavailable(signal?.aborted ? "cancelled" : controller.signal.aborted || performance.now() - started >= requestTimeout ? "request_timeout" : error instanceof GatewayFailure ? error.reason : "adapter_error");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        controller.abort();
        // A timed-out non-cooperating adapter still consumes capacity. Keep its
        // permit until actual settlement, rather than pretending work stopped.
        if (pending.size) void Promise.allSettled([...pending]).then(release);
        else release();
      }
  }
  return Object.freeze({
    run,
    /** Trusted operators only. Fixed cardinality; no content, IDs or raw errors. */
    diagnostics(): Diagnostics {
      return Object.freeze({ counts: Object.freeze({ ...counts }), byPhase: Object.freeze(Object.fromEntries(phases.map(phase => [phase, Object.freeze({ ...byPhase[phase] })]))) }) as Diagnostics;
    },
    async handle(request: unknown, signal?: AbortSignal): Promise<Result> {
      // Authority/profile cannot be supplied on the language-neutral request.
      if (!validRequest(request)) { record("invalid_request", "request"); return stop("unavailable"); }
      return run((request as { input: string }).input, signal);
    }
  });
}
