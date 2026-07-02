import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  consumeRateLimitAttemptMultiMock,
  getRateLimitKeyMock,
  sendPasswordResetEmailMock,
  verifyEmailMock,
  validatePasswordResetTokenMock,
  resetPasswordMock,
} = vi.hoisted(() => ({
  consumeRateLimitAttemptMultiMock: vi.fn(),
  getRateLimitKeyMock: vi.fn((action: string) => `${action}:ip`),
  sendPasswordResetEmailMock: vi.fn(),
  verifyEmailMock: vi.fn(),
  validatePasswordResetTokenMock: vi.fn(),
  resetPasswordMock: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimitAttemptMulti: consumeRateLimitAttemptMultiMock,
  getRateLimitKey: getRateLimitKeyMock,
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  verifyEmail: verifyEmailMock,
  validatePasswordResetToken: validatePasswordResetTokenMock,
  resetPassword: resetPasswordMock,
}));

vi.mock("@/lib/security/env", () => ({
  getAuthUrlObject: vi.fn(() => null),
  getTrustedAuthHosts: vi.fn().mockResolvedValue(new Set<string>()),
  getPublicBaseUrl: vi.fn((_host?: string | null, proto?: string | null) =>
    `${proto ?? "https"}://example.com`
  ),
  normalizeHostForComparison: vi.fn((host: string) => host.trim().toLowerCase()),
}));

import { POST as forgotPassword } from "@/app/api/v1/auth/forgot-password/route";
import { POST as verifyEmail } from "@/app/api/v1/auth/verify-email/route";
import { POST as resetPassword } from "@/app/api/v1/auth/reset-password/route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://example.com/api/v1/auth/route", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function csrfHeaders() {
  return {
    "x-requested-with": "XMLHttpRequest",
    origin: "https://example.com",
  };
}

describe("public auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitAttemptMultiMock.mockResolvedValue(false);
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("rejects requests without CSRF headers", async () => {
      const req = makeRequest({ email: "user@example.com" });
      const res = await forgotPassword(req);
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("returns invalidJson for a malformed body", async () => {
      const req = new NextRequest("https://example.com/api/v1/auth/forgot-password", {
        method: "POST",
        headers: csrfHeaders(),
        body: "not-json",
      });
      const res = await forgotPassword(req);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "invalidJson" });
    });

    it("processes a valid CSRF-protected request", async () => {
      sendPasswordResetEmailMock.mockResolvedValue({ success: true });
      const req = makeRequest({ email: "user@example.com" }, csrfHeaders());
      const res = await forgotPassword(req);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true });
      expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
        "user@example.com",
        expect.any(String)
      );
    });
  });

  describe("POST /api/v1/auth/verify-email", () => {
    it("rejects requests without CSRF headers", async () => {
      const req = makeRequest({ token: "valid-token" });
      const res = await verifyEmail(req);
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("returns invalidJson for a malformed body", async () => {
      const req = new NextRequest("https://example.com/api/v1/auth/verify-email", {
        method: "POST",
        headers: csrfHeaders(),
        body: "not-json",
      });
      const res = await verifyEmail(req);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "invalidJson" });
    });

    it("processes a valid CSRF-protected request", async () => {
      verifyEmailMock.mockResolvedValue({ success: true });
      const req = makeRequest({ token: "valid-token" }, csrfHeaders());
      const res = await verifyEmail(req);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true });
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("rejects requests without CSRF headers", async () => {
      const req = makeRequest({ token: "valid-token", password: "NewPass123!" });
      const res = await resetPassword(req);
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "csrfValidationFailed" });
    });

    it("returns invalidJson for a malformed body", async () => {
      const req = new NextRequest("https://example.com/api/v1/auth/reset-password", {
        method: "POST",
        headers: csrfHeaders(),
        body: "not-json",
      });
      const res = await resetPassword(req);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "invalidJson" });
    });

    it("processes a valid CSRF-protected request", async () => {
      validatePasswordResetTokenMock.mockResolvedValue({ valid: true });
      resetPasswordMock.mockResolvedValue({ success: true });
      const req = makeRequest(
        { token: "valid-token", password: "NewPass123!" },
        csrfHeaders()
      );
      const res = await resetPassword(req);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true });
    });
  });
});
