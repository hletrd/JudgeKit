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

export function encodeValue(v: unknown, t: FunctionType): string {
  if (!isArrayType(t)) return encodeScalar(v, t);
  const el = elementType(t);
  const items = (v as unknown[]).map((x) => encodeScalar(x, el));
  return `[${items.join(",")}]`;
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
  const encoded = `[${params.map((p, i) => encodeValue(args[i], p.type)).join(",")}]`;
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
