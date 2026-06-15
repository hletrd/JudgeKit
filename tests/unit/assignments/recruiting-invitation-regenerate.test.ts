import { beforeEach, describe, expect, it, vi } from "vitest";

// regenerateRecruitingInvitationToken issues a single atomic UPDATE guarded by
// status = 'pending' and returns the freshly minted plaintext token. These
// tests mock the drizzle update chain to (a) capture the values written to the
// row and (b) drive the RETURNING result that decides success vs. the
// not-regeneratable guard.

const { setMock, returningMock, getDbNowMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  returningMock: vi.fn(),
  getDbNowMock: vi.fn().mockResolvedValue(new Date("2026-06-15T00:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: (...args: unknown[]) => {
        setMock(...args);
        return { where: vi.fn(() => ({ returning: returningMock })) };
      },
    })),
  },
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowMock,
}));

import { regenerateRecruitingInvitationToken } from "@/lib/assignments/recruiting-invitations";
import { hashToken } from "@/lib/security/token-hash";

describe("regenerateRecruitingInvitationToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rotates the token and returns a fresh plaintext whose hash is what gets stored", async () => {
    returningMock.mockResolvedValue([
      { id: "inv-1", status: "pending", candidateEmail: null, expiresAt: null, metadata: {} },
    ]);

    const result = await regenerateRecruitingInvitationToken("inv-1");

    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.id).toBe("inv-1");

    // The persisted tokenHash must be the hash of the returned plaintext — that
    // is the whole point: the candidate's new link (plaintext) resolves to this
    // stored hash, and the previous link's hash no longer matches.
    const written = setMock.mock.calls[0][0] as { tokenHash: string };
    expect(written.tokenHash).toBe(hashToken(result.token));
  });

  it("throws invitationNotRegeneratable when the pending-guarded update matches no row", async () => {
    // Empty RETURNING = the row was not pending (redeemed/revoked) or gone.
    returningMock.mockResolvedValue([]);

    await expect(regenerateRecruitingInvitationToken("inv-x")).rejects.toThrow(
      "invitationNotRegeneratable",
    );
  });
});
