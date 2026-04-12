import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("recruiting invitations panel implementation", () => {
  it("lets admins reset a redeemed candidate resume code and reveal the fresh value once", () => {
    const source = read("src/components/contest/recruiting-invitations-panel.tsx");

    expect(source).toContain('handleResetResumeCode(invitation: Invitation)');
    expect(source).toContain('JSON.stringify({ resetResumeCode: true })');
    expect(source).toContain('setRevealedResumeCode({ candidateName: invitation.candidateName, code });');
    expect(source).toContain('title={t("resetResumeCode")}');
    expect(source).toContain('t("resumeCodeRevealTitle", { name: revealedResumeCode.candidateName })');
  });
});
