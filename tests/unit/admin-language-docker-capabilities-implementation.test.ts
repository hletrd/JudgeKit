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

  it("keeps admin language form help accessible and renders literal command placeholders", () => {
    const table = read("src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx");
    const en = read("messages/en.json");
    const ko = read("messages/ko.json");

    expect(table).toContain('aria-label={t("search")}');
    expect(table).toContain('aria-label={t("actions.more")}');
    expect(table).toContain('className="inline-flex size-8');
    expect(table).toContain('const commandPlaceholderTokens = { file: "{file}", binary: "{binary}" };');
    expect(table).toContain('t("edit.compileCommandHelp", commandPlaceholderTokens)');
    expect(table).toContain('t("edit.runCommandHelp", commandPlaceholderTokens)');
    expect(table).toContain('aria-describedby="add-required-fields-help"');
    expect(en).toContain('"requiredFields"');
    expect(ko).toContain('"requiredFields"');
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
