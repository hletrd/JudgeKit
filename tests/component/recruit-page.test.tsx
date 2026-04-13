import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, dbSelectMock, getRecruitingInvitationByTokenMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getRecruitingInvitationByTokenMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      title: "Coding Assessment",
      invalidToken: "Invalid link",
      invalidTokenDescription: "This link is invalid or has been revoked.",
      expired: "Link expired",
      expiredDescription: "This link has expired. Contact the organizer for a new one.",
      contestClosed: "Assessment closed",
      contestClosedDescription: "This assessment is closed.",
      importantNotes: "Before you start",
      noteTimer: "Timer note",
      noteSubmissions: "Submission note",
      noteCompletion: "Completion note",
      reviewNoticeTitle: "Assessment review notice",
      reviewNoticeSubmissions: "Review submissions note",
      reviewNoticeSignals: "Review signals note",
      reviewNoticeAi: "Review AI note",
      continueAssessment: "Continue Assessment",
      startAssessment: "Start Assessment",
      claimed: "Assessment already claimed",
      claimedDescription: "This invitation has already been used. Continue from your existing assessment session on this device, or sign in with your recruiting email and account password.",
      accountPasswordLoginNotice: "After your first start, you can sign in later with your recruiting email and account password through the normal login page.",
      goToLogin: "Go to login",
    };

    if (key === "welcome") return `Welcome, ${values?.name ?? ""}`;
    if (key === "problemCount") return `${values?.count ?? 0} problems`;
    if (key === "durationDetail") return `Time limit: ${values?.minutes ?? 0} minutes`;
    if (key === "deadlineInfo") return `Deadline: ${values?.date ?? ""}`;
    return messages[key] ?? key;
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/assignments/recruiting-invitations", () => ({ getRecruitingInvitationByToken: getRecruitingInvitationByTokenMock }));
vi.mock("@/lib/db", () => ({ db: { select: dbSelectMock } }));
vi.mock("@/app/(auth)/recruit/[token]/recruit-start-form", () => ({
  RecruitStartForm: ({ assignmentId, isReentry, resumeWithCurrentSession, requiresAccountPassword }: { assignmentId: string; isReentry: boolean; resumeWithCurrentSession: boolean; requiresAccountPassword: boolean }) => (
    <div data-testid="recruit-start-form" data-assignment-id={assignmentId} data-reentry={String(isReentry)} data-resume={String(resumeWithCurrentSession)} data-requires-account-password={String(requiresAccountPassword)} />
  ),
}));

import RecruitPage from "@/app/(auth)/recruit/[token]/page";

function mockSelectQueue(...results: unknown[][]) {
  dbSelectMock.mockImplementation(() => {
    const result = results.shift() ?? [];
    const whereResult = Promise.resolve(result) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
    whereResult.limit = async () => result;
    return { from: () => ({ where: () => whereResult }) };
  });
}

describe("RecruitPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(null);
  });

  it("renders the first-claim flow with an account password requirement", async () => {
    getRecruitingInvitationByTokenMock.mockResolvedValue({ id: "invite-1", status: "pending", assignmentId: "assignment-1", candidateName: "Candidate One", candidateEmail: "candidate@example.com", expiresAt: null, userId: null, metadata: {} });
    mockSelectQueue([{ id: "assignment-1", title: "Recruiting Assignment", description: "Assessment details", examDurationMinutes: 90, deadline: null }],[{ count: 2 }]);

    render(await RecruitPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByText("Welcome, Candidate One")).toBeInTheDocument();
    expect(screen.getByTestId("recruit-start-form")).toHaveAttribute("data-requires-account-password", "true");
  });

  it("requires standard login when the invite was already claimed on another session", async () => {
    getRecruitingInvitationByTokenMock.mockResolvedValue({ id: "invite-2", status: "redeemed", assignmentId: "assignment-2", candidateName: "Candidate Two", candidateEmail: "candidate@example.com", expiresAt: null, userId: "user-2", metadata: {} });
    mockSelectQueue([{ id: "assignment-2", title: "Recruiting Assignment", description: "Assessment details", examDurationMinutes: 90, deadline: null }],[{ count: 2 }]);

    render(await RecruitPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByText("Assessment already claimed")).toBeInTheDocument();
    expect(screen.getByText(/sign in with your recruiting email and account password/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute("href", "/login?callbackUrl=%2Fdashboard%2Fcontests%2Fassignment-2");
    expect(screen.queryByTestId("recruit-start-form")).not.toBeInTheDocument();
  });

  it("lets the claimed candidate continue with their current session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-3" } });
    getRecruitingInvitationByTokenMock.mockResolvedValue({ id: "invite-3", status: "redeemed", assignmentId: "assignment-3", candidateName: "Candidate Three", candidateEmail: "candidate@example.com", expiresAt: null, userId: "user-3", metadata: {} });
    mockSelectQueue([{ id: "assignment-3", title: "Claimed Assessment", description: "Assessment details", examDurationMinutes: 60, deadline: null }],[{ count: 1 }]);

    render(await RecruitPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByText("Welcome, Candidate Three")).toBeInTheDocument();
    expect(screen.getByTestId("recruit-start-form")).toHaveAttribute("data-resume", "true");
  });
});
