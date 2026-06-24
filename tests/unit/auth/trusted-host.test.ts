import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getTrustedAuthHostsMock, normalizeHostMock } = vi.hoisted(() => ({
  getTrustedAuthHostsMock: vi.fn(),
  normalizeHostMock: vi.fn(),
}));

vi.mock("@/lib/security/env", () => ({
  getTrustedAuthHosts: getTrustedAuthHostsMock,
  normalizeHostForComparison: normalizeHostMock,
}));

import { validateTrustedAuthHost } from "@/lib/auth/trusted-host";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/auth/signin", {
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  normalizeHostMock.mockImplementation((h: string) => h.toLowerCase().replace(/:\d+$/, ""));
});

describe("validateTrustedAuthHost", () => {
  it("returns null when trusted hosts set is empty (no restriction)", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set());

    const result = await validateTrustedAuthHost(makeRequest({ host: "evil.com" }));

    expect(result).toBeNull();
  });

  it("returns null when request host matches a trusted host", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["example.com"]));

    const result = await validateTrustedAuthHost(makeRequest({ host: "example.com" }));

    expect(result).toBeNull();
  });

  it("does not bypass the trusted-host allowlist for proxy trust mode", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["trusted.com"]));

    const result = await validateTrustedAuthHost(makeRequest({ host: "evil.com" }));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("returns null when no host header is present", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["example.com"]));

    const result = await validateTrustedAuthHost(makeRequest());

    expect(result).toBeNull();
  });

  it("returns 400 response when host is not trusted", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["trusted.com"]));

    const result = await validateTrustedAuthHost(makeRequest({ host: "evil.com" }));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("does not trust client-supplied x-forwarded-host over host", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["backend.com"]));

    const result = await validateTrustedAuthHost(
      makeRequest({ "x-forwarded-host": "proxy.com", host: "backend.com" })
    );

    expect(result).toBeNull();
  });

  it("rejects when host is untrusted even if x-forwarded-host is trusted", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["trusted.com"]));

    const result = await validateTrustedAuthHost(
      makeRequest({ "x-forwarded-host": "trusted.com", host: "evil.com" })
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });
});
