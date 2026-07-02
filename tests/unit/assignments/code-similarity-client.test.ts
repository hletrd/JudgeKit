import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { computeSimilarityRust } from "@/lib/assignments/code-similarity-client";

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe("computeSimilarityRust", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns pairs on successful response", async () => {
    const mockPairs = [
      { userId1: "u1", userId2: "u2", problemId: "p1", language: "python", similarity: 0.95 },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pairs: mockPairs }),
    });

    const result = await computeSimilarityRust(
      [
        { userId: "u1", problemId: "p1", language: "python", sourceCode: "code1" },
        { userId: "u2", problemId: "p1", language: "python", sourceCode: "code2" },
      ],
      0.85,
      3
    );

    expect(result).toEqual(mockPairs);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns SIDECAR_HTTP_ERROR on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await computeSimilarityRust(
      [{ userId: "u1", problemId: "p1", language: "python", sourceCode: "code" }],
      0.85,
      3
    );

    expect(result).toBe("SIDECAR_HTTP_ERROR");
  });

  it("returns SIDECAR_UNAVAILABLE on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await computeSimilarityRust(
      [{ userId: "u1", problemId: "p1", language: "python", sourceCode: "code" }],
      0.85,
      3
    );

    expect(result).toBe("SIDECAR_UNAVAILABLE");
  });

  it("returns SIDECAR_ABORTED when the caller signal aborts mid-flight", async () => {
    const controller = new AbortController();

    globalThis.fetch = vi.fn((_url, init) =>
      new Promise<Response>((_, reject) => {
        const requestSignal = init?.signal as AbortSignal | undefined;
        if (requestSignal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        requestSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      })
    );

    const resultPromise = computeSimilarityRust(
      [{ userId: "u1", problemId: "p1", language: "python", sourceCode: "code" }],
      0.85,
      3,
      controller.signal
    );

    controller.abort();

    expect(await resultPromise).toBe("SIDECAR_ABORTED");
  });

  it("sends correct JSON payload with snake_case ngram_size", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pairs: [] }),
    });

    await computeSimilarityRust(
      [{ userId: "u1", problemId: "p1", language: "python", sourceCode: "code" }],
      0.9,
      5
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({
      submissions: [{ userId: "u1", problemId: "p1", language: "python", sourceCode: "code" }],
      threshold: 0.9,
      ngram_size: 5,
    });
  });

  it("uses default threshold and ngramSize", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ pairs: [] }),
    });

    await computeSimilarityRust([
      { userId: "u1", problemId: "p1", language: "python", sourceCode: "code" },
    ]);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.threshold).toBe(0.85);
    expect(body.ngram_size).toBe(3);
  });
});
