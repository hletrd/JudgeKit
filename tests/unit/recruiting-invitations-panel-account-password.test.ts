import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("recruiting invitations panel account-password reset", () => {
  it("lets admins invalidate the old recruiting password without revealing a new secret in the UI", () => {
    const source = read("src/components/contest/recruiting-invitations-panel.tsx");

    expect(source).toContain('handleResetAccountPassword(invitation: Invitation)');
    expect(source).toContain('JSON.stringify({ resetAccountPassword: true })');
    expect(source).not.toContain("setRevealedTemporaryPassword");
    expect(source).toContain('title={t("resetAccountPassword")}');
  });
});
