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

export function encodeArgs(args: unknown[], params: { name: string; type: FunctionType }[]): string {
  return `[${params.map((p, i) => encodeValue(args[i], p.type)).join(",")}]`;
}

export function decodeValue(s: string, _t: FunctionType): unknown {
  const parsed = JSON.parse(s);
  return parsed;
}
