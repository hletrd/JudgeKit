# Critic — Cycle 5

**Reviewer:** critic
**Base commit:** 6bb2b2eb
**Date:** 2026-05-14

## Multi-Perspective Critique

### CRI-1: `rateLimits` table overload is a ticking time bomb for production [MEDIUM]

- **File:** `src/lib/realtime/realtime-coordination.ts`, `src/lib/security/api-rate-limit.ts`
- **Confidence:** High

The `rateLimits` table currently serves three entirely different purposes: API rate limiting (with backoff logic), SSE connection slot tracking (where `blockedUntil` means "connection expires at"), and heartbeat deduplication (where `lastAttempt` means "last heartbeat timestamp"). The cleanup logic only removes expired SSE entries. Heartbeat entries are never cleaned up. In a production environment with thousands of students and daily assignments, this table will grow without bound. The `acquireSharedSseConnectionSlot` function already has a `getSsePrefixPattern()` that only matches `realtime:sse:user:%` — there is literally no code path that ever deletes `realtime:heartbeat:%` entries. This is not a theoretical concern; it's a guaranteed table bloat issue.

**Recommendation:** Either add a category column with per-category cleanup, or split into separate tables before the next production deployment with significant user growth.

### CRI-2: Defense-in-depth gaps in shell command validator [MEDIUM]

- **File:** `src/lib/compiler/execute.ts:170-175`
- **Confidence:** Medium

The shell command validator documents that it blocks "Variable substitution: `${`" but the regex actually blocks `$a`, `$FOO`, etc. while allowing `$1`, `$0`. The comment and the regex are subtly mismatched. A developer reading the comment might believe positional parameters are blocked when they are not. The trust boundary (Docker sandbox) is strong, but the validator's purpose is defense-in-depth — it should match its documented intent.

**Recommendation:** Update the regex and the comment to be consistent. If positional parameters are intentionally allowed, document why.

### CRI-3: Size validation mismatch between API contract and runtime [LOW]

- **File:** `src/app/api/v1/compiler/run/route.ts`, `src/lib/compiler/execute.ts`
- **Confidence:** High

A user submits Korean source code of 40,000 characters. The API returns 200 OK (schema validation passes: 40K < 64K). The compiler then rejects it with "Source code exceeds maximum size limit" (byte length: ~120K > 64K). From the user's perspective, the API accepted their input but the compiler refused it with a confusing message. This is a contract mismatch that degrades user trust.

**Recommendation:** Unify the validation at the API layer so the user gets a clear 400 response before any compiler execution.

## Summary

3 findings: 2 MEDIUM, 1 LOW.
