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
  // Server-recorded: a submission was accepted while the candidate's in-browser
  // anti-cheat heartbeat was stale (possible submission from outside the
  // monitored session). The gate fails open to protect honest candidates, so
  // this flag is the reviewer's signal.
  submission_stale_heartbeat: "escalate",
};

export function getAntiCheatReviewTier(eventType: string): AntiCheatReviewTier {
  return EVENT_TIERS[eventType] ?? "context";
}
