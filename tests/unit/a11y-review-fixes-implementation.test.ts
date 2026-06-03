import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string) {
  return readFileSync(join(process.cwd(), p), "utf8");
}

// Guards for the accessibility findings from the 2026-06-03 multi-agent review.
describe("a11y review fixes", () => {
  it("M6: stderr / timed-out markers use a >=4.5:1 amber in light mode (not yellow-600)", () => {
    const form = read("src/components/problem/problem-submission-form.tsx");
    const compiler = read("src/components/code/compiler-client.tsx");
    expect(form).toContain("text-yellow-700 dark:text-yellow-400");
    expect(compiler).toContain("text-yellow-700 dark:text-yellow-400");
    // the failing light-mode color must not return on these markers
    expect(form).not.toContain('text-xs text-yellow-600');
    expect(compiler).not.toContain('font-medium text-yellow-600');
  });

  it("M5: side-by-side diff marks add/remove rows with a +/- cue (not color alone)", () => {
    const diff = read("src/components/submissions/output-diff-view.tsx");
    expect(diff).toContain('left?.kind === "remove" ? "-" : left?.kind === "add" ? "+"');
    expect(diff).toContain('right?.kind === "add" ? "+" : right?.kind === "remove" ? "-"');
  });

  it("H6: fullscreen code-editor overlay is a focus-managed modal dialog", () => {
    const editor = read("src/components/code/code-editor.tsx");
    expect(editor).toContain('role: "dialog"');
    expect(editor).toContain('"aria-modal": true');
    expect(editor).toContain("handleTabTrap"); // focus trap inside the overlay
    expect(editor).toContain("restoreFocusRef.current?.focus?.()"); // focus restore on close
  });
});
