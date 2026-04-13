import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecruitStartForm } from "@/app/(auth)/recruit/[token]/recruit-start-form";

const { pushMock, refreshMock, signInMock, signOutMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: refreshMock }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({ startAssessment: "Start Assessment", continueAssessment: "Continue Assessment", starting: "Starting...", startFailed: "Couldn't start. Try again.", accountPasswordLabel: "Account password", accountPasswordPlaceholder: "Create your account password", accountPasswordHint: "Use this password to sign in later with your recruiting email through the normal login page.", accountPasswordMissing: "Create an account password to continue." }[key] ?? key) }));
vi.mock("next-auth/react", () => ({ signIn: signInMock, signOut: signOutMock }));

describe("RecruitStartForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue(undefined);
    signInMock.mockResolvedValue({ ok: true });
  });

  it("requires an account password on first claim and includes it in sign-in", async () => {
    const user = userEvent.setup();
    render(<RecruitStartForm token="invite-token" assignmentId="assignment-1" isReentry={false} resumeWithCurrentSession={false} requiresAccountPassword />);

    await user.type(screen.getByLabelText("Account password"), "account-password");
    await user.click(screen.getByRole("button", { name: "Start Assessment" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
      expect(signInMock).toHaveBeenCalledWith("credentials", { recruitToken: "invite-token", recruitAccountPassword: "account-password", redirect: false });
      expect(pushMock).toHaveBeenCalledWith("/dashboard/contests/assignment-1");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("shows a validation error when the account password is missing", async () => {
    const user = userEvent.setup();
    render(<RecruitStartForm token="invite-token" assignmentId="assignment-claim" isReentry={false} resumeWithCurrentSession={false} requiresAccountPassword />);

    await user.click(screen.getByRole("button", { name: "Start Assessment" }));

    expect(screen.getByText("Create an account password to continue.")).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("reuses the current session without replaying the invite token", async () => {
    const user = userEvent.setup();
    render(<RecruitStartForm token="invite-token" assignmentId="assignment-4" isReentry resumeWithCurrentSession requiresAccountPassword={false} />);

    await user.click(screen.getByRole("button", { name: "Continue Assessment" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard/contests/assignment-4");
      expect(refreshMock).toHaveBeenCalled();
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });
});
