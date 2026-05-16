export const CODE_SURFACE_LANGUAGE_MAP = {
  c: "c",
  c11: "c",
  c17: "c",
  c23: "c",
  c89: "c",
  c99: "c",
  cpp: "cpp",
  cpp17: "cpp",
  cpp20: "cpp",
  cpp23: "cpp",
  cpp26: "cpp",
  java: "java",
  javascript: "javascript",
  node: "javascript",
  kotlin: "kotlin",
  typescript: "typescript",
  verilog: "plaintext",
  systemverilog: "plaintext",
  vhdl: "plaintext",
  python: "python",
  python3: "python",
  pypy: "python",
  rust: "rust",
  go: "go",
  swift: "swift",
  csharp: "csharp",
  r: "r",
  perl: "perl",
  php: "php",
  ruby: "ruby",
  scala: "scala",
  haskell: "haskell",
  ocaml: "ocaml",
  lua: "lua",
  bash: "bash",
  clang_c23: "c",
  clang_cpp23: "cpp",
  clang_cpp26: "cpp",
  purescript: "haskell",
  mercury: "prolog",
  modula2: "pascal",
  spark: "rust",
  curry: "haskell",
  clean: "haskell",
  carp: "clojure",
  pony: "python",
  idris2: "haskell",
  rescript: "javascript",
  elm: "haskell",
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

  if (typeof language !== "string") {
    return CODE_SURFACE_PLAINTEXT_LANGUAGE;
  }

  const lower = language.toLowerCase();
  return (
    CODE_SURFACE_LANGUAGE_MAP[lower as JudgeCodeLanguageKey] ??
    CODE_SURFACE_PLAINTEXT_LANGUAGE
  );
}

/**
 * Adapter: map a judge language id to a highlight.js language identifier, or
 * `undefined` when the canonical lookup yields `"plaintext"` (signalling
 * `hljs.highlightAuto` should run instead). Single source of truth for
 * "judge language → syntax highlighter" mapping; previously
 * `code-timeline-panel.tsx` carried a parallel `LANGUAGE_TO_HLJS` map that
 * tended to drift from `CODE_SURFACE_LANGUAGE_MAP`.
 */
export function getHighlightJsLanguage(language: string | null | undefined): string | undefined {
  const surfaceLang = getCodeSurfaceLanguage(language);
  return surfaceLang === CODE_SURFACE_PLAINTEXT_LANGUAGE ? undefined : surfaceLang;
}
