import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getRateLimitKeyMock, isRateLimitedMock, recordRateLimitFailureMock } = vi.hoisted(
  () => ({
    getRateLimitKeyMock: vi.fn(),
    isRateLimitedMock: vi.fn(),
    recordRateLimitFailureMock: vi.fn(),
  })
);

vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: getRateLimitKeyMock,
  isRateLimited: isRateLimitedMock,
  recordRateLimitFailure: recordRateLimitFailureMock,
}));

import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

function createRequest() {
  return new NextRequest("https://example.com/api/v1/groups", {
    method: "POST",
    headers: {
      "x-forwarded-for": "198.51.100.8",
    },
  });
}

describe("checkApiRateLimit", () => {
  it("returns null when the endpoint is still allowed", () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    isRateLimitedMock.mockReturnValue(false);

    expect(checkApiRateLimit(createRequest(), "groups")).toBeNull();
    expect(getRateLimitKeyMock).toHaveBeenCalledWith(
      "api:groups",
      expect.any(Headers)
    );
  });

  it("returns a 429 response when the request is already rate limited", async () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    isRateLimitedMock.mockReturnValue(true);

    const response = checkApiRateLimit(createRequest(), "groups");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    await expect(response?.json()).resolves.toEqual({ error: "rateLimited" });
  });
});

describe("recordApiRateHit", () => {
  it("records hits under the endpoint-specific API key", () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");

    recordApiRateHit(createRequest(), "groups");

    expect(recordRateLimitFailureMock).toHaveBeenCalledWith("api:groups:198.51.100.8");
  });
});
