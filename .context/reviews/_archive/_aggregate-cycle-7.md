# Aggregate Review — RPF Cycle 7/100

**Date:** 2026-04-26
**Cycle:** 7/100 of review-plan-fix loop
**Reviewers:** architect, code-reviewer, critic, debugger, designer, document-specialist, perf-reviewer, security-reviewer, test-engineer, tracer, verifier (11 lanes — designer covered as web frontend exists; no live runtime per cycle-3 sandbox limitation)
**Total findings (cycle 7 NEW):** 0 HIGH, 0 MEDIUM, ~50 LOW (with significant cross-agent overlap; deduplicated below)
**Cross-agent agreement:** STRONG. All cycle-6 plan tasks verified resolved across all 11 lanes. No new HIGH or MEDIUM findings emerged.

---

## Cross-Agent Convergence Map

| Topic | Agents flagging | Severity peak |
|-------|-----------------|---------------|
| Step 5b backfill is forever-load-bearing without sunset criterion | CRIT7-1, PERF7-1 | LOW (2-agent) |
| AGENTS.md "DRIZZLE_PUSH_FORCE" section lacks sunset criterion | CRIT7-2 | LOW |
| `tags.updated_at` nullable inconsistency (carried from AGG6-3) | ARCH7-2 | LOW (re-flagged) |
| `_lastRefreshFailureAt` Map indirect bound (carried from AGG6-9) | PERF7-3 | LOW |
| `__test_internals.cacheDelete` ambiguous test API name | CR7-3 | LOW |
| `__test_internals.setCooldown.valueMs` ambiguous param name (carried from CR6-1) | CR7-1 (refactor angle) | LOW (carried) |
| `analyticsCache.dispose` invariant lives only in catch-block comment | ARCH7-3, CR7-1 | LOW (2-agent) |
| `analyticsCache.set` then `_lastRefreshFailureAt.delete` redundancy on overwrite | DBG7-3, TE7-2, TE7-5 | LOW (3-agent) |
| `performFlush` sequential await intentional but undocumented | CR7-2, PERF7-4 | LOW (2-agent) |
| NETWORK_NAME detection uses bare `judgekit` regex (multi-project hosts) | DBG7-2, VER7-1 | LOW (2-agent) |
| Step 5b heredoc multi-layer escaping fragile (works but undocumented) | DBG7-1 | LOW |
| `getAuthSessionCookieName` vs `getAuthSessionCookieNames` API confusion | ARCH7-4 | LOW |
| `bytesToBase64` and `bytesToHex` inconsistent iteration style | CR7-4 | LOW |
| `clearAuthSessionCookies` cookie-clear semantics undocumented | CR7-5, SEC7-4 | LOW (2-agent) |
| `PGPASSWORD` exposed in `docker inspect` for ~5-10s | SEC7-1 | LOW |
| psql connection without sslmode (internal docker network) | SEC7-2 | LOW |
| `suspicious_ua_mismatch` audit events without rate-limiting | SEC7-3 | LOW (carried defense-in-depth) |
| Privacy notice no decline path (carried from DES6-1/DES3-1) | DES7-1 | LOW (carried-deferred) |
| Privacy notice WCAG AA contrast (text-muted-foreground) | DES7-2 | LOW |
| Privacy notice escape handler implicit | DES7-3 | LOW |
| Heartbeat interval not configurable | DES7-4 | LOW |
| Cycle-6 plan needs to be archived to `plans/done/` | CRIT7-4 | LOW (housekeeping — actionable) |
| AGENTS.md missing cross-references to source plans/aggregates | DOC7-1 | LOW |
| `.env.example` cross-reference is section-name (string-search) | DOC7-2 | LOW |
| `0021_lethal_black_tom.sql` filename auto-generated (carried) | DOC7-3 | LOW (carried from CR6-3) |
| Plan deferred-table phrasing inconsistent | DOC7-4 | LOW |
| `.context/reviews/README.md` missing per-agent file convention | DOC7-6 | LOW |
| Hash semantics test gap: SQL `encode(sha256(...))` vs JS `createHash('sha256')` | TE7-1 | LOW (plannable) |
| Success-path cooldown clearing lacks regression test | TE7-2, TE7-5 | LOW (plannable) |
| `performFlush` lacks dedicated unit test | TE7-3 | LOW |
| Schema-parity test only generic | TE7-4 | LOW |
| Anti-cheat retry timer stale-closure risk on assignmentId change | TRC7-2 | LOW (theoretical) |
| Cache-miss path uses `getDbNowMs()` adding DB round-trip | PERF7-6 | LOW |
| `proxy.ts` authUserCache O(n) cleanup at 90% capacity | PERF7-5 | LOW |
| Drizzle-kit npm install per-deploy (carried from AGG5-13) | PERF7-2 | LOW (carried) |
| Schema repairs band-aid block undocumented | CRIT7-3 | LOW |
| Workspace-to-public migration directive — no opportunity surfaced this cycle | CRIT7-5 | LOW (resolved at verification) |

---

## Deduplicated Findings (sorted by severity / actionability)

### AGG7-1: [LOW, NEW, 3-agent convergence] Step 5b backfill is forever-load-bearing without a sunset criterion

**Sources:** CRIT7-1, PERF7-1, CRIT7-2 | **Confidence:** HIGH

**Cluster summary:**

The cycle-6 fix introduced Step 5b in `deploy-docker.sh` (lines 570-596) — an idempotent secret_token backfill that runs on EVERY deploy regardless of whether the column exists. This is the correct fix for cycle-5 / cycle-6 AGG6-1, but adds a permanent ~5-10s overhead per deploy that no longer pays its way after the column has been gone from all environments for a reasonable retention period.

The cycle-6 implementation:
1. Spins up a `postgres:18-alpine` container.
2. Connects via the docker network.
3. Runs the DO-block (a no-op when `secret_token` column is absent due to `information_schema` guard).
4. Tears down the container.

Net cost: ~5-10s per deploy, FOREVER, unless someone documents and acts on a sunset criterion.

**Why this is an AGG7-1 finding rather than a hard task:** The fix is correct and not blocking. But this is sloppy ops debt — a future maintainer reading the script will see the Step 5b block with no indication of when it can be removed, and either (a) preserve it indefinitely, or (b) remove it without checking if any environment still has the column.

**Fix:**
1. Add an inline comment in `deploy-docker.sh` Step 5b block (around line 567-569) noting the SUNSET CRITERION: e.g., "Remove this Step 5b after the secret_token column is gone from ALL environments AND a 6-month retention has passed (target re-evaluation: 2026-10-26)."
2. Add a corresponding "Sunset criteria" subsection to `AGENTS.md` "Database migration recovery (DRIZZLE_PUSH_FORCE)" section (around line 365).

**Exit criteria:**
- `deploy-docker.sh` has an inline sunset comment with a target re-evaluation date.
- `AGENTS.md` has a "Sunset criteria" subsection.
- All gates green.

**Plannable:** YES (small comment-only change). Pick up this cycle.

---

### AGG7-2: [LOW, NEW, housekeeping] Cycle-6 plan must be archived to `plans/done/` per the README convention

**Sources:** CRIT7-4 | **Confidence:** HIGH

**Cluster summary:**

`plans/open/2026-04-26-rpf-cycle-6-review-remediation.md` exists with all tasks `[x]` done. Per `plans/open/README.md:36-39`: "Once **every** task in such a plan is `[x]`, the plan must be moved to `plans/done/` in the next cycle's housekeeping pass — typically by the cycle that follows it."

**Fix:** `git mv plans/open/2026-04-26-rpf-cycle-6-review-remediation.md plans/done/`

**Exit criteria:**
- Cycle-6 plan in `plans/done/`.
- `plans/open/` contains only standing/master plans + the new cycle-7 plan.

**Plannable:** YES. Pick up this cycle.

---

### AGG7-3: [LOW, NEW, 3-agent convergence] `analyticsCache.set` then `_lastRefreshFailureAt.delete` redundancy needs documentation comment

**Sources:** DBG7-3, TE7-2, TE7-5 | **Confidence:** HIGH

**Cluster summary:**

`route.ts:82-84` (success path) calls:
```ts
analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
_lastRefreshFailureAt.delete(cacheKey);
```

The dispose hook ALSO clears the cooldown on overwrite. So the explicit delete is:
- REDUNDANT on overwrite (dispose already cleared)
- NECESSARY on first-set (no prior entry → no dispose fires)

This dual nature is invisible. A reader scanning the code might think the explicit delete is always necessary (and not realize dispose covers the overwrite case), or always redundant (and remove it, breaking the first-set case).

**Fix:** Add a one-line comment above line 84:
```ts
// Explicit delete here covers the "first set" case (no prior value, no
// dispose fires). On overwrite, dispose has already cleared the cooldown.
_lastRefreshFailureAt.delete(cacheKey);
```

**Exit criteria:** Comment clarifies the dual nature of the delete; gates green.

**Plannable:** YES (comment-only change). Pick up this cycle.

---

### AGG7-4 through AGG7-N: [LOW, deferred / cosmetic / housekeeping]

The remaining ~28 deduplicated LOW findings are all defensible defers:

| ID | Source | Description | Defer reason |
|----|--------|-------------|--------------|
| AGG7-4 | ARCH7-1 | 4x duplicate psql/node container boilerplate in deploy-docker.sh | Operational refactor; not blocking |
| AGG7-5 | ARCH7-2 (carries AGG6-3) | tags.updated_at nullable inconsistency | No consumer; carried |
| AGG7-6 | ARCH7-3 | analyticsCache.dispose invariant in catch-block only | Code correct; defensive doc |
| AGG7-7 | ARCH7-4 | getAuthSessionCookieName vs Names API confusion | Callers correct; cosmetic doc |
| AGG7-8 | CR7-1 | _lastRefreshFailureAt no single owner via wrapper | Code correct; cosmetic refactor |
| AGG7-9 | CR7-2 | performFlush serial-await rationale undocumented | Code correct; comment |
| AGG7-10 | CR7-3 | cacheDelete name doesn't reflect dispose side-effect | Test API stable |
| AGG7-11 | CR7-4 | bytesToBase64/Hex inconsistent iteration | Cosmetic |
| AGG7-12 | CR7-5 / SEC7-4 | Cookie-clear secure flag semantics undocumented | Code correct; comment |
| AGG7-13 | CRIT7-3 | Schema repairs band-aid block undocumented | Defer alongside ARCH7-1 |
| AGG7-14 | DBG7-1 | Step 5b heredoc multi-layer escape map undocumented | Code correct; comment |
| AGG7-15 | DBG7-2 / VER7-1 | NETWORK_NAME bare grep regex | Single-project deploy host OK |
| AGG7-16 | DBG7-4 / TRC7-2 | scheduleRetryRef no-op default + stale-closure risk | Theoretical; assignmentId stable |
| AGG7-17 | DES7-1 (carries DES3-1) | Privacy notice no decline path | UX/legal call |
| AGG7-18 | DES7-2 | Privacy notice WCAG contrast borderline | Needs runtime |
| AGG7-19 | DES7-3 | Modal escape handler implicit | a11y deferred |
| AGG7-20 | DES7-4 | Heartbeat interval hardcoded | No product req |
| AGG7-21 | DES7-5 | Smallest mobile dialog overflow | Needs runtime |
| AGG7-22 | DOC7-1 | AGENTS.md missing source plan cross-refs | Cosmetic |
| AGG7-23 | DOC7-2 | .env.example uses section-name ref | Acceptable |
| AGG7-24 | DOC7-3 (carries CR6-3) | 0021 filename auto-generated | Drizzle-kit risk |
| AGG7-25 | DOC7-4 | Plan deferred-table phrasing inconsistent | Process improvement |
| AGG7-26 | DOC7-6 | .context/reviews/README.md missing per-agent convention | Process doc |
| AGG7-27 | PERF7-2 (carries AGG5-13) | drizzle-kit npm install per-deploy | Operational refactor |
| AGG7-28 | PERF7-3 (carries AGG6-9) | _lastRefreshFailureAt indirect bound | Defense-in-depth |
| AGG7-29 | PERF7-4 | performFlush serial-await latency | Edge case perf |
| AGG7-30 | PERF7-5 | proxy.ts authUserCache O(n) cleanup | Rare edge case |
| AGG7-31 | PERF7-6 | Cache-miss getDbNowMs() round-trip | Negligible |
| AGG7-32 | SEC7-1 | PGPASSWORD exposed in docker inspect | Defense-in-depth |
| AGG7-33 | SEC7-2 | psql sslmode unset | Internal network |
| AGG7-34 | SEC7-3 | UA-mismatch audit events unbounded | Audit infra downstream |
| AGG7-35 | TE7-1 | Hash semantics SQL-vs-JS not pinned | Plannable for cycle-7 if affordable |
| AGG7-36 | TE7-3 | performFlush lacks dedicated unit test | Functionally covered |
| AGG7-37 | TE7-4 | schema-parity only generic | Test depth |

### Carried-deferred from cycle 6 (unchanged)

All cycle-6 carried-deferred items remain accurate and deferrable:

| Cycle 6 ID | Description | Reason for deferral |
|------------|-------------|---------------------|
| AGG6-3 | tags.updated_at nullable inconsistency | No current consumer |
| AGG6-4 | 0021_lethal_black_tom.sql filename | Drizzle-kit rename procedure risk |
| AGG6-5 | Cycle-5 dispose-hook test name | Cosmetic test naming |
| AGG6-6 | setCooldown.valueMs param naming | Cosmetic |
| AGG6-7 | deploy-docker.sh AGG5-1 reference rot | Ephemeral content |
| AGG6-8 | deploy-docker.sh:596 regex broadness | Pattern works against drizzle-kit |
| AGG6-9 | _lastRefreshFailureAt indirect bound | Defense-in-depth |
| AGG6-10 | __test_internals block-vs-expression style | Cosmetic |
| AGG6-11 | 0020 UTF-8 encoding cross-references | Code correct |
| AGG6-12 | analyticsCache.dispose synchronous-only doc | Future-proofing |
| AGG6-13 | Privacy notice ARIA hierarchy | Radix auto-wires |
| AGG6-14 | Privacy notice no decline path (carried DES3-1) | UX/legal call |
| AGG6-16 | Deploy "Schema repairs" log granularity | Cosmetic |
| AGG6-17 | Deploy PUSH_OUT memory | Acceptable |
| AGG6-18 | DRIZZLE_PUSH_FORCE audit trail | No audit infra in deploy |
| AGG6-19 | 0020 backfill idempotency integration test | Integration test infra |
| AGG6-20 | 0021 schema-parity test coverage | Resolved at verification this cycle |

### Carried-deferred from cycles 1-5 (unchanged)

All cycles 1-5 carried-deferred items remain in `_aggregate-cycle-48.md` and earlier; reasoning unchanged.

---

## No Agent Failures

All 11 spawned review lanes completed successfully. No retries needed.

---

## Plannable Tasks for Cycle-7

Three findings are plannable for actual implementation this cycle:

1. **AGG7-1** (CRIT7-1 / PERF7-1 / CRIT7-2 cluster) — Add sunset criterion comment to `deploy-docker.sh` Step 5b + AGENTS.md "Sunset criteria" subsection.
2. **AGG7-2** (CRIT7-4) — Move `plans/open/2026-04-26-rpf-cycle-6-review-remediation.md` to `plans/done/`.
3. **AGG7-3** (DBG7-3 / TE7-2 / TE7-5 cluster) — Add explanatory comment above `route.ts:84` `_lastRefreshFailureAt.delete(cacheKey)`.

All other cycle-7 findings (~28 deduplicated LOW items) are defensible defers, recorded in the deferred table above per the cycle's deferred-fix rules.

---

## Workspace-to-Public Migration Directive

Per cycle orchestrator instruction: "Make progress in this cycle ONLY where the review surfaces a relevant opportunity; do NOT force unrelated migration work."

**Status:** No workspace-to-public migration opportunity surfaced in any of the 11 review lanes this cycle. Per `user-injected/workspace-to-public-migration.md`, the migration is "substantially complete" and remains a "placeholder for opportunistic edge cases". Cycle-7 honors the surfacing rule by NOT taking migration action.

---

## Verdict

**Cycle 7 verdict:** Code health at HEAD is high. All cycle-6 fixes hold. No HIGH or MEDIUM findings emerged. Three small plannable items (one comment, one housekeeping move, one comment-doc sweep) and ~28 defensible defers.
