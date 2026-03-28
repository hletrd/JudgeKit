import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const {
  languageConfigsSelectMock,
  getJudgeLanguageDefinitionMock,
  getApiUserMock,
  csrfForbiddenMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  languageConfigsSelectMock: vi.fn(),
  getJudgeLanguageDefinitionMock: vi.fn(),
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  loggerErrorMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number; headers?: Record<string, string> }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200, headers: opts?.headers }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) =>
    role === "instructor" || role === "admin" || role === "super_admin",
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) =>
    NextResponse.json({ error: "notFound", resource }, { status: 404 }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/judge/languages", () => ({
  getJudgeLanguageDefinition: getJudgeLanguageDefinitionMock,
}));

vi.mock("@/lib/db", () => {
  const whereFn = languageConfigsSelectMock;
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: whereFn,
        })),
      })),
    },
  };
});

// The languages route uses createApiHandler which relies on these
vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/security/constants", () => ({
  isUserRole: vi.fn(() => true),
}));

// Import handler AFTER all mocks
import { GET } from "@/app/api/v1/languages/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest() {
  return new NextRequest("http://localhost:3000/api/v1/languages", {
    method: "GET",
  });
}

const PYTHON_DB_ROW = { id: "lc-1", language: "python3", isEnabled: true };
const PYTHON_DEFINITION = {
  language: "python3",
  displayName: "Python 3",
  standard: "3.11",
  extension: "py",
};

const CPP_DB_ROW = { id: "lc-2", language: "cpp17", isEnabled: true };
const CPP_DEFINITION = {
  language: "cpp17",
  displayName: "C++17",
  standard: "c++17",
  extension: "cpp",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);

  // Default: two enabled languages
  languageConfigsSelectMock.mockResolvedValue([PYTHON_DB_ROW, CPP_DB_ROW]);
  getJudgeLanguageDefinitionMock.mockImplementation((lang: string) => {
    if (lang === "python3") return PYTHON_DEFINITION;
    if (lang === "cpp17") return CPP_DEFINITION;
    return null;
  });
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/languages", () => {
  it("returns 200 with a list of enabled languages", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      id: "lc-1",
      language: "python3",
      displayName: "Python 3",
      extension: "py",
    });
    expect(body.data[1]).toMatchObject({
      id: "lc-2",
      language: "cpp17",
      displayName: "C++17",
      extension: "cpp",
    });
  });

  it("filters out languages whose definition is missing", async () => {
    // cpp17 has no definition → should be excluded
    getJudgeLanguageDefinitionMock.mockImplementation((lang: string) => {
      if (lang === "python3") return PYTHON_DEFINITION;
      return null;
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].language).toBe("python3");
  });

  it("returns empty list when no languages are enabled", async () => {
    languageConfigsSelectMock.mockResolvedValue([]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns empty list when all enabled languages lack definitions", async () => {
    getJudgeLanguageDefinitionMock.mockReturnValue(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("sets Cache-Control header to public, max-age=300", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("does not require authentication (auth: false)", async () => {
    // Even with no user set, GET should succeed because auth is false
    getApiUserMock.mockResolvedValue(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  it("returns 500 on unexpected DB error", async () => {
    languageConfigsSelectMock.mockRejectedValue(new Error("DB connection failed"));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
  });

  it("returns only the shape fields from the definition (not raw DB row fields)", async () => {
    const res = await GET(makeGetRequest());
    const body = await res.json();
    const first = body.data[0];

    // Should have id from DB row + fields from definition
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("language");
    expect(first).toHaveProperty("displayName");
    expect(first).toHaveProperty("standard");
    expect(first).toHaveProperty("extension");
    // Should NOT expose isEnabled raw column
    expect(first).not.toHaveProperty("isEnabled");
  });
});
