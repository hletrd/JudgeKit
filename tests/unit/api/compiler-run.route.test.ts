import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  getEffectivePlatformModeMock,
  getEffectiveModeRestrictionsMock,
  resolvePlatformModeAssignmentContextDetailsMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  getEffectivePlatformModeMock: vi.fn(),
  getEffectiveModeRestrictionsMock: vi.fn(),
  resolvePlatformModeAssignmentContextDetailsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
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

vi.mock("@/lib/security/sandbox-gate", () => ({
  gateSandboxEndpoint: vi.fn(async () => null),
}));

vi.mock("@/lib/capabilities", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/platform-mode-context", () => ({
  getEffectivePlatformMode: getEffectivePlatformModeMock,
  resolvePlatformModeAssignmentContextDetails:
    resolvePlatformModeAssignmentContextDetailsMock,
}));

vi.mock("@/lib/system-settings", () => ({
  getEffectiveModeRestrictions: getEffectiveModeRestrictionsMock,
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

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("POST /api/v1/compiler/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "student-1",
      role: "student",
      username: "student",
      email: "student@example.com",
      name: "Student",
      className: null,
      mustChangePassword: false,
    });
    consumeApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["content.submit_solutions"]));
    getEffectivePlatformModeMock.mockResolvedValue("homework");
    // Mirror getPlatformModePolicy's defaults (no admin opt-out): exam and
    // recruiting restrict the standalone compiler; homework/contest do not.
    getEffectiveModeRestrictionsMock.mockImplementation((mode: string) =>
      Promise.resolve({
        restrictAiByDefault:
          mode === "exam" || mode === "contest" || mode === "recruiting",
        restrictStandaloneCompiler: mode === "exam" || mode === "recruiting",
      })
    );
    resolvePlatformModeAssignmentContextDetailsMock.mockImplementation(
      ({ assignmentId }: { assignmentId?: string | null }) =>
        Promise.resolve({ assignmentId: assignmentId ?? null, mismatch: null })
    );
  });

  it("blocks standalone compiler in recruiting mode even when the global site is permissive", async () => {
    getEffectivePlatformModeMock.mockResolvedValue("recruiting");
    const { POST } = await import("@/app/api/v1/compiler/run/route");

    const request = new NextRequest("http://localhost:3000/api/v1/compiler/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        language: "python",
        sourceCode: "print(1)",
        stdin: "",
        assignmentId: "assignment-1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "compilerDisabledInCurrentMode" });
    expect(getEffectivePlatformModeMock).toHaveBeenCalledWith({
      userId: "student-1",
      assignmentId: "assignment-1",
    });
  });

  it("derives compiler mode from the server-resolved assignment context instead of the forged request value", async () => {
    resolvePlatformModeAssignmentContextDetailsMock.mockResolvedValue({
      assignmentId: "assignment-2",
      mismatch: {
        providedAssignmentId: "assignment-1",
        resolvedAssignmentId: "assignment-2",
        reason: "active_restricted_scope",
      },
    });
    getEffectivePlatformModeMock.mockResolvedValue("exam");
    const { POST } = await import("@/app/api/v1/compiler/run/route");

    const request = new NextRequest("http://localhost:3000/api/v1/compiler/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        language: "python",
        sourceCode: "print(1)",
        stdin: "",
        assignmentId: "assignment-1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "compilerDisabledInCurrentMode" });
    expect(resolvePlatformModeAssignmentContextDetailsMock).toHaveBeenCalledWith({
      userId: "student-1",
      assignmentId: "assignment-1",
    });
    expect(getEffectivePlatformModeMock).toHaveBeenCalledWith({
      userId: "student-1",
      assignmentId: "assignment-2",
    });
    expect(loggerWarnMock).toHaveBeenCalledOnce();
  });
});
