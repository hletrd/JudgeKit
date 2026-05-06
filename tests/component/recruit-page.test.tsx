import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, dbSelectMock, getRecruitingInvitationByTokenMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  dbSelectMock: vi.fn(),
  getRecruitingInvitationByTokenMock: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      title: "Coding Assessment",
      description: "You're invited to a coding assessment.",
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
      accountPasswordResetRequiredNotice: "Your previous recruiting password was invalidated. Choose a new account password below to continue this assessment.",
      languageCountDetail: "{count} languages available in the editor",
      languageListMore: "+{count} more",
      goToLogin: "Go to login",
    };

    if (key === "welcome") return `Welcome, ${values?.name ?? ""}`;
    if (key === "problemCount") return `${values?.count ?? 0} problems`;
    if (key === "durationDetail") return `Time limit: ${values?.minutes ?? 0} minutes`;
    if (key === "deadlineInfo") return `Deadline: ${values?.date ?? ""}`;
    if (key === "languageCountDetail") return `${values?.count ?? 0} languages available in the editor`;
    if (key === "languageListMore") return `+${values?.count ?? 0} more`;
    return messages[key] ?? key;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));
vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: async () => null,
}));
vi.mock("@/lib/security/ip", () => ({
  extractClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/assignments/recruiting-invitations", () => ({ getRecruitingInvitationByToken: getRecruitingInvitationByTokenMock }));
vi.mock("@/lib/compiler/catalog", () => ({
  getEnabledCompilerLanguages: vi.fn(async () => [
    { id: "lang-1", language: "python", displayName: "Python", standard: "3.14", extension: ".py" },
    { id: "lang-2", language: "javascript", displayName: "JavaScript", standard: null, extension: ".js" },
    { id: "lang-3", language: "cpp20", displayName: "C++", standard: "20", extension: ".cpp" },
    { id: "lang-4", language: "java", displayName: "Java", standard: "25", extension: ".java" },
    { id: "lang-5", language: "go", displayName: "Go", standard: "1.26", extension: ".go" },
    { id: "lang-6", language: "rust", displayName: "Rust", standard: "1.94", extension: ".rs" },
    { id: "lang-7", language: "swift", displayName: "Swift", standard: "6.2", extension: ".swift" },
  ]),
}));
vi.mock("@/lib/db", () => ({ db: { select: dbSelectMock } }));
vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn(async () => new Date()),
  getDbNow: vi.fn(async () => new Date()),
}));
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

    expect(screen.getByText("You're invited to a coding assessment.")).toBeInTheDocument();
    expect(screen.getByText("7 languages available in the editor")).toBeInTheDocument();
    expect(screen.getByText("Python (3.14)")).toBeInTheDocument();
    expect(screen.getByText("JavaScript")).toBeInTheDocument();
    expect(screen.getByText("C++ (20)")).toBeInTheDocument();
    expect(screen.getByText("Java (25)")).toBeInTheDocument();
    expect(screen.getByText("Go (1.26)")).toBeInTheDocument();
    expect(screen.getByText("Rust (1.94)")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.getByTestId("recruit-start-form")).toHaveAttribute("data-requires-account-password", "true");
  });

  it("keeps claimed invites on the original link with password-based re-entry", async () => {
    getRecruitingInvitationByTokenMock.mockResolvedValue({ id: "invite-2", status: "redeemed", assignmentId: "assignment-2", candidateName: "Candidate Two", candidateEmail: "candidate@example.com", expiresAt: null, userId: "user-2", metadata: {} });
    mockSelectQueue([{ id: "assignment-2", title: "Recruiting Assignment", description: "Assessment details", examDurationMinutes: 90, deadline: null }],[{ count: 2 }]);

    render(await RecruitPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByText("You're invited to a coding assessment.")).toBeInTheDocument();
    expect(screen.getByText(/sign in later with your recruiting email and account password/i)).toBeInTheDocument();
    expect(screen.getByTestId("recruit-start-form")).toHaveAttribute("data-reentry", "true");
  });

  it("lets the claimed candidate continue with their current session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-3" } });
    getRecruitingInvitationByTokenMock.mockResolvedValue({ id: "invite-3", status: "redeemed", assignmentId: "assignment-3", candidateName: "Candidate Three", candidateEmail: "candidate@example.com", expiresAt: null, userId: "user-3", metadata: {} });
    mockSelectQueue([{ id: "assignment-3", title: "Claimed Assessment", description: "Assessment details", examDurationMinutes: 60, deadline: null }],[{ count: 1 }]);

    render(await RecruitPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByText("Welcome, Candidate Three")).toBeInTheDocument();
    expect(screen.getByTestId("recruit-start-form")).toHaveAttribute("data-resume", "true");
  });

  it("shows the password-reset re-entry flow when the organizer invalidated the old password", async () => {
    getRecruitingInvitationByTokenMock.mockResolvedValue({
      id: "invite-4",
      status: "redeemed",
      assignmentId: "assignment-4",
      candidateName: "Candidate Four",
      candidateEmail: "candidate@example.com",
      expiresAt: null,
      userId: "user-4",
      metadata: { "_sys.accountPasswordResetRequired": "true" },
    });
    mockSelectQueue(
      [{
        id: "assignment-4",
        title: "Reset Assessment",
        description: "Assessment details",
        examDurationMinutes: 45,
        deadline: null,
      }],
      [{ count: 1 }]
    );

    render(await RecruitPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByText("You're invited to a coding assessment.")).toBeInTheDocument();
    expect(screen.getByText(/previous recruiting password was invalidated/i)).toBeInTheDocument();
    expect(screen.getByTestId("recruit-start-form")).toHaveAttribute(
      "data-requires-account-password",
      "true"
    );
    expect(screen.queryByRole("link", { name: "Go to login" })).not.toBeInTheDocument();
  });
});
