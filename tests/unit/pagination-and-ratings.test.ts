import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
  setPaginationParams,
} from "@/lib/pagination";
import { calculateTier } from "@/lib/ratings";

describe("pagination helpers", () => {
  it("normalizes invalid pages back to 1", () => {
    expect(normalizePage()).toBe(1);
    expect(normalizePage("0")).toBe(1);
    expect(normalizePage("-4")).toBe(1);
    expect(normalizePage("2.8")).toBe(2);
  });

  it("accepts only supported page sizes", () => {
    expect(normalizePageSize()).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize("20")).toBe(20);
    expect(normalizePageSize("15")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("writes pagination params while omitting defaults", () => {
    const params = new URLSearchParams("search=judgekit");
    setPaginationParams(params, 1, DEFAULT_PAGE_SIZE);
    expect(params.toString()).toBe("search=judgekit");

    setPaginationParams(params, 3, 20);
    expect(params.toString()).toBe("search=judgekit&page=3&pageSize=20");
  });
});

describe("rating tiers", () => {
  it("maps solved counts to the expected tier", () => {
    expect(calculateTier(0)).toBeNull();
    expect(calculateTier(1)).toBe("bronze");
    expect(calculateTier(51)).toBe("silver");
    expect(calculateTier(151)).toBe("gold");
    expect(calculateTier(301)).toBe("platinum");
    expect(calculateTier(501)).toBe("diamond");
    expect(calculateTier(701)).toBe("ruby");
  });
});
