# Cycle 33 Review Remediation Plan

**Date:** 2026-05-10
**Based on:** `.context/reviews/_aggregate.md` (Cycle 33)
**HEAD:** b1c3564b (clean working tree)

---

## Active Tasks

### C33-1: Fix timer leak in submission-list-auto-refresh on unmount during initial tick

- **File:** `src/components/submission-list-auto-refresh.tsx:60-77`
- **Severity:** MEDIUM
- **Confidence:** HIGH

**Problem:** The `start()` function awaits `tick()` then calls `scheduleNext()`. If component unmounts during `tick()`, cleanup runs but `scheduleNext()` still sets a leaked timer.

**Fix:** Add mounted ref guard:
```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;
  async function start() {
    await tick();
    if (mountedRef.current) scheduleNext();
  }
  void start();
  return () => {
    mountedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
}, [hasActiveSubmissions, activeIntervalMs, idleIntervalMs, router]);
```

**Implementation:**
- [x] Update submission-list-auto-refresh.tsx
- [ ] Add unit tests for unmount-during-tick scenario
- [x] Run gates

**Exit criterion:** Component unmount during async tick does not leak timers.

---

### C33-2: Fix apiFetchJson to handle fetch() throwing

- **File:** `src/lib/api/client.ts:126-144`
- **Severity:** MEDIUM
- **Confidence:** HIGH

**Problem:** `apiFetchJson` only catches `res.json()` throwing, not `fetch()` itself throwing.

**Fix:** Wrap `apiFetch` call in try/catch and return `{ ok: false, data: fallback }` on network errors.

**Implementation:**
- [x] Update apiFetchJson function
- [ ] Add unit tests for network failure scenario
- [x] Run gates

**Exit criterion:** Network failures return `{ ok: false, data: fallback }` instead of throwing.

---

### C33-3: Gate console.error calls in error boundaries behind NODE_ENV check

- **Files:**
  - `src/app/(dashboard)/dashboard/admin/error.tsx:19`
  - `src/app/(public)/problems/error.tsx:20`
  - `src/app/(public)/groups/error.tsx:20`
  - `src/app/(public)/contests/manage/error.tsx:22`
- **Severity:** LOW
- **Confidence:** HIGH

**Problem:** Error boundaries log unconditionally to console.error in production.

**Fix:** Wrap each console.error in `if (process.env.NODE_ENV === "development")`.

**Implementation:**
- [x] Update all 4 error.tsx files (1 fixed, 3 already gated)
- [x] Run gates

**Exit criterion:** No ungated console.error in error boundary components.

---

### C33-4: Add AbortController to export-button

- **File:** `src/components/contest/export-button.tsx`
- **Severity:** LOW
- **Confidence:** MEDIUM

**Problem:** Export requests cannot be cancelled and rapid clicks may leak blob URLs.

**Fix:** Add AbortController ref, cancel previous request on new click, and properly revoke blob URLs.

**Implementation:**
- [x] Update export-button.tsx
- [x] Run gates

**Exit criterion:** Export requests can be cancelled; no blob URL leaks on rapid clicks.

---

### C33-5: Fix contests layout DOM query and add upstream issue link

- **File:** `src/app/(public)/contests/manage/layout.tsx`
- **Severity:** LOW
- **Confidence:** MEDIUM

**Problem:** DOM elements may not exist during initial render; TODO lacks tracking issue.

**Fix:** Add null checks for queried elements and add specific upstream issue reference in TODO comment.

**Implementation:**
- [x] Update layout.tsx
- [x] Run gates

**Exit criterion:** Null-safe DOM queries with tracked upstream issue.

---

### C33-6: Fix sign-out storage iteration race condition

- **File:** `src/lib/auth/sign-out.ts:37-44`
- **Severity:** LOW
- **Confidence:** LOW

**Problem:** localStorage iteration is non-atomic.

**Fix:** Snapshot keys before iterating.

**Implementation:**
- [x] Update sign-out.ts
- [x] Run gates

**Exit criterion:** Keys are snapshotted atomically before removal.

---

### C33-7: Add tests for timer/async components

- **Files:**
  - `src/components/submission-list-auto-refresh.tsx`
  - `src/components/contest/export-button.tsx`
  - `src/lib/api/client.ts`
- **Severity:** LOW
- **Confidence:** MEDIUM

**Problem:** These components have no unit tests for timer logic, blob downloads, or network failure handling.

**Fix:** Add unit tests for:
- submission-list-auto-refresh: timer scheduling, backoff, cleanup, unmount-during-tick
- export-button: blob creation, filename parsing, error handling
- apiFetchJson: network failures, non-JSON responses

**Implementation:**
- [ ] Add tests for submission-list-auto-refresh (deferred — no existing test file)
- [ ] Add tests for export-button (deferred — no existing test file)
- [ ] Add tests for apiFetchJson network failures (deferred — no existing test file)
- [x] Run gates

**Exit criterion:** All new tests pass.

---

## Deferred Items (from previous cycles, unchanged)

The following findings from previous cycles remain deferred per existing policy:

- **C-1:** Test/Seed localhost check spoofable (CRITICAL) — requires architecture review
- **C-2:** Accepted solutions endpoint unauthenticated (CRITICAL) — requires product decision
- **C-3:** File DELETE CSRF ordering (CRITICAL) — requires API refactor
- **H-1:** SSE result visibility bypass (HIGH) — requires SSE sanitization refactor
- **H-2:** Problem-Set PATCH bypasses createApiHandler (HIGH) — requires schema migration
- **H-3:** Overrides route doesn't use createApiHandler (HIGH) — requires route refactor
- **H-4:** In-memory rate limiter for judge claims (HIGH) — requires infra decision
- **H-5:** Accepted solutions exposes userId for anonymous (HIGH) — requires data migration
- **DEFER-C30-4:** `.json()` before `.ok` in non-critical components (MEDIUM) — 30+ files, large refactor
- **DEFER-C30-5:** Raw API error strings without i18n (MEDIUM) — ongoing incremental fix
- **DEFER-C30-6:** `as { error?: string }` unsafe type assertions (MEDIUM) — 15 instances, type system refactor needed
