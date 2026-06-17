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

/**
 * int/long authored values flow through JS `Number` and the harnesses read
 * ints via double, so magnitudes beyond ±2^53 silently lose precision. Reject
 * those at authoring time; within ±Number.MAX_SAFE_INTEGER everything is exact.
 * BigInt rework is deferred (out of v1 scope).
 */
function isSafeInteger(n: number): boolean {
  return Number.isSafeInteger(n);
}

function scalarErrorKey(scalar: string, array: boolean): string {
  switch (scalar) {
    case "int":
    case "long":
      return array ? "fnValueInvalidArrayInt" : "fnValueInvalidInt";
    case "double":
      return array ? "fnValueInvalidArrayDouble" : "fnValueInvalidDouble";
    case "bool":
      return array ? "fnValueInvalidArrayBool" : "fnValueInvalidBool";
    case "string":
      return array ? "fnValueInvalidArrayString" : "fnValueInvalidString";
    default:
      return "fnValueInvalidInt";
  }
}

function intRangeErrorKey(array: boolean): string {
  return array ? "fnValueArrayIntOutOfRange" : "fnValueIntOutOfRange";
}

/**
 * NaN/Infinity are out of scope for double judging (the worker's float
 * comparator and the space-separated numeric contract assume finite values), so
 * reject non-finite author-supplied doubles at the authoring boundary. A literal
 * like `1e999` matches NUMBER_RE yet `Number()` overflows it to `Infinity`; this
 * is the realistic vector (JSON.parse can also yield Infinity from such a token).
 */
function doubleNotFiniteErrorKey(array: boolean): string {
  return array ? "fnValueArrayDoubleNotFinite" : "fnValueDoubleNotFinite";
}

type ScalarParse =
  | { ok: true; value: unknown }
  | { ok: false; errorKey?: string };

function parseScalar(raw: string, scalar: string): ScalarParse {
  const trimmed = raw.trim();
  switch (scalar) {
    case "int":
    case "long": {
      if (!INT_RE.test(trimmed)) return { ok: false };
      const value = Number(trimmed);
      if (!isSafeInteger(value)) return { ok: false, errorKey: intRangeErrorKey(false) };
      return { ok: true, value };
    }
    case "double": {
      if (!NUMBER_RE.test(trimmed)) return { ok: false };
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return { ok: false, errorKey: doubleNotFiniteErrorKey(false) };
      return { ok: true, value };
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

/** Coerce a JSON-decoded element into the editor's scalar value, with range/type checks. */
function coerceJsonElement(el: unknown, scalar: string): ScalarParse {
  switch (scalar) {
    case "int":
    case "long": {
      if (typeof el !== "number" || !Number.isInteger(el)) return { ok: false };
      if (!isSafeInteger(el)) return { ok: false, errorKey: intRangeErrorKey(true) };
      return { ok: true, value: el };
    }
    case "double":
      if (typeof el !== "number") return { ok: false };
      if (!Number.isFinite(el)) return { ok: false, errorKey: doubleNotFiniteErrorKey(true) };
      return { ok: true, value: el };
    case "bool":
      if (typeof el !== "boolean") return { ok: false };
      return { ok: true, value: el };
    case "string":
      if (typeof el !== "string") return { ok: false };
      return { ok: true, value: el };
    default:
      return { ok: false };
  }
}

/** Parse an array field whose text is a JSON array literal (e.g. `["a,b", "c"]`). */
function parseJsonArray(trimmed: string, scalar: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, errorKey: scalarErrorKey(scalar, true) };
  }
  if (!Array.isArray(parsed)) return { ok: false, errorKey: scalarErrorKey(scalar, true) };
  const out: unknown[] = [];
  for (const el of parsed) {
    const result = coerceJsonElement(el, scalar);
    if (!result.ok) {
      return { ok: false, errorKey: result.errorKey ?? scalarErrorKey(scalar, true) };
    }
    out.push(result.value);
  }
  return { ok: true, value: out };
}

/** Parse the editor text for a single typed field into a JS value. */
export function parseFieldValue(raw: string, type: FunctionType): ParseResult {
  if (!isArrayType(type)) {
    const scalar = type;
    const result = parseScalar(raw, scalar);
    if (!result.ok) {
      return { ok: false, errorKey: result.errorKey ?? scalarErrorKey(scalar, false) };
    }
    return { ok: true, value: result.value };
  }

  const scalar = elementType(type);
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: [] };
  }

  // A JSON array literal is the canonical, comma-safe authoring format and is
  // accepted for every element type. `string[]` REQUIRES it because commas are
  // significant inside string elements and bare comma-splitting would corrupt
  // them (e.g. "a,b" -> ["a","b"]).
  if (trimmed.startsWith("[")) {
    return parseJsonArray(trimmed, scalar);
  }
  if (scalar === "string") {
    return { ok: false, errorKey: scalarErrorKey("string", true) };
  }

  // Non-string arrays accept the friendlier bare comma-separated form.
  const parts = trimmed.split(",").map((p) => p.trim());
  const out: unknown[] = [];
  for (const part of parts) {
    const result = parseScalar(part, scalar);
    if (!result.ok) {
      // Map a scalar-specific error (out-of-range int, non-finite double) onto
      // its array variant; otherwise fall back to the generic array error.
      let errorKey: string;
      if (result.errorKey === intRangeErrorKey(false)) {
        errorKey = intRangeErrorKey(true);
      } else if (result.errorKey === doubleNotFiniteErrorKey(false)) {
        errorKey = doubleNotFiniteErrorKey(true);
      } else {
        errorKey = scalarErrorKey(scalar, true);
      }
      return { ok: false, errorKey };
    }
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
  // `string[]` formats back to a JSON array literal so commas inside elements
  // survive the format -> parse round-trip (matches the required input format).
  if (scalar === "string") {
    return JSON.stringify(value.map((v) => (typeof v === "string" ? v : String(v ?? ""))));
  }
  return value
    .map((v) => {
      if (scalar === "bool") return v ? "true" : "false";
      return v == null ? "" : String(v);
    })
    .join(", ");
}

export { SCALAR_TYPES };
