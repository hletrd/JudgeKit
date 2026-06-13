# Verifier — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. **Method:** evidence-based check of stated behavior (docs, comments, plan completion claims, registers) against the code at this exact HEAD.

## Claims verified TRUE at this HEAD
- **V6-1** `docs/exam-integrity-model.md` claim "flags are recorded only for accepted submissions and carry the submission id" — matches `submissions/route.ts:396-425` (insert after tx success, details include `submissionId`, `ipAddress`, DB-time `createdAt`) and the probe-only validator (`submissions.ts:375-403`). Cycle-5 G1 completion claim is truthful.
- **V6-2** Cycle-5 plan completion records (G1–G5 ✅ with SHAs) — all five SHAs exist on main with the described content (spot-checked diffs of 16f64ab2, 0083a577, 1e6457b6, 34a6a9c1).
- **V6-3** Baseline gate claims — re-executed this cycle: tsc 0, eslint 0/0, lint:bash clean, unit 2632/2632 PASS. Matches the cycle-5 completion record's shape (2632 tests).
- **V6-4** `includeGaps=1` gating claim — confirmed: without the param the route never runs the 5000-row scan (`anti-cheat/route.ts:292`); the timeline is the only `includeGaps` consumer (repo-wide grep: 1 call site).
- **V6-5** AGG4-5 disposition claim ("count(*) retained for pagination total") — confirmed at `:280-283`; still fed to the response `total`.

## Claims verified FALSE / STALE (action required)
- **V6-6 (MEDIUM-doc, High, CONFIRMED)** `plans/open/user-injected/pending-next-cycle.md` lists item #1 (workspace migration Phase 2) as ONGOING/High and item #3 (COMPILER_RUNNER_URL auto-injection) as pending. Both are complete in-repo: the migration plan was archived 2026-04-29 with "ALL PHASES COMPLETE" (`plans/archive/2026-04-29-archived-workspace-to-public-migration.md`), and `deploy-docker.sh:657` auto-injects `COMPILER_RUNNER_URL` via `ensure_env_literal` on the `INCLUDE_WORKER=false` path (with a drift warning at `:663-666`). A stale High-priority register risks a future cycle re-doing finished work. Update the register with evidence (move resolved items to `plans/done/user-injected/` per existing convention).
- **V6-7 (LOW-doc, High, CONFIRMED)** `anti-cheat/route.ts:192-195` comment claims the POST keeps `canManageContest` — the POST's actual gates are enrollment/token + origin pinning (`:80-90`, `:54-78`). Comment must be corrected (CR6-5).
- **V6-8 (LOW, High, CONFIRMED)** `messages/en.json:2313` (`similarityServiceUnavailable`) describes a scan-skip state the engine can no longer produce (CR6-2). The string is a behavior claim shown to operators; it is now false by construction.

## Cross-checks with no discrepancy
- `SECURITY.md` heartbeat-gate fail-open statement vs `submissions/route.ts:396-403` — consistent.
- `EVENT_TIERS` ↔ `EVENT_TYPE_COLORS` ↔ both locale catalogs: every tier key has a color and an `eventTypes.*` message in en+ko (the catalog-coverage pin at `tests/unit/infra/source-grep-inventory.test.ts` enforces it; baseline 140 matches actual).
- `MAX_PENDING_EVENTS=200` doc comment matches enforcement (`anti-cheat-storage.ts:53`).

## Verdict
Cycle-5's work is honestly recorded. The two stale-register/comment items (V6-6, V6-7) and the false operator-facing string (V6-8) are the verification debt of this cycle.
