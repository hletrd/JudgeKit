import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("problem page anti-cheat implementation", () => {
  it("mounts the anti-cheat monitor when the assignment context enables it", () => {
    // The dashboard problem detail page was migrated to a public route as
    // part of the workspace→public migration; the dashboard route is now a
    // redirect-only shell. Verify the anti-cheat wiring on the public page
    // and assert the dashboard shell is just a redirect.
    const dashboardShell = read("src/app/(dashboard)/dashboard/problems/[id]/page.tsx");
    const publicSource = read("src/app/(public)/practice/problems/[id]/page.tsx");

    expect(dashboardShell).toContain("redirect(");
    expect(dashboardShell).toContain("/practice/problems/");

    expect(publicSource).toContain('import { AntiCheatMonitor } from "@/components/exam/anti-cheat-monitor"');
    expect(publicSource).toContain("enableAntiCheat: true");
    expect(publicSource).toContain("enableAntiCheat: Boolean(assignment.enableAntiCheat)");
    // The mount now passes a runtime expression rather than the literal
    // boolean attribute so guests / non-exam contexts still render the
    // wrapping element but with the monitor disabled. The instructor
    // toggles `enableAntiCheat` per-assignment.
    expect(publicSource).toContain(
      "<AntiCheatMonitor assignmentId={assignmentContext.id} enabled={assignmentContext.enableAntiCheat} />",
    );
  });
});
