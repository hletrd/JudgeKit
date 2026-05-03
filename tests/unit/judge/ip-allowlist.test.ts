import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isJudgeIpAllowed, ipMatchesAllowlistEntry, resetIpAllowlistCache } from "@/lib/judge/ip-allowlist";

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

    // TODO: Restore fail-closed behavior once JUDGE_ALLOWED_IPS is configured
    // in production. The function currently allows all IPs when no allowlist
    // is set (temporary change for judge worker access — see ff80dc23).
    it("allows every request in production when no allowlist is set (temporary fail-open)", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isJudgeIpAllowed(requestWithIp("127.0.0.1"))).toBe(true);
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

  describe("enforcement on judge routes", () => {
    it("every judge route imports and calls isJudgeIpAllowed", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const judgeRoutes = [
        "src/app/api/v1/judge/claim/route.ts",
        "src/app/api/v1/judge/register/route.ts",
        "src/app/api/v1/judge/deregister/route.ts",
        "src/app/api/v1/judge/heartbeat/route.ts",
        "src/app/api/v1/judge/poll/route.ts",
      ];

      for (const relPath of judgeRoutes) {
        const source = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
        expect(source, `${relPath} should import isJudgeIpAllowed`).toContain("isJudgeIpAllowed");
        expect(source, `${relPath} should call isJudgeIpAllowed`).toMatch(/isJudgeIpAllowed\s*\(/);
        expect(source, `${relPath} should deny when IP is not allowed`).toMatch(
          /if\s*\(\s*!isJudgeIpAllowed/
        );
      }
    });

    it("denies a non-allowed IP from judge claim route", () => {
      vi.stubEnv("JUDGE_ALLOWED_IPS", "10.0.0.5");
      resetIpAllowlistCache();

      const request = new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.99" },
      });

      expect(isJudgeIpAllowed(request)).toBe(false);
    });

    it("allows a listed IP on judge claim route", () => {
      vi.stubEnv("JUDGE_ALLOWED_IPS", "10.0.0.5");
      resetIpAllowlistCache();

      const request = new NextRequest("http://localhost:3000/api/v1/judge/claim", {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.5" },
      });

      expect(isJudgeIpAllowed(request)).toBe(true);
    });
  });
});

describe("ipMatchesAllowlistEntry (low-level CIDR matching)", () => {
  it("matches exact IPv4 addresses", () => {
    expect(ipMatchesAllowlistEntry("192.168.1.10", "192.168.1.10")).toBe(true);
    expect(ipMatchesAllowlistEntry("192.168.1.10", "192.168.1.11")).toBe(false);
  });

  it("matches /16 CIDR ranges", () => {
    expect(ipMatchesAllowlistEntry("192.168.100.50", "192.168.0.0/16")).toBe(true);
    expect(ipMatchesAllowlistEntry("192.169.1.1", "192.168.0.0/16")).toBe(false);
  });

  it("matches /32 CIDR (single host)", () => {
    expect(ipMatchesAllowlistEntry("10.0.0.1", "10.0.0.1/32")).toBe(true);
    expect(ipMatchesAllowlistEntry("10.0.0.2", "10.0.0.1/32")).toBe(false);
  });

  it("matches /0 CIDR (match all)", () => {
    expect(ipMatchesAllowlistEntry("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(ipMatchesAllowlistEntry("255.255.255.255", "0.0.0.0/0")).toBe(true);
  });

  it("rejects invalid CIDR prefixes", () => {
    expect(ipMatchesAllowlistEntry("192.168.1.1", "192.168.1.0/33")).toBe(false);
    expect(ipMatchesAllowlistEntry("192.168.1.1", "192.168.1.0/abc")).toBe(false);
    expect(ipMatchesAllowlistEntry("192.168.1.1", "192.168.1.0/-1")).toBe(false);
  });

  it("rejects non-4-part IPs in CIDR matching", () => {
    expect(ipMatchesAllowlistEntry("2001:db8::1", "192.168.1.0/24")).toBe(false);
    expect(ipMatchesAllowlistEntry("192.168.1.1", "2001:db8::/64")).toBe(false);
  });

  it("matches IPv6 exact addresses and IPv6 CIDR ranges", () => {
    // Exact-match cases (the historical behaviour).
    expect(ipMatchesAllowlistEntry("::1", "::1")).toBe(true);
    expect(ipMatchesAllowlistEntry("2001:db8::1", "2001:db8::1")).toBe(true);

    // IPv6 CIDR is now supported — see commit 12417fa9 and
    // ipv6ToBytes/bytesEqualUnderPrefix in src/lib/judge/ip-allowlist.ts.
    expect(ipMatchesAllowlistEntry("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipMatchesAllowlistEntry("2001:db8:0:1::5", "2001:db8::/32")).toBe(true);
    // /128 host route — only the exact address matches.
    expect(ipMatchesAllowlistEntry("::1", "::1/128")).toBe(true);
    expect(ipMatchesAllowlistEntry("::2", "::1/128")).toBe(false);
    // Outside the prefix.
    expect(ipMatchesAllowlistEntry("2001:db9::1", "2001:db8::/32")).toBe(false);
    // Mixed-family rejection (IPv4 client vs IPv6 CIDR and vice versa)
    // already covered in the preceding "rejects non-4-part" test.
  });

  it("returns false for non-matching entry types", () => {
    expect(ipMatchesAllowlistEntry("192.168.1.1", "10.0.0.1")).toBe(false);
  });
});
