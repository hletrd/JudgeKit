import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupPage from "@/app/(auth)/signup/page";

const { getResolvedSystemSettingsMock, notFoundMock } = vi.hoisted(() => ({
  getResolvedSystemSettingsMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      auth: {
        signUpDescription: "Create a public user account",
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

vi.mock("@/lib/security/hcaptcha", () => ({
  getHcaptchaSiteKey: () => Promise.resolve("site-key"),
  isHcaptchaConfigured: () => Promise.resolve(true),
}));

vi.mock("@/app/(auth)/signup/signup-form", () => ({
  SignupForm: () => <div>signup-form</div>,
}));

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the public signup form when enabled", async () => {
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
      publicSignupEnabled: true,
      signupHcaptchaEnabled: true,
    });

    render(await SignupPage());

    expect(screen.getByText("JudgeKit")).toBeInTheDocument();
    expect(screen.getByText("Create a public user account")).toBeInTheDocument();
    expect(screen.getByText("signup-form")).toBeInTheDocument();
  });

  it("calls notFound when public signup is disabled", async () => {
    getResolvedSystemSettingsMock.mockResolvedValue({
      siteTitle: "JudgeKit",
      siteDescription: "Online judge",
      publicSignupEnabled: false,
      signupHcaptchaEnabled: false,
    });

    await expect(SignupPage()).rejects.toThrow("NOT_FOUND");
  });
});
