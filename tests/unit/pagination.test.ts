import { describe, expect, it } from "vitest";
import { parsePagination } from "@/lib/api/pagination";

function params(record: Record<string, string> = {}) {
  return new URLSearchParams(record);
}

describe("parsePagination", () => {
  describe("page parsing", () => {
    it("returns page 1 and offset 0 when no params are provided", () => {
      const result = parsePagination(params());
      expect(result.page).toBe(1);
      expect(result.offset).toBe(0);
    });

    it("parses a valid page number", () => {
      const result = parsePagination(params({ page: "3" }));
      expect(result.page).toBe(3);
    });

    it("returns page 1 for a zero page value", () => {
      const result = parsePagination(params({ page: "0" }));
      expect(result.page).toBe(1);
    });

    it("returns page 1 for a negative page value", () => {
      const result = parsePagination(params({ page: "-5" }));
      expect(result.page).toBe(1);
    });

    it("returns page 1 for a non-numeric page value", () => {
      const result = parsePagination(params({ page: "abc" }));
      expect(result.page).toBe(1);
    });

    it("returns page 1 for an empty page string", () => {
      const result = parsePagination(params({ page: "" }));
      expect(result.page).toBe(1);
    });
  });

  describe("limit parsing", () => {
    it("uses the default limit of 20 when not specified", () => {
      const result = parsePagination(params());
      expect(result.limit).toBe(20);
    });

    it("uses a custom defaultLimit option", () => {
      const result = parsePagination(params(), { defaultLimit: 50 });
      expect(result.limit).toBe(50);
    });

    it("parses a valid limit param", () => {
      const result = parsePagination(params({ limit: "10" }));
      expect(result.limit).toBe(10);
    });

    it("clamps limit to maxLimit (default 100)", () => {
      const result = parsePagination(params({ limit: "200" }));
      expect(result.limit).toBe(100);
    });

    it("clamps limit to a custom maxLimit", () => {
      const result = parsePagination(params({ limit: "60" }), { maxLimit: 40 });
      expect(result.limit).toBe(40);
    });

    it("falls back to defaultLimit for a zero limit value (falsy parseInt)", () => {
      // parseInt("0") is falsy, so the implementation falls back to defaultLimit
      const result = parsePagination(params({ limit: "0" }));
      expect(result.limit).toBe(20);
    });

    it("clamps limit to 1 for a negative limit value", () => {
      const result = parsePagination(params({ limit: "-10" }));
      expect(result.limit).toBe(1);
    });

    it("falls back to defaultLimit for a non-numeric limit", () => {
      const result = parsePagination(params({ limit: "abc" }));
      expect(result.limit).toBe(20);
    });
  });

  describe("offset calculation", () => {
    it("computes offset as (page - 1) * limit", () => {
      const result = parsePagination(params({ page: "3", limit: "10" }));
      expect(result.offset).toBe(20);
    });

    it("returns offset 0 for page 1", () => {
      const result = parsePagination(params({ page: "1", limit: "25" }));
      expect(result.offset).toBe(0);
    });

    it("returns correct offset with default limit", () => {
      const result = parsePagination(params({ page: "4" }));
      // default limit = 20, so offset = (4-1)*20 = 60
      expect(result.offset).toBe(60);
    });
  });
});
