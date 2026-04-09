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

  it("uses x-forwarded-host header when present", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["proxy.com"]));

    const result = await validateTrustedAuthHost(
      makeRequest({ "x-forwarded-host": "proxy.com", host: "backend.com" })
    );

    expect(result).toBeNull();
  });

  it("uses first value from comma-separated x-forwarded-host", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["first.com"]));

    const result = await validateTrustedAuthHost(
      makeRequest({ "x-forwarded-host": "first.com, second.com" })
    );

    expect(result).toBeNull();
  });

  it("rejects when x-forwarded-host is not trusted", async () => {
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["trusted.com"]));

    const result = await validateTrustedAuthHost(
      makeRequest({ "x-forwarded-host": "evil.com", host: "trusted.com" })
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });
});
