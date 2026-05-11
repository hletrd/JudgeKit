# RPF Cycle 9 — Aggregate Review

**Date:** 2026-05-11
**HEAD reviewed:** `06f74d76` (cycle-8 close-out)
**Change surface:** 0 commits, 0 files, 0 lines vs cycle-8 close-out HEAD.
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, test-engineer, architect, debugger (6 lanes; manual review due to no registered agent subagents).
**Per-agent files:** `.context/reviews/cycle-9/*.md`

---

## Total deduplicated NEW findings

**0 HIGH, 0 MEDIUM, 5 LOW.**

All findings are carry-forward sweeps on existing code; no new issues introduced this cycle.

---

## NEW findings this cycle

### C9-AGG-1: SIGINT handler forces process exit (LOW)

**Consensus:** code-reviewer + architect + debugger + security-reviewer (4 lanes)
**File:** `src/lib/audit/node-shutdown.ts:49`
**Description:** The SIGINT handler calls `processLike.exit?.(130)` inside `.finally()`, forcing immediate process termination. This is inconsistent with the SIGTERM handler (fixed in cycle 8) which allows natural exit. Prevents other cleanup handlers from running and could truncate in-flight audit events.
**Fix:** Remove forced exit from SIGINT, matching SIGTERM behavior. Single-line change.

---

### C9-AGG-2: countdown-timer leaks AbortController on visibility changes (LOW)

**Consensus:** code-reviewer + perf-reviewer + debugger (3 lanes)
**File:** `src/components/exam/countdown-timer.tsx:186`
**Description:** `syncTime()` is called from `handleVisibilityChange` but its returned cleanup function (AbortController abort + timeout clear) is discarded. Rapid tab switching can queue multiple concurrent `/api/v1/time` requests.
**Fix:** Store the cleanup function in a ref and abort before starting a new sync. ~8 lines.

---

### C9-AGG-3: Malformed JSON success responses treated as success (LOW)

**Consensus:** code-reviewer + security-reviewer + architect + debugger + test-engineer (5 lanes)
**Files:**
- `src/app/(auth)/verify-email/page.tsx:38-50`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx:34-55`
- `src/app/(auth)/reset-password/reset-password-form.tsx:52-73`
- `src/app/(public)/problems/create/create-problem-form.tsx:343-356`
**Description:** These components parse JSON with `.catch(() => fallback)` and branch on `res.ok` alone. If the server returns HTTP 200 with a non-JSON body (proxy/WAF misconfiguration), the components enter their success paths with fallback data, producing false-positive success states.
**Fix:** Add an explicit parse-success check alongside `res.ok`. ~3 lines per file; 4 files total.

---

### C9-AGG-4: apiFetch fallback timer leak in old browsers (LOW)

**Consensus:** code-reviewer + perf-reviewer (2 lanes)
**File:** `src/lib/api/client.ts:97-98`
**Description:** When no signal is provided to `apiFetch`, `createTimeoutSignal(30_000)` is used. In the fallback path for old browsers, the `setTimeout` timer cannot be cancelled if the fetch completes before timeout. Modern browsers are not affected.
**Fix:** Store timer reference and clean it up. ~5 lines.
**Status:** Deferred — old-browser-only, minimal practical impact.

---

## Carry-forward DEFERRED items (status verified at HEAD `06f74d76`)

All deferred items from previous cycles remain unchanged:

| ID | Severity | Status |
|---|---|---|
| DEFER-1 (SSE unbounded IN) | MEDIUM | Unchanged |
| DEFER-2 (rateLimits overloaded) | MEDIUM | Unchanged |
| DEFER-3 (compiler child.kill timeout) | LOW | Unchanged |
| DEFER-4 (pre-restore type assertion) | LOW | Unchanged |
| DEFER-5 (stopSharedPollTimer race) | LOW | Unchanged |
| DEFER-6 (anti-cheat 5000 rows) | LOW | Unchanged |
| DEFER-7 (submissionSubscribers leak) | LOW | Unchanged |
| DEFER-8 (Next.js layout workaround) | LOW | Unchanged |
| DEFER-9 (stopSharedPollTimer tests) | LOW | Unchanged |
| DEFER-10 (compiler local fallback tests) | LOW | Unchanged |
| C9-AGG-4 (apiFetch timer leak) | LOW | Deferred this cycle |

---

## Cross-agent agreement summary

- **Empty change surface (0 commits, 0 files, 0 lines):** 6 lanes agree.
- **C9-AGG-1 (SIGINT exit) as primary pick:** 4 lanes.
- **C9-AGG-3 (malformed JSON success) as highest-signal finding:** 5 lanes.
- **C9-AGG-2 (countdown-timer leak) as secondary pick:** 3 lanes.
- **C9-AGG-4 (apiFetch timer leak) as deferrable:** 2 lanes.

## Agent failures

No agent failures. All 6 reviewer perspectives were performed manually and produced artifacts in `.context/reviews/cycle-9/`.

---

## Implementation queue for PROMPT 3

Per orchestrator directive, pick at least 2-3 LOW findings:

1. **C9-AGG-1** — SIGINT natural exit. Single file, ~3 lines.
2. **C9-AGG-3** — Malformed JSON success responses. 4 files, ~3 lines each.
3. **C9-AGG-2** — countdown-timer AbortController leak. Single file, ~8 lines.

**Deferred:**
- C9-AGG-4 (apiFetch timer leak): Old-browser-only, minimal impact.

**Repo-policy compliance:**
- GPG-signed commits with conventional commit + gitmoji.
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`.
