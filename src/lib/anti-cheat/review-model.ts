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
  // Server-recorded by the submit route ONLY, and only AFTER the submission
  // insert succeeds (RPF cycle-4 AGG4-1 → cycle-5 AGG5-1): a submission was
  // ACCEPTED while the candidate's in-browser anti-cheat heartbeat was stale
  // (possible submission from outside the monitored session). The flag's
  // details carry the accepted submission's id and the row stores the
  // submitting IP. Page renders, autosave snapshots, and REJECTED submit
  // attempts (rate-limited, mismatched, expired) never record it. The gate
  // fails open to protect honest candidates, so this flag is the reviewer's
  // signal.
  submission_stale_heartbeat: "escalate",
};

export function getAntiCheatReviewTier(eventType: string): AntiCheatReviewTier {
  return EVENT_TIERS[eventType] ?? "context";
}
