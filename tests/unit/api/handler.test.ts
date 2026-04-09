import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// --- Hoisted mocks ---
const {
  getApiUserMock,
  unauthorizedMock,
  forbiddenMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  isUserRoleMock,
  resolveCapabilitiesMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  unauthorizedMock: vi.fn(() =>
    NextResponse.json({ error: "unauthorized" }, { status: 401 })
  ),
  forbiddenMock: vi.fn(() =>
    NextResponse.json({ error: "forbidden" }, { status: 403 })
  ),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  isUserRoleMock: vi.fn(() => true),
  resolveCapabilitiesMock: vi.fn(async () => new Set<string>()),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
  csrfForbidden: csrfForbiddenMock,
  isAdmin: vi.fn((role: string) => role === "admin" || role === "super_admin"),
  isInstructor: vi.fn(
    (role: string) =>
      role === "admin" || role === "super_admin" || role === "instructor"
  ),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/security/constants", () => ({
  isUserRole: isUserRoleMock,
  USER_ROLES: ["student", "instructor", "admin", "super_admin"],
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createApiHandler } from "@/lib/api/handler";

// --- Helpers ---

function makeRequest(
  method: string = "GET",
  body?: unknown,
  headers?: Record<string, string>
) {
  const url = "http://localhost:3000/api/test";
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  // Cast needed: NextRequest expects NextRequestInit whose signal differs from RequestInit.signal
  return new NextRequest(url, init as any);
}

const fakeUser = {
  id: "user-1",
  role: "admin" as const,
  username: "testadmin",
  email: "admin@test.com",
  name: "Test Admin",
  className: null,
  mustChangePassword: false,
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  getApiUserMock.mockResolvedValue(fakeUser);
  isUserRoleMock.mockReturnValue(true);
  resolveCapabilitiesMock.mockResolvedValue(new Set(["system.settings"]));
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
});

describe("createApiHandler", () => {
  // -------------------------------------------------------
  // Successful execution
  // -------------------------------------------------------
  describe("successful execution", () => {
    it("executes handler with valid auth and returns response", async () => {
      const handler = createApiHandler({
        handler: async (_req, { user }) =>
          NextResponse.json({ id: user.id }),
      });

      const res = await handler(makeRequest("GET"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.id).toBe("user-1");
      expect(getApiUserMock).toHaveBeenCalledOnce();
    });

    it("passes parsed params from routeCtx to the handler", async () => {
      const handler = createApiHandler({
        handler: async (_req, { params }) =>
          NextResponse.json({ params }),
      });

      const routeCtx = {
        params: Promise.resolve({ id: "42", slug: "hello" }),
      };

      const res = await handler(makeRequest("GET"), routeCtx);
      const json = await res.json();

      expect(json.params).toEqual({ id: "42", slug: "hello" });
    });

    it("provides empty params when routeCtx is undefined", async () => {
      const handler = createApiHandler({
        handler: async (_req, { params }) =>
          NextResponse.json({ params }),
      });

      const res = await handler(makeRequest("GET"));
      const json = await res.json();

      expect(json.params).toEqual({});
    });
  });

  // -------------------------------------------------------
  // Authentication
  // -------------------------------------------------------
  describe("authentication", () => {
    it("returns 401 when auth required but user not authenticated", async () => {
      getApiUserMock.mockResolvedValue(null);

      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(401);
      expect(unauthorizedMock).toHaveBeenCalledOnce();
    });

    it("returns 401 when auth explicitly set to true and user missing", async () => {
      getApiUserMock.mockResolvedValue(null);

      const handler = createApiHandler({
        auth: true,
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(401);
    });

    it("skips auth when auth is false (public handler)", async () => {
      const handler = createApiHandler({
        auth: false,
        handler: async (_req, { user }) =>
          NextResponse.json({ user: user ?? "none" }),
      });

      const res = await handler(makeRequest("GET"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user).toBe("none");
      expect(getApiUserMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // Role-based authorization
  // -------------------------------------------------------
  describe("role-based authorization", () => {
    it("returns 403 when user role not in required roles", async () => {
      const studentUser = { ...fakeUser, role: "student" };
      getApiUserMock.mockResolvedValue(studentUser);

      const handler = createApiHandler({
        auth: { roles: ["admin", "super_admin"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(403);
      expect(forbiddenMock).toHaveBeenCalledOnce();
    });

    it("allows access when user role matches required roles", async () => {
      const handler = createApiHandler({
        auth: { roles: ["admin", "super_admin"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(200);
    });

    it("allows access when required capabilities are present", async () => {
      const handler = createApiHandler({
        auth: { capabilities: ["system.settings"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(200);
    });

    it("returns 403 when required capabilities are missing", async () => {
      const handler = createApiHandler({
        auth: { capabilities: ["nonexistent.capability"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(403);
      expect(forbiddenMock).toHaveBeenCalledOnce();
    });

    it("returns 403 when isUserRole returns false", async () => {
      isUserRoleMock.mockReturnValue(false);

      const handler = createApiHandler({
        auth: { roles: ["admin"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(403);
    });

    it("allows any authenticated user when auth is true with no roles", async () => {
      const studentUser = { ...fakeUser, role: "student" };
      getApiUserMock.mockResolvedValue(studentUser);

      const handler = createApiHandler({
        auth: true,
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(200);
    });

    it("allows any authenticated user when auth has empty roles array", async () => {
      const studentUser = { ...fakeUser, role: "student" };
      getApiUserMock.mockResolvedValue(studentUser);

      const handler = createApiHandler({
        auth: { roles: [] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(200);
    });

    it("allows access when the user has all required capabilities", async () => {
      resolveCapabilitiesMock.mockResolvedValue(new Set(["system.settings", "docker.manage"]));

      const handler = createApiHandler({
        auth: { capabilities: ["system.settings", "docker.manage"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(200);
      expect(resolveCapabilitiesMock).toHaveBeenCalledWith(fakeUser.role);
    });

    it("returns 403 when the user is missing a required capability", async () => {
      resolveCapabilitiesMock.mockResolvedValue(new Set(["system.settings"]));

      const handler = createApiHandler({
        auth: { capabilities: ["system.settings", "docker.manage"] },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(403);
      expect(forbiddenMock).toHaveBeenCalledOnce();
    });

    it("supports any-of capability checks when requireAllCapabilities is false", async () => {
      resolveCapabilitiesMock.mockResolvedValue(new Set(["docker.manage"]));

      const handler = createApiHandler({
        auth: {
          capabilities: ["system.settings", "docker.manage"],
          requireAllCapabilities: false,
        },
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------
  // CSRF validation
  // -------------------------------------------------------
  describe("CSRF validation", () => {
    it("checks CSRF for POST requests by default", async () => {
      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("POST", {}));

      expect(csrfForbiddenMock).toHaveBeenCalledOnce();
    });

    it("checks CSRF for PATCH requests by default", async () => {
      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("PATCH", {}));

      expect(csrfForbiddenMock).toHaveBeenCalledOnce();
    });

    it("checks CSRF for DELETE requests by default", async () => {
      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("DELETE"));

      expect(csrfForbiddenMock).toHaveBeenCalledOnce();
    });

    it("checks CSRF for PUT requests by default", async () => {
      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("PUT", {}));

      expect(csrfForbiddenMock).toHaveBeenCalledOnce();
    });

    it("does not check CSRF for GET requests by default", async () => {
      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("GET"));

      expect(csrfForbiddenMock).not.toHaveBeenCalled();
    });

    it("returns CSRF error response when validation fails", async () => {
      const csrfResponse = NextResponse.json(
        { error: "csrfForbidden" },
        { status: 403 }
      );
      csrfForbiddenMock.mockReturnValue(csrfResponse);

      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("POST", {}));

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("csrfForbidden");
    });

    it("skips CSRF check when csrf is explicitly false", async () => {
      const handler = createApiHandler({
        csrf: false,
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("POST", {}));

      expect(csrfForbiddenMock).not.toHaveBeenCalled();
    });

    it("forces CSRF check on GET when csrf is explicitly true", async () => {
      const handler = createApiHandler({
        csrf: true,
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("GET"));

      expect(csrfForbiddenMock).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------
  describe("rate limiting", () => {
    it("applies rate limiting when rateLimit key is provided", async () => {
      const handler = createApiHandler({
        rateLimit: "test:endpoint",
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("GET"));

      expect(consumeApiRateLimitMock).toHaveBeenCalledOnce();
      expect(consumeApiRateLimitMock).toHaveBeenCalledWith(
        expect.any(NextRequest),
        "test:endpoint"
      );
    });

    it("returns 429 when rate limit exceeded", async () => {
      consumeApiRateLimitMock.mockReturnValue(
        NextResponse.json(
          { error: "rateLimited" },
          { status: 429, headers: { "Retry-After": "60" } }
        )
      );

      const handler = createApiHandler({
        rateLimit: "test:endpoint",
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toBe("rateLimited");
    });

    it("does not apply rate limiting when no rateLimit key", async () => {
      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("GET"));

      expect(consumeApiRateLimitMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // Body parsing + Zod validation
  // -------------------------------------------------------
  describe("body parsing and validation", () => {
    const testSchema = z.object({
      name: z.string().min(1, "Name is required"),
      age: z.number().int().positive(),
    });

    it("parses and validates body with schema", async () => {
      const handler = createApiHandler({
        schema: testSchema,
        handler: async (_req, { body }) =>
          NextResponse.json({ body }),
      });

      const res = await handler(makeRequest("POST", { name: "Alice", age: 30 }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.body).toEqual({ name: "Alice", age: 30 });
    });

    it("returns 400 for invalid JSON body", async () => {
      const handler = createApiHandler({
        schema: testSchema,
        handler: async () => NextResponse.json({ ok: true }),
      });

      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-valid-json{{{",
      });

      // Need to bypass CSRF for this test
      const res = await handler(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("invalidJson");
    });

    it("returns 400 with first validation error when schema fails", async () => {
      const handler = createApiHandler({
        schema: testSchema,
        handler: async () => NextResponse.json({ ok: true }),
      });

      const res = await handler(
        makeRequest("POST", { name: "", age: -5 })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(typeof json.error).toBe("string");
    });

    it("does not parse body when no schema is provided", async () => {
      const handlerFn = vi.fn(async (_req: NextRequest, { body }: { body: unknown }) =>
        NextResponse.json({ body: body === undefined ? "undefined" : body })
      );

      const handler = createApiHandler({
        handler: handlerFn,
      });

      const res = await handler(makeRequest("GET"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.body).toBe("undefined");
    });
  });

  // -------------------------------------------------------
  // Error handling
  // -------------------------------------------------------
  describe("error handling", () => {
    it("catches unhandled errors and returns 500", async () => {
      const handler = createApiHandler({
        handler: async () => {
          throw new Error("Something broke");
        },
      });

      const res = await handler(makeRequest("GET"));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe("internalServerError");
    });

    it("logs unhandled errors with method and path", async () => {
      const error = new Error("Unexpected failure");

      const handler = createApiHandler({
        handler: async () => {
          throw error;
        },
      });

      await handler(makeRequest("GET"));

      expect(loggerErrorMock).toHaveBeenCalledOnce();
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          method: "GET",
          path: "/api/test",
        }),
        "Unhandled error"
      );
    });

    it("catches non-Error throws and returns 500", async () => {
      const handler = createApiHandler({
        handler: async () => {
          throw "string error";
        },
      });

      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------
  // Middleware ordering
  // -------------------------------------------------------
  describe("middleware ordering", () => {
    it("checks auth before CSRF by default", async () => {
      const csrfResponse = NextResponse.json(
        { error: "csrfForbidden" },
        { status: 403 }
      );
      csrfForbiddenMock.mockReturnValue(csrfResponse);
      getApiUserMock.mockResolvedValue(null);

      const handler = createApiHandler({
        handler: async () => NextResponse.json({ ok: true }),
      });

      await handler(makeRequest("POST", {}));

      expect(getApiUserMock).toHaveBeenCalledOnce();
      expect(csrfForbiddenMock).not.toHaveBeenCalled();
    });

    it("checks rate limit before auth", async () => {
      consumeApiRateLimitMock.mockReturnValue(
        NextResponse.json({ error: "rateLimited" }, { status: 429 })
      );

      const handler = createApiHandler({
        rateLimit: "test:endpoint",
        handler: async () => NextResponse.json({ ok: true }),
      });

      // Use GET to skip CSRF
      await handler(makeRequest("GET"));

      expect(consumeApiRateLimitMock).toHaveBeenCalledOnce();
      expect(getApiUserMock).not.toHaveBeenCalled();
    });

    it("checks auth before body parsing", async () => {
      getApiUserMock.mockResolvedValue(null);

      const schema = z.object({ name: z.string() });
      const handler = createApiHandler({
        schema,
        handler: async () => NextResponse.json({ ok: true }),
      });

      // Send GET (no CSRF) with body that would fail parsing
      const res = await handler(makeRequest("GET"));

      expect(res.status).toBe(401);
      // Handler never called, body never parsed
    });
  });

  // -------------------------------------------------------
  // Combined scenarios
  // -------------------------------------------------------
  describe("combined scenarios", () => {
    it("works end-to-end with auth, roles, CSRF, rate limit, and schema", async () => {
      const schema = z.object({ title: z.string() });

      const handler = createApiHandler({
        auth: { roles: ["admin", "super_admin"] },
        rateLimit: "items:create",
        schema,
        handler: async (_req, { user, body, params }) =>
          NextResponse.json({
            userId: user.id,
            title: (body as { title: string }).title,
            itemId: params.id,
          }),
      });

      const routeCtx = {
        params: Promise.resolve({ id: "item-99" }),
      };

      const res = await handler(
        makeRequest("POST", { title: "New Item" }),
        routeCtx
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        userId: "user-1",
        title: "New Item",
        itemId: "item-99",
      });

      expect(csrfForbiddenMock).toHaveBeenCalledOnce();
      expect(consumeApiRateLimitMock).toHaveBeenCalledOnce();
      expect(getApiUserMock).toHaveBeenCalledOnce();
    });
  });
});
