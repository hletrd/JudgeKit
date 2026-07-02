import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/** Parse the TypeScript `Language` union members from `src/types/index.ts`. */
function parseTsLanguageUnion(source: string): Set<string> {
  const startMarker = "export type Language =";
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error("TypeScript Language union start marker not found");
  }

  let endIndex = source.indexOf(";", startIndex);
  if (endIndex === -1) {
    throw new Error("TypeScript Language union end marker not found");
  }

  const body = source.slice(startIndex + startMarker.length, endIndex);
  const languages = new Set<string>();
  const re = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    languages.add(match[1]);
  }
  return languages;
}

/** Parse the Rust `Language` enum variants from `judge-worker-rs/src/types.rs`. */
function parseRustLanguageEnum(source: string): Set<string> {
  const startMarker = "pub enum Language {";
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error("Rust Language enum start marker not found");
  }

  let braceDepth = 0;
  let endIndex = -1;
  for (let i = startIndex + startMarker.length; i < source.length; i++) {
    const char = source[i];
    if (char === "{") braceDepth++;
    if (char === "}") {
      if (braceDepth === 0) {
        endIndex = i;
        break;
      }
      braceDepth--;
    }
  }
  if (endIndex === -1) {
    throw new Error("Rust Language enum end marker not found");
  }

  const body = source.slice(startIndex + startMarker.length, endIndex);
  const lines = body.split("\n");
  const languages = new Set<string>();
  let pendingRename: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    const renameMatch = line.match(/^#\[serde\(rename\s*=\s*"([^"]+)"\)\]$/);
    if (renameMatch) {
      pendingRename = renameMatch[1];
      continue;
    }

    const variantMatch = line.match(/^([A-Za-z0-9_]+)(?:[,\s]|$)/);
    if (variantMatch) {
      const variant = variantMatch[1];
      // Skip the Unknown catch-all; it is not a seeded language identifier.
      if (variant === "Unknown") continue;
      languages.add(pendingRename ?? variant.toLowerCase());
      pendingRename = null;
    }
  }

  return languages;
}

/** Parse the keys / `language` values of `JUDGE_LANGUAGE_CONFIGS` from `src/lib/judge/languages.ts`. */
function parseTsLanguageConfigs(source: string): Set<string> {
  const startMarker = "export const JUDGE_LANGUAGE_CONFIGS: Record<Language, JudgeLanguageDefinition> = {";
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error("JUDGE_LANGUAGE_CONFIGS start marker not found");
  }

  let braceDepth = 0;
  let endIndex = -1;
  for (let i = startIndex + startMarker.length; i < source.length; i++) {
    const char = source[i];
    if (char === "{") braceDepth++;
    if (char === "}") {
      if (braceDepth === 0) {
        endIndex = i;
        break;
      }
      braceDepth--;
    }
  }
  if (endIndex === -1) {
    throw new Error("JUDGE_LANGUAGE_CONFIGS end marker not found");
  }

  const body = source.slice(startIndex + startMarker.length, endIndex);
  const languages = new Set<string>();
  const re = /language:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    languages.add(match[1]);
  }
  return languages;
}

describe("language configuration contract (S8)", () => {
  it("runs PostScript with -dSAFER in both TypeScript and Rust language configs", () => {
    const tsSource = read("src/lib/judge/languages.ts");
    const rustSource = read("judge-worker-rs/src/languages.rs");

    const tsPostscript = tsSource.match(/postscript:\s*\{[\s\S]*?runCommand:\s*(\[[^\]]+\])/);
    expect(tsPostscript).not.toBeNull();
    expect(tsPostscript![1]).toContain("-dSAFER");
    expect(tsPostscript![1]).not.toContain("-dNOSAFER");
    expect(tsPostscript![1]).toContain("-sPermitFileReading=/workspace");

    const rustPostscript = rustSource.match(/static\s+POSTSCRIPT_RUN:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/);
    expect(rustPostscript).not.toBeNull();
    expect(rustPostscript![1]).toContain("-dSAFER");
    expect(rustPostscript![1]).not.toContain("-dNOSAFER");
    expect(rustPostscript![1]).toContain("-sPermitFileReading=/workspace");
  });

  it("has identical identifiers in TypeScript Language union, Rust Language enum, and language_configs seed", () => {
    const tsUnion = parseTsLanguageUnion(read("src/types/index.ts"));
    const rustEnum = parseRustLanguageEnum(read("judge-worker-rs/src/types.rs"));
    const tsConfigs = parseTsLanguageConfigs(read("src/lib/judge/languages.ts"));

    // The DB seed comes from `DEFAULT_JUDGE_LANGUAGES = Object.values(JUDGE_LANGUAGE_CONFIGS)`,
    // so the TS language config map is the canonical set of seeded identifiers.
    expect(tsUnion).toEqual(rustEnum);
    expect(tsConfigs).toEqual(tsUnion);
    expect(rustEnum).toEqual(tsConfigs);
  });
});
