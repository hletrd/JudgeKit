import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Messages = Record<string, unknown>;

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function walk(dir: string, exts: Set<string>, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const relativePath = join(dir, entry);
    const fullPath = join(process.cwd(), relativePath);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walk(relativePath, exts, acc);
      continue;
    }

    const extension = relativePath.split(".").pop() ?? "";
    if (exts.has(extension)) {
      acc.push(relativePath);
    }
  }

  return acc;
}

function getAtPath(messages: Messages, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, messages);
}

describe("UI i18n key coverage", () => {
  it("keeps literal translation keys used by app/components present in both en and ko bundles", () => {
    const en = JSON.parse(read("messages/en.json")) as Messages;
    const ko = JSON.parse(read("messages/ko.json")) as Messages;
    const uiFiles = [
      ...walk("src/app", new Set(["ts", "tsx"])),
      ...walk("src/components", new Set(["ts", "tsx"])),
    ];

    const namespacePattern =
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\("([^"]+)"\)/g;
    const keyCallPattern = /(?<![A-Za-z0-9_])(\w+)\("([A-Za-z0-9_.-]+)"/g;

    /**
     * Strip comments before pattern-matching so JSDoc @example blocks don't
     * register fake translation calls (e.g. contest-status-styles.ts has an
     * example that aliases `t` to a different namespace inside a comment).
     */
    function stripComments(src: string): string {
      return src
        // Remove block comments (incl. JSDoc).
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Remove single-line comments.
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    }

    const missing: string[] = [];

    for (const file of uiFiles) {
      const source = stripComments(read(file));
      const namespaces = new Map<string, string>();

      for (const match of source.matchAll(namespacePattern)) {
        namespaces.set(match[1], match[2]);
      }

      for (const match of source.matchAll(keyCallPattern)) {
        const helperName = match[1];
        const key = match[2];
        const namespace = namespaces.get(helperName);
        if (!namespace) continue;

        const fullKey = `${namespace}.${key}`;
        for (const [lang, messages] of [
          ["en", en],
          ["ko", ko],
        ] as const) {
          if (getAtPath(messages, fullKey) === undefined) {
            missing.push(`${lang}:${file}:${fullKey}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
