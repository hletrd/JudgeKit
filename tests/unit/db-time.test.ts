import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDbNow, getDbNowUncached } from "@/lib/db-time";

// Mock the db queries module
vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: vi.fn(),
}));

import { rawQueryOne } from "@/lib/db/queries";

const mockRawQueryOne = vi.mocked(rawQueryOne);

describe("getDbNowUncached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Date from DB server time", async () => {
    const dbTime = new Date("2026-04-20T12:00:00Z");
    mockRawQueryOne.mockResolvedValue({ now: dbTime });
    const result = await getDbNowUncached();
    expect(result).toBe(dbTime);
  });

  it("coerces an ISO-string DB server time to a Date", async () => {
    const dbTime = new Date("2026-04-20T12:00:00Z");
    mockRawQueryOne.mockResolvedValue({ now: dbTime.toISOString() });
    const result = await getDbNowUncached();
    expect(result.getTime()).toBe(dbTime.getTime());
  });

  it("throws when DB query returns an unparseable timestamp string", async () => {
    mockRawQueryOne.mockResolvedValue({ now: "not-a-timestamp" });
    await expect(getDbNowUncached()).rejects.toThrow(
      "getDbNowUncached: failed to parse DB server time"
    );
  });

  it("throws when DB query returns null", async () => {
    mockRawQueryOne.mockResolvedValue(null);
    await expect(getDbNowUncached()).rejects.toThrow(
      "getDbNowUncached: failed to fetch DB server time"
    );
  });

  it("throws when DB query returns row with null now", async () => {
    mockRawQueryOne.mockResolvedValue({ now: null });
    await expect(getDbNowUncached()).rejects.toThrow(
      "getDbNowUncached: failed to fetch DB server time"
    );
  });

  it("calls SELECT NOW() query", async () => {
    const dbTime = new Date("2026-04-20T12:00:00Z");
    mockRawQueryOne.mockResolvedValue({ now: dbTime });
    await getDbNowUncached();
    expect(mockRawQueryOne).toHaveBeenCalledWith(
      "SELECT NOW()::timestamptz AS now"
    );
  });
});

describe("getDbNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Date from DB server time", async () => {
    const dbTime = new Date("2026-04-20T12:00:00Z");
    mockRawQueryOne.mockResolvedValue({ now: dbTime });
    const result = await getDbNow();
    expect(result).toBe(dbTime);
  });

  it("throws when DB query returns null", async () => {
    mockRawQueryOne.mockResolvedValue(null);
    await expect(getDbNow()).rejects.toThrow(
      "getDbNow: failed to fetch DB server time"
    );
  });
});
