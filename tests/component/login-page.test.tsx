import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/(auth)/login/page";

const { getResolvedSystemSettingsMock } = vi.hoisted(() => ({
  getResolvedSystemSettingsMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      auth: {
        signInDescription: "Sign in to your account",
        identifier: "Username or Email",
        needAccount: "Need an account?",
        createAccount: "Create account",
      },
      common: {
        appName: "JudgeKit",
        appDescription: "Online judge",
      },
    };
    return translations[namespace]?.[key] ?? key;
  },
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedSystemSettings: getResolvedSystemSettingsMock,
}));

vi.mock("@/app/(auth)/login/login-form", () => ({
  LoginForm: () => <div>login-form</div>,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a sign-up link when public registration is enabled", async () => {
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
      publicSignupEnabled: true,
    });

    render(await LoginPage());

    expect(screen.getByText("JudgeKit")).toBeInTheDocument();
    expect(screen.getByText("login-form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to your account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
  });

  it("omits the sign-up link when public registration is disabled", async () => {
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
      publicSignupEnabled: false,
    });

    render(await LoginPage());

    expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  });
});
