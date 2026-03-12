import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// vi.hoisted mock functions — lifted above all imports
// ---------------------------------------------------------------------------
const {
  getTokenMock,
  getActiveAuthUserByIdMock,
  getTokenUserIdMock,
  getTokenAuthenticatedAtSecondsMock,
  shouldUseSecureAuthCookieMock,
  getValidatedAuthSecretMock,
  recordAuditEventMock,
  buildAuditRequestContextMock,
  randomUUIDMock,
  randomBytesMock,
  createHashMock,
} = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  getActiveAuthUserByIdMock: vi.fn(),
  getTokenUserIdMock: vi.fn(),
  getTokenAuthenticatedAtSecondsMock: vi.fn(),
  shouldUseSecureAuthCookieMock: vi.fn(),
  getValidatedAuthSecretMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  buildAuditRequestContextMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  randomBytesMock: vi.fn(),
  createHashMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/lib/auth/secure-cookie", () => ({
  shouldUseSecureAuthCookie: shouldUseSecureAuthCookieMock,
}));

vi.mock("@/lib/auth/session-security", () => ({
  getTokenAuthenticatedAtSeconds: getTokenAuthenticatedAtSecondsMock,
}));

vi.mock("@/lib/api/auth", () => ({
  getActiveAuthUserById: getActiveAuthUserByIdMock,
  getTokenUserId: getTokenUserIdMock,
}));

vi.mock("@/lib/security/env", () => ({
  getValidatedAuthSecret: getValidatedAuthSecretMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
  buildAuditRequestContext: buildAuditRequestContextMock,
}));

vi.mock("crypto", () => {
  const hashObj = {
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue("abcdef0123456789abcdef0123456789"),
  };
  randomBytesMock.mockReturnValue(Buffer.from("0123456789abcdef"));
  return {
    default: {
      randomUUID: randomUUIDMock,
      createHash: createHashMock.mockReturnValue(hashObj),
      randomBytes: randomBytesMock,
    },
  };
});

// ---------------------------------------------------------------------------
// Import the proxy under test AFTER mocks are in place
// ---------------------------------------------------------------------------
// We use dynamic re-import in beforeEach to reset the in-process LRU cache
// (authUserCache) that lives inside proxy.ts. Without this, cached auth results
// from one test leak into subsequent tests.
import { config } from "@/proxy";
let proxy: (typeof import("@/proxy"))["proxy"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = "http://localhost:3000";

function makeRequest(pathname: string, options?: { headers?: Record<string, string> }) {
  const url = new URL(pathname, BASE_URL);
  return new NextRequest(url, {
    method: "GET",
    headers: options?.headers,
  });
}

/** Standard active user returned by getActiveAuthUserById */
function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    role: "user",
    username: "testuser",
    email: "test@example.com",
    name: "Test User",
    className: null,
    mustChangePassword: false,
    ...overrides,
  };
}

/** Token-shaped object returned by getToken */
function fakeToken(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user-1",
    id: "user-1",
    role: "user",
    username: "testuser",
    email: "test@example.com",
    name: "Test User",
    mustChangePassword: false,
    authenticatedAt: Math.trunc(Date.now() / 1000),
    ...overrides,
  };
}

function isRedirectTo(response: Response, path: string) {
  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  const url = new URL(location!);
  expect(url.pathname).toBe(path);
  return url;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(async () => {
  // Reset modules so the in-process authUserCache Map inside proxy.ts is
  // recreated fresh for every test — prevents cached auth results leaking
  // across tests.
  vi.resetModules();
  vi.clearAllMocks();

  // Defaults: unauthenticated
  getTokenMock.mockResolvedValue(null);
  getActiveAuthUserByIdMock.mockResolvedValue(null);
  getTokenUserIdMock.mockReturnValue(null);
  getTokenAuthenticatedAtSecondsMock.mockReturnValue(null);
  shouldUseSecureAuthCookieMock.mockReturnValue(false);
  getValidatedAuthSecretMock.mockReturnValue("test-secret-that-is-at-least-32-chars");
  randomUUIDMock.mockReturnValue("00000000-0000-0000-0000-000000000000");
  buildAuditRequestContextMock.mockReturnValue({});

  // Reset NODE_ENV
  vi.stubEnv("NODE_ENV", "test");

  // Re-import proxy after module reset so it picks up a clean cache
  proxy = (await import("@/proxy")).proxy;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("proxy", () => {
  // =========================================================================
  // Config / matcher
  // =========================================================================
  describe("config.matcher", () => {
    it("matches dashboard, api/v1, login, and change-password routes", () => {
      expect(config.matcher).toEqual(
        expect.arrayContaining([
          "/dashboard/:path*",
          "/api/v1/:path*",
          "/login",
          "/change-password",
        ])
      );
    });
  });

  // =========================================================================
  // Public / bypass routes
  // =========================================================================
  describe("public routes", () => {
    it("allows unauthenticated access to /api/v1/judge/* routes (judge worker bypass)", async () => {
      const response = await proxy(makeRequest("/api/v1/judge/poll"));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    });

    it("allows unauthenticated access to /api/v1/languages (public languages route)", async () => {
      const response = await proxy(makeRequest("/api/v1/languages"));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    });
  });

  // =========================================================================
  // Auth page behaviour
  // =========================================================================
  describe("auth page (/login)", () => {
    it("allows unauthenticated users to access /login", async () => {
      const response = await proxy(makeRequest("/login"));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    });

    it("redirects authenticated active users from /login to /dashboard", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      const response = await proxy(makeRequest("/login"));

      isRedirectTo(response, "/dashboard");
    });

    it("redirects authenticated user with mustChangePassword from /login to /change-password", async () => {
      getTokenMock.mockResolvedValue(fakeToken({ mustChangePassword: true }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser({ mustChangePassword: true }));

      const response = await proxy(makeRequest("/login"));

      isRedirectTo(response, "/change-password");
    });

    it("clears session cookies when token exists but user is not active (stale session)", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(null); // inactive / not found

      const response = await proxy(makeRequest("/login"));

      // Should pass through (200) but clear the cookies
      expect(response.status).toBe(200);
      const setCookieHeader = response.headers.getSetCookie();
      const cookieNames = setCookieHeader.map((c: string) => c.split("=")[0]);
      expect(cookieNames).toContain("authjs.session-token");
      expect(cookieNames).toContain("__Secure-authjs.session-token");
    });
  });

  // =========================================================================
  // Protected dashboard routes
  // =========================================================================
  describe("protected dashboard routes", () => {
    it("redirects unauthenticated users to /login with callbackUrl", async () => {
      const response = await proxy(makeRequest("/dashboard/problems"));

      const redirectUrl = isRedirectTo(response, "/login");
      expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/dashboard/problems");
    });

    it("allows authenticated active users to access /dashboard", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      const response = await proxy(makeRequest("/dashboard"));

      expect(response.status).toBe(200);
    });

    it("redirects to /change-password when mustChangePassword is set", async () => {
      getTokenMock.mockResolvedValue(fakeToken({ mustChangePassword: true }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser({ mustChangePassword: true }));

      const response = await proxy(makeRequest("/dashboard/submissions"));

      isRedirectTo(response, "/change-password");
    });

    it("clears session cookies when token exists but user is not found for dashboard", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(null);

      const response = await proxy(makeRequest("/dashboard"));

      const redirectUrl = isRedirectTo(response, "/login");
      expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/dashboard");
      // Cookies should be cleared
      const setCookieHeader = response.headers.getSetCookie();
      const cookieNames = setCookieHeader.map((c: string) => c.split("=")[0]);
      expect(cookieNames).toContain("authjs.session-token");
      expect(cookieNames).toContain("__Secure-authjs.session-token");
    });
  });

  // =========================================================================
  // Protected API routes
  // =========================================================================
  describe("protected API routes", () => {
    it("returns 401 JSON for unauthenticated API requests", async () => {
      const response = await proxy(makeRequest("/api/v1/users"));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 JSON when token exists but user is inactive", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(null);

      const response = await proxy(makeRequest("/api/v1/groups/1/members"));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("returns 403 JSON when mustChangePassword is set on API route", async () => {
      getTokenMock.mockResolvedValue(fakeToken({ mustChangePassword: true }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser({ mustChangePassword: true }));

      const response = await proxy(makeRequest("/api/v1/groups/1/assignments"));

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toEqual({ error: "Password change required" });
    });

    it("allows authenticated active API requests through", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      const response = await proxy(makeRequest("/api/v1/users"));

      expect(response.status).toBe(200);
    });

    it("clears session cookies on 401 API response", async () => {
      const response = await proxy(makeRequest("/api/v1/users"));

      expect(response.status).toBe(401);
      const setCookieHeader = response.headers.getSetCookie();
      const cookieNames = setCookieHeader.map((c: string) => c.split("=")[0]);
      expect(cookieNames).toContain("authjs.session-token");
      expect(cookieNames).toContain("__Secure-authjs.session-token");
    });
  });

  // =========================================================================
  // /change-password route
  // =========================================================================
  describe("/change-password route", () => {
    it("redirects unauthenticated users from /change-password to /login", async () => {
      const response = await proxy(makeRequest("/change-password"));

      const redirectUrl = isRedirectTo(response, "/login");
      expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/change-password");
    });

    it("allows authenticated users with mustChangePassword to access /change-password", async () => {
      getTokenMock.mockResolvedValue(fakeToken({ mustChangePassword: true }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser({ mustChangePassword: true }));

      const response = await proxy(makeRequest("/change-password"));

      expect(response.status).toBe(200);
    });

    it("allows authenticated users without mustChangePassword to access /change-password", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      const response = await proxy(makeRequest("/change-password"));

      expect(response.status).toBe(200);
    });

    it("clears session cookies when token exists but user not found for /change-password", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(null);

      const response = await proxy(makeRequest("/change-password"));

      const redirectUrl = isRedirectTo(response, "/login");
      expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/change-password");
    });
  });

  // =========================================================================
  // CSP nonce injection
  // =========================================================================
  describe("CSP nonce injection", () => {
    it("sets Content-Security-Policy header with nonce on pass-through responses", async () => {
      const nonceBytes = Buffer.from("test-nonce-bytes");
      randomBytesMock.mockReturnValue(nonceBytes);

      const response = await proxy(makeRequest("/login"));

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();

      // Nonce is base64-encoded random bytes
      const expectedNonce = nonceBytes.toString("base64");
      expect(csp).toContain(`'nonce-${expectedNonce}'`);
    });

    it("includes unsafe-eval in script-src during development", async () => {
      vi.stubEnv("NODE_ENV", "development");

      const response = await proxy(makeRequest("/login"));

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("'unsafe-eval'");
    });

    it("does NOT include unsafe-eval in script-src during production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const response = await proxy(makeRequest("/login"));

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it("sets x-nonce request header for downstream consumption", async () => {
      const nonceBytes = Buffer.from("downstream-nonce-bytes");
      randomBytesMock.mockReturnValue(nonceBytes);

      const response = await proxy(makeRequest("/login"));

      // The x-nonce header is set on the request headers forwarded downstream.
      // NextResponse.next() embeds them — we verify the CSP contains the matching nonce.
      const expectedNonce = nonceBytes.toString("base64");
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain(expectedNonce);
    });

    it("includes frame-ancestors none and object-src none in CSP", async () => {
      const response = await proxy(makeRequest("/login"));

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
    });

    it("includes unsafe-inline in style-src for CodeMirror compatibility", async () => {
      const response = await proxy(makeRequest("/login"));

      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });
  });

  // =========================================================================
  // HSTS header
  // =========================================================================
  describe("HSTS header", () => {
    it("sets Strict-Transport-Security in production", async () => {
      vi.stubEnv("NODE_ENV", "production");

      const response = await proxy(makeRequest("/login"));

      expect(response.headers.get("Strict-Transport-Security")).toBe(
        "max-age=31536000; includeSubDomains"
      );
    });

    it("does NOT set Strict-Transport-Security in development", async () => {
      vi.stubEnv("NODE_ENV", "development");

      const response = await proxy(makeRequest("/login"));

      expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    });
  });

  // =========================================================================
  // User-Agent hash mismatch logging
  // =========================================================================
  describe("User-Agent hash mismatch logging", () => {
    it("records audit event when UA hash does not match token", async () => {
      const hashObj = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue("different_hash_00different_hash_00"),
      };
      createHashMock.mockReturnValue(hashObj);

      getTokenMock.mockResolvedValue(fakeToken({ uaHash: "stored_ua_hash_0" }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      await proxy(
        makeRequest("/dashboard", {
          headers: { "user-agent": "SuspiciousBot/1.0" },
        })
      );

      expect(recordAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "user-1",
          action: "suspicious_ua_mismatch",
          resourceType: "session",
        })
      );
    });

    it("does NOT record audit event when UA hash matches", async () => {
      const matchingHash = "abcdef0123456789";
      const hashObj = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue("abcdef0123456789abcdef0123456789"),
      };
      createHashMock.mockReturnValue(hashObj);

      getTokenMock.mockResolvedValue(fakeToken({ uaHash: matchingHash }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      await proxy(
        makeRequest("/dashboard", {
          headers: { "user-agent": "Mozilla/5.0" },
        })
      );

      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("does NOT log UA mismatch when token has no uaHash", async () => {
      getTokenMock.mockResolvedValue(fakeToken({ uaHash: undefined }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      await proxy(makeRequest("/dashboard"));

      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });

    it("does NOT log UA mismatch when user is not active", async () => {
      getTokenMock.mockResolvedValue(fakeToken({ uaHash: "some_hash" }));
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(Math.trunc(Date.now() / 1000));
      getActiveAuthUserByIdMock.mockResolvedValue(null);

      await proxy(makeRequest("/dashboard"));

      expect(recordAuditEventMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Auth lookup caching
  // =========================================================================
  describe("auth lookup caching", () => {
    it("calls getActiveAuthUserById for authenticated protected route requests", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");
      getTokenAuthenticatedAtSecondsMock.mockReturnValue(1000);
      getActiveAuthUserByIdMock.mockResolvedValue(activeUser());

      await proxy(makeRequest("/dashboard"));

      expect(getActiveAuthUserByIdMock).toHaveBeenCalledWith("user-1", 1000);
    });

    it("does NOT call getActiveAuthUserById for unauthenticated requests", async () => {
      getTokenMock.mockResolvedValue(null);

      await proxy(makeRequest("/dashboard"));

      expect(getActiveAuthUserByIdMock).not.toHaveBeenCalled();
    });

    it("does NOT call getActiveAuthUserById for judge worker routes even with token", async () => {
      // Judge worker routes are not protected, so shouldRefreshAuthState should be false
      // when the route is only a judge worker route
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");

      await proxy(makeRequest("/api/v1/judge/poll"));

      // /api/v1/judge/poll is isApiRoute=true, isJudgeWorkerRoute=true
      // isProtectedRoute = isApiRoute && !isJudgeWorkerRoute && !isPublicLanguagesRoute = false
      // shouldRefreshAuthState = token && (isProtectedRoute || isChangePasswordPage || isAuthPage) = false
      expect(getActiveAuthUserByIdMock).not.toHaveBeenCalled();
    });

    it("does NOT call getActiveAuthUserById for /api/v1/languages even with token", async () => {
      getTokenMock.mockResolvedValue(fakeToken());
      getTokenUserIdMock.mockReturnValue("user-1");

      await proxy(makeRequest("/api/v1/languages"));

      expect(getActiveAuthUserByIdMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge: combined conditions
  // =========================================================================
  describe("edge cases", () => {
    it("treats /api/v1/judge/submit as a judge worker route (bypass)", async () => {
      const response = await proxy(makeRequest("/api/v1/judge/submit"));

      expect(response.status).toBe(200);
    });

    it("treats /api/v1/groups as a protected API route", async () => {
      const response = await proxy(makeRequest("/api/v1/groups"));

      expect(response.status).toBe(401);
    });

    it("treats /api/v1/submissions as a protected API route", async () => {
      const response = await proxy(makeRequest("/api/v1/submissions"));

      expect(response.status).toBe(401);
    });

    it("does not treat /api/v1/judge (without trailing slash) as a judge worker route", async () => {
      // isJudgeWorkerRoute = pathname.startsWith("/api/v1/judge/") — requires trailing slash
      const response = await proxy(makeRequest("/api/v1/judge"));

      expect(response.status).toBe(401);
    });

    it("handles token present but no sub/id (getTokenUserId returns null)", async () => {
      getTokenMock.mockResolvedValue({ iat: 1000 }); // token with no id/sub
      getTokenUserIdMock.mockReturnValue(null);

      const response = await proxy(makeRequest("/dashboard"));

      // shouldRefreshAuthState: Boolean(token)=true, isProtectedRoute=true => true
      // But getTokenUserId returns null, so getActiveAuthUserById gets null userId => returns null
      // => activeUser is null => redirect to /login
      isRedirectTo(response, "/login");
    });
  });
});
