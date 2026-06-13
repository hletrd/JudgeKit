# Perf Reviewer — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Focus:** event-loop hazards, query shapes on hot paths, polling costs, client responsiveness on the cycle-5 surface and the submit/judge hot paths.

## Findings

### P6-1 — TS similarity fallback: the normalization/n-gram build phase neither yields nor honors the abort signal (LOW, Medium, RISK → DEFER with exit criterion)
`runSimilarityCheckTS` (`code-similarity.ts:266-275`) normalizes and n-grams all rows in a tight synchronous loop before the yielding comparison phase. Bounded by the 500-row cap and the 10k string-literal cap, but ~500 large sources can still hold the event loop for a noticeable burst on the app server (this fallback runs in-process, fired from a staff route during a live contest). The comparison loop already yields every 8 ms and checks the signal; the build loop does neither. Recommendation if/when touched: move the per-row normalize into the same time-sliced loop. Not worth a dedicated change while the Rust sidecar is the default engine — recommend recording as a deferred item with an incident-based exit criterion.

### P6-2 — Timeline `loadMore` carries no AbortController and no staleness guard (LOW, Medium, LIKELY)
`participant-anti-cheat-timeline.tsx:126-144`: the 30 s visibility poll resets `events` to the fresh first page and `offset` to its length, while an in-flight `loadMore` (old offset) appends afterwards → duplicate rows (duplicate React keys; wasted re-render of the whole table). The dashboard solved the same interaction with first-page reconciliation + offset preservation (`anti-cheat-dashboard.tsx:120-148`). Cheapest correct fix for the timeline's reset-on-poll semantics: a fetch-sequence counter — drop the `loadMore` response if a poll reset completed after it started (also dedupe by id defensively).

## Verified-acceptable (no action)
- **Gap scan cost is now opt-in and consumed** (`anti-cheat/route.ts:292`): dashboard polls skip it; the timeline pays for what it renders. The extra `getDbNowUncached()` round trip (`:339`) only fires on the opt-in path with ≥1 heartbeat — negligible.
- **Submit hot path:** validator keeps the single parallel pair (enrollment+session), one probe query gated on exam-mode+anti-cheat, problem-mismatch check after; the post-accept flag insert is one fail-open INSERT. No N+1.
- **Offset listing `count(*) over()`** single-query total remains the right call; the GROUP BY summary only runs when `includeSummary=1`.
- **Heartbeat LRU** (10k entries, 120 s TTL) and the shared-coordination path remain O(1) per ingest.
- **`getAssignmentStatusRows`** pushes aggregation into one window-function query + one overrides query — O(students × problems) assembly in memory, as designed.
- **Monitor client:** single-flight flush, capped queue (200), exponential backoff capped at 8 s effective — no busy-retry behavior. The proposed queue-first `reportEvent` (AGG6-2) adds at most one localStorage write per event; negligible.

## Final sweep
No new unindexed predicates introduced this cycle (`ace_assignment_user_idx` covers the probe and gap scans; `cat_assignment_user_idx` covers token lookups). No client component re-render hazards beyond P6-2 (memoization on filters/types intact in both anti-cheat views).
