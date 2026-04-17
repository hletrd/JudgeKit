import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("recruiting invitations panel implementation", () => {
  it("lets admins invalidate a redeemed candidate password without revealing a new secret", () => {
    const source = read("src/components/contest/recruiting-invitations-panel.tsx");

    expect(source).toContain('handleResetAccountPassword(invitation: Invitation)');
    expect(source).toContain('JSON.stringify({ resetAccountPassword: true })');
    expect(source).not.toContain("temporaryPassword");
    expect(source).toContain('title={t("resetAccountPassword")}');
    expect(source).toContain('t("resetAccountPasswordConfirmTitle")');
  });
});
