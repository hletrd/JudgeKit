/**
 * localStorage helpers for the anti-cheat pending-events queue.
 *
 * Extracted from `anti-cheat-monitor.tsx` so the helpers are unit-testable
 * without rendering the full component (which requires React + jsdom +
 * next-intl provider context).
 *
 * The queue stores events that failed to POST to the server; each event is
 * retried up to MAX_RETRIES times before being dropped.
 */

const STORAGE_KEY = "judgekit_anticheat_pending";

/**
 * Upper bound on the number of pending events returned from localStorage.
 *
 * localStorage is shared with extensions and other tabs/origins that may write
 * arbitrary data. Capping the returned array prevents pathological cases where
 * a malicious extension or browser quirk writes a multi-megabyte array,
 * causing every flush iteration to re-parse and re-save a huge JSON blob.
 *
 * 200 is well above the realistic upper bound for a single exam session
 * (heartbeats every 30s + a few user-action events), but small enough to keep
 * load/save costs negligible even if the cap is reached.
 */
export const MAX_PENDING_EVENTS = 200;

export interface PendingEvent {
  eventType: string;
  details?: string;
  timestamp: number;
  retries: number;
}

export function isValidPendingEvent(entry: unknown): entry is PendingEvent {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.eventType === "string" &&
    typeof e.retries === "number" &&
    typeof e.timestamp === "number"
  );
}

export function loadPendingEvents(assignmentId: string): PendingEvent[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${assignmentId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Cap the length to MAX_PENDING_EVENTS to bound trust in localStorage.
    // See module-level doc on MAX_PENDING_EVENTS for rationale.
    return parsed.filter(isValidPendingEvent).slice(0, MAX_PENDING_EVENTS);
  } catch {
    return [];
  }
}

export function savePendingEvents(assignmentId: string, events: PendingEvent[]): void {
  try {
    if (events.length === 0) {
      localStorage.removeItem(`${STORAGE_KEY}_${assignmentId}`);
    } else {
      localStorage.setItem(`${STORAGE_KEY}_${assignmentId}`, JSON.stringify(events));
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Single-occupancy crash-recovery slot for the event currently being sent by
 * the flush claim loop (RPF cycle-5 AGG5-4).
 *
 * The claim loop removes an event from the pending queue BEFORE awaiting the
 * send; a hard navigation/tab close in that window would otherwise drop the
 * event from both memory and storage. The loop writes the claimed event here
 * synchronously before the send and clears the slot once the result is
 * handled; the next flush re-queues a leftover slot at the head. A bounded
 * duplicate (the server throttles heartbeats; otherwise one extra evidence
 * row) beats silent evidence loss. One slot suffices: the flush loop is
 * single-flight and sends one event at a time.
 */
const INFLIGHT_KEY = "judgekit_anticheat_inflight";

export function loadInflightEvent(assignmentId: string): PendingEvent | null {
  try {
    const raw = localStorage.getItem(`${INFLIGHT_KEY}_${assignmentId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidPendingEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveInflightEvent(assignmentId: string, event: PendingEvent): void {
  try {
    localStorage.setItem(`${INFLIGHT_KEY}_${assignmentId}`, JSON.stringify(event));
  } catch {
    // localStorage unavailable
  }
}

export function clearInflightEvent(assignmentId: string): void {
  try {
    localStorage.removeItem(`${INFLIGHT_KEY}_${assignmentId}`);
  } catch {
    // localStorage unavailable
  }
}
