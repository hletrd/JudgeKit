import { describe, expect, it } from "vitest";
import { getAntiCheatReviewTier } from "@/lib/anti-cheat/review-model";

describe("getAntiCheatReviewTier", () => {
  it("classifies ambient heartbeat events as context", () => {
    expect(getAntiCheatReviewTier("heartbeat")).toBe("context");
  });

  it("classifies browser-behavior events as signal", () => {
    expect(getAntiCheatReviewTier("copy")).toBe("signal");
    expect(getAntiCheatReviewTier("tab_switch")).toBe("signal");
  });

  it("classifies stronger anomalies as escalate", () => {
    expect(getAntiCheatReviewTier("ip_change")).toBe("escalate");
    expect(getAntiCheatReviewTier("code_similarity")).toBe("escalate");
  });
});
