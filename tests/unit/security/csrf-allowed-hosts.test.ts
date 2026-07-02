import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getTrustedAuthHostsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(new Set<string>())
);

vi.mock("@/lib/security/env", () => ({
  getAuthUrlObject: vi.fn(() => null),
  getTrustedAuthHosts: getTrustedAuthHostsMock,
  normalizeHostForComparison: vi.fn((host: string) => host.trim().toLowerCase()),
}));

import { validateCsrf } from "@/lib/security/csrf";

function createRequest(headers: Record<string, string>, url = "https://example.com/api/v1/resource") {
  return new NextRequest(url, { method: "POST", headers });
}

describe("validateCsrf allowedHosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTrustedAuthHostsMock.mockResolvedValue(new Set(["allowed.example.com"]));
  });

  it("accepts an Origin that is in the DB allowedHosts list", async () => {
    const req = createRequest({
      "x-requested-with": "XMLHttpRequest",
      origin: "https://allowed.example.com",
    });
    expect(await validateCsrf(req)).toBeNull();
  });

  it("rejects an Origin that matches the request host but is not in allowedHosts", async () => {
    const req = createRequest({
      "x-requested-with": "XMLHttpRequest",
      origin: "https://example.com",
    });
    const res = await validateCsrf(req);
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
  });

  it("rejects an Origin that is not in allowedHosts", async () => {
    const req = createRequest({
      "x-requested-with": "XMLHttpRequest",
      origin: "https://evil.example.com",
    });
    const res = await validateCsrf(req);
    expect(res?.status).toBe(403);
    await expect(res?.json()).resolves.toEqual({ error: "csrfValidationFailed" });
  });
});
