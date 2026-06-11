# Cycle 26 Tracer Review

**Date:** 2026-04-20
**Base commit:** 660ae372

---

## TR-1: Recruit page data flow — duplicate query with potential consistency gap [MEDIUM/MEDIUM]

**Files:** `src/app/(auth)/recruit/[token]/page.tsx:19,56`
**Trace:**
1. Next.js calls `generateMetadata({ params })` → calls `getRecruitingInvitationByToken(token)` → DB query #1
2. Next.js renders the page component → calls `getRecruitingInvitationByToken(token)` → DB query #2
3. Between steps 1 and 2, the invitation state could change (e.g. another request redeems or revokes it)
4. Result: metadata says "valid invitation" but page shows "invalid/expired" or vice versa

**Hypothesis:** The metadata and page render could disagree about the invitation state, confusing users or search engines.
**Likelihood:** LOW in practice (the window between metadata and render is milliseconds), but architecturally incorrect.
**Fix:** Use `React.cache()` to ensure both calls return the same result within a single render.

## TR-2: Rate limit data flow — correct atomic guarantee [VERIFIED SAFE]

**Trace:**
1. `consumeApiRateLimit()` checks sidecar first (fast path)
2. If sidecar allows or is unreachable, falls back to `atomicConsumeRateLimit()`
3. `atomicConsumeRateLimit()` uses `SELECT FOR UPDATE` inside a transaction
4. The `WeakMap` prevents double-consumption within the same request
5. Sidecar failure mode: returns `null`, code falls back to DB (fail-open, correct)

**Conclusion:** The rate limiting flow is race-condition-free and handles sidecar failures correctly.
