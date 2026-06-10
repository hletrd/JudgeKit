# Code Reviewer — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c (main)
**Scope:** all 76 commits since 24939e42; line-level depth on the 30 commits
after 804c8db3 (post-multi-agent-review remediation + Jun-4/5 fixes).

## Inventory
Full diffstat enumerated (144 files / +16,161 −557 over the range); every
changed non-test source file read; tests consulted as behavior claims, then
validated against the implementation (not trusted).

## Findings

### CR1 — `worker_bump` double-counts a self-reclaimed stale submission (MEDIUM, confidence Medium-High)
`src/lib/judge/claim-query.ts:80-101`. The new `prev_worker_release` CTE
correctly releases the PREVIOUS worker's `active_tasks` slot on stale reclaim,
but is guarded by `c.previous_worker_id <> @workerId`. When the SAME worker
reclaims its own stale submission (concurrency > 1 worker that hung on one
task > staleClaimTimeout while still polling for new work), the release is
skipped while `worker_bump` (line 95-101) increments AGAIN:
original claim +1, self-reclaim +1, but `poll/route.ts:172` decrements exactly
once on finalization (the old-token finalize is rejected by the claim-token
fence without decrementing). Net: a **permanent +1 `active_tasks` leak on a
healthy worker**, silently reducing its effective concurrency by one. The
staleness sweep only zeroes counters of *silent* workers
(`worker-staleness-sweep.ts:60-69`), so a live worker never self-heals.
**Fix:** the exclusion cannot simply be dropped (Postgres forbids two modifying
CTEs updating the same row in one statement — only one write would win).
Fold the self-release into `worker_bump` instead:
`SET active_tasks = active_tasks + 1 - (SELECT COUNT(*) FROM candidate c WHERE
c.previous_worker_id = @workerId AND EXISTS (SELECT 1 FROM claimed))`.
Add a structural guard test in `tests/unit/judge/claim-query.test.ts`.

### CR2 — Claim route issues a separate per-claim SELECT for `scoringModel` (LOW, confidence High)
`src/app/api/v1/judge/claim/route.ts:323-337`. The IOI `runAllTestCases` flag is
derived via an extra `db.select` after the claim transaction. The remediation
plan (2026-06-03, C1 item) specified joining `assignments.scoring_model` into
the claim SELECT. One extra round-trip per claim; negligible against judging
cost but the claim path is the hottest judge-facing query. Acceptable deviation;
note for a future claim-SQL consolidation pass (clusters with the carried
"triple SELECT" deferred item F3/F4).

### CR3 — `isAiAssistantEnabled` lost its DB-failure fallback (LOW, confidence High)
`src/lib/system-settings.ts:218-228` (commit c8d06661). The old implementation
wrapped the settings query in try/catch and returned a mode-derived safe
default on DB error. The rewrite calls `getSystemSettings()` whose own catch
only covers the *missing-column fallback query*; if both queries throw (DB
outage blip), the exception now propagates to page rendering instead of
degrading to a default. Minor (DB-down usually means the page fails anyway),
but it is a behavior regression vs. the explicit old contract.
**Fix:** restore a try/catch returning
`!getPlatformModePolicy(DEFAULT_PLATFORM_MODE).restrictAiByDefault`-style safe
default.

### CR4 — Stable-number Map built from a full-catalog fetch (see perf-reviewer P1) (MEDIUM, cross-ref)
`src/app/(public)/problems/page.tsx:469-482`,
`src/app/(public)/practice/page.tsx:538-549`. Code-quality angle: the new
block duplicates the ordering expression (`asc(sequenceNumber), asc(createdAt)`)
in a 4th place and the duplicated query body (accessFilter/no-filter branches)
could be one query with a conditional `.where()`. Consolidate when fixing P1.

## Verified sound (no finding)
- `normalizeExamMode` coercion (2388302e): applied at BOTH init and reset paths.
- `CountdownTimer` `suppressHydrationWarning` (d280a45f): correctly scoped to
  the two time-text nodes, not the whole subtree.
- Tag dialogs (82059635) / group collapsible (ebdfaafb): interactive content no
  longer nested inside `<button>`; semantics preserved.
- `recordAuditEventDurable`: single `buildAuditRow` shared with the buffered
  path — no row-shape drift possible.
- `sweepStaleWorkers`: status-filtered WHEREs make the log-once claim true;
  `setInterval(...).unref()` + idempotent start guard correct.
- Draft hook (`use-server-source-draft.ts`): hydration/autosave invariants are
  real — refs prevent stale-closure clobbering; worst case is "no recovery".
  Edge: a change typed BEFORE hydration completes and never followed by another
  change is not autosaved (ref-gated effect) — acceptable, localStorage covers it.

## Final sweep
Looked specifically for: shared-state hazards in new module-level timers (sweep
timer is per-process and unref'd — OK), error handling in new routes (draft
route returns proper 403/validation responses via createApiHandler), magic
numbers (AUTOSAVE_DEBOUNCE_MS, MAX_SOURCE_BYTES documented), naming/layering
violations (worker-staleness vs -sweep split is clean: pure vs DB). No
additional findings.
