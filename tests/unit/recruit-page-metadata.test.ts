import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRecruitingInvitationByTokenMock, getDbNowMock } = vi.hoisted(() => ({
  getRecruitingInvitationByTokenMock: vi.fn(),
  getDbNowMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => {
    const messages: Record<string, string> = {
      title: "Coding Assessment",
      ogDescription: "You've been invited to a coding assessment. Click to begin.",
      invalidToken: "Invalid link",
      expired: "Link expired",
      claimed: "Assessment already claimed",
      claimedDescription:
        "This invitation has already been used. Continue from your existing assessment session on this device, or sign in with your recruiting email and account password.",
    };
    return messages[key] ?? key;
  },
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  getRecruitingInvitationByToken: getRecruitingInvitationByTokenMock,
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/compiler/catalog", () => ({
  getEnabledCompilerLanguages: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db-time", () => ({
  // getDbNow uses React.cache() which calls rawQueryOne internally;
  // mock it to return a fixed date so tests don't need a DB pool.
  getDbNow: getDbNowMock,
}));

vi.mock("@/lib/db/schema", () => ({
  assignments: { id: "id", title: "title", description: "description", examDurationMinutes: "examDurationMinutes", deadline: "deadline" },
  assignmentProblems: { assignmentId: "assignmentId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

import RecruitPage, { generateMetadata } from "@/app/(auth)/recruit/[token]/page";

describe("recruit page metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DB time is a fixed reference point
    getDbNowMock.mockResolvedValue(new Date("2026-04-20T12:00:00Z"));
  });

  it("uses generic metadata for valid public invite tokens instead of leaking assignment titles", async () => {
    getRecruitingInvitationByTokenMock.mockResolvedValue({
      id: "invite-1",
      status: "pending",
      assignmentId: "assignment-1",
      candidateName: "Candidate One",
      expiresAt: null,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ token: "invite-token" }),
    });

    expect(metadata.title).toBe("Coding Assessment");
    expect(metadata.description).toBe(
      "You've been invited to a coding assessment. Click to begin."
    );
  });

  it("still uses the claimed-state metadata for redeemed tokens", async () => {
    getRecruitingInvitationByTokenMock.mockResolvedValue({
      id: "invite-2",
      status: "redeemed",
      assignmentId: "assignment-2",
      candidateName: "Candidate Two",
      expiresAt: null,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ token: "invite-token" }),
    });

    expect(metadata.title).toBe("Assessment already claimed");
    expect(metadata.description).toContain("already been used");
  });

  it("uses DB-sourced time for expiry checks instead of new Date()", async () => {
    // Verify that getDbNow is called by generateMetadata, ensuring temporal
    // comparisons use the DB server clock (not the app server clock) to
    // avoid clock-skew inconsistency with the API validation route.
    getRecruitingInvitationByTokenMock.mockResolvedValue({
      id: "invite-3",
      status: "pending",
      assignmentId: "assignment-3",
      candidateName: "Candidate Three",
      expiresAt: null,
    });

    await generateMetadata({ params: Promise.resolve({ token: "invite-token" }) });

    expect(getDbNowMock).toHaveBeenCalled();
  });

  it("shows expired metadata when DB time is past the invitation expiry", async () => {
    // Invitation expires at 11:00 UTC, DB time is 12:00 UTC
    getRecruitingInvitationByTokenMock.mockResolvedValue({
      id: "invite-4",
      status: "pending",
      assignmentId: "assignment-4",
      candidateName: "Candidate Four",
      expiresAt: new Date("2026-04-20T11:00:00Z"),
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ token: "invite-token" }),
    });

    expect(metadata.title).toBe("Link expired");
  });
});
