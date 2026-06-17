import type { FunctionType } from "./types";
import { isArrayType, elementType } from "./types";

function encodeScalar(v: unknown, t: string): string {
  switch (t) {
    case "int": case "long": return String(Math.trunc(Number(v)));
    case "double": return String(Number(v)); // shortest round-trip form
    case "bool": return v ? "true" : "false";
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

export function decodeValue(s: string, _t: FunctionType): unknown {
  const parsed = JSON.parse(s);
  return parsed;
}
