import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./protocol.schema.json" with { type: "json" };

// Only bundled trusted schemas. No remote references, schema uploads, coercion,
// default insertion, or silent property stripping. Do not log validation data.
const ajv = new Ajv2020({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true });
ajv.addSchema(schema);
export const protocolVersion = "1" as const;
export function validator(name: keyof typeof schema.$defs) {
  return ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
}
export const validProfile = validator("profile");
export const validAuthority = validator("authority");
export const validCapabilities = validator("capabilities");
export const validAssessment = validator("assessment");
export const validRequest = validator("request");
export const validResult = validator("result");
export const validIdentifier = validator("identifier");

/** Optional transport helper: bounded UTF-8 JSON only, no HTTP server/auth.
 * Callers still need streaming ingress byte limits before collecting a body. */
export function decodeRequest(bytes: Uint8Array): unknown | null {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 16384) return null;
  try {
    const request: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return validRequest(request) ? request : null;
  } catch { return null; }
}
