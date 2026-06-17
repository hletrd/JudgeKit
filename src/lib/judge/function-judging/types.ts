import { z } from "zod";

export const SCALAR_TYPES = ["int", "long", "double", "bool", "string"] as const;
export const SUPPORTED_FUNCTION_TYPES = [
  ...SCALAR_TYPES,
  ...SCALAR_TYPES.map((t) => `${t}[]` as const),
] as const;

export type FunctionType = (typeof SUPPORTED_FUNCTION_TYPES)[number];

/**
 * Types an author may pick. As of v1.1 every supported type — including
 * `double`/`double[]` — is authorable. Correct cross-language float judging is
 * achieved by (a) forcing `comparisonMode = "float"` at create/update when the
 * RETURN type is double-valued (see problem-management) and (b) printing double
 * returns as whitespace-separated numeric tokens (see serialization.ts +
 * adapters), which the worker's whitespace-token float comparator tokenizes and
 * compares within tolerance. Under that contract the per-language textual form
 * (`0.5` vs `0.500000000`) need not byte-match.
 */
export const AUTHORABLE_FUNCTION_TYPES = SUPPORTED_FUNCTION_TYPES as readonly FunctionType[];

export function isFunctionType(value: string): value is FunctionType {
  return (SUPPORTED_FUNCTION_TYPES as readonly string[]).includes(value);
}

/** True for any type an author may pick (every supported type as of v1.1). */
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
// Validation accepts every authorable type (all supported scalars + 1-D arrays,
// including `double`/`double[]` as of v1.1) and rejects anything else.
const functionTypeSchema = z.string().refine(
  isAuthorableFunctionType,
  "unsupported function type",
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
