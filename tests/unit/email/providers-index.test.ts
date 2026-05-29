import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider, SendResult } from "@/lib/email/providers/types";

// Regression for DBG-C2-1 / F3 (cycle-2): sendEmail()'s cached-provider
// isConfigured() re-check must be guarded so a throwing isConfigured()
// (e.g. decrypt() on a malformed stored secret) degrades to re-detection
// instead of escaping sendEmail() and breaking all transactional email.

const mocks = vi.hoisted(() => ({
  smtpIsConfigured: vi.fn<() => Promise<boolean>>(),
  smtpSend: vi.fn<() => Promise<SendResult>>(),
  notConfigured: vi.fn<() => Promise<boolean>>(),
  warn: vi.fn(),
}));

function provider(name: string, isConfigured: () => Promise<boolean>, send: () => Promise<SendResult>): EmailProvider {
  return { name, isConfigured, send };
}

vi.mock("@/lib/email/providers/smtp", () => ({
  smtpProvider: provider("smtp", () => mocks.smtpIsConfigured(), () => mocks.smtpSend()),
}));
vi.mock("@/lib/email/providers/sendgrid", () => ({
  sendgridProvider: provider("sendgrid", () => mocks.notConfigured(), async () => ({ success: false, error: "x" })),
}));
vi.mock("@/lib/email/providers/resend", () => ({
  resendProvider: provider("resend", () => mocks.notConfigured(), async () => ({ success: false, error: "x" })),
}));
vi.mock("@/lib/email/providers/ses", () => ({
  sesProvider: provider("ses", () => mocks.notConfigured(), async () => ({ success: false, error: "x" })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const msg = { to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.notConfigured.mockResolvedValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendEmail cached-provider re-check (F3)", () => {
  it("sends via SMTP when it is the only configured provider", async () => {
    mocks.smtpIsConfigured.mockResolvedValue(true);
    mocks.smtpSend.mockResolvedValue({ success: true, messageId: "mid-1" });
    const { sendEmail } = await import("@/lib/email/providers");

    const r = await sendEmail(msg);
    expect(r).toEqual({ success: true, messageId: "mid-1" });
  });

  it("does NOT reject when the cached provider's isConfigured() throws on a later send", async () => {
    // First send: configured + cached.
    mocks.smtpIsConfigured.mockResolvedValueOnce(true);
    mocks.smtpSend.mockResolvedValue({ success: true, messageId: "mid-1" });
    const { sendEmail } = await import("@/lib/email/providers");
    await sendEmail(msg);

    // Second send: the cached provider's isConfigured() now THROWS (e.g.
    // undecryptable secret). Re-detection then finds nothing configured.
    mocks.smtpIsConfigured.mockRejectedValue(new Error("decrypt failed: bad ciphertext"));

    const r = await sendEmail(msg);
    // Must NOT reject; must degrade to a clean "no provider" result.
    expect(r.success).toBe(false);
    expect(r.error).toBe("No email provider configured");
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("re-detects and sends when the cached provider becomes reconfigured after a throw", async () => {
    mocks.smtpIsConfigured.mockResolvedValueOnce(true);
    mocks.smtpSend.mockResolvedValue({ success: true, messageId: "mid-1" });
    const { sendEmail } = await import("@/lib/email/providers");
    await sendEmail(msg);

    // Re-check throws once, but re-detection finds SMTP healthy again.
    mocks.smtpIsConfigured.mockRejectedValueOnce(new Error("transient decrypt glitch"));
    mocks.smtpIsConfigured.mockResolvedValue(true);
    mocks.smtpSend.mockResolvedValue({ success: true, messageId: "mid-2" });

    const r = await sendEmail(msg);
    expect(r).toEqual({ success: true, messageId: "mid-2" });
  });
});
