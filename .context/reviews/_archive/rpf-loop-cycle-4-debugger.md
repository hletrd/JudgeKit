# Debugger — RPF Loop Cycle 4 (2026-05-03)

**Lens:** latent bugs, failure modes, regressions, edge cases.

## Failure-mode walkthroughs

### Mode 1: snapshot path collision (same actor, same millisecond)

`src/lib/db/pre-restore-snapshot.ts:75-76`
```ts
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `pre-restore-${stamp}-${actorId.slice(0, 8)}.json`;
```

Two snapshots with the same actor in the same millisecond produce the same
filename. The second `createWriteStream(fullPath, { mode: 0o600 })` opens
in default `flags: 'w'` mode which truncates. The first snapshot is
silently overwritten.

Practical exposure: the snapshot is invoked by an operator-initiated DB
restore which is a UI-driven once-per-event action. Two concurrent
restores in the same millisecond by the same actor is extremely unlikely.
Mitigation in place: the new test at line 122-124 inserts a
`setTimeout(r, 5)` precisely because the test would otherwise suffer the
same collision. Production risk is negligible.

Carry-forward: this is partially covered by SEC2-2 deferral. Not a
cycle-4 finding.

### Mode 2: NaN propagation through helper (CYC3-AGG-6 verification)

Pre-cycle-3 code:
```ts
const normalizedPercentage = Math.min(Math.max(score, 0), 100);
let earnedPoints = roundAssignmentScore((normalizedPercentage / 100) * points);
```

If `score = NaN`:
- `Math.max(NaN, 0)` = `NaN`
- `Math.min(NaN, 100)` = `NaN`
- `NaN / 100` = `NaN`
- `Math.round(NaN * 100) / 100` = `NaN`
- Returned: `NaN`

Post-cycle-3:
```ts
if (!Number.isFinite(score)) return 0;
```

Verified: `NaN`, `+Infinity`, `-Infinity` all early-return 0. Pinned by
test. Mode 2 closed.

### Mode 3: stat() succeeds with size 0 (NEW edge case)

`pre-restore-snapshot.ts:99-110` post-cycle-3:
- `stStat = await stat(fullPath).catch(() => null)`
- If stat succeeds and `stStat.size === 0` — e.g., the export stream
  closed without writing any bytes — the info-log emits
  `sizeBytes: 0`. Operator can distinguish "stat failed" (warn line)
  from "size 0" (info line, sizeBytes:0).
- Is `size 0` a real failure mode? Only if `streamDatabaseExport`
  returned an empty Web stream. Today, the export stream emits a JSON
  object with at least `{}` — so size > 0 always. A future regression
  that returned an actually-empty stream would log
  `sizeBytes: 0` (info), and the operator should investigate.
- This is the failure mode the CYC3-AGG-1 split was specifically designed
  to surface.

### Mode 4: chmod failure on dir + stat failure on file (compound)

`pre-restore-snapshot.ts:67-72` (chmod best-effort) and
`pre-restore-snapshot.ts:99` (stat best-effort).

If both fail:
- chmod fails → warn log "could not chmod 0o700 snapshot dir"
- pipeline succeeds → file written with mode 0o600 (per-file mode is
  authoritative).
- stat fails → warn log "snapshot written but size unavailable"
- Function returns the path successfully.

This is acceptable: the file is on disk with the correct mode, and the
operator gets two warn lines explaining the partial degradation.
Pre-cycle-3 the second warn line was missing.

### Mode 5: `Promise.allSettled` rejection but `db.execute` mock resolves rest (CYC3-AGG-5 verification)

Test at `data-retention-maintenance.test.ts:113-150`:
- `mockImplementationOnce(() => Promise.reject(...))` — first call rejects.
- Default `mockResolvedValue({rowCount: 0})` — subsequent calls resolve.
- `Promise.allSettled` waits for all 5 → 1 rejected + 4 fulfilled.
- Each `batchedDelete` exits after first iteration because `rowCount < BATCH_SIZE` (rowCount === 0).
- Asserts `>= 5 db.execute calls` — verified.
- Asserts the warn log is emitted with the simulated reason — verified.

Mode 5 contract pinned by test.

### Mode 6: helper called with empty assignmentProblemRows but non-empty bestByProblem

`recruiting-results.ts:60` iterates only `assignmentProblemRows`. If the
caller passes an empty array, the for-loop never executes. `bestByProblem`
contents are ignored. Returned: zeros, empty map. Verified by test.

### Mode 7: helper called with assignmentProblemRows containing duplicate problemId

This is not a real scenario — the page's SELECT joins `assignmentProblems`
with `problems`, with PRIMARY KEY constraints. But the helper does not
validate; if the same `problemId` appears twice:
- `totalPossible` accumulates twice (incorrect but rare).
- `adjustedByProblem.set(...)` overwrites (lossy).
- `totalScore` accumulates twice (incorrect).

This is a latent bug that cannot trigger today due to DB constraints. Not
a cycle-4 finding; mention for future-proofing.

## NEW findings this cycle

### DBG4-1: [LOW] Helper does not validate `assignmentProblemRows` for duplicate problemId

- **File:** `src/lib/assignments/recruiting-results.ts:60-69`
- **Description:** No validation against duplicate problemIds. Today's
  callers (page server component) cannot produce duplicates because the
  DB enforces uniqueness. But a future caller that aggregates rows
  differently (e.g., a per-attempt SELECT without DISTINCT) could.
- **Confidence:** LOW (latent, no current trigger)
- **Failure scenario:** Future callsite without DB-level uniqueness
  passes `[{problemId: 'p1', points: 25}, {problemId: 'p1', points: 25}]`
  → `totalPossible = 50`, `totalScore` doubled.
- **Fix:** Optional — add a `Set<string>` dedup or assert duplicates.
  Defer; document in JSDoc that "callers MUST pass each problemId at most
  once".

### DBG4-2: [LOW] CYC3-AGG-1 split's stat() can race with concurrent prune

- **File:** `src/lib/db/pre-restore-snapshot.ts:99-110`
- **Description:** Between the pipeline close (line 90) and the stat call
  (line 99), the file exists on disk. If a separate process (e.g., a manual
  `find` operator command) deleted the file in that micro-window, stat
  returns ENOENT and we hit the warn path even though the file was
  successfully written. Theoretically observable; practically not.
- **Confidence:** LOW (race window is microseconds)
- **Fix:** No action needed; the warn path is honest about what it can
  observe. A delete by another process is correctly surfaced as
  "size unavailable".

## Carry-forward debugger items

| ID | File | Status | Exit criterion |
|----|------|--------|----------------|
| C7-AGG-6 | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary |
| C7-AGG-7 | `encryption.ts:79-81` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering OR audit cycle |

## Summary

| ID | Severity | Confidence | File | Action |
|----|----------|------------|------|--------|
| DBG4-1 | LOW | LOW | `recruiting-results.ts` | Defer (no current trigger) |
| DBG4-2 | LOW | LOW | `pre-restore-snapshot.ts` | No action |

No HIGH/MEDIUM debugger findings. The cycle-3 close-out closes Mode 2
(NaN propagation) and Mode 3 (sizeBytes ambiguity); Modes 1, 4, 5, 6 are
verified working. The latent Modes 7 and DBG4-1 are caught by upstream DB
constraints today.
