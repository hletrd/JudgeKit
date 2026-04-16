import type { ButtonHTMLAttributes, ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemSettingsForm } from "@/app/(dashboard)/dashboard/admin/settings/system-settings-form";
import { updateSystemSettings } from "@/lib/actions/system-settings";

const { refreshMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    (key: string, values?: Record<string, string>) =>
      values?.current ? `${key}:${values.current}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/lib/actions/system-settings", () => ({
  updateSystemSettings: vi.fn(),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    id?: string;
  }) => (
    <input
      {...props}
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      type="checkbox"
    />
  ),
}));

const updateSystemSettingsMock = vi.mocked(updateSystemSettings);

function renderForm(initialTimeZone = "UTC") {
  return render(
    <SystemSettingsForm
      initialSiteTitle="JudgeKit"
      initialSiteDescription="Description"
      initialTimeZone={initialTimeZone}
      initialPlatformMode="homework"
      initialDefaultLanguage="python"
      initialDefaultLocale="en"
      defaultSiteTitle="JudgeKit"
      defaultSiteDescription="Description"
      defaultTimeZone="Asia/Seoul"
      currentSiteTitle="JudgeKit"
      currentSiteDescription="Description"
      currentTimeZone={initialTimeZone}
      currentPlatformMode="homework"
      initialAiAssistantEnabled
      initialPublicSignupEnabled={false}
      initialSignupHcaptchaEnabled={false}
      signupHcaptchaAvailable={true}
      initialHcaptchaSiteKey=""
      initialHcaptchaSecretMasked=""
    />
  );
}

describe("SystemSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSystemSettingsMock.mockResolvedValue({ success: true });
  });

  it("submits UTC time zones even though they are not listed by Intl.supportedValuesOf", async () => {
    const user = userEvent.setup();
    renderForm("UTC");

    await user.clear(screen.getByLabelText("siteTitle"));
    await user.type(screen.getByLabelText("siteTitle"), "JudgeKit Updated");
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(updateSystemSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          siteTitle: "JudgeKit Updated",
          timeZone: "UTC",
          publicSignupEnabled: false,
          signupHcaptchaEnabled: false,
          defaultLanguage: "python",
        })
      );
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("updateSuccess");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("blocks invalid time zones before submit", async () => {
    const user = userEvent.setup();
    renderForm("Not/A/RealZone");

    await user.click(screen.getByRole("button", { name: "save" }));

    expect(updateSystemSettingsMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("invalidTimeZone");
  });
});
