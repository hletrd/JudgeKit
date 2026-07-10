import type { FunctionType } from "./types";
import { isArrayType, elementType } from "./types";

/**
 * Encode an int/long value verbatim, without IEEE-754 float64 coercion.
 *
 * `String(Math.trunc(Number(v)))` previously rounded every integer > 2^53 at
 * encode time (F1): e.g. author enters `9223372036854775807` (LLONG_MAX) and
 * `Number()` rounds it to `9223372036854775808`, which is OUTSIDE the int64
 * range — the harness then receives a value no strict int64 reader can parse,
 * and large-int function problems get wrong verdicts. To stay exact, the value
 * must be carried as a `bigint` or digit-`string` through authoring→DB→encode
 * and emitted byte-identical. A JS `number` is accepted only when it is a
 * safe integer; an unsafe `number` throws loudly rather than silently rounding.
 */
function encodeIntLiteral(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") {
    if (!/^-?\d+$/.test(v)) {
      throw new Error(`invalid integer literal for function judging: ${JSON.stringify(v)}`);
    }
    return v;
  }
  if (typeof v === "number" && Number.isSafeInteger(v)) {
    return String(v);
  }
  throw new Error(
    `integer value ${String(v)} exceeds safe-integer range or is the wrong type; ` +
      "pass it as a string or bigint to preserve int64 precision (F1).",
  );
}

/**
 * Encode a boolean strictly: only a real boolean or the exact strings
 * "true"/"false" are accepted. Truthiness coercion would flip a stringified
 * `"false"` (e.g. from a CSV/import path that stored the literal as text) to
 * `true` and silently corrupt the expected value — the same boolean-string
 * bug class already seen in db/import.ts.
 */
function encodeBoolLiteral(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === "true" || v === "false") return v;
  throw new Error(`invalid boolean literal for function judging: ${JSON.stringify(v)}`);
}

function encodeScalar(v: unknown, t: string): string {
  switch (t) {
    case "int": case "long": return encodeIntLiteral(v);
    case "double": return String(Number(v)); // shortest round-trip form
    case "bool": return encodeBoolLiteral(v);
    case "string": return JSON.stringify(String(v));
    default: throw new Error(`unsupported scalar ${t}`);
  }
}

/** Canonical JSON form of a value used for stdin args (every type, incl. double). */
function encodeJson(v: unknown, t: FunctionType): string {
  if (!isArrayType(t)) return encodeScalar(v, t);
  const el = elementType(t);
  const items = (v as unknown[]).map((x) => encodeScalar(x, el));
  return `[${items.join(",")}]`;
}

/**
 * Encode the canonical RETURN representation stored as a test case's
 * `expectedOutput` (and what each adapter's harness must print byte-equivalently
 * under its comparison mode).
 *
 * FLOAT / SPACE-SEPARATED CONTRACT for double returns: a `double` scalar return
 * is a SINGLE numeric token (e.g. `0.5`) and a `double[]` return is
 * SPACE-SEPARATED numeric tokens (e.g. `0.5 0.25 -3`) — never JSON `[a,b]`. The
 * worker's `compare_float_output` splits expected/actual on whitespace into
 * tokens, requires equal token counts, and compares each token as f64 within
 * tolerance, so a JSON array (one unparseable token) cannot be judged. Because
 * comparison is float-tolerant, the exact textual form per language need NOT
 * byte-match — only the token COUNT and each token's parsed f64 value must agree.
 *
 * Every NON-double type (int/long/bool/string + their arrays) keeps the
 * canonical JSON form and is judged with exact comparison.
 */
export function encodeValue(v: unknown, t: FunctionType): string {
  if (t === "double") return encodeScalar(v, "double");
  if (t === "double[]") {
    return (v as unknown[]).map((x) => encodeScalar(x, "double")).join(" ");
  }
  return encodeJson(v, t);
}

/**
 * Encode a positional argument vector as ONE JSON line for the harness stdin.
 *
 * SINGLE-LINE STDIN CONTRACT: every language harness reads exactly one stdin
 * line (`readline` / `ReadString('\n')` / `getline` / `split("\n")[0]`) and
 * parses it as the JSON args array. The encoded output MUST therefore be free
 * of raw newlines. `encodeScalar("string")` uses `JSON.stringify`, which
 * escapes any `\n`/`\r` inside a string element to `\\n`/`\\r`, so the contract
 * holds for all supported value types today. The assertion below guards the
 * invariant: if any future change ever lets a literal newline reach this output
 * it fails loudly here rather than silently truncating args across every
 * adapter at judge time.
 */
export function encodeArgs(args: unknown[], params: { name: string; type: FunctionType }[]): string {
  // STDIN args are always canonical JSON for EVERY type, including double — only
  // the RETURN print format diverges for double (see encodeValue). Using
  // encodeJson (not encodeValue) keeps double params as JSON numbers the
  // harnesses parse exactly as before.
  const encoded = `[${params.map((p, i) => encodeJson(args[i], p.type)).join(",")}]`;
  if (encoded.includes("\n") || encoded.includes("\r")) {
    throw new Error(
      "encodeArgs produced a multi-line value, violating the single-line stdin contract",
    );
  }
  return encoded;
}

export class FunctionJudgingDecodeError extends Error {
  readonly code = "DECODE_ERROR";
  constructor(
    message: string,
    public readonly source: string,
  ) {
    super(message);
    this.name = "FunctionJudgingDecodeError";
  }
}

export function decodeValue(s: string, _t: FunctionType): unknown {
  try {
    return JSON.parse(s);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new FunctionJudgingDecodeError(
      `failed to decode function-judging value: ${reason}`,
      s,
    );
  }
}
