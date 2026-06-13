# Perf Reviewer — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Baseline green.

## Findings
No NEW performance regression found. The three CR9 listing routes
(code-snapshots, recruiting-invitations, accepted-solutions) gain a unique-id
tiebreak; adding `id` to the ORDER BY is index-friendly (`id` is the PK / the
table already returns `id` in the projection) and does not change the query plan
class — the keyset still leads with the existing `created_at`/`submittedAt`
column. No added scan cost.

## Carried perf register (exit criteria re-checked)
- **P6-1** — TS similarity fallback normalize/n-gram grouping phase
  (`code-similarity.ts:266-275`) neither time-slices nor honors the abort signal.
  LOW/Medium (RISK). Bounded by 500-row + 10k-literal caps; Rust sidecar is the
  default engine; fallback is staff-triggered and rare. `runSimilarityCheckTS`
  NOT edited this cycle. **Exit:** any edit to `runSimilarityCheckTS`, or an
  incident implicating app-server event-loop stalls during a fallback run.
  Carried.
- **AGG8-2** — heartbeat-gap scan `limit(5000)` (`anti-cheat/route.ts:316-325`):
  bounded scan, unchanged. Carried (correctness/determinism item, tracked in
  debugger/code-reviewer registers).

The Promise.all fan-outs in submissions.ts / contest-analytics.ts /
participant-timeline.ts / dashboard-data.ts read as independent reads with no
shared-mutable-state hazard — no change recommended.
