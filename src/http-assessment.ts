import type { Assess, Assessment, Capabilities } from "./gateway.js";
import { validAssessment, validCapabilities, validProfile } from "./protocol.js";

/** Trusted backend configuration, never populated from a wire request. */
export type HttpAssessmentConfig = Readonly<{
  endpoint: string;
  capabilities: Capabilities;
  timeoutMs: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  /** Trusted Fetch implementation; must honor redirect/credential settings and cancellation. */
  fetch?: typeof globalThis.fetch;
}>;

const unavailable: Assessment = Object.freeze({ verdict: "unavailable", category: "none" });
const encoder = new TextEncoder();

// Reject accessors, inherited configuration, symbols, and unexpected fields.
function dataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => typeof key === "string" && keys.includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.get === undefined
    && Object.getOwnPropertyDescriptor(value, key)?.set === undefined);
}
function limit(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}
function cancel(stream: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null): void {
  // Cleanup must not extend a deadline or expose transport errors.
  try { void stream?.cancel().catch(() => {}); } catch { /* no diagnostics containing remote data */ }
}

/** Proposed detector protocol v1, not a vendor API or a qualification claim. */
export function createHttpAssessmentAdapter(config: HttpAssessmentConfig): Readonly<{ assess: Assess; capabilities: Capabilities }> {
  if (!dataObject(config, ["endpoint", "capabilities", "timeoutMs", "maxRequestBytes", "maxResponseBytes", "fetch"])) {
    throw new TypeError("Invalid HTTP assessment configuration");
  }
  const { endpoint, capabilities: declared, timeoutMs, maxRequestBytes, maxResponseBytes } = config;
  if (typeof endpoint !== "string" || endpoint.length > 2048 || /[\s\\]/u.test(endpoint) || !endpoint.startsWith("https://")) {
    throw new TypeError("Invalid HTTP assessment endpoint");
  }
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new TypeError("Invalid HTTP assessment endpoint"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash
    || endpoint.slice(8).split(/[/?#]/u, 1)[0]?.includes("@")) {
    throw new TypeError("Invalid HTTP assessment endpoint");
  }
  if (!limit(timeoutMs, 30000) || !limit(maxRequestBytes, 65536) || !limit(maxResponseBytes, 16384)) {
    throw new TypeError("Invalid HTTP assessment bounds");
  }
  if (!dataObject(declared, ["protocolVersion", "id", "revision", "modality", "locales", "ageBands", "stages"])
    || !validCapabilities(declared)) throw new TypeError("Invalid HTTP assessment capabilities");
  const capabilities: Capabilities = Object.freeze({ ...declared,
    locales: Object.freeze([...declared.locales]), ageBands: Object.freeze([...declared.ageBands]), stages: Object.freeze([...declared.stages]) });
  const fetcher = config.fetch ?? globalThis.fetch;
  if ((config.fetch !== undefined && typeof config.fetch !== "function") || typeof fetcher !== "function") {
    throw new TypeError("Invalid HTTP assessment fetch");
  }
  const target = url.href;

  const assess: Assess = async (text, stage, profile, parent) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let abort: (() => void) | undefined;
    const controller = new AbortController();
    try {
      if (!(parent instanceof AbortSignal) || parent.aborted || typeof text !== "string"
        || (stage !== "input" && stage !== "output")
        || text.length > (stage === "input" ? 4000 : 8000) * 2 || !text.trim()
        || [...text].length > (stage === "input" ? 4000 : 8000)
        || !dataObject(profile, ["ageBand", "locale", "task"]) || !validProfile(profile)
        || !capabilities.stages.includes(stage) || !capabilities.locales.includes(profile.locale)
        || !capabilities.ageBands.includes(profile.ageBand)) return unavailable;
      // Text is bounded before serialization/encoding; encoded JSON has a second, exact byte bound.
      const body = encoder.encode(JSON.stringify({ protocolVersion: "1", text, stage,
        profile: { ageBand: profile.ageBand, locale: profile.locale, task: profile.task } }));
      if (body.byteLength > maxRequestBytes) return unavailable;
      const started = performance.now();
      const stopped = new Promise<never>((_, reject) => {
        abort = () => { controller.abort(); reject(new Error("unavailable")); };
      });
      parent.addEventListener("abort", abort!, { once: true });
      timer = setTimeout(abort!, timeoutMs);
      const check = () => {
        if (parent.aborted || controller.signal.aborted || performance.now() - started >= timeoutMs) throw new Error("unavailable");
      };
      const work = async (): Promise<Assessment> => {
        check();
        const response = await fetcher(target, { method: "POST", body,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal });
        // Fetch enforces redirects; these checks also reject a misconfigured injected transport.
        if (controller.signal.aborted || parent.aborted || response.status !== 200 || response.redirected
          || (response.url !== "" && response.url !== target)
          || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(response.headers.get("content-type") ?? "")) {
          cancel(response.body);
          return unavailable;
        }
        const length = response.headers.get("content-length");
        if ((length !== null && (!/^\d+$/u.test(length) || Number(length) > maxResponseBytes)) || !response.body) {
          cancel(response.body);
          return unavailable;
        }
        reader = response.body.getReader();
        // Allocate only the configured bounded byte budget. Never call text()/json()/arrayBuffer().
        const bytes = new Uint8Array(maxResponseBytes);
        let used = 0;
        try {
          while (true) {
            check();
            const chunk = await reader.read();
            check();
            if (chunk.done) break;
            if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > maxResponseBytes - used) return unavailable;
            bytes.set(chunk.value, used);
            used += chunk.value.byteLength;
          }
          if (length !== null && Number(length) !== used) return unavailable;
          const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used)));
          check();
          if (!validAssessment(raw)) return unavailable;
          check();
          const result = raw as Assessment;
          return Object.freeze({ verdict: result.verdict, category: result.category });
        } finally {
          cancel(reader);
          reader.releaseLock();
          reader = undefined;
        }
      };
      return await Promise.race([work(), stopped]);
    } catch {
      return unavailable;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abort && parent instanceof AbortSignal) parent.removeEventListener("abort", abort);
      controller.abort();
      if (reader) cancel(reader);
    }
  };
  return Object.freeze({ assess, capabilities });
}
