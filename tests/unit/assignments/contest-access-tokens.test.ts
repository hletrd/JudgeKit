import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { tokenFindFirstMock } = vi.hoisted(() => ({
  tokenFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      contestAccessTokens: {
        findFirst: tokenFindFirstMock,
      },
    },
  },
}));

import {
  CONTEST_ACCESS_TOKEN_VALIDITY_SQL,
  contestAccessTokenExpiry,
  findValidContestAccessToken,
} from "@/lib/assignments/contest-access-tokens";

const NOW_MS = new Date("2026-04-20T12:00:00Z").valueOf();

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

// RPF cycle-6 AGG6-1: ONE validity semantic for contest access tokens.
describe("findValidContestAccessToken", () => {
  beforeEach(() => {
    tokenFindFirstMock.mockReset();
  });

  it("returns null when no token exists", async () => {
    tokenFindFirstMock.mockResolvedValue(undefined);
    await expect(findValidContestAccessToken("a-1", "u-1", NOW_MS)).resolves.toBeNull();
  });

  it("accepts a token without expiry", async () => {
    tokenFindFirstMock.mockResolvedValue({ id: "t-1", expiresAt: null });
    await expect(findValidContestAccessToken("a-1", "u-1", NOW_MS)).resolves.toEqual({
      id: "t-1",
      expiresAt: null,
    });
  });

  it("accepts a token expiring in the future", async () => {
    const expiresAt = new Date(NOW_MS + 60_000);
    tokenFindFirstMock.mockResolvedValue({ id: "t-1", expiresAt });
    await expect(findValidContestAccessToken("a-1", "u-1", NOW_MS)).resolves.toEqual({
      id: "t-1",
      expiresAt,
    });
  });

  it("rejects an expired token — indistinguishable from no token", async () => {
    tokenFindFirstMock.mockResolvedValue({ id: "t-1", expiresAt: new Date(NOW_MS - 1) });
    await expect(findValidContestAccessToken("a-1", "u-1", NOW_MS)).resolves.toBeNull();
  });

  it("rejects a token expiring exactly now (strict >, matching SQL expires_at > NOW())", async () => {
    tokenFindFirstMock.mockResolvedValue({ id: "t-1", expiresAt: new Date(NOW_MS) });
    await expect(findValidContestAccessToken("a-1", "u-1", NOW_MS)).resolves.toBeNull();
  });
});

describe("contestAccessTokenExpiry", () => {
  it("uses the late deadline when configured (the effective close)", () => {
    const deadline = new Date("2026-05-01T00:00:00Z");
    const lateDeadline = new Date("2026-05-02T00:00:00Z");
    expect(contestAccessTokenExpiry({ deadline, lateDeadline })).toBe(lateDeadline);
  });

  it("falls back to the deadline", () => {
    const deadline = new Date("2026-05-01T00:00:00Z");
    expect(contestAccessTokenExpiry({ deadline, lateDeadline: null })).toBe(deadline);
  });

  it("returns null when the assignment has no close", () => {
    expect(contestAccessTokenExpiry({ deadline: null, lateDeadline: null })).toBeNull();
  });
});

// Structural pins: the shared semantic must actually be consumed everywhere —
// a re-inlined copy is exactly the drift AGG6-1 closed.
describe("contest access-token validity — single-source consumption pins", () => {
  it("raw-SQL gates interpolate the shared validity constant (alias cat)", () => {
    expect(CONTEST_ACCESS_TOKEN_VALIDITY_SQL).toContain("cat.expires_at");
    for (const file of [
      "src/lib/assignments/contests.ts",
      "src/lib/platform-mode-context.ts",
      "src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts",
    ]) {
      const source = read(file);
      expect(source, `${file} must use the shared validity SQL`).toContain(
        "CONTEST_ACCESS_TOKEN_VALIDITY_SQL"
      );
      // No inline re-declarations of the expiry rule outside the module.
      expect(source, `${file} must not inline the expiry rule`).not.toMatch(
        /expires_at IS NULL OR [a-z.]*expires_at > NOW\(\)/
      );
    }
  });

  it("Drizzle gates consume findValidContestAccessToken", () => {
    for (const file of [
      "src/lib/assignments/submissions.ts",
      "src/lib/assignments/public-contests.ts",
    ]) {
      const source = read(file);
      expect(source, `${file} must use the shared finder`).toContain(
        "findValidContestAccessToken("
      );
      expect(source, `${file} must not query the token table inline`).not.toContain(
        "db.query.contestAccessTokens.findFirst"
      );
    }
  });

  it("both token-creation sites set the effective-close expiry", () => {
    for (const file of [
      "src/app/api/v1/contests/[assignmentId]/invite/route.ts",
      "src/lib/assignments/recruiting-invitations.ts",
    ]) {
      const source = read(file);
      expect(source, `${file} must use contestAccessTokenExpiry`).toContain(
        "expiresAt: contestAccessTokenExpiry(assignment)"
      );
    }
  });
});
