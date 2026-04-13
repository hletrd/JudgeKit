export type AntiCheatReviewTier = "context" | "signal" | "escalate";

const EVENT_TIERS: Record<string, AntiCheatReviewTier> = {
  heartbeat: "context",
  blur: "signal",
  contextmenu: "signal",
  copy: "signal",
  paste: "signal",
  tab_switch: "signal",
  ip_change: "escalate",
  code_similarity: "escalate",
};

export function getAntiCheatReviewTier(eventType: string): AntiCheatReviewTier {
  return EVENT_TIERS[eventType] ?? "signal";
}
