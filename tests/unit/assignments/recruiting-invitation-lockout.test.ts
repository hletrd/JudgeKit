/**
 * Unit tests for the recruiting-invitation brute-force lockout surfacing and
 * its recovery paths.
 *
 * Background: after MAX_FAILED_REDEEM_ATTEMPTS failed account-password
 * attempts, redeemRecruitingToken rejects every attempt with "tokenLocked".
 * The recruit page uses isRecruitingInvitationLocked() to show an explicit
 * "Link locked" card instead of a generic error, and both organizer recovery
 * actions (account password reset, link regeneration) must clear the counter
 * so the lockout is not a permanent dead end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { hashPasswordMock } = vi.hoisted(() => ({
  hashPasswordMock: vi.fn().mockResolvedValue("argon2-hash"),
}));

// Mutable test state for the DB mock.
const state: {
  regenerateRowCount: number;
  capturedSets: Record<string, unknown>[];
  selectResult: unknown[];
} = {
  regenerateRowCount: 1,
  capturedSets: [],
  selectResult: [],
};

vi.mock("@/lib/db", () => {
  const makeUpdateChain = () => ({
    set: (arg: Record<string, unknown>) => {
      state.capturedSets.push(arg);
      return { where: () => Promise.resolve({ rowCount: state.regenerateRowCount }) };
    },
  });
  const tx = {
    update: () => makeUpdateChain(),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  };
  return {
    db: {
      update: () => makeUpdateChain(),
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(state.selectResult) }) }),
      }),
      transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
      insert: vi.fn(),
      delete: vi.fn(),
    },
    execTransaction: (cb: (t: typeof tx) => unknown) => cb(tx),
  };
});

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z")),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/password-hash", () => ({
  hashPassword: hashPasswordMock,
  verifyAndRehashPassword: vi.fn(),
}));

import {
  isRecruitingInvitationLocked,
  regenerateRecruitingInvitationToken,
  resetRecruitingInvitationAccountPassword,
} from "@/lib/assignments/recruiting-invitations";

const FAILED_KEY = "_sys.failedRedeemAttempts";
const RESET_KEY = "_sys.accountPasswordResetRequired";

beforeEach(() => {
  state.regenerateRowCount = 1;
  state.capturedSets = [];
  state.selectResult = [];
  vi.clearAllMocks();
});

describe("isRecruitingInvitationLocked", () => {
  it("returns false for missing/empty metadata", () => {
    expect(isRecruitingInvitationLocked(undefined)).toBe(false);
    expect(isRecruitingInvitationLocked(null)).toBe(false);
    expect(isRecruitingInvitationLocked({})).toBe(false);
  });

  it("returns false below the threshold", () => {
    expect(isRecruitingInvitationLocked({ [FAILED_KEY]: "0" })).toBe(false);
    expect(isRecruitingInvitationLocked({ [FAILED_KEY]: "4" })).toBe(false);
  });

  it("returns true at and above the threshold (5)", () => {
    expect(isRecruitingInvitationLocked({ [FAILED_KEY]: "5" })).toBe(true);
    expect(isRecruitingInvitationLocked({ [FAILED_KEY]: "6" })).toBe(true);
    expect(isRecruitingInvitationLocked({ [FAILED_KEY]: "99" })).toBe(true);
  });

  it("ignores unrelated metadata keys", () => {
    expect(isRecruitingInvitationLocked({ department: "Eng", [RESET_KEY]: "true" })).toBe(false);
  });
});

describe("regenerateRecruitingInvitationToken", () => {
  it("returns a fresh token that matches the recruiting-token format", async () => {
    const token = await regenerateRecruitingInvitationToken("invite-1");
    // Mirrors the auth-side format gate: base64url, 16-128 chars.
    expect(token).toMatch(/^[-A-Za-z0-9_]{16,128}$/);
  });

  it("persists a new token hash AND clears the brute-force counter", async () => {
    await regenerateRecruitingInvitationToken("invite-1");
    expect(state.capturedSets).toHaveLength(1);
    const setArg = state.capturedSets[0];
    // A new hash is written...
    expect(typeof setArg.tokenHash).toBe("string");
    // ...and metadata is updated in the same statement (the jsonb_set that
    // resets the lockout counter). Without this the regenerated link would
    // still be locked.
    expect(setArg.metadata).toBeDefined();
    expect(setArg.updatedAt).toBeDefined();
  });

  it("throws when the row cannot be updated (e.g. revoked / missing)", async () => {
    state.regenerateRowCount = 0;
    await expect(regenerateRecruitingInvitationToken("invite-1")).rejects.toThrow(
      "invitationCannotRegenerateToken",
    );
  });
});

describe("resetRecruitingInvitationAccountPassword", () => {
  it("clears the brute-force lockout counter so the reset is a real recovery path", async () => {
    state.selectResult = [
      {
        id: "invite-1",
        status: "redeemed",
        userId: "user-1",
        metadata: { [FAILED_KEY]: "5", department: "Eng" },
      },
    ];

    await resetRecruitingInvitationAccountPassword("invite-1");

    // Find the recruiting_invitations update (the one writing metadata).
    const invitationSet = state.capturedSets.find(
      (s) => s.metadata && typeof s.metadata === "object",
    );
    expect(invitationSet).toBeDefined();
    const metadata = invitationSet!.metadata as Record<string, string>;
    expect(metadata[FAILED_KEY]).toBe("0");
    expect(metadata[RESET_KEY]).toBe("true");
    // Unrelated metadata is preserved.
    expect(metadata.department).toBe("Eng");
  });

  it("rejects when the invitation is not a redeemed candidate", async () => {
    state.selectResult = [
      { id: "invite-1", status: "pending", userId: null, metadata: {} },
    ];
    await expect(resetRecruitingInvitationAccountPassword("invite-1")).rejects.toThrow(
      "accountPasswordResetRequiresRedeemed",
    );
  });
});
