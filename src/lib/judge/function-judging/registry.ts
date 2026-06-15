import type { FunctionHarnessAdapter } from "./adapter";
import { pythonAdapter } from "./adapters/python";
import { cppAdapter } from "./adapters/cpp";
import { javascriptAdapter } from "./adapters/javascript";
import { typescriptAdapter } from "./adapters/typescript";
import { javaAdapter } from "./adapters/java";
import { goAdapter } from "./adapters/go";
import { csharpAdapter } from "./adapters/csharp";

const ADAPTERS: Record<string, FunctionHarnessAdapter> = {
  [pythonAdapter.language]: pythonAdapter,
  [cppAdapter.language]: cppAdapter,
  [javascriptAdapter.language]: javascriptAdapter,
  [typescriptAdapter.language]: typescriptAdapter,
  [javaAdapter.language]: javaAdapter,
  [goAdapter.language]: goAdapter,
  [csharpAdapter.language]: csharpAdapter,
};

export const FUNCTION_JUDGING_LANGUAGES = new Set(Object.keys(ADAPTERS));

export function supportsFunctionJudging(language: string): boolean {
  return FUNCTION_JUDGING_LANGUAGES.has(language);
}

export function getAdapter(language: string): FunctionHarnessAdapter {
  const a = ADAPTERS[language];
  if (!a) throw new Error(`no function-judging adapter for ${language}`);
  return a;
}
