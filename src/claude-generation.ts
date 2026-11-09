import type { Options } from "./gateway.js";
import { validProfile } from "./protocol.js";

/** Trusted backend configuration only. No credentials, model, version, or policy defaults. */
export type ClaudeGenerationConfig = Readonly<{
  apiKey: string;
  model: string;
  apiVersion: string;
  systemPolicy: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  /** Must honor cancellation, redirect, and credential settings. */
  fetch: typeof globalThis.fetch;
}>;

const endpoint = "https://api.anthropic.com/v1/messages";
const encoder = new TextEncoder();
const fields = ["apiKey", "model", "apiVersion", "systemPolicy", "timeoutMs", "maxOutputTokens",
  "maxRequestBytes", "maxResponseBytes", "fetch"] as const;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function dataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return object(value) && Reflect.ownKeys(value).every(key => typeof key === "string" && keys.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value"));
}
function limit(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max * 2 && !!value.trim() && [...value].length <= max;
}
function cancel(stream: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null): void {
  try { void stream?.cancel().catch(() => {}); } catch { /* No remote diagnostics. */ }
}
function failed(): never { throw new Error("Claude generation unavailable"); }

/** Returns an unapproved candidate callback for Options.generate, never a delivery API. */
export function createClaudeGenerator(config: ClaudeGenerationConfig): Options["generate"] {
  try { return buildGenerator(config); }
  catch { throw new TypeError("Invalid Claude generation configuration"); }
}

function buildGenerator(config: ClaudeGenerationConfig): Options["generate"] {
  if (!dataObject(config, fields) || Reflect.ownKeys(config).length !== fields.length) failed();
  const { apiKey, model, apiVersion, systemPolicy, timeoutMs, maxOutputTokens,
    maxRequestBytes, maxResponseBytes, fetch: fetcher } = config;
  if (typeof apiKey !== "string" || !/^[\x21-\x7e]{1,512}$/u.test(apiKey)
    || typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(model)
    || typeof apiVersion !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(apiVersion)
    || !Number.isFinite(Date.parse(apiVersion)) || new Date(apiVersion).toISOString().slice(0, 10) !== apiVersion
    || typeof systemPolicy !== "string" || !systemPolicy.trim() || systemPolicy.length > 32768
    || !limit(timeoutMs, 30000) || !limit(maxOutputTokens, 4096)
    || !limit(maxRequestBytes, 65536) || !limit(maxResponseBytes, 65536)
    || typeof fetcher !== "function") failed();

  return async (input, profile, parent) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    const cleanupBody = () => {
      try { cancel(reader ?? response?.body ?? null); } catch { /* Malformed trusted transport. */ }
    };
    try {
      if (!(parent instanceof AbortSignal) || parent.aborted || !text(input, 4000)
        || !dataObject(profile, ["ageBand", "locale", "task"]) || !validProfile(profile)) return null;
      const started = performance.now();
      const check = () => {
        if (parent.aborted || controller.signal.aborted || performance.now() - started >= timeoutMs) failed();
      };
      const stopped = new Promise<never>((_, reject) => {
        abort = () => {
          controller.abort();
          cleanupBody();
          reject(new Error("Claude generation unavailable"));
        };
      });
      parent.addEventListener("abort", abort!, { once: true });
      timer = setTimeout(abort!, timeoutMs);
      const work = async (): Promise<string> => {
        check();
        const body = encoder.encode(JSON.stringify({ model, max_tokens: maxOutputTokens, system: systemPolicy,
          messages: [{ role: "user", content: JSON.stringify({
            profile: { ageBand: profile.ageBand, locale: profile.locale, task: profile.task }, input }) }],
          stream: false, thinking: { type: "disabled" } }));
        if (body.byteLength > maxRequestBytes) failed();
        check();
        response = await fetcher(endpoint, { method: "POST", body,
          headers: { "Content-Type": "application/json", Accept: "application/json",
            "x-api-key": apiKey, "anthropic-version": apiVersion },
          redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal });
        // The finally runs even for a late response after the caller's race settled.
        try {
          check();
          if (response.status !== 200 || response.redirected || (response.url !== "" && response.url !== endpoint)
            || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(response.headers.get("content-type") ?? "")) failed();
          const length = response.headers.get("content-length");
          if (!response.body || (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxResponseBytes))) failed();
          reader = response.body.getReader();
          const bytes = new Uint8Array(maxResponseBytes);
          let used = 0;
          while (true) {
            check();
            const chunk = await reader.read();
            check();
            if (chunk.done) break;
            if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > maxResponseBytes - used) failed();
            bytes.set(chunk.value, used);
            used += chunk.value.byteLength;
          }
          if (length !== null && Number(length) !== used) failed();
          // Decode and parse only after the entire envelope has passed the byte bound.
          const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used)));
          check();
          if (!object(raw) || raw.type !== "message" || raw.role !== "assistant" || raw.model !== model
            || raw.stop_reason !== "end_turn" || (raw.stop_sequence !== undefined && raw.stop_sequence !== null)
            || (raw.stop_details !== undefined && raw.stop_details !== null)
            || Object.hasOwn(raw, "error") || Object.hasOwn(raw, "refusal")
            || !Array.isArray(raw.content) || raw.content.length !== 1) failed();
          const block: unknown = raw.content[0];
          if (!object(block) || block.type !== "text" || !text(block.text, 8000)
            || !Object.keys(block).every(key => ["type", "text", "citations"].includes(key))
            || (block.citations !== undefined && (!Array.isArray(block.citations) || block.citations.length !== 0))) failed();
          check();
          return block.text;
        } finally {
          cleanupBody();
          reader?.releaseLock();
          reader = undefined;
        }
      };
      return await Promise.race([work(), stopped]);
    } catch {
      // Null fails the gateway's generation validation; no fallback candidate or raw errors.
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abort && parent instanceof AbortSignal) parent.removeEventListener("abort", abort);
      controller.abort();
      cleanupBody();
    }
  };
}
