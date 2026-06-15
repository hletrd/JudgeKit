import {
  SCALAR_TYPES,
  elementType,
  isArrayType,
  type FunctionType,
} from "./types";

/**
 * UI-layer helpers for the typed function test-case editor: parse the raw text
 * an author types into a JS value (for serialization via serialization.ts) and
 * format a stored value back into editable text. Pure + framework-agnostic so
 * they can be unit/component-tested directly.
 */

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; errorKey: string };

const INT_RE = /^[+-]?\d+$/;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function scalarErrorKey(scalar: string, array: boolean): string {
  switch (scalar) {
    case "int":
    case "long":
      return array ? "fnValueInvalidArrayInt" : "fnValueInvalidInt";
    case "double":
      return array ? "fnValueInvalidArrayDouble" : "fnValueInvalidDouble";
    case "bool":
      return array ? "fnValueInvalidArrayBool" : "fnValueInvalidBool";
    default:
      // string never fails to parse.
      return "fnValueInvalidInt";
  }
}

function parseScalar(raw: string, scalar: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = raw.trim();
  switch (scalar) {
    case "int":
    case "long": {
      if (!INT_RE.test(trimmed)) return { ok: false };
      return { ok: true, value: Number(trimmed) };
    }
    case "double": {
      if (!NUMBER_RE.test(trimmed)) return { ok: false };
      return { ok: true, value: Number(trimmed) };
    }
    case "bool": {
      const lowered = trimmed.toLowerCase();
      if (lowered === "true") return { ok: true, value: true };
      if (lowered === "false") return { ok: true, value: false };
      return { ok: false };
    }
    case "string":
      // The raw text is taken verbatim (no surrounding quotes expected).
      return { ok: true, value: raw };
    default:
      return { ok: false };
  }
}

/** Parse the editor text for a single typed field into a JS value. */
export function parseFieldValue(raw: string, type: FunctionType): ParseResult {
  if (!isArrayType(type)) {
    const scalar = type;
    const result = parseScalar(raw, scalar);
    if (!result.ok) return { ok: false, errorKey: scalarErrorKey(scalar, false) };
    return { ok: true, value: result.value };
  }

  const scalar = elementType(type);
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: [] };
  }
  const parts = trimmed.split(",").map((p) => p.trim());
  const out: unknown[] = [];
  for (const part of parts) {
    // For string[] an empty element between commas is a deliberate "" entry.
    const result = parseScalar(scalar === "string" ? part : part, scalar);
    if (!result.ok) return { ok: false, errorKey: scalarErrorKey(scalar, true) };
    out.push(result.value);
  }
  return { ok: true, value: out };
}

/**
 * Best-effort: turn a previously-serialized canonical string (the value stored
 * on a test-case draft's input element / expectedOutput) back into editor text.
 * Used to hydrate the typed editor when editing an existing function problem.
 */
export function formatStoredScalar(serialized: string, scalar: string): string {
  if (scalar === "string") {
    try {
      const parsed = JSON.parse(serialized);
      if (typeof parsed === "string") return parsed;
    } catch {
      // fall through — return raw
    }
    return serialized;
  }
  return serialized;
}

/** Format a decoded value (from decodeValue) into editor text for a type. */
export function formatValue(value: unknown, type: FunctionType): string {
  if (!isArrayType(type)) {
    if (type === "string") return typeof value === "string" ? value : String(value ?? "");
    if (type === "bool") return value ? "true" : "false";
    return value == null ? "" : String(value);
  }
  if (!Array.isArray(value)) return "";
  const scalar = elementType(type);
  return value
    .map((v) => {
      if (scalar === "string") return typeof v === "string" ? v : String(v ?? "");
      if (scalar === "bool") return v ? "true" : "false";
      return v == null ? "" : String(v);
    })
    .join(", ");
}

export { SCALAR_TYPES };
