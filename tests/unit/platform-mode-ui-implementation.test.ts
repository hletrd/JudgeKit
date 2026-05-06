import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("platform mode UI implementation", () => {
  it("shows the effective platform mode visibly in the dashboard layout header", () => {
    const source = read("src/app/(dashboard)/layout.tsx");
    const badge = read("src/components/layout/platform-mode-badge.tsx");

    // Cycle 2: the platform-mode badge moved out of the deleted sidebar
    // and into the PublicHeader trailing slot. The dashboard layout still
    // resolves the effective mode and threads it through to the badge.
    expect(source).toContain("effectivePlatformMode");
    expect(source).toContain("PlatformModeBadge");
    expect(source).toContain("platformMode={effectivePlatformMode}");
    expect(badge).toContain("platformModes.${platformMode}");
    expect(badge).toContain("export async function PlatformModeBadge");
  });

  it("shows an operational-mode warning block in system settings", () => {
    const source = read("src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx");

    expect(source).toContain('const platformPolicy = useMemo(() => getPlatformModePolicy(platformMode), [platformMode]);');
    expect(source).toContain('t("platformModeOperationalTitle")');
    expect(source).toContain('t("platformModeHighStakesNotice")');
  });
});
