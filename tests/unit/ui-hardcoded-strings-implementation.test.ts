import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("UI hardcoded-string guards", () => {
  it("removes the known hardcoded English fallback strings from reviewed UI surfaces", () => {
    const checks: Array<{ path: string; forbidden: string[]; required?: string[] }> = [
      {
        path: "src/app/(dashboard)/dashboard/admin/error.tsx",
        forbidden: ["Something went wrong", "Try Again"],
        required: ['useTranslations("dashboardState")'],
      },
      {
        path: "src/app/(dashboard)/dashboard/admin/users/[id]/not-found.tsx",
        forbidden: ["Not Found", "Back to Dashboard"],
        required: ['getTranslations("dashboardState")'],
      },
      {
        path: "src/app/(dashboard)/dashboard/submissions/[id]/not-found.tsx",
        forbidden: ["Not Found", "Back to Dashboard"],
        required: ['getTranslations("dashboardState")'],
      },
      {
        path: "src/app/(dashboard)/dashboard/groups/[id]/not-found.tsx",
        forbidden: ["Not Found", "Back to Dashboard"],
        required: ['getTranslations("dashboardState")'],
      },
      {
        path: "src/components/exam/anti-cheat-monitor.tsx",
        forbidden: ["Tab switch detected. An integrity signal has been recorded for review."],
        required: ['useTranslations("contests.antiCheat")'],
      },
      {
        path: "src/components/lecture/lecture-problem-view.tsx",
        forbidden: [">Problem<", ">Code<"],
        required: ['useTranslations("lecture")'],
      },
      {
        path: "src/components/lecture/lecture-toolbar.tsx",
        forbidden: ["Problem only (1)", "Split view (2)", "Code only (3)", "Fullscreen (F)"],
        required: ['useTranslations("lecture")'],
      },
      {
        path: "src/components/lecture/submission-overview.tsx",
        forbidden: ['"Submission Stats"', '"Accepted:"', '"Wrong:"', '"Recent"'],
        required: ['useTranslations("lecture")'],
      },
      {
        path: "src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/assignment-overview.tsx",
        forbidden: ['"Solved"', '"Attempted"', '"Untried"'],
      },
      {
        path: "src/components/destructive-action-dialog.tsx",
        forbidden: ['"Processing..."'],
        required: ['useTranslations("common")'],
      },
      {
        path: "src/components/language-selector.tsx",
        forbidden: ["Select Language", "Search languages...", "Recently Used", "No languages found."],
        required: ['useTranslations("problems")'],
      },
      {
        path: "src/components/code/copy-code-button.tsx",
        forbidden: ['"Copy code"'],
        required: ['useTranslations("common")'],
      },
    ];

    for (const check of checks) {
      const source = read(check.path);
      for (const forbidden of check.forbidden) {
        expect(source).not.toContain(forbidden);
      }
      for (const required of check.required ?? []) {
        expect(source).toContain(required);
      }
    }
  });
});
