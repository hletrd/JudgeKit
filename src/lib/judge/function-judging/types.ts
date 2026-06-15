import { z } from "zod";

export const SCALAR_TYPES = ["int", "long", "double", "bool", "string"] as const;
export const SUPPORTED_FUNCTION_TYPES = [
  ...SCALAR_TYPES,
  ...SCALAR_TYPES.map((t) => `${t}[]` as const),
] as const;

export type FunctionType = (typeof SUPPORTED_FUNCTION_TYPES)[number];

export function isFunctionType(value: string): value is FunctionType {
  return (SUPPORTED_FUNCTION_TYPES as readonly string[]).includes(value);
}

export function isArrayType(t: FunctionType): boolean {
  return t.endsWith("[]");
}
export function elementType(t: FunctionType): (typeof SCALAR_TYPES)[number] {
  return t.replace("[]", "") as (typeof SCALAR_TYPES)[number];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const functionTypeSchema = z.string().refine(isFunctionType, "unsupported type");

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
