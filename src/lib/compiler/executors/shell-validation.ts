/**
 * Known compiler/tool prefixes that may appear as the first command in a
 * compile or run command string. Used by validateShellCommandStrict as a
 * secondary defense-in-depth check on top of validateShellCommand.
 */
export const ALLOWED_COMMAND_PREFIXES = [
  "gcc", "g++", "clang", "clang++", "cc", "c++",
  "javac", "java", "jar",
  "go",
  "rustc", "cargo",
  "python3", "python", "pypy3",
  "node",
  "dotnet", "mcs", "mono",
  "ghc", "runhaskell",
  "dart",
  "swiftc",
  "fpc",
  "ruby",
  "kotlinc", "kotlin",
  "scalac", "scala",
  "gdc", "ldc2",
  "vbnc", "vbc",
  "racket",
  "gs",
  "bash", "sh",
  "csc",
  "octave",
  "Rscript",
  "php",
  "perl",
  "lua",
  "awk",
  "sed",
  "powershell", "pwsh",
];

/**
 * Check whether a command basename matches an allowed prefix.
 * Allows exact matches and version-style suffixes (e.g., python3.11, gcc-12,
 * node20) but rejects unrelated strings that merely start with a prefix
 * (e.g., "nodemalicious" must not match "node").
 */
export function isValidCommandPrefix(baseName: string): boolean {
  return ALLOWED_COMMAND_PREFIXES.some((prefix) => {
    if (baseName === prefix) return true;
    // Allow version suffixes: digits, dots, dashes, underscores after the prefix
    if (baseName.length > prefix.length) {
      const suffix = baseName.slice(prefix.length);
      return /^[0-9.\-_]+$/.test(suffix);
    }
    return false;
  });
}
