import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "@/lib/api/client";

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("adds X-Requested-With header when not present", async () => {
    await apiFetch("/api/v1/test");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [input, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(input).toBe("/api/v1/test");
    const headers = init?.headers as Headers;
    expect(headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("preserves existing Content-Type header", async () => {
    await apiFetch("/api/v1/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const headers = init?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("does not duplicate X-Requested-With if already set by caller", async () => {
    await apiFetch("/api/v1/test", {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json" },
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const headers = init?.headers as Headers;
    // Should still be exactly one X-Requested-With header
    expect(headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("passes through method, body, and other options unchanged", async () => {
    const body = JSON.stringify({ key: "value" });
    await apiFetch("/api/v1/test", {
      method: "POST",
      body,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(body);
  });

  it("works with URL input", async () => {
    await apiFetch(new URL("http://localhost/api/v1/test"));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("adds default AbortSignal.timeout(30s) when no signal is provided", async () => {
    await apiFetch("/api/v1/test");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
  });

  it("combines caller-provided signal with default timeout", async () => {
    const controller = new AbortController();
    await apiFetch("/api/v1/test", { signal: controller.signal });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    // The signal passed to fetch should be a composite signal, not the caller's raw signal
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal).not.toBe(controller.signal);
  });

  it("aborts fetch when caller-provided signal is aborted", async () => {
    const controller = new AbortController();
    await apiFetch("/api/v1/test", { signal: controller.signal });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(init?.signal?.aborted).toBe(false);

    controller.abort();
    expect(init?.signal?.aborted).toBe(true);
  });

  it("falls back to setTimeout-based signal when AbortSignal.timeout is unavailable", async () => {
    const originalTimeout = AbortSignal.timeout;
    (AbortSignal as unknown as { timeout: unknown }).timeout = undefined;

    try {
      await apiFetch("/api/v1/test");

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
    } finally {
      (AbortSignal as unknown as { timeout: typeof originalTimeout }).timeout = originalTimeout;
    }
  });

  it("immediately aborts when caller-provided signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await apiFetch("/api/v1/test", { signal: controller.signal });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(true);
  });
});
