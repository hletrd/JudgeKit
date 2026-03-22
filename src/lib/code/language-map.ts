export const CODE_SURFACE_LANGUAGE_MAP = {
  c17: "c",
  c23: "c",
  cpp20: "cpp",
  cpp23: "cpp",
  java: "java",
  javascript: "javascript",
  kotlin: "kotlin",
  typescript: "typescript",
  python: "python",
  rust: "rust",
  go: "go",
  swift: "swift",
  csharp: "csharp",
  r: "r",
  perl: "perl",
  php: "php",
  clang_c23: "c",
  clang_cpp23: "cpp",
  purescript: "haskell",
  mercury: "prolog",
  modula2: "pascal",
  spark: "rust",
  curry: "haskell",
  clean: "haskell",
  carp: "clojure",
  pony: "python",
  roc: "elm",
} as const;

export const CODE_SURFACE_PLAINTEXT_LANGUAGE = "plaintext" as const;

/** Languages that must use a raw textarea instead of CodeMirror (e.g. whitespace-significant code). */
export const RAW_TEXTAREA_LANGUAGES = new Set(["whitespace"]);

export type JudgeCodeLanguageKey = keyof typeof CODE_SURFACE_LANGUAGE_MAP;

export type CodeSurfaceLanguage =
  | (typeof CODE_SURFACE_LANGUAGE_MAP)[JudgeCodeLanguageKey]
  | typeof CODE_SURFACE_PLAINTEXT_LANGUAGE;

export function getCodeSurfaceLanguage(language: string | null | undefined): CodeSurfaceLanguage {
  if (language === CODE_SURFACE_PLAINTEXT_LANGUAGE) {
    return CODE_SURFACE_PLAINTEXT_LANGUAGE;
  }

  return CODE_SURFACE_LANGUAGE_MAP[language as JudgeCodeLanguageKey] ?? CODE_SURFACE_PLAINTEXT_LANGUAGE;
}
