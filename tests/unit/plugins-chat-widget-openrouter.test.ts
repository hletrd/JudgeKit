import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_OPENROUTER_MODELS,
  OPENROUTER_MODEL_PATTERN,
  OPENROUTER_MODEL_MAX_LENGTH,
  isValidOpenRouterModel,
  buildOpenRouterModelList,
  recommendedFallbackList,
} from "@/lib/plugins/chat-widget/openrouter-models";

describe("RECOMMENDED_OPENROUTER_MODELS", () => {
  it("is non-empty and has the expected 12 ids in spec order", () => {
    expect(RECOMMENDED_OPENROUTER_MODELS.length).toBe(12);
    expect(RECOMMENDED_OPENROUTER_MODELS[0]).toBe("deepseek/deepseek-v4-flash");
  });

  it("has no duplicate ids", () => {
    expect(new Set(RECOMMENDED_OPENROUTER_MODELS).size).toBe(RECOMMENDED_OPENROUTER_MODELS.length);
  });

  it("every id is well-formed (matches the pattern, contains a slug/`/`, no whitespace)", () => {
    for (const id of RECOMMENDED_OPENROUTER_MODELS) {
      expect(isValidOpenRouterModel(id), `id valid: ${id}`).toBe(true);
      expect(OPENROUTER_MODEL_PATTERN.test(id), `id matches pattern: ${id}`).toBe(true);
      expect(id).toContain("/");
      expect(id).not.toMatch(/\s/);
      expect(id.length).toBeLessThanOrEqual(OPENROUTER_MODEL_MAX_LENGTH);
    }
  });
});

describe("isValidOpenRouterModel", () => {
  it("accepts OpenRouter-style ids with `/` and `:`", () => {
    expect(isValidOpenRouterModel("deepseek/deepseek-v4-flash")).toBe(true);
    expect(isValidOpenRouterModel("qwen/qwen3.7-plus:thinking")).toBe(true);
    expect(isValidOpenRouterModel("x-ai/grok-4.5")).toBe(true);
  });

  it("rejects traversal, whitespace, empty, and over-length ids", () => {
    expect(isValidOpenRouterModel("../etc")).toBe(false);
    expect(isValidOpenRouterModel("../../etc/passwd")).toBe(false);
    expect(isValidOpenRouterModel("deepseek/ flash")).toBe(false);
    expect(isValidOpenRouterModel("deepseek\tflash")).toBe(false);
    expect(isValidOpenRouterModel(" deepseek/flash")).toBe(false);
    expect(isValidOpenRouterModel("deepseek/flash ")).toBe(false);
    expect(isValidOpenRouterModel("")).toBe(false);
    expect(isValidOpenRouterModel("a".repeat(OPENROUTER_MODEL_MAX_LENGTH + 1))).toBe(false);
  });

  it("rejects ids that start or end with a punctuation character", () => {
    expect(isValidOpenRouterModel("/deepseek/flash")).toBe(false);
    expect(isValidOpenRouterModel("deepseek/flash/")).toBe(false);
    expect(isValidOpenRouterModel(".deepseek")).toBe(false);
    expect(isValidOpenRouterModel("deepseek:")).toBe(false);
  });
});

describe("buildOpenRouterModelList", () => {
  const mockPayload = {
    data: [
      // A non-recommended, newest model.
      { id: "acme/newest", name: "Newest", context_length: 8000, pricing: { prompt: "0.3", completion: "0.6" }, created: 3000 },
      // A recommended model (out of listed order in the payload).
      { id: "qwen/qwen3.7-plus", name: "Qwen 3.7 Plus", context_length: 128000, pricing: { prompt: "0.1", completion: "0.2" }, created: 1500 },
      // Another non-recommended, older model.
      { id: "acme/older", name: "Older", context_length: 4000, pricing: { prompt: "0.05", completion: "0.1" }, created: 1000 },
      // The default recommended model.
      { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", context_length: 64000, pricing: { prompt: "0", completion: "0" }, created: 2000 },
    ],
  };

  it("puts recommended models first, in the hardcoded order", () => {
    const list = buildOpenRouterModelList(mockPayload);
    // First 12 are the recommended shortlist, in RECOMMENDED order.
    const firstRecommended = list.slice(0, RECOMMENDED_OPENROUTER_MODELS.length).map((m) => m.id);
    expect(firstRecommended).toEqual([...RECOMMENDED_OPENROUTER_MODELS]);
    expect(list[0].id).toBe("deepseek/deepseek-v4-flash");
    expect(list[0].recommended).toBe(true);
  });

  it("trims live metadata for recommended entries present in the payload", () => {
    const list = buildOpenRouterModelList(mockPayload);
    const flash = list.find((m) => m.id === "deepseek/deepseek-v4-flash")!;
    expect(flash.name).toBe("DeepSeek V4 Flash");
    expect(flash.contextLength).toBe(64000);
    expect(flash.pricing).toEqual({ prompt: "0", completion: "0" });
    expect(flash.created).toBe(2000);
  });

  it("includes recommended ids missing from the payload with null metadata", () => {
    const list = buildOpenRouterModelList(mockPayload);
    const missing = list.find((m) => m.id === "moonshotai/kimi-k3")!;
    expect(missing.recommended).toBe(true);
    expect(missing.name).toBeNull();
    expect(missing.contextLength).toBeNull();
    expect(missing.pricing).toEqual({ prompt: null, completion: null });
  });

  it("sorts the non-recommended remainder by created desc", () => {
    const list = buildOpenRouterModelList(mockPayload);
    const rest = list.slice(RECOMMENDED_OPENROUTER_MODELS.length).map((m) => m.id);
    expect(rest).toEqual(["acme/newest", "acme/older"]);
    for (const m of list.slice(RECOMMENDED_OPENROUTER_MODELS.length)) {
      expect(m.recommended).toBe(false);
    }
  });

  it("degrades to an empty remainder on a malformed payload but keeps recommended", () => {
    const list = buildOpenRouterModelList({ nonsense: true });
    expect(list.length).toBe(RECOMMENDED_OPENROUTER_MODELS.length);
    expect(list.every((m) => m.recommended)).toBe(true);
  });
});

describe("recommendedFallbackList", () => {
  it("returns the recommended ids with null metadata, in order", () => {
    const list = recommendedFallbackList();
    expect(list.map((m) => m.id)).toEqual([...RECOMMENDED_OPENROUTER_MODELS]);
    expect(list.every((m) => m.recommended && m.name === null && m.created === null)).toBe(true);
  });
});
