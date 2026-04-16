import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  isTrustedServerActionOrigin: vi.fn(),
  checkServerActionRateLimit: vi.fn(),
  getSystemSettings: vi.fn(),
  isHcaptchaConfigured: vi.fn(),
  verifyHcaptchaToken: vi.fn(),
  validateAndHashPassword: vi.fn(),
  isUsernameTaken: vi.fn(),
  isEmailTaken: vi.fn(),
  dbTransaction: vi.fn(),
  txInsertValues: vi.fn(),
  buildServerActionAuditContext: vi.fn(),
  recordAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/security/server-actions", () => ({
  isTrustedServerActionOrigin: mocks.isTrustedServerActionOrigin,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: mocks.checkServerActionRateLimit,
}));

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: mocks.getSystemSettings,
}));

vi.mock("@/lib/security/hcaptcha", () => ({
  isHcaptchaConfigured: mocks.isHcaptchaConfigured,
  verifyHcaptchaToken: mocks.verifyHcaptchaToken,
}));

vi.mock("@/lib/users/core", () => ({
  isUsernameTaken: mocks.isUsernameTaken,
  isEmailTaken: mocks.isEmailTaken,
  validateAndHashPassword: mocks.validateAndHashPassword,
}));

vi.mock("@/lib/audit/events", () => ({
  buildServerActionAuditContext: mocks.buildServerActionAuditContext,
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id" },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.dbTransaction(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "127.0.0.1" }));
  mocks.isTrustedServerActionOrigin.mockResolvedValue(true);
  mocks.checkServerActionRateLimit.mockResolvedValue(null);
  mocks.getSystemSettings.mockResolvedValue({
    publicSignupEnabled: true,
    signupHcaptchaEnabled: false,
    defaultLanguage: "python",
  });
  mocks.isHcaptchaConfigured.mockResolvedValue(true);
  mocks.verifyHcaptchaToken.mockResolvedValue({ success: true, errorCodes: [] });
  mocks.validateAndHashPassword.mockResolvedValue({ hash: "hashed-password" });
  mocks.isUsernameTaken.mockResolvedValue(false);
  mocks.isEmailTaken.mockResolvedValue(false);
  mocks.buildServerActionAuditContext.mockResolvedValue({ requestPath: "/signup" });
  mocks.dbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      insert: vi.fn(() => ({
        values: mocks.txInsertValues,
      })),
    };
    return callback(tx);
  });
  mocks.txInsertValues.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerPublicUser", () => {
  it("creates a student account when public sign-up is enabled", async () => {
    const { registerPublicUser } = await import("@/lib/actions/public-signup");

    const result = await registerPublicUser({
      username: "newstudent",
      name: "New Student",
      email: "student@example.com",
      password: "password123",
      confirmPassword: "password123",
      captchaToken: undefined,
    });

    expect(result).toEqual({ success: true });
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "newstudent",
        name: "New Student",
        email: "student@example.com",
        role: "student",
        mustChangePassword: false,
        preferredLanguage: "python",
      }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "public_signup.created",
      resourceLabel: "newstudent",
    }));
  });

  it("returns signupDisabled when public registration is off", async () => {
    const { registerPublicUser } = await import("@/lib/actions/public-signup");
    mocks.getSystemSettings.mockResolvedValue({ publicSignupEnabled: false, signupHcaptchaEnabled: false });

    const result = await registerPublicUser({
      username: "newstudent",
      name: "New Student",
      email: undefined,
      password: "password123",
      confirmPassword: "password123",
      captchaToken: undefined,
    });

    expect(result).toEqual({ success: false, error: "signupDisabled" });
  });

  it("requires hCaptcha when enabled", async () => {
    const { registerPublicUser } = await import("@/lib/actions/public-signup");
    mocks.getSystemSettings.mockResolvedValue({ publicSignupEnabled: true, signupHcaptchaEnabled: true });

    const result = await registerPublicUser({
      username: "newstudent",
      name: "New Student",
      email: undefined,
      password: "password123",
      confirmPassword: "password123",
      captchaToken: undefined,
    });

    expect(result).toEqual({ success: false, error: "hcaptchaRequired" });
  });

  it("returns usernameInUse when the username is already taken", async () => {
    const { registerPublicUser } = await import("@/lib/actions/public-signup");
    mocks.isUsernameTaken.mockResolvedValue(true);

    const result = await registerPublicUser({
      username: "newstudent",
      name: "New Student",
      email: undefined,
      password: "password123",
      confirmPassword: "password123",
      captchaToken: undefined,
    });

    expect(result).toEqual({ success: false, error: "usernameInUse" });
  });
});
