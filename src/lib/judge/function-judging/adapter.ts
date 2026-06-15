import type { FunctionSpec } from "./types";

export interface FunctionHarnessAdapter {
  language: string;
  /** Student-facing starter stub (signature + empty body). */
  generateStub(spec: FunctionSpec): string;
  /** Full compile unit: prelude + studentCode + generated main. */
  assemble(spec: FunctionSpec, studentCode: string): { source: string; preludeLineCount: number };
}
