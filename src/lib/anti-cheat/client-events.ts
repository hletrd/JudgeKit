/**
 * Canonical vocabulary of CLIENT-emitted anti-cheat event types — exactly the
 * events the in-browser monitor (`src/components/exam/anti-cheat-monitor.tsx`)
 * may POST to `/api/v1/contests/[assignmentId]/anti-cheat`.
 *
 * Lives in lib rather than the route module (RPF cycle-4 AGG4-7): route files
 * are leaves in the Next.js layering, so lib code could not consume the list
 * without importing a route. The submission validator's heartbeat-freshness
 * probe filters on this list so SERVER-inserted rows in the same table
 * (`submission_stale_heartbeat` — submission validator; `code_similarity` —
 * similarity engine; see `src/lib/anti-cheat/review-model.ts`) never count as
 * browser liveness (RPF cycle-4 AGG4-2: a flag row must not suppress the next
 * flag, and a similarity hit is not a heartbeat).
 *
 * The anti-cheat POST route's zod schema is derived from this list, which is
 * what stops contestants from forging server-originated event classes.
 */
export const CLIENT_EVENT_TYPES = [
  "tab_switch",
  "copy",
  "paste",
  "blur",
  "contextmenu",
  "heartbeat",
] as const;

export type ClientAntiCheatEventType = (typeof CLIENT_EVENT_TYPES)[number];
