# Critic Review — Cycle 12/100

**Reviewer:** critic (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Multi-perspective critique of the whole change surface

---

## NEW FINDINGS

### C12-CT-1 — Incomplete cycle 10 remediation: deregister route omitted
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts:24`
- **Problem:** Cycle 10 fixed JSON parse error handling across four judge routes (register, claim, heartbeat, poll) but missed the deregister route. This suggests the cycle 10 review did not inventory ALL judge routes before applying the fix. The deregister route has the exact same vulnerability: unguarded `await request.json()` inside `safeParse`.
- **Cross-perspective:** From a security angle, this gives attackers a 500-producing probe target. From a reliability angle, it generates false-positive alerts. From a maintenance angle, it breaks the consistency of the judge route error-handling pattern.
- **Fix:** Apply the same try/catch wrapper pattern used in the other four judge routes.

### C12-CT-2 — CountdownTimer edge cases around prop changes
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx`
- **Problem:** The CountdownTimer component assumes `deadline` is static after mount. The `expired` state, `expiredRef`, and `firedThresholds` ref are never reset when `deadline` changes. This creates two failure modes: (1) deadline extension leaves the timer stuck at "00:00:00", and (2) staggered toast timers are not tracked for cleanup. These are edge cases that may not occur in normal exam usage but represent incomplete reactive behavior.
- **Cross-perspective:** From UX, a student seeing "00:00:00" after a deadline extension is confusing. From code quality, the component should handle prop changes reactively or document the static-deadline assumption.
- **Fix:** Reset `expired` and `firedThresholds` when `deadline` changes; track staggered timer IDs for cleanup.

---

## No Other Critiques

The codebase shows good patterns overall: consistent use of `createApiHandler`, proper CSRF handling, explicit abort controller cleanup in most fetch paths, and defensive SQL via drizzle-orm. The cycle 10 and 11 fixes were well-applied across their target surfaces.
