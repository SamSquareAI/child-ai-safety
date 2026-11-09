/** Orchestration contract only. Adapters must supply actual safety judgments.
 * No network, telemetry, persistence, templates, or provider SDK is included. */
export type Locale = "en" | "fr" | "es";
export type AgeBand = "6-8" | "9-11" | "12-15" | "unknown";
export type Category = "none" | "privacy" | "harm" | "safeguarding" | "relational";
export type Verdict = "allow" | "refuse" | "support" | "unavailable";
export type Assessment = Readonly<{ verdict: Verdict; category: Category }>;
export type Profile = Readonly<{ ageBand: AgeBand; locale: Locale; task: "learning" }>;
export type Stage = "input" | "output";
export type Result =
  | Readonly<{ action: "allow"; text: string; policyVersion: string }>
  | Readonly<{ action: "refuse" | "support" | "unavailable"; responseId: string; policyVersion: string }>;
export type Assess = (text: string, stage: Stage, profile: Profile, signal: AbortSignal) => Promise<unknown>;
export type Options = {
  /** Backend-resolved profile; never populate directly from a request body. */
  profile: Profile;
  policyVersion: string;
  authorize: (signal: AbortSignal) => Promise<unknown>;
  /** Mandatory local-only check. No provider calls or persistence allowed. */
  localAssess: Assess;
  /** Mandatory approved remote or self-hosted safety check. */
  assess: Assess;
  generate: (text: string, profile: Profile, signal: AbortSignal) => Promise<unknown>;
  stageTimeoutMs?: number;
};
const verdicts: readonly string[] = ["allow", "refuse", "support", "unavailable"];
const categories: readonly string[] = ["none", "privacy", "harm", "safeguarding", "relational"];
function validAssessment(raw: unknown): raw is Assessment {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const a = raw as Record<string, unknown>;
  return Object.keys(a).length === 2 && verdicts.includes(String(a.verdict)) &&
    categories.includes(String(a.category)) && typeof a.verdict === "string" && typeof a.category === "string" &&
    (a.verdict === "allow" ? a.category === "none" : a.verdict === "unavailable" ? a.category === "none" : a.category !== "none");
}
const validText = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;

/** Trusted adapters must honor AbortSignal. A timeout suppresses delivery but
 * cannot forcibly undo external work performed by a non-cooperating adapter. */
async function bounded<T>(fn: (signal: AbortSignal) => Promise<T>, timeout: number, parent?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectAbort = () => { ctrl.abort(); reject(new Error("unavailable")); }; });
  parent?.addEventListener("abort", rejectAbort, { once: true });
  try {
    if (parent?.aborted) throw new Error("unavailable");
    timer = setTimeout(rejectAbort, timeout);
    return await Promise.race([Promise.resolve().then(() => fn(ctrl.signal)), stopped]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    parent?.removeEventListener("abort", rejectAbort);
    ctrl.abort();
  }
}

export function createGateway(options: Options) {
  if (!options || !options.profile) throw new TypeError("Trusted gateway configuration required");
  const profile = Object.freeze({ ageBand: options.profile.ageBand, locale: options.profile.locale, task: options.profile.task });
  if (!["6-8", "9-11", "12-15", "unknown"].includes(profile.ageBand) ||
      !["en", "fr", "es"].includes(profile.locale) || profile.task !== "learning" ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(options.policyVersion)) throw new TypeError("Unsupported policy configuration");
  const { authorize, localAssess, assess, generate, policyVersion } = options;
  if ([authorize, localAssess, assess, generate].some(fn => typeof fn !== "function")) throw new TypeError("All safety stages are mandatory");
  const timeout = options.stageTimeoutMs ?? 5000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new TypeError("Invalid timeout");
  const stop = (action: "refuse" | "support" | "unavailable", category: Category = "none"): Result =>
    Object.freeze({ action, responseId: `${profile.locale}.${action}.${category}`, policyVersion });
  return Object.freeze({
    async run(input: unknown, signal?: AbortSignal): Promise<Result> {
      if (!validText(input, 4000)) return stop("unavailable");
      const permitted = async () => {
        if (await bounded(authorize, timeout, signal) !== true) throw new Error("unavailable");
      };
      const inspect = async (fn: Assess, text: string, stage: Stage) => {
        const raw = await bounded(s => fn(text, stage, profile, s), timeout, signal);
        if (!validAssessment(raw)) return stop("unavailable");
        return raw.verdict === "allow" ? null : stop(raw.verdict, raw.category);
      };
      try {
        await permitted();
        const localIn = await inspect(localAssess, input, "input");
        if (localIn) return localIn;
        await permitted();
        const remoteIn = await inspect(assess, input, "input");
        if (remoteIn) return remoteIn;
        await permitted();
        const output = await bounded(s => generate(input, profile, s), timeout, signal);
        if (!validText(output, 8000)) return stop("unavailable");
        // Local output checks precede remote assessment to avoid forwarding
        // detected identifiers or disclosures to a second service.
        const localOut = await inspect(localAssess, output, "output");
        if (localOut) return localOut;
        await permitted();
        const remoteOut = await inspect(assess, output, "output");
        if (remoteOut) return remoteOut;
        await permitted();
        return Object.freeze({ action: "allow", text: output, policyVersion });
      } catch {
        // Never serialize adapter errors, raw candidates, or detector evidence.
        return stop("unavailable");
      }
    }
  });
}
