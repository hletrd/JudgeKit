import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin capability alignment", () => {
  it("keeps plugin pages, routes, and actions aligned on system.plugins", () => {
    expect(read("src/app/(dashboard)/dashboard/admin/plugins/page.tsx")).toContain('caps.has("system.plugins")');
    expect(read("src/app/api/v1/admin/plugins/route.ts")).toContain('auth: { capabilities: ["system.plugins"] }');
    expect(read("src/app/api/v1/admin/plugins/[id]/route.ts")).toContain('auth: { capabilities: ["system.plugins"] }');
    expect(read("src/lib/actions/plugins.ts")).toContain('caps.has("system.plugins")');
    expect(read("src/app/api/v1/plugins/chat-widget/test-connection/route.ts")).toContain('caps.has("system.plugins")');
  });

  it("keeps API key pages and routes aligned on system.settings", () => {
    expect(read("src/app/(dashboard)/dashboard/admin/api-keys/page.tsx")).toContain('caps.has("system.settings")');
    expect(read("src/app/api/v1/admin/api-keys/route.ts")).toContain('auth: { capabilities: ["system.settings"] }');
    expect(read("src/app/api/v1/admin/api-keys/[id]/route.ts")).toContain('auth: { capabilities: ["system.settings"] }');
  });

  it("keeps backup/import/export routes aligned on system.backup", () => {
    expect(read("src/app/(dashboard)/dashboard/admin/settings/page.tsx")).toContain('caps.has("system.backup")');
    expect(read("src/app/api/v1/admin/backup/route.ts")).toContain('caps.has("system.backup")');
    expect(read("src/app/api/v1/admin/restore/route.ts")).toContain('caps.has("system.backup")');
    expect(read("src/app/api/v1/admin/migrate/export/route.ts")).toContain('caps.has("system.backup")');
    expect(read("src/app/api/v1/admin/migrate/import/route.ts")).toContain('caps.has("system.backup")');
    expect(read("src/app/api/v1/admin/migrate/validate/route.ts")).toContain('caps.has("system.backup")');
  });

  it("keeps language pages, routes, and actions aligned on system.settings", () => {
    expect(read("src/app/(dashboard)/dashboard/admin/languages/page.tsx")).toContain('caps.has("system.settings")');
    expect(read("src/app/api/v1/admin/languages/route.ts")).toContain('auth: { capabilities: ["system.settings"] }');
    expect(read("src/app/api/v1/admin/languages/[language]/route.ts")).toContain('auth: { capabilities: ["system.settings"] }');
    expect(read("src/lib/actions/language-configs.ts")).toContain('caps.has("system.settings")');
  });

  it("keeps tag pages and actions aligned on system.settings", () => {
    expect(read("src/app/(dashboard)/dashboard/admin/tags/page.tsx")).toContain('caps.has("system.settings")');
    expect(read("src/lib/actions/tag-management.ts")).toContain('caps.has("system.settings")');
  });
});
