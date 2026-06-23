import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin language Docker capability implementation", () => {
  it("surfaces backend Docker management capabilities and disables image mutations when unavailable", () => {
    const table = read("src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx");

    expect(table).toContain("parseDockerCapabilities(data.capabilities)");
    expect(table).toContain("dockerCapabilities?.canBuild !== true");
    expect(table).toContain("dockerCapabilities?.canRemove !== true");
    expect(table).toContain("dockerCapabilities?.canPrune !== true");
    expect(table).toContain('t("imageStatus.managementUnavailable")');
  });

  it("returns Docker management capabilities from the image listing API", () => {
    const route = read("src/app/api/v1/admin/docker/images/route.ts");
    const buildRoute = read("src/app/api/v1/admin/docker/images/build/route.ts");

    expect(route).toContain("getDockerManagementCapabilities()");
    expect(route).toContain("capabilities,");
    expect(route).toContain("dockerManagementUnavailable");
    expect(buildRoute).toContain("!capabilities.canBuild");
  });
});
