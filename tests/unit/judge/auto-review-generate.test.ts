import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  submissionsFindFirstMock,
  commentsFindFirstMock,
  insertValuesMock,
  insertMock,
  isPluginEnabledMock,
  getPluginStateMock,
  chatWithToolsMock,
  getProviderMock,
  isAiEnabledForContextMock,
  getSystemSettingsMock,
} = vi.hoisted(() => ({
  submissionsFindFirstMock: vi.fn(),
  commentsFindFirstMock: vi.fn(),
  insertValuesMock: vi.fn(),
  insertMock: vi.fn(),
  isPluginEnabledMock: vi.fn(),
  getPluginStateMock: vi.fn(),
  chatWithToolsMock: vi.fn(),
  getProviderMock: vi.fn(),
  isAiEnabledForContextMock: vi.fn(),
  getSystemSettingsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      submissions: { findFirst: submissionsFindFirstMock },
      submissionComments: { findFirst: commentsFindFirstMock },
    },
    insert: insertMock,
  },
}));

vi.mock("@/lib/plugins/data", () => ({
  isPluginEnabled: isPluginEnabledMock,
  getPluginState: getPluginStateMock,
}));

vi.mock("@/lib/plugins/chat-widget/providers", () => ({
  getProvider: getProviderMock,
}));

vi.mock("@/lib/platform-mode-context", () => ({
  isAiAssistantEnabledForContext: isAiEnabledForContextMock,
}));

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: getSystemSettingsMock,
}));

vi.mock("@/lib/judge/prompt-sanitization", () => ({
  sanitizePromptInput: (s: string) => s,
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  generateAndStoreReview,
  triggerAutoCodeReview,
} from "@/lib/judge/auto-review";

function baseSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    userId: "u1",
    sourceCode: "print(1)",
    language: "python",
    status: "accepted",
    executionTimeMs: 10,
    memoryUsedKb: 100,
    assignmentId: null,
    user: { preferredLanguage: "en" },
    problem: { title: "Two Sum", description: "desc", allowAiAssistant: true },
    ...overrides,
  };
}

describe("generateAndStoreReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submissionsFindFirstMock.mockResolvedValue(baseSubmission());
    commentsFindFirstMock.mockResolvedValue(null);
    insertMock.mockReturnValue({ values: insertValuesMock });
    insertValuesMock.mockResolvedValue(undefined);
    isPluginEnabledMock.mockResolvedValue(true);
    getPluginStateMock.mockResolvedValue({
      config: { provider: "openai", openaiApiKey: "oa-key", openaiModel: "gpt-x" },
    });
    getProviderMock.mockReturnValue({ chatWithTools: chatWithToolsMock });
    chatWithToolsMock.mockResolvedValue({ type: "text", text: "Nice solution." });
    isAiEnabledForContextMock.mockResolvedValue(true);
    getSystemSettingsMock.mockResolvedValue({ autoCodeReviewEnabled: true });
  });

  it("creates an AI-authored comment for an accepted submission", async () => {
    const result = await generateAndStoreReview("sub-1");
    expect(result.status).toBe("created");
    expect(chatWithToolsMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1", authorId: null, content: "Nice solution." }),
    );
  });

  it("skips (dedup) when an AI comment already exists and does not call the provider", async () => {
    commentsFindFirstMock.mockResolvedValue({ id: "c1" });
    const result = await generateAndStoreReview("sub-1");
    expect(result).toEqual({ status: "skipped", reason: "alreadyExists" });
    expect(chatWithToolsMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("force bypasses the dedup check and regenerates", async () => {
    commentsFindFirstMock.mockResolvedValue({ id: "c1" });
    const result = await generateAndStoreReview("sub-1", { force: true });
    expect(result.status).toBe("created");
    expect(commentsFindFirstMock).not.toHaveBeenCalled();
    expect(chatWithToolsMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
  });

  it("selects the OpenRouter key/model for the openrouter provider (bug fix)", async () => {
    getPluginStateMock.mockResolvedValue({
      config: {
        provider: "openrouter",
        openaiApiKey: "oa-key",
        openaiModel: "gpt-x",
        openrouterApiKey: "or-key",
        openrouterModel: "deepseek/model",
      },
    });
    const result = await generateAndStoreReview("sub-1");
    expect(result.status).toBe("created");
    expect(getProviderMock).toHaveBeenCalledWith("openrouter");
    expect(chatWithToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "or-key", model: "deepseek/model" }),
    );
  });

  it("skips a non-accepted submission when requireAccepted (default)", async () => {
    submissionsFindFirstMock.mockResolvedValue(baseSubmission({ status: "wrong_answer" }));
    const result = await generateAndStoreReview("sub-1");
    expect(result).toEqual({ status: "skipped", reason: "notAccepted" });
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it("allows a non-accepted submission when requireAccepted is false (manual admin path)", async () => {
    submissionsFindFirstMock.mockResolvedValue(baseSubmission({ status: "wrong_answer" }));
    const result = await generateAndStoreReview("sub-1", { requireAccepted: false });
    expect(result.status).toBe("created");
    expect(chatWithToolsMock).toHaveBeenCalledTimes(1);
  });

  it("skips oversized source without calling the provider", async () => {
    submissionsFindFirstMock.mockResolvedValue(
      baseSubmission({ sourceCode: "x".repeat(9000) }),
    );
    const result = await generateAndStoreReview("sub-1");
    expect(result).toEqual({ status: "skipped", reason: "sourceTooLarge" });
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it("is disabled when the per-problem AI assistant is off", async () => {
    submissionsFindFirstMock.mockResolvedValue(
      baseSubmission({ problem: { title: "T", description: "d", allowAiAssistant: false } }),
    );
    const result = await generateAndStoreReview("sub-1");
    expect(result).toEqual({ status: "disabled", reason: "problemAiDisabled" });
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it("is disabled when AI is off for the submission context", async () => {
    isAiEnabledForContextMock.mockResolvedValue(false);
    const result = await generateAndStoreReview("sub-1");
    expect(result).toEqual({ status: "disabled", reason: "aiDisabledForContext" });
  });

  it("returns error (not throw) when the provider call fails", async () => {
    chatWithToolsMock.mockRejectedValue(new Error("boom"));
    const result = await generateAndStoreReview("sub-1");
    expect(result.status).toBe("error");
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("triggerAutoCodeReview (auto-trigger gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submissionsFindFirstMock.mockResolvedValue(baseSubmission());
    commentsFindFirstMock.mockResolvedValue(null);
    insertMock.mockReturnValue({ values: insertValuesMock });
    insertValuesMock.mockResolvedValue(undefined);
    isPluginEnabledMock.mockResolvedValue(true);
    getPluginStateMock.mockResolvedValue({
      config: { provider: "openai", openaiApiKey: "oa-key", openaiModel: "gpt-x" },
    });
    getProviderMock.mockReturnValue({ chatWithTools: chatWithToolsMock });
    chatWithToolsMock.mockResolvedValue({ type: "text", text: "Nice." });
    isAiEnabledForContextMock.mockResolvedValue(true);
  });

  it("skips generation entirely when autoCodeReviewEnabled is false", async () => {
    getSystemSettingsMock.mockResolvedValue({ autoCodeReviewEnabled: false });
    await triggerAutoCodeReview("sub-1");
    expect(submissionsFindFirstMock).not.toHaveBeenCalled();
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it("generates when autoCodeReviewEnabled is true", async () => {
    getSystemSettingsMock.mockResolvedValue({ autoCodeReviewEnabled: true });
    await triggerAutoCodeReview("sub-1");
    expect(submissionsFindFirstMock).toHaveBeenCalledTimes(1);
    expect(chatWithToolsMock).toHaveBeenCalledTimes(1);
  });

  it("proceeds (default-enabled) when the setting is missing", async () => {
    getSystemSettingsMock.mockResolvedValue(undefined);
    await triggerAutoCodeReview("sub-1");
    expect(submissionsFindFirstMock).toHaveBeenCalledTimes(1);
  });
});
