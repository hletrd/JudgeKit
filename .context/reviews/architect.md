# Architect Review — Cycle 12/100

**Reviewer:** architect (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Architectural/design risks, coupling, layering

---

## NEW FINDINGS

### C12-AR-1 — Judge route JSON parse pattern: incomplete DRY application
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts`
- **Problem:** The five judge routes (register, deregister, claim, heartbeat, poll) all perform the same manual JSON parse + safeParse + error-return pattern. Cycle 10 fixed four of them but not deregister. This is a DRY violation that creates maintenance risk: future changes to JSON parse error handling must be applied in five places.
- **Architectural recommendation:** Extract a shared `parseJudgeBody(schema, request)` helper that wraps `request.json()` in try/catch and returns either `{ success: true, data }` or `{ success: false, errorResponse }`. This centralizes the pattern and prevents future omissions.

### C12-AR-2 — CountdownTimer: prop-change reactivity gap
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/exam/countdown-timer.tsx`
- **Problem:** The CountdownTimer component mixes imperative refs (`expiredRef`, `firedThresholds`, `offsetRef`) with React state (`expired`, `remaining`). When the `deadline` prop changes, the imperative state is not reset, causing the component to display stale data. This is a symptom of using refs for derived state that should be recomputed from props.
- **Architectural recommendation:** Derive `expired` directly from `remaining <= 0` instead of maintaining it as separate state. Reset `firedThresholds` in a `useEffect` when `deadline` changes.

---

## No Other Architectural Issues Found

The overall architecture remains sound: API routes are well-layered with `createApiHandler`, DB access is centralized through drizzle-orm, auth is handled consistently, and client-side state is mostly well-managed. The judge worker route pattern (custom auth, raw SQL for atomic claims) is justified by the performance requirements.
