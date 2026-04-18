import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isJudgeIpAllowed, resetIpAllowlistCache } from "@/lib/judge/ip-allowlist";

function requestWithIp(ip: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (ip !== null) headers["x-forwarded-for"] = ip;
  return new NextRequest("http://localhost:3000/api/v1/judge/claim", {
    method: "POST",
    headers,
  });
}

describe("isJudgeIpAllowed", () => {
  beforeEach(() => {
    resetIpAllowlistCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetIpAllowlistCache();
  });

  describe("with no allowlist configured", () => {
    it("allows every request in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(isJudgeIpAllowed(requestWithIp("203.0.113.9"))).toBe(true);
      expect(isJudgeIpAllowed(requestWithIp("127.0.0.1"))).toBe(true);
    });

    it("denies every request in production (fail closed)", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isJudgeIpAllowed(requestWithIp("127.0.0.1"))).toBe(false);
    });
  });

  describe("with an exact-IP allowlist", () => {
    beforeEach(() => {
      vi.stubEnv("JUDGE_ALLOWED_IPS", "10.0.0.5, 192.168.1.10");
      resetIpAllowlistCache();
    });

    it("allows listed IPs", () => {
      expect(isJudgeIpAllowed(requestWithIp("10.0.0.5"))).toBe(true);
      expect(isJudgeIpAllowed(requestWithIp("192.168.1.10"))).toBe(true);
    });

    it("rejects unlisted IPs", () => {
      expect(isJudgeIpAllowed(requestWithIp("10.0.0.6"))).toBe(false);
      expect(isJudgeIpAllowed(requestWithIp("203.0.113.9"))).toBe(false);
    });
  });

  describe("with a CIDR allowlist", () => {
    beforeEach(() => {
      vi.stubEnv("JUDGE_ALLOWED_IPS", "192.168.1.0/24");
      resetIpAllowlistCache();
    });

    it("allows addresses inside the range", () => {
      expect(isJudgeIpAllowed(requestWithIp("192.168.1.1"))).toBe(true);
      expect(isJudgeIpAllowed(requestWithIp("192.168.1.254"))).toBe(true);
    });

    it("rejects addresses outside the range", () => {
      expect(isJudgeIpAllowed(requestWithIp("192.168.2.1"))).toBe(false);
      expect(isJudgeIpAllowed(requestWithIp("10.0.0.1"))).toBe(false);
    });
  });

  describe("when the client IP cannot be extracted", () => {
    beforeEach(() => {
      vi.stubEnv("JUDGE_ALLOWED_IPS", "10.0.0.5");
      resetIpAllowlistCache();
    });

    it("denies requests without a determinable IP (fail closed)", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isJudgeIpAllowed(requestWithIp(null))).toBe(false);
    });
  });
});
