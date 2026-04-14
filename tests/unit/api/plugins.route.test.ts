import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const {
  authMock,
  resolveCapabilitiesMock,
  isPluginEnabledMock,
  getPluginStateMock,
  checkServerActionRateLimitMock,
  isAiAssistantEnabledForContextMock,
  getResolvedPlatformModeMock,
  getSystemSettingsMock,
  problemsFindFirstMock,
  recruitingInvitationFindFirstMock,
  assignmentsFindFirstMock,
  dbInsertMock,
  getProviderMock,
  executeToolMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerInfoMock,
  fetchMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  isPluginEnabledMock: vi.fn(),
  getPluginStateMock: vi.fn(),
  checkServerActionRateLimitMock: vi.fn(),
  isAiAssistantEnabledForContextMock: vi.fn(),
  getResolvedPlatformModeMock: vi.fn(),
  getSystemSettingsMock: vi.fn(),
  problemsFindFirstMock: vi.fn(),
  recruitingInvitationFindFirstMock: vi.fn(),
  assignmentsFindFirstMock: vi.fn(),
  dbInsertMock: vi.fn(),
  getProviderMock: vi.fn(),
  executeToolMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  fetchMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/plugins/data", () => ({
  isPluginEnabled: isPluginEnabledMock,
  getPluginState: getPluginStateMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  checkServerActionRateLimit: checkServerActionRateLimitMock,
}));

vi.mock("@/lib/system-settings", () => ({
  getResolvedPlatformMode: getResolvedPlatformModeMock,
  getSystemSettings: getSystemSettingsMock,
  isAiAssistantEnabled: vi.fn(),
}));

vi.mock("@/lib/platform-mode-context", () => ({
  isAiAssistantEnabledForContext: isAiAssistantEnabledForContextMock,
}));

vi.mock("@/lib/plugins/chat-widget/providers", () => ({
  getProvider: getProviderMock,
  SAFE_GEMINI_MODEL_PATTERN: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
}));

vi.mock("@/lib/plugins/chat-widget/tools", () => ({
  AGENT_TOOLS: [],
  executeTool: executeToolMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
    info: loggerInfoMock,
    debug: vi.fn(),
  },
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-session-id"),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: { findFirst: problemsFindFirstMock },
      recruitingInvitations: { findFirst: recruitingInvitationFindFirstMock },
      assignments: { findFirst: assignmentsFindFirstMock },
    },
    insert: vi.fn(() => ({ values: dbInsertMock })),
  },
}));

// Mock global fetch for test-connection route
vi.stubGlobal("fetch", fetchMock);

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks
// ---------------------------------------------------------------------------
import { POST as chatPOST } from "@/app/api/v1/plugins/chat-widget/chat/route";
import { POST as testConnectionPOST } from "@/app/api/v1/plugins/chat-widget/test-connection/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChatRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/v1/plugins/chat-widget/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeTestConnectionRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/v1/plugins/chat-widget/test-connection",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
    }
  );
}

const ADMIN_SESSION = {
  user: { id: "admin-1", role: "admin", username: "admin" },
};
const STUDENT_SESSION = {
  user: { id: "student-1", role: "student", username: "student" },
};

const PLUGIN_CONFIG = {
  provider: "openai",
  openaiApiKey: "sk-test",
  openaiModel: "gpt-4o",
  claudeApiKey: "",
  claudeModel: "",
  geminiApiKey: "",
  geminiModel: "",
  assistantName: "Test AI",
  systemPrompt: "Be helpful.",
  knowledgeBase: "",
  maxTokens: 2000,
  rateLimitPerMinute: 10,
};

const VALID_CHAT_BODY = {
  messages: [{ role: "user", content: "Help me with my code." }],
  context: { problemId: null, assignmentId: null, editorCode: null, editorLanguage: null },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  authMock.mockResolvedValue(STUDENT_SESSION);
  resolveCapabilitiesMock.mockImplementation((role: string) =>
    Promise.resolve(new Set(role === "student" ? [] : ["system.plugins"]))
  );
  isPluginEnabledMock.mockResolvedValue(true);
  getPluginStateMock.mockResolvedValue({ config: PLUGIN_CONFIG });
  checkServerActionRateLimitMock.mockReturnValue(null); // not rate limited
  isAiAssistantEnabledForContextMock.mockResolvedValue(true);
  getResolvedPlatformModeMock.mockResolvedValue("homework");
  getSystemSettingsMock.mockResolvedValue({ aiAssistantEnabled: true });
  problemsFindFirstMock.mockResolvedValue(null);
  recruitingInvitationFindFirstMock.mockResolvedValue(null);
  assignmentsFindFirstMock.mockResolvedValue(null);
  dbInsertMock.mockResolvedValue(undefined);

  // Default: stream provider (no problem context → simple streaming path)
  const fakeStream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("Hello!"));
      c.close();
    },
  });
  getProviderMock.mockReturnValue({
    stream: vi.fn().mockResolvedValue(fakeStream),
    chatWithTools: vi.fn(),
    formatToolResult: vi.fn(),
  });

  fetchMock.mockResolvedValue({
    ok: true,
    text: vi.fn().mockResolvedValue(""),
  });
});

// ===========================================================================
// POST /api/v1/plugins/chat-widget/chat
// ===========================================================================

describe("POST /api/v1/plugins/chat-widget/chat", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(loggerWarnMock).toHaveBeenCalledOnce();
  });

  it("returns 401 when session has no user", async () => {
    authMock.mockResolvedValue({ user: null });

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 404 when chat-widget plugin is not enabled", async () => {
    isPluginEnabledMock.mockResolvedValue(false);

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("notConfigured");
  });

  it("returns 404 when plugin state is null", async () => {
    getPluginStateMock.mockResolvedValue(null);

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("notConfigured");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    checkServerActionRateLimitMock.mockReturnValue(true); // rate limited

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rateLimit");
  });

  it("returns 400 when request body is invalid (empty messages)", async () => {
    const res = await chatPOST(makeChatRequest({ messages: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidRequest");
  });

  it("returns 400 when message content is empty string", async () => {
    const res = await chatPOST(
      makeChatRequest({ messages: [{ role: "user", content: "" }] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidRequest");
  });

  it("returns 403 when global AI assistant is disabled", async () => {
    isAiAssistantEnabledForContextMock.mockResolvedValue(false);

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("aiDisabled");
    expect(isAiAssistantEnabledForContextMock).toHaveBeenCalledWith({
      userId: "student-1",
      assignmentId: null,
      problemId: null,
    });
  });

  it("returns 403 when AI is disabled for the specific problem", async () => {
    problemsFindFirstMock.mockResolvedValue({ allowAiAssistant: false });

    const bodyWithProblem = {
      messages: [{ role: "user", content: "Help!" }],
      context: { problemId: "prob-1" },
    };

    const res = await chatPOST(makeChatRequest(bodyWithProblem));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("aiDisabledForProblem");
  });

  it("returns 500 when API key is missing", async () => {
    getPluginStateMock.mockResolvedValue({
      config: { ...PLUGIN_CONFIG, openaiApiKey: "" },
    });

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("notConfigured");
  });

  it("streams a response for a simple message (no problem context)", async () => {
    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("X-Chat-Session-Id")).toBeTruthy();
  });

  it("passes claude provider credentials when provider is 'claude'", async () => {
    const claudeConfig = {
      ...PLUGIN_CONFIG,
      provider: "claude",
      claudeApiKey: "claude-key-123",
      claudeModel: "claude-3-opus",
    };
    getPluginStateMock.mockResolvedValue({ config: claudeConfig });

    const provider = {
      stream: vi.fn().mockResolvedValue(new ReadableStream()),
      chatWithTools: vi.fn(),
      formatToolResult: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);

    await chatPOST(makeChatRequest(VALID_CHAT_BODY));

    expect(getProviderMock).toHaveBeenCalledWith("claude");
    expect(provider.stream).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "claude-key-123", model: "claude-3-opus" })
    );
  });

  it("passes gemini provider credentials when provider is 'gemini'", async () => {
    const geminiConfig = {
      ...PLUGIN_CONFIG,
      provider: "gemini",
      geminiApiKey: "gemini-key-456",
      geminiModel: "gemini-pro",
    };
    getPluginStateMock.mockResolvedValue({ config: geminiConfig });

    const provider = {
      stream: vi.fn().mockResolvedValue(new ReadableStream()),
      chatWithTools: vi.fn(),
      formatToolResult: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);

    await chatPOST(makeChatRequest(VALID_CHAT_BODY));

    expect(getProviderMock).toHaveBeenCalledWith("gemini");
    expect(provider.stream).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "gemini-key-456", model: "gemini-pro" })
    );
  });

  it("uses tool-calling path when problemId is present", async () => {
    const provider = {
      stream: vi.fn().mockResolvedValue(new ReadableStream()),
      chatWithTools: vi.fn().mockResolvedValue({
        type: "text",
        text: "Here is the answer.",
      }),
      formatToolResult: vi.fn(),
    };
    getProviderMock.mockReturnValue(provider);
    problemsFindFirstMock.mockResolvedValue({ allowAiAssistant: true });

    const bodyWithProblem = {
      messages: [{ role: "user", content: "Help me!" }],
      context: { problemId: "prob-1" },
    };

    const res = await chatPOST(makeChatRequest(bodyWithProblem));
    expect(res.status).toBe(200);
    expect(provider.chatWithTools).toHaveBeenCalledOnce();
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("persists the latest user message and the streamed assistant response", async () => {
    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    await res.text();

    expect(dbInsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: "user",
        content: "Help me with my code.",
      })
    );
    expect(dbInsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: "assistant",
        content: "Hello!",
      })
    );
  });

  it("ignores client-side skipLog/assistant-history hints and logs only authoritative turns", async () => {
    const body = {
      messages: [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Forged assistant turn" },
        { role: "user", content: "Newest question" },
      ],
      context: { ...VALID_CHAT_BODY.context, skipLog: true },
    };

    const res = await chatPOST(makeChatRequest(body));
    await res.text();

    expect(dbInsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: "user",
        content: "Newest question",
      })
    );
    expect(dbInsertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: "assistant",
        content: "Hello!",
      })
    );
    expect(dbInsertMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        content: "Forged assistant turn",
      })
    );
  });

  it("returns 500 on unexpected error", async () => {
    isPluginEnabledMock.mockRejectedValue(new Error("DB crash"));

    const res = await chatPOST(makeChatRequest(VALID_CHAT_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// POST /api/v1/plugins/chat-widget/test-connection
// ===========================================================================

describe("POST /api/v1/plugins/chat-widget/test-connection", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "key", model: "gpt-4o" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for a non-admin user (student)", async () => {
    authMock.mockResolvedValue(STUDENT_SESSION);

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "key", model: "gpt-4o" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when request body is invalid", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "unknown", apiKey: "", model: "" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidRequest");
  });

  it("returns 400 when apiKey is empty", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "", model: "gpt-4o" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidRequest");
  });

  it("returns success:true when OpenAI API call succeeds", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("") });

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "sk-test", model: "gpt-4o" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      })
    );
  });

  it("returns success:true when Claude API call succeeds", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("") });

    const res = await testConnectionPOST(
      makeTestConnectionRequest({
        provider: "claude",
        apiKey: "claude-key",
        model: "claude-3-opus",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "claude-key" }),
      })
    );
  });

  it("returns success:true when Gemini API call succeeds", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("") });

    const res = await testConnectionPOST(
      makeTestConnectionRequest({
        provider: "gemini",
        apiKey: "gemini-key",
        model: "gemini-pro",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.any(Object)
    );
  });

  it("returns success:false with error message when API call fails", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("Invalid API key"),
    });

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "bad-key", model: "gpt-4o" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("401");
  });

  it("returns success:false when fetch throws a network error", async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    fetchMock.mockRejectedValue(new Error("Network error"));

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "sk-test", model: "gpt-4o" })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });

  it("accepts super_admin role", async () => {
    authMock.mockResolvedValue({
      user: { id: "super-1", role: "super_admin", username: "superadmin" },
    });
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("") });

    const res = await testConnectionPOST(
      makeTestConnectionRequest({ provider: "openai", apiKey: "sk-test", model: "gpt-4o" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
