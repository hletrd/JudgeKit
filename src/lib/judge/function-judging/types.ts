import { z } from "zod";

export const SCALAR_TYPES = ["int", "long", "double", "bool", "string"] as const;
export const SUPPORTED_FUNCTION_TYPES = [
  ...SCALAR_TYPES,
  ...SCALAR_TYPES.map((t) => `${t}[]` as const),
] as const;

export type FunctionType = (typeof SUPPORTED_FUNCTION_TYPES)[number];

/**
 * Types an author may actually pick in v1. `double`/`double[]` are DEFERRED to
 * v1.1 because correct cross-language float judging needs a float comparison
 * mode plus space-separated numeric output: under the default `exact` mode the
 * TS serializer, C/Java/C# `%g`, and Go `json.Marshal` emit three different
 * texts for the same value, and the worker's float comparator can't tokenize a
 * JSON `[a,b]` array. The encoder + adapters keep their `double` mapping/printing
 * code intact so v1.1 can re-enable it; only authoring/validation excludes it.
 */
export const AUTHORABLE_FUNCTION_TYPES = SUPPORTED_FUNCTION_TYPES.filter(
  (t) => t !== "double" && t !== "double[]",
) as readonly FunctionType[];

export function isFunctionType(value: string): value is FunctionType {
  return (SUPPORTED_FUNCTION_TYPES as readonly string[]).includes(value);
}

/** True only for types an author may pick in v1 (excludes deferred `double`). */
export function isAuthorableFunctionType(value: string): value is FunctionType {
  return (AUTHORABLE_FUNCTION_TYPES as readonly string[]).includes(value);
}

export function isArrayType(t: FunctionType): boolean {
  return t.endsWith("[]");
}
export function elementType(t: FunctionType): (typeof SCALAR_TYPES)[number] {
  return t.replace("[]", "") as (typeof SCALAR_TYPES)[number];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Validation rejects `double`/`double[]` (deferred to v1.1) with a clear
// message, while the encoder/adapters still understand them internally.
const functionTypeSchema = z.string().refine(
  isAuthorableFunctionType,
  "unsupported type (double/double[] are not yet supported)",
);

export const functionSpecSchema = z.object({
  functionName: z.string().regex(IDENTIFIER, "invalid function name"),
  params: z.array(z.object({
    name: z.string().regex(IDENTIFIER, "invalid parameter name"),
    type: functionTypeSchema,
  })).min(1, "at least one parameter required"),
  // v1: non-void return only (void/in-place deferred to v1.1).
  returnType: functionTypeSchema,
  enabledLanguages: z.array(z.string()).min(1),
});

export type FunctionSpec = z.infer<typeof functionSpecSchema>;

export function parseFunctionSpec(value: unknown): FunctionSpec {
  return functionSpecSchema.parse(value);
}
