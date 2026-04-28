# Verifier Review — Cycle 1 (New Session)

**Reviewer:** verifier
**Date:** 2026-04-28
**Scope:** Evidence-based correctness check against stated behavior

---

## Verification Results

### VER-1: [HIGH, CONFIRMED BUG] `totalPoints` calculation is incorrect

**File:** `src/app/(public)/contests/[id]/page.tsx:187`

**Evidence:**
- Code: `sortedProblems.reduce((sum, p) => sum + p.points, 100)`
- Expected behavior: Sum of all problem points
- Actual behavior: Sum of all problem points + 100 (the reduce initial value)
- The `AssignmentOverview` component receives `totalPoints={totalPoints}` at line 329
- This is a data integrity bug on the student-facing contest detail page

**Verdict:** CONFIRMED BUG. The initial value must be 0, not 100.

---

### VER-2: [MEDIUM, CONFIRMED] `StartExamButton` on problem detail page passes 0 for exam duration

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:478`

**Evidence:**
- Code: `durationMinutes={0}` — hardcoded
- The `assignmentContext` type definition (lines 152-162) does not include `examDurationMinutes`
- The contest detail page correctly passes `contest.examDurationMinutes ?? 0` at line 288
- The problem detail page should also pass the actual duration

**Verdict:** CONFIRMED BUG. The `assignmentContext` type and DB query need to include `examDurationMinutes`.

---

### VER-3: [VERIFIED OK] Anti-cheat monitor does not capture text content

**File:** `src/components/exam/anti-cheat-monitor.tsx:207-228`

**Evidence:**
- The `describeElement` function (lines 207-228) explicitly does not capture `textContent`
- Line 219-220 comment: "Note: text content is intentionally NOT captured to avoid storing copyrighted exam problem text in the audit log."
- Copy/paste events only capture element type and CSS class identifier
- Previous AGG-4 finding about text capture is now RESOLVED

**Verdict:** VERIFIED OK. Previous finding is fixed.

---

### VER-4: [VERIFIED OK] CountdownTimer uses server time sync with proper error handling

**File:** `src/components/exam/countdown-timer.tsx:62-93`

**Evidence:**
- Uses `apiFetch("/api/v1/time", { signal: controller.signal })` with 5-second timeout
- Validates `Number.isFinite(data.timestamp)` before using offset
- Falls back to client time on error (offset stays at 0)
- Previous AGG-5 about uncorrected initial render is a known trade-off documented in the code

**Verdict:** VERIFIED OK with accepted trade-off (initial flash before server sync).

---

### VER-5: [VERIFIED OK] Auth configuration is secure

**File:** `src/lib/auth/config.ts`

**Evidence:**
- Dummy password hash for timing-safe comparison on non-existent users
- Rate limiting on IP + username for login attempts
- Argon2id for password hashing with automatic rehashing
- Token invalidation check on every JWT refresh cycle
- Auth secret and judge auth token minimum length validation (32 chars)
- Secure cookie detection based on AUTH_URL scheme

**Verdict:** VERIFIED OK. No new auth security issues.

---

### VER-6: [VERIFIED OK] SSE connection tracking is correctly implemented

**File:** `src/app/api/v1/submissions/[id]/events/route.ts`

**Evidence:**
- Two-phase eviction (stale cleanup + FIFO by insertion order) replaces previous O(n) scan
- `userConnectionCounts` Map provides O(1) per-user count lookup
- Per-user connection cap enforced
- Shared polling reduces DB queries
- Re-auth check every 30 seconds prevents data leakage after account deactivation
- Cleanup timer with `unref()` to avoid blocking process exit

**Verdict:** VERIFIED OK. Previous AGG-6 about O(n) eviction is now resolved.

---

## Summary

| ID | Finding | Verdict |
|----|---------|---------|
| VER-1 | totalPoints off by 100 | CONFIRMED BUG |
| VER-2 | StartExamButton duration=0 | CONFIRMED BUG |
| VER-3 | Anti-cheat text capture | VERIFIED OK (fixed) |
| VER-4 | CountdownTimer server sync | VERIFIED OK (trade-off) |
| VER-5 | Auth configuration | VERIFIED OK |
| VER-6 | SSE connection tracking | VERIFIED OK (fixed) |
