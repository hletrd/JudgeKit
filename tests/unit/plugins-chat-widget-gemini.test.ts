import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECOMMENDED_GEMINI_MODELS,
  buildGeminiModelList,
  recommendedFallbackList,
  stripModelsPrefix,
  type GeminiModelInfo,
} from "@/lib/plugins/chat-widget/gemini-models";

// ── Pure helpers (no mocks) ───────────────────────────────────────────────────

describe("RECOMMENDED_GEMINI_MODELS", () => {
  it("is the confirmed 6-id shortlist in spec order with the GA default first", () => {
    expect([...RECOMMENDED_GEMINI_MODELS]).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ]);
    expect(RECOMMENDED_GEMINI_MODELS[0]).toBe("gemini-3.6-flash");
  });

  it("has no duplicate ids and none carry the `models/` prefix", () => {
    expect(new Set(RECOMMENDED_GEMINI_MODELS).size).toBe(RECOMMENDED_GEMINI_MODELS.length);
    for (const id of RECOMMENDED_GEMINI_MODELS) {
      expect(id.startsWith("models/")).toBe(false);
      expect(id).not.toMatch(/\s/);
    }
  });
});

describe("stripModelsPrefix", () => {
  it("removes a leading `models/` and leaves bare ids untouched", () => {
    expect(stripModelsPrefix("models/gemini-3.6-flash")).toBe("gemini-3.6-flash");
    expect(stripModelsPrefix("gemini-3.6-flash")).toBe("gemini-3.6-flash");
  });
});

describe("buildGeminiModelList", () => {
  const mockPayload = {
    models: [
      // A non-recommended chat model.
      {
        name: "models/gemini-2.0-flash",
        displayName: "Gemini 2.0 Flash",
        description: "older flash",
        inputTokenLimit: 1000000,
        supportedGenerationMethods: ["generateContent", "countTokens"],
      },
      // A recommended model, present with live metadata (out of shortlist order).
      {
        name: "models/gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        description: "pro",
        inputTokenLimit: 2000000,
        supportedGenerationMethods: ["generateContent"],
      },
      // An embedding model — must be filtered out (no generateContent).
      {
        name: "models/text-embedding-004",
        displayName: "Text Embedding 004",
        supportedGenerationMethods: ["embedContent"],
      },
      // The default recommended model with live metadata.
      {
        name: "models/gemini-3.6-flash",
        displayName: "Gemini 3.6 Flash",
        description: "default flash",
        inputTokenLimit: 1048576,
        supportedGenerationMethods: ["generateContent", "countTokens"],
      },
    ],
  };

  it("puts recommended models first, in the hardcoded order", () => {
    const list = buildGeminiModelList(mockPayload);
    const firstRecommended = list.slice(0, RECOMMENDED_GEMINI_MODELS.length).map((m) => m.id);
    expect(firstRecommended).toEqual([...RECOMMENDED_GEMINI_MODELS]);
    expect(list[0].id).toBe("gemini-3.6-flash");
    expect(list[0].recommended).toBe(true);
  });

  it("strips the `models/` prefix from ids", () => {
    const list = buildGeminiModelList(mockPayload);
    expect(list.every((m) => !m.id.startsWith("models/"))).toBe(true);
    expect(list.some((m) => m.id === "gemini-2.0-flash")).toBe(true);
  });

  it("filters out models without generateContent (e.g. embeddings)", () => {
    const list = buildGeminiModelList(mockPayload);
    expect(list.some((m) => m.id === "text-embedding-004")).toBe(false);
  });

  it("trims live metadata for recommended entries present in the payload", () => {
    const list = buildGeminiModelList(mockPayload);
    const flash = list.find((m) => m.id === "gemini-3.6-flash")!;
    expect(flash.displayName).toBe("Gemini 3.6 Flash");
    expect(flash.description).toBe("default flash");
    expect(flash.inputTokenLimit).toBe(1048576);
  });

  it("includes recommended ids missing from the payload with null metadata", () => {
    const list = buildGeminiModelList(mockPayload);
    const missing = list.find((m) => m.id === "gemini-3.1-pro-preview")!;
    expect(missing.recommended).toBe(true);
    expect(missing.displayName).toBeNull();
    expect(missing.description).toBeNull();
    expect(missing.inputTokenLimit).toBeNull();
  });

  it("keeps the non-recommended remainder after the shortlist, not recommended", () => {
    const list = buildGeminiModelList(mockPayload);
    const rest = list.slice(RECOMMENDED_GEMINI_MODELS.length);
    expect(rest.map((m) => m.id)).toEqual(["gemini-2.0-flash"]);
    expect(rest.every((m) => m.recommended === false)).toBe(true);
  });

  it("degrades to the recommended-only shortlist on a malformed payload", () => {
    const list = buildGeminiModelList({ nonsense: true });
    expect(list.length).toBe(RECOMMENDED_GEMINI_MODELS.length);
    expect(list.every((m) => m.recommended)).toBe(true);
  });
});

describe("recommendedFallbackList", () => {
  it("returns the recommended ids with null metadata, in order", () => {
    const list = recommendedFallbackList();
    expect(list.map((m) => m.id)).toEqual([...RECOMMENDED_GEMINI_MODELS]);
    expect(
      list.every(
        (m) => m.recommended && m.displayName === null && m.inputTokenLimit === null
      )
    ).toBe(true);
  });
});

// ── Route: auth-gated GET, cache/degradation, key-never-logged ────────────────
// Mock the handler factory so `GET` is the raw handler fn (bypasses auth/rate
// limit), and mock the plugin-state + logger + fetch dependencies.
const getPluginStateMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/handler", () => ({
  createApiHandler: (config: { handler: (...a: unknown[]) => unknown }) => config.handler,
}));
vi.mock("@/lib/plugins/data", () => ({ getPluginState: getPluginStateMock }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: loggerWarnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const SECRET_KEY = "AIza-super-secret-gemini-key-DO-NOT-LOG";

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/v1/plugins/chat-widget/gemini-models/route");
  return mod.GET as unknown as () => Promise<Response>;
}

describe("gemini-models route", () => {
  beforeEach(() => {
    getPluginStateMock.mockReset();
    loggerWarnMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the fallback list with keyConfigured:false when no key is set (never fetches)", async () => {
    getPluginStateMock.mockResolvedValue({ config: { geminiApiKey: "" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const GET = await loadRoute();
    const res = await GET();
    const body = await res.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.keyConfigured).toBe(false);
    expect(body.error).toBe(false);
    expect(body.models.map((m: GeminiModelInfo) => m.id)).toEqual([
      ...RECOMMENDED_GEMINI_MODELS,
    ]);
  });

  it("fetches live models with the key in the x-goog-api-key HEADER (never the URL)", async () => {
    getPluginStateMock.mockResolvedValue({ config: { geminiApiKey: SECRET_KEY } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            name: "models/gemini-3.6-flash",
            displayName: "Gemini 3.6 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const GET = await loadRoute();
    const res = await GET();
    const body = await res.json();

    expect(body.error).toBe(false);
    expect(body.keyConfigured).toBe(true);
    expect(body.models[0].id).toBe("gemini-3.6-flash");

    // The key is in the header, and NOT in the URL.
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).not.toContain(SECRET_KEY);
    expect(String(calledUrl)).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(SECRET_KEY);
  });

  it("degrades to the fallback list on upstream failure and NEVER logs the key", async () => {
    getPluginStateMock.mockResolvedValue({ config: { geminiApiKey: SECRET_KEY } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const GET = await loadRoute();
    const res = await GET();
    const body = await res.json();

    expect(body.error).toBe(true);
    expect(body.models.map((m: GeminiModelInfo) => m.id)).toEqual([
      ...RECOMMENDED_GEMINI_MODELS,
    ]);

    // A warn was logged for the degradation, but the key must not appear in any
    // argument of any log call.
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    const allLoggedArgs = JSON.stringify(
      loggerWarnMock.mock.calls.map((call) =>
        call.map((arg) => (arg instanceof Error ? { message: arg.message, stack: arg.stack } : arg))
      )
    );
    expect(allLoggedArgs).not.toContain(SECRET_KEY);
  });

  it("also never logs the key when fetch itself throws (network/abort)", async () => {
    getPluginStateMock.mockResolvedValue({ config: { geminiApiKey: SECRET_KEY } });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const GET = await loadRoute();
    const res = await GET();
    const body = await res.json();

    expect(body.error).toBe(true);
    const allLoggedArgs = JSON.stringify(
      loggerWarnMock.mock.calls.map((call) =>
        call.map((arg) => (arg instanceof Error ? { message: arg.message, stack: arg.stack } : arg))
      )
    );
    expect(allLoggedArgs).not.toContain(SECRET_KEY);
  });
});
