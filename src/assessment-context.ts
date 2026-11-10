/** Request-scoped context; never a mutable adapter-global conversation buffer. */
export type AssessmentContext = Readonly<{ version: "1"; requestInput: string }>;

/** Copy only bounded data properties. Missing output context must fail closed. */
export function snapshotAssessmentContext(value: unknown, text: string, stage: "input" | "output"): AssessmentContext | null {
  if (value === undefined && stage === "input") value = { version: "1", requestInput: text };
  try {
    if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || keys.some(key => !["version", "requestInput"].includes(key as string))) return null;
    const version = Object.getOwnPropertyDescriptor(value, "version");
    const input = Object.getOwnPropertyDescriptor(value, "requestInput");
    if (!version || !input || !Object.hasOwn(version, "value") || !Object.hasOwn(input, "value") || version.value !== "1") return null;
    const requestInput: unknown = input.value;
    if (typeof requestInput !== "string" || requestInput.length > 8000 || !requestInput.trim() || [...requestInput].length > 4000) return null;
    if (stage === "input" && requestInput !== text) return null;
    return Object.freeze({ version: "1", requestInput });
  } catch { return null; }
}
