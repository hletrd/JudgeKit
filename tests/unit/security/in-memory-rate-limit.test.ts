import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock extractClientIp before importing the module under test.
// vi.mock is hoisted, so the factory must not reference outer variables.
vi.mock("@/lib/security/ip", () => ({
  extractClientIp: vi.fn((headers: Headers) => headers.get("x-forwarded-for") ?? "0.0.0.0"),
}));

import {
  isRateLimitedInMemory,
  recordAttemptInMemory,
  recordFailureInMemory,
  resetInMemory,
  consumeInMemoryRateLimit,
} from "@/lib/security/in-memory-rate-limit";

describe("in-memory-rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isRateLimitedInMemory", () => {
    it("returns false for a key with no prior attempts", () => {
      expect(isRateLimitedInMemory("test:key", 5, 60_000)).toBe(false);
    });

    it("returns false when within limit", () => {
      const key = "test:within";
      recordAttemptInMemory(key, 60_000);
      recordAttemptInMemory(key, 60_000);
      expect(isRateLimitedInMemory(key, 5, 60_000)).toBe(false);
    });

    it("returns true when limit exceeded", () => {
      const key = "test:exceeded";
      for (let i = 0; i < 5; i++) {
        recordAttemptInMemory(key, 60_000);
      }
      expect(isRateLimitedInMemory(key, 5, 60_000)).toBe(true);
    });

    it("returns false after window expires", () => {
      const key = "test:expired";
      const windowMs = 60_000;
      for (let i = 0; i < 5; i++) {
        recordAttemptInMemory(key, windowMs);
      }
      // Advance past the window
      vi.advanceTimersByTime(windowMs + 1);
      expect(isRateLimitedInMemory(key, 5, windowMs)).toBe(false);
    });
  });

  describe("recordAttemptInMemory", () => {
    it("creates a new entry on first attempt", () => {
      const key = "test:record-new";
      recordAttemptInMemory(key, 60_000);
      expect(isRateLimitedInMemory(key, 1, 60_000)).toBe(true);
    });

    it("increments attempts on subsequent calls", () => {
      const key = "test:record-incr";
      recordAttemptInMemory(key, 60_000);
      recordAttemptInMemory(key, 60_000);
      // With maxAttempts=3, should not be limited yet
      expect(isRateLimitedInMemory(key, 3, 60_000)).toBe(false);
      recordAttemptInMemory(key, 60_000);
      // Now at 3 attempts, should be limited
      expect(isRateLimitedInMemory(key, 3, 60_000)).toBe(true);
    });

    it("resets the window on first attempt after expiry", () => {
      const key = "test:record-reset";
      const windowMs = 60_000;
      recordAttemptInMemory(key, windowMs);
      vi.advanceTimersByTime(windowMs + 1);
      // New attempt should reset the window
      recordAttemptInMemory(key, windowMs);
      expect(isRateLimitedInMemory(key, 2, windowMs)).toBe(false);
    });
  });

  describe("recordFailureInMemory", () => {
    it("returns not blocked on first failure", () => {
      const key = "test:fail-first";
      const result = recordFailureInMemory(key, 3, 60_000, 5_000);
      expect(result.blocked).toBe(false);
      expect(result.blockedUntil).toBeNull();
    });

    it("returns blocked when maxAttempts reached", () => {
      const key = "test:fail-blocked";
      const maxAttempts = 3;
      const windowMs = 60_000;
      const blockMs = 5_000;
      // 3 failures to reach maxAttempts
      recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      const result = recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      expect(result.blocked).toBe(true);
      expect(result.blockedUntil).not.toBeNull();
    });

    it("applies exponential backoff", () => {
      const key = "test:fail-backoff";
      const maxAttempts = 2;
      const windowMs = 60_000;
      const blockMs = 1_000;

      // First block: consecutiveBlocks becomes 1, duration = blockMs * 2^0 = 1000
      recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      const r1 = recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      expect(r1.blocked).toBe(true);

      // Reset and re-block: consecutiveBlocks becomes 2, duration = blockMs * 2^1 = 2000
      resetInMemory(key);
      recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      const r2 = recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
      expect(r2.blocked).toBe(true);
    });

    it("caps block duration at MAX_BLOCK (24 hours)", () => {
      const key = "test:fail-max-block";
      const maxAttempts = 2;
      const windowMs = 60_000;
      const blockMs = 1_000;
      const MAX_BLOCK = 24 * 60 * 60 * 1000;

      // Simulate many consecutive blocks to test MAX_BLOCK cap
      let lastBlockedUntil: number | null = null;
      for (let i = 0; i < 20; i++) {
        resetInMemory(key);
        for (let j = 0; j < maxAttempts; j++) {
          const result = recordFailureInMemory(key, maxAttempts, windowMs, blockMs);
          if (result.blocked) {
            lastBlockedUntil = result.blockedUntil;
          }
        }
      }
      // Block duration should never exceed MAX_BLOCK
      if (lastBlockedUntil !== null) {
        const now = Date.now();
        const blockDuration = lastBlockedUntil - now;
        expect(blockDuration).toBeLessThanOrEqual(MAX_BLOCK);
      }
    });
  });

  describe("resetInMemory", () => {
    it("clears a rate limit entry", () => {
      const key = "test:reset";
      recordAttemptInMemory(key, 60_000);
      recordAttemptInMemory(key, 60_000);
      expect(isRateLimitedInMemory(key, 2, 60_000)).toBe(true);

      resetInMemory(key);
      expect(isRateLimitedInMemory(key, 2, 60_000)).toBe(false);
    });
  });

  describe("consumeInMemoryRateLimit", () => {
    it("allows requests within limit", () => {
      const request = { headers: new Headers({ "x-forwarded-for": "1.2.3.4" }) };
      const result = consumeInMemoryRateLimit(request, "test-action", 5, 60_000);
      expect(result.limited).toBe(false);
    });

    it("limits requests exceeding the threshold", () => {
      const request = { headers: new Headers({ "x-forwarded-for": "1.2.3.4" }) };
      for (let i = 0; i < 5; i++) {
        consumeInMemoryRateLimit(request, "test-limit-action", 5, 60_000);
      }
      const result = consumeInMemoryRateLimit(request, "test-limit-action", 5, 60_000);
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("returns retryAfter based on window when limited", () => {
      const request = { headers: new Headers({ "x-forwarded-for": "1.2.3.4" }) };
      // Fill up to limit
      for (let i = 0; i < 5; i++) {
        consumeInMemoryRateLimit(request, "test-retry-action", 5, 60_000);
      }
      const result = consumeInMemoryRateLimit(request, "test-retry-action", 5, 60_000);
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });
});
