# RPF Cycle 7 — code-reviewer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305` (cycle-6 close-out: docs(plans) mark cycle 6 Tasks Z (gates+deploy) and ZZ (archive) done).
**Cycle-7 change surface vs prior cycle close-out (`45502305`):** **0 commits, 0 files, 0 lines.**
**Cycle-6 cumulative diff vs `a18302b8`:** 5 commits (28dd4261 reviews, 7d4066d5 cycle-6 plan + cycle-5 archive, 72868cea Task B SUDO_PASSWORD, 2791d9a3 Task C DEPLOY_SSH_RETRY_MAX, 45502305 cycle-6 close-out). Net `src/` change: **0 lines.**

## Summary

Empty cycle-7 change surface. No new code introduced. Re-validation of prior cycle's findings + an existing stale cycle-7 review set (rooted at `b0666b7a`, dated 2026-04-24) confirms ALL of those stale findings RESOLVED at HEAD. Cycle-6's two functional commits are pure-additive deploy-script changes (zero `src/` impact).

## Stale prior cycle-7 review findings — re-validated at HEAD

A previous non-orchestrator cycle-7 review run (rooted at `b0666b7a`, dated 2026-04-24) was found at `.context/reviews/rpf-cycle-7-*.md`. Each finding has been re-validated against HEAD `45502305`:

| Stale ID | File | HEAD evidence | Status |
|---|---|---|---|
| C7-CR-1 / AGG-1 (`/api/v1/time` uses Date.now) | `src/app/api/v1/time/route.ts` | `import { getDbNowMs } from "@/lib/db-time"`; `export const dynamic = "force-dynamic"`; `return NextResponse.json({ timestamp: await getDbNowMs() })` | **RESOLVED** |
| C7-SR-2 / AGG-2 (plaintext recruiting `token` column) | `src/lib/db/schema.pg.ts:940` | Column is now `tokenHash: varchar("token_hash", { length: 64 })`. Plaintext `token` column removed entirely. Only `ri_token_hash_idx` index exists; `ri_token_idx` (plaintext) is gone. | **RESOLVED** |
| C7-CR-2 / C7-PR-1 / AGG-3 (SSE O(n) eviction) | `src/app/api/v1/submissions/[id]/events/route.ts:48-63` | Still O(n) at HEAD. Same as ARCH-CARRY-2 in cycle-6 backlog. | **DEFERRED** (matches ARCH-CARRY-2) |
| C7-CR-4 / C7-PR-2 / AGG-4 (rate-limit sort) | `src/lib/security/in-memory-rate-limit.ts:41-47` | Still sorts on overflow. Same as AGG-2 in cycle-6 backlog. | **DEFERRED** (matches AGG-2) |
| C7-TE-1 / AGG-5 (no test for `/api/v1/time`) | `src/app/api/v1/time/route.ts` | Endpoint now uses `getDbNowMs()`; test still missing. Now an unambiguous LOW (tiny 1-line endpoint, but mockable). | **NEW LOW (carried)** |
| C7-TE-2 / AGG-6 (participant-status time logic untested) | `src/lib/assignments/participant-status.ts` | Time-boundary edge cases still untested. | **DEFERRED** (LOW; exit criterion: bug report on deadline boundary) |
| C7-SR-3 / AGG-7 (decrypt plaintext fallback) | `src/lib/security/encryption.ts:79-81` | Documented behavior; deferral acceptable. | **DEFERRED** (LOW; advisory) |
| C7-CR-3 / AGG-8 (client console.error) | client components | HEAD count: **25** (was 19 in stale review, 21 in cycle-5 close-out, 24 in my cycle-6 grep). Slight upward drift. Same as C1-AGG-3 in cycle-6 backlog. | **DEFERRED** (matches C1-AGG-3) |
| C7-AR-2 / AGG-9 (dual rate-limiting modules) | `src/lib/security/in-memory-rate-limit.ts`, `api-rate-limit.ts`, `rate-limit.ts` | 3 modules still coexist; advisory only. | **DEFERRED** (LOW; advisory) |

## Cycle-7 NEW findings

**0 NEW (HIGH/MEDIUM/LOW).** Empty change surface; no new code paths introduced.

## Cycle-6 commits — code-quality assessment

I reviewed `git diff a18302b8 45502305 -- deploy-docker.sh`:

### Commit `72868cea` (Task B — SUDO_PASSWORD decoupling)

```bash
local sudo_pw="${SUDO_PASSWORD:-${SSH_PASSWORD}}"
```

- **Correct.** Default-substitution chain falls back to `SSH_PASSWORD` when `SUDO_PASSWORD` unset, preserving prior behavior.
- `_CALLER_SUDO_PASSWORD` save/restore at `deploy-docker.sh:75, 92` correctly handles the env-var lifecycle across function calls. No regression.

### Commit `2791d9a3` (Task C — DEPLOY_SSH_RETRY_MAX env override)

```bash
local max_attempts="${DEPLOY_SSH_RETRY_MAX:-4}"
if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  warn "DEPLOY_SSH_RETRY_MAX='${max_attempts}' is not a positive integer; falling back to 4"
  max_attempts=4
fi
```

- **Correct.** Regex `^[1-9][0-9]*$` rejects `0`, negative, decimal, alpha, empty. Sane default-fallback with warn line.
- Env-var docstring at `deploy-docker.sh:46` lists `DEPLOY_SSH_RETRY_MAX`. Compliant.

No code-smell findings on cycle-6 diff.

## Cycle-6 backlog re-validation at HEAD `45502305`

| Carry-forward | File (corrected for HEAD) | HEAD status |
|---|---|---|
| C2-AGG-5 | 4-6 polling components | unchanged; below 7th-instance trigger |
| C2-AGG-6 | `src/app/(public)/practice/page.tsx:417` | unchanged |
| C1-AGG-3 | client `console.error` count | **25 at HEAD** (was 21 at cycle-6 aggregate, 19 at stale cycle-7 review) — slight drift; not new findings, just count update |
| AGG-2 | `src/lib/security/in-memory-rate-limit.ts:22, 24, 56, 75, 100, 149` | unchanged |
| ARCH-CARRY-1 | 20 raw API handlers (104 total) | unchanged from cycle-6 |
| ARCH-CARRY-2 | `src/lib/realtime/realtime-coordination.ts` SSE eviction O(n) | unchanged. NOTE: stale cycle-7 review had this in `events/route.ts:48-63` not `realtime-coordination.ts` — the SSE eviction issue applies to BOTH. ARCH-CARRY-2 should be path-clarified. |
| PERF-3 | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:191-225` | unchanged |
| D1, D2 | auth JWT clock-skew + DB-per-request (NOT in `src/lib/auth/config.ts`) | unchanged |
| DEFER-ENV-GATES | env-blocked test gates | unchanged |

## Path-drift correction proposed for cycle-7 plan

**ARCH-CARRY-2** carry-forward: original cycle was rooted in `src/lib/realtime/realtime-coordination.ts` (which has 254 lines and an in-memory connection map). The stale cycle-7 reviews flag the same kind of O(n) eviction in `src/app/api/v1/submissions/[id]/events/route.ts:48-63`. These are **two distinct sites** of the same pattern. Severity unchanged (LOW). Exit criterion unchanged. Proposed update: register both sites under ARCH-CARRY-2 to prevent future cycles from treating them as separate items.

## Recommendation for cycle-7 PROMPT 2 / 3

Per orchestrator's PROMPT 2 directive ("Pick at least 2-3 LOW deferred items"), cycle-7's draw-down candidates:

1. **Stale cycle-7 finding closures** (3 items, doc-only): Mark C7-CR-1/AGG-1 (time route) and C7-SR-2/AGG-2 (plaintext recruiting tokens) **CLOSED at HEAD** in the cycle-7 plan; both were silently fixed by intervening commits (verified by direct file inspection).
2. **C2-AGG-5 pre-emptive helper extraction** — Extract `useVisibilityAwarePolling` hook from one polling site as a reusable primitive. Defends against the open-ended "wait for 7th instance" trigger by ensuring future polling components default to visibility-aware. Risk: low (≤ 80 lines, behavior-preserving migration of one site).
3. **C7-TE-1 unit test for `/api/v1/time`** — Now valuable: the endpoint uses `getDbNowMs()` and is the client's authoritative time source. A small unit test verifying the response shape + timestamp validity is justified. Risk: low (≤ 30 lines).

Combined diff < 150 lines, all tightly scoped, all retire deferred items.

## Confidence labels

- Re-validation of stale cycle-7 findings: **H** (direct file inspection at HEAD).
- Cycle-6 commit code quality: **H**.
- Cycle-7 NEW findings: **H** (= 0).
- Path-drift correction for ARCH-CARRY-2: **M** (depends on architect's preference for grouping vs separating the two sites).
