import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("problem editor scroll implementation", () => {
  it("marks both textarea and CodeMirror editor surfaces as vertical pan targets for touch scrolling", () => {
    const codeEditorSource = read("src/components/code/code-editor.tsx");
    const codeSurfaceSource = read("src/components/code/code-surface.tsx");

    expect(codeEditorSource).toContain("overflow-auto");
    expect(codeEditorSource).toContain('resize: "vertical"');

    expect(codeSurfaceSource).toContain("overflow-hidden");
    expect(codeSurfaceSource).toContain('".cm-scroller": {');
    expect(codeSurfaceSource).toContain('overflow: "auto"');
  });
});

describe("problem editor lecture typography", () => {
  it("uses the problem body font size for CodeMirror and raw textarea editors", () => {
    const globalsCss = read("src/app/globals.css");
    const codeEditorSource = read("src/components/code/code-editor.tsx");
    const codeSurfaceSource = read("src/components/code/code-surface.tsx");

    expect(globalsCss).toMatch(
      /\.lecture-mode\s*\{[^}]*--lecture-base-size:\s*calc\(1\.125rem \* var\(--lecture-font-scale\)\)/,
    );
    expect(globalsCss).toMatch(
      /\.lecture-mode \.problem-description\s*\{[^}]*font-size:\s*var\(--lecture-base-size\)/,
    );
    expect(globalsCss).toMatch(
      /\.lecture-mode \.code-surface:not\(\.code-viewer\)\s*\{[^}]*--code-surface-font-size:\s*var\(--lecture-base-size\)/,
    );
    expect(codeSurfaceSource).toContain(
      'fontSize: "var(--code-surface-font-size, 0.875rem)"',
    );
    expect(codeEditorSource).toContain(
      'fontSize: "var(--code-surface-font-size, 0.875rem)"',
    );
  });
});
