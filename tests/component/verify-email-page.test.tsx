import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerifyEmailPage from "@/app/(auth)/verify-email/page";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

let mockToken: string | null = "valid-token";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "token") return mockToken;
      return null;
    },
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      verifyEmailTitle: "Verify Email",
      verifying: "Verifying your email...",
      verifySuccess: "Email verified successfully.",
      verifyFailed: "Verification failed. Please try again.",
      invalidOrExpiredToken: "Invalid or expired token.",
      signIn: "Sign In",
      backToSignIn: "Back to Sign In",
    };
    return translations[key] ?? key;
  },
}));

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken = "valid-token";
  });

  it("renders error state immediately when token is missing", () => {
    mockToken = null;
    render(<VerifyEmailPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid or expired token.");
    expect(screen.getByRole("button", { name: "Back to Sign In" })).toBeInTheDocument();
  });

  it("shows loading state then success on valid verification", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<VerifyEmailPage />);

    expect(screen.getByText("Verifying your email...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Email verified successfully.");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token" }),
    });
  });

  it("shows error on 4xx response with invalid token", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalidOrExpiredToken" }),
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid or expired token.");
    });
  });

  it("shows generic error on 4xx response with unknown error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "unknown" }),
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Verification failed. Please try again.");
    });
  });

  it("shows error on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Verification failed. Please try again.");
    });
  });

  it("navigates to login on button click after success", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(pushMock).toHaveBeenCalledWith("/login");
  });

  it("navigates to login on button click after error", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<VerifyEmailPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Back to Sign In" }));
    expect(pushMock).toHaveBeenCalledWith("/login");
  });
});
