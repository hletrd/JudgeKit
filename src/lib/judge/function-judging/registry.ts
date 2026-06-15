import type { FunctionHarnessAdapter } from "./adapter";
import { pythonAdapter } from "./adapters/python";
import { cppAdapter } from "./adapters/cpp";
import { javascriptAdapter } from "./adapters/javascript";

const ADAPTERS: Record<string, FunctionHarnessAdapter> = {
  [pythonAdapter.language]: pythonAdapter,
  [cppAdapter.language]: cppAdapter,
  [javascriptAdapter.language]: javascriptAdapter,
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
