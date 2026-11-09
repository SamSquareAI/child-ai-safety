import type { Assess, Capabilities } from "./gateway.js";
import { createHttpAssessmentAdapter } from "./http-assessment.js";
import { validAssessment } from "./protocol.js";

/** Caller must include this verbatim in its reviewed policy. Never appended implicitly. */
export const CLAUDE_ASSESSMENT_OUTPUT_CONTRACT = 'Return only one Assessment JSON object with exactly the keys "verdict" and "category", with no markdown, explanation, or other keys. "verdict" must be "allow", "refuse", "support", or "unavailable". For "allow" or "unavailable", "category" must be "none". For "refuse" or "support", "category" must be "privacy", "harm", "safeguarding", or "relational".';

/** Trusted backend configuration only; no environment lookup or provider defaults. */
export type ClaudeAssessmentConfig = Readonly<{
  apiKey: string;
  model: string;
  apiVersion: string;
  capabilities: Capabilities;
  systemPolicy: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  /** Explicit trusted transport, required to honor cancellation and redirect settings. */
  fetch: typeof globalThis.fetch;
}>;

const endpoint = "https://api.anthropic.com/v1/messages";
const encoder = new TextEncoder();
const fields = ["apiKey", "model", "apiVersion", "capabilities", "systemPolicy", "timeoutMs",
  "maxOutputTokens", "maxRequestBytes", "maxResponseBytes", "fetch"] as const;
function dataObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function cancel(stream: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null): void {
  try { void stream?.cancel().catch(() => {}); } catch { /* Never expose transport diagnostics. */ }
}
function failed(): never { throw new Error("Claude assessment unavailable"); }

/** Declared coverage is neither permission to call the provider nor qualification. */
export function createClaudeAssessmentAdapter(config: ClaudeAssessmentConfig): Readonly<{ assess: Assess; capabilities: Capabilities }> {
  try { return buildAdapter(config); }
  catch { throw new TypeError("Invalid Claude assessment configuration"); }
}

function buildAdapter(config: ClaudeAssessmentConfig): Readonly<{ assess: Assess; capabilities: Capabilities }> {
  // Inspect descriptors before touching values, including credentials.
  if (!dataObject(config) || Reflect.ownKeys(config).length !== fields.length
    || !Reflect.ownKeys(config).every(key => typeof key === "string" && fields.includes(key as typeof fields[number])
      && Object.hasOwn(Object.getOwnPropertyDescriptor(config, key)!, "value"))) {
    throw new TypeError("Invalid Claude assessment configuration");
  }
  const { apiKey, model, apiVersion, systemPolicy, maxOutputTokens, timeoutMs,
    maxRequestBytes, maxResponseBytes, fetch: fetcher } = config;
  if (typeof apiKey !== "string" || !/^[\x21-\x7e]{1,512}$/u.test(apiKey)
    || typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(model)
    || typeof apiVersion !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(apiVersion)
    || !Number.isFinite(Date.parse(apiVersion)) || new Date(apiVersion).toISOString().slice(0, 10) !== apiVersion
    || typeof systemPolicy !== "string" || systemPolicy.length > 32768
    || !systemPolicy.includes(CLAUDE_ASSESSMENT_OUTPUT_CONTRACT)
    || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096
    || typeof fetcher !== "function") {
    throw new TypeError("Invalid Claude assessment configuration");
  }

  // Only this private wrapper sees the generic adapter's validated JSON request.
  const transport: typeof globalThis.fetch = async (_target, init) => {
    const signal = init?.signal;
    if (!signal || signal.aborted || !(init?.body instanceof Uint8Array)) failed();
    const request = JSON.parse(new TextDecoder().decode(init.body)) as Record<string, unknown>;
    const body = encoder.encode(JSON.stringify({ model, max_tokens: maxOutputTokens, system: systemPolicy,
      messages: [{ role: "user", content: JSON.stringify({ profile: request.profile, stage: request.stage, text: request.text }) }],
      stream: false, thinking: { type: "disabled" } }));
    if (body.byteLength > maxRequestBytes || signal.aborted) failed();
    const response = await fetcher(endpoint, { method: "POST", body,
      headers: { "Content-Type": "application/json", Accept: "application/json",
        "x-api-key": apiKey, "anthropic-version": apiVersion },
      redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const stop = () => cancel(reader ?? response.body);
    signal.addEventListener("abort", stop, { once: true });
    try {
      if (signal.aborted || response.status !== 200 || response.redirected
        || (response.url !== "" && response.url !== endpoint)
        || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(response.headers.get("content-type") ?? "")) failed();
      const length = response.headers.get("content-length");
      if (!response.body || (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxResponseBytes))) failed();
      reader = response.body.getReader();
      const bytes = new Uint8Array(maxResponseBytes);
      let used = 0;
      while (true) {
        if (signal.aborted) failed();
        const chunk = await reader.read();
        if (signal.aborted) failed();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > maxResponseBytes - used) failed();
        bytes.set(chunk.value, used);
        used += chunk.value.byteLength;
      }
      if (length !== null && Number(length) !== used) failed();
      // Bound the provider envelope itself, not merely the extracted Assessment.
      const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used)));
      if (signal.aborted || !dataObject(raw) || raw.type !== "message" || raw.role !== "assistant" || raw.model !== model
        || raw.stop_reason !== "end_turn" || (raw.stop_sequence !== undefined && raw.stop_sequence !== null)
        || (raw.stop_details !== undefined && raw.stop_details !== null)
        || Object.hasOwn(raw, "error") || Object.hasOwn(raw, "refusal")
        || !Array.isArray(raw.content) || raw.content.length !== 1) failed();
      const block: unknown = raw.content[0];
      if (!dataObject(block) || block.type !== "text" || typeof block.text !== "string"
        || !Object.keys(block).every(key => ["type", "text", "citations"].includes(key))
        || (block.citations !== undefined && (!Array.isArray(block.citations) || block.citations.length !== 0))) failed();
      const assessment: unknown = JSON.parse(block.text);
      if (signal.aborted || !validAssessment(assessment)) failed();
      return new Response(JSON.stringify(assessment), { status: 200, headers: { "Content-Type": "application/json" } });
    } finally {
      signal.removeEventListener("abort", stop);
      stop();
      reader?.releaseLock();
    }
  };
  // Reuse exact profile/text/capability validation and the outer deadline race.
  return createHttpAssessmentAdapter({ endpoint, capabilities: config.capabilities, timeoutMs,
    maxRequestBytes, maxResponseBytes, fetch: transport });
}
