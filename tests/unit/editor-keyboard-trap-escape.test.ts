import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// WCAG 2.1.2 "No Keyboard Trap": the code editor binds `indentWithTab`, which
// captures Tab/Shift-Tab for indentation. Without a way to move focus out using
// only the keyboard, that would trap keyboard-only and screen-reader users in
// the editor. CodeMirror's accessibility guidance says: whenever you use
// indentWithTab, also bind Escape to move focus elsewhere. This test guards
// that the escape hatch can't be silently removed in a future refactor.
describe("editor keyboard-trap escape (WCAG 2.1.2)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/code/code-surface.tsx"), "utf8");

  it("still captures Tab for indentation (the reason an escape is required)", () => {
    expect(src).toContain("indentWithTab");
  });

  it("binds Escape to blur the editor so the next Tab/Shift-Tab leaves it", () => {
    expect(src).toMatch(/key:\s*"Escape"/);
    expect(src).toContain("view.contentDOM.blur()");
  });
});
