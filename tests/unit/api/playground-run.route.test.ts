import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { consumeApiRateLimitMock } = vi.hoisted(() => ({
  consumeApiRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: vi.fn(),
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
  isAdmin: vi.fn(() => true),
  isInstructor: vi.fn(() => true),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ auth = true, schema, rateLimit, handler }: {
      auth?: unknown;
      schema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues?: Array<{ message?: string }> } } };
      rateLimit?: string;
      handler: (req: NextRequest, ctx: { user: unknown; body: unknown; params: Record<string, string> }) => Promise<Response>;
    }) =>
    async (req: NextRequest) => {
      if (rateLimit) {
        const limited = await consumeApiRateLimitMock(req, rateLimit);
        if (limited) return limited;
      }
      if (auth !== false) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      const raw = await req.json();
      const parsed = schema?.safeParse(raw) ?? { success: true, data: raw };
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error?.issues?.[0]?.message ?? "validationError" }, { status: 400 });
      }
      return handler(req, { user: null, body: parsed.data, params: {} });
    },
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number, resource?: string) =>
    NextResponse.json(resource ? { error, resource } : { error }, { status }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/judge/languages", () => ({
  isJudgeLanguage: vi.fn(() => true),
  getJudgeLanguageDefinition: vi.fn(() => ({
    extension: "py",
    dockerImage: "judge-python",
    runCommand: ["python3", "/workspace/main.py"],
    compileCommand: null,
  })),
  serializeJudgeCommand: vi.fn(() => null),
}));

vi.mock("@/lib/compiler/execute", () => ({
  executeCompilerRun: vi.fn(),
}));

describe("POST /api/v1/playground/run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/api/auth", () => ({
      getApiUser: vi.fn(),
      csrfForbidden: vi.fn(() => null),
      unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
      forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
      notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
      isAdmin: vi.fn(() => true),
      isInstructor: vi.fn(() => true),
    }));
    vi.doMock("@/lib/api/handler", () => ({
      createApiHandler:
        ({ auth = true, schema, rateLimit, handler }: {
          auth?: unknown;
          schema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues?: Array<{ message?: string }> } } };
          rateLimit?: string;
          handler: (req: NextRequest, ctx: { user: unknown; body: unknown; params: Record<string, string> }) => Promise<Response>;
        }) =>
        async (req: NextRequest) => {
          if (rateLimit) {
            const limited = await consumeApiRateLimitMock(req, rateLimit);
            if (limited) return limited;
          }
          if (auth !== false) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
          }
          const raw = await req.json();
          const parsed = schema?.safeParse(raw) ?? { success: true, data: raw };
          if (!parsed.success) {
            return NextResponse.json({ error: parsed.error?.issues?.[0]?.message ?? "validationError" }, { status: 400 });
          }
          return handler(req, { user: null, body: parsed.data, params: {} });
        },
    }));
    vi.doMock("@/lib/api/responses", () => ({
      apiSuccess: (data: unknown, opts?: { status?: number }) =>
        NextResponse.json({ data }, { status: opts?.status ?? 200 }),
      apiError: (error: string, status: number, resource?: string) =>
        NextResponse.json(resource ? { error, resource } : { error }, { status }),
    }));
    vi.doMock("@/lib/security/api-rate-limit", () => ({
      consumeApiRateLimit: consumeApiRateLimitMock,
    }));
    vi.doMock("@/lib/db", () => ({
      db: {
        select: vi.fn(),
      },
    }));
    vi.doMock("@/lib/judge/languages", () => ({
      isJudgeLanguage: vi.fn(() => true),
      getJudgeLanguageDefinition: vi.fn(() => ({
        extension: "py",
        dockerImage: "judge-python",
        runCommand: ["python3", "/workspace/main.py"],
        compileCommand: null,
      })),
      serializeJudgeCommand: vi.fn(() => null),
    }));
    vi.doMock("@/lib/compiler/execute", () => ({
      executeCompilerRun: vi.fn(),
    }));
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);
  });

  it("requires authentication to run code", { timeout: 15000 }, async () => {
    const { POST } = await import("@/app/api/v1/playground/run/route");
    const request = new NextRequest("http://localhost:3000/api/v1/playground/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        language: "python",
        sourceCode: "print(1 + 2)",
        stdin: "",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
