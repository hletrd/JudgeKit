import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getRateLimitKeyMock, isRateLimitedMock, dbMock } = vi.hoisted(() => ({
  getRateLimitKeyMock: vi.fn(),
  isRateLimitedMock: vi.fn(),
  dbMock: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: getRateLimitKeyMock,
  isRateLimited: isRateLimitedMock,
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-nanoid"),
}));

import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: db.select returns no existing row (new request)
  dbMock.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        get: vi.fn(() => undefined),
      })),
    })),
  });
  dbMock.insert.mockReturnValue({
    values: vi.fn(() => ({ run: vi.fn() })),
  });
  dbMock.update.mockReturnValue({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ run: vi.fn() })),
    })),
  });
});

function createRequest() {
  return new NextRequest("https://example.com/api/v1/groups", {
    method: "POST",
    headers: {
      "x-forwarded-for": "198.51.100.8",
    },
  });
}

describe("consumeApiRateLimit", () => {
  it("returns null when the endpoint is still allowed", () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    isRateLimitedMock.mockReturnValueOnce(false);

    expect(consumeApiRateLimit(createRequest(), "groups")).toBeNull();
    expect(getRateLimitKeyMock).toHaveBeenCalledWith(
      "api:groups",
      expect.any(Headers)
    );
    // recordApiAttempt is called internally via db.insert (new key)
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("returns a 429 response when the request is already rate limited", async () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    isRateLimitedMock.mockReturnValue(true);

    const response = consumeApiRateLimit(createRequest(), "groups");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    await expect(response?.json()).resolves.toEqual({ error: "rateLimited" });
  });

  it("does not double-count the same request key", () => {
    getRateLimitKeyMock.mockReturnValue("api:groups:198.51.100.8");
    isRateLimitedMock.mockReturnValue(false);
    const request = createRequest();

    consumeApiRateLimit(request, "groups");
    // Second call with same request object: key already consumed, returns null without recording
    consumeApiRateLimit(request, "groups");

    // recordApiAttempt is only called once (dedup via WeakMap)
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });
});
