# Aggregate Review — Cycle 33

**Date:** 2026-05-10
**Cycle:** 33 of 100
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, test-engineer, architect, debugger, verifier, critic, tracer, document-specialist
**Total findings:** 7 new (3 MEDIUM, 4 LOW) + 11 carried deferred re-validated

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] Timer leak in submission-list-auto-refresh on unmount during initial tick

**Sources:** C33-CR-1, C33-DB-2, C33-TR-1, C33-PR-1 | **Confidence:** HIGH
**File:** `src/components/submission-list-auto-refresh.tsx:60-77`

The `start()` function awaits `tick()` (which includes an async fetch) then calls `scheduleNext()`. If the component unmounts during `tick()`, cleanup sets `timerRef.current = null`, but after `tick()` completes, `scheduleNext()` still executes and sets a new timer that will never be cleared.

**Failure scenario:** User navigates away during initial poll. A leaked timer continues calling `router.refresh()` indefinitely, causing unnecessary server load and React reconciliation.

**Fix:** Add a mounted ref check before scheduling:
```typescript
const mountedRef = useRef(true);
useEffect(() => {
  mountedRef.current = true;
  async function start() {
    await tick();
    if (mountedRef.current) scheduleNext();
  }
  void start();
  return () => { mountedRef.current = false; /* existing cleanup */ };
}, [...]);
```

**Cross-agent agreement:** 4 agents flagged this. HIGH confidence.

---

### AGG-2: [MEDIUM] apiFetchJson does not handle fetch() throwing

**Sources:** C33-CR-2, C33-SR-4, C33-VR-1, C33-DS-1 | **Confidence:** HIGH
**File:** `src/lib/api/client.ts:126-144`

The `apiFetchJson` helper documents itself as a "safe wrapper" that eliminates common footguns, but if `fetch()` itself throws (network failure, CORS, DNS error), the exception propagates unhandled. Only `res.json()` throwing is caught.

**Failure scenario:** Network interruption during API call causes unhandled exception instead of graceful fallback.

**Fix:** Wrap the `apiFetch` call in try/catch:
```typescript
export async function apiFetchJson<T = unknown>(input, init, fallback) {
  let res: Response;
  try {
    res = await apiFetch(input, init);
  } catch {
    return { ok: false, data: fallback };
  }
  // ...existing parse logic...
}
```

**Cross-agent agreement:** 4 agents flagged this. HIGH confidence.

---

### AGG-3: [MEDIUM] Ungated console.error in error boundaries

**Sources:** C33-SR-1, C33-CT-2 | **Confidence:** HIGH
**Files:**
- `src/app/(dashboard)/dashboard/admin/error.tsx:19`
- `src/app/(public)/problems/error.tsx:20`
- `src/app/(public)/groups/error.tsx:20`
- `src/app/(public)/contests/manage/error.tsx:22`

Error boundary components have `console.error` calls that are NOT gated behind `process.env.NODE_ENV === "development"`. In production, these could leak internal error details including Next.js digest hashes.

**Fix:** Gate all error boundary console.error calls:
```typescript
if (process.env.NODE_ENV === "development") {
  console.error("[problems-error-boundary]", error);
}
```

---

### AGG-4: [LOW] export-button missing request cancellation

**Sources:** C33-CR-3, C33-DB-3 | **Confidence:** MEDIUM
**File:** `src/components/contest/export-button.tsx:14-43`

Large contest exports could take significant time. There is no AbortController to cancel in-flight requests if the user navigates away or clicks the other export button.

**Fix:** Add AbortController support and revoke blob URL properly.

---

### AGG-5: [LOW] contests layout queries DOM elements that may not exist

**Sources:** C33-CR-4, C33-AR-2 | **Confidence:** MEDIUM
**File:** `src/app/(public)/contests/manage/layout.tsx:42-45`

The layout queries `document.getElementById("main-content")` and `document.querySelector("[data-slot='sidebar']")` in useEffect. These elements may not exist during initial render. The TODO lacks an upstream issue link for tracking removal.

**Fix:** Add null checks and specific GitHub issue reference in TODO.

---

### AGG-6: [LOW] sign-out storage iteration race condition

**Sources:** C33-CR-5, C33-DB-4, C33-TR-2 | **Confidence:** LOW
**File:** `src/lib/auth/sign-out.ts:37-44`

The for loop iterates over `window.localStorage.length` and accesses `key(i)`. If another tab modifies localStorage during iteration, indices shift and some keys may be skipped.

**Fix:** Snapshot keys first:
```typescript
const keys = Array.from({ length: window.localStorage.length }, (_, i) =>
  window.localStorage.key(i)
).filter((k): k is string => k !== null);
```

---

### AGG-7: [LOW] Test coverage gaps for timer/async components

**Sources:** C33-TE-1, C33-TE-2, C33-TE-3 | **Confidence:** MEDIUM

- `submission-list-auto-refresh.tsx`: no tests for timer logic, backoff, cleanup
- `export-button.tsx`: no tests for blob download, filename extraction
- `apiFetchJson`: no tests for network failures, non-JSON responses

**Fix:** Add unit tests for these components.

---

## Previously Fixed Findings (none this cycle — working tree was clean)

## Carried Deferred Items (unchanged)

- C-1: Test/Seed localhost check spoofable — CRITICAL
- C-2: Accepted solutions endpoint unauthenticated — CRITICAL
- C-3: File DELETE CSRF ordering — CRITICAL
- H-1: SSE result visibility bypass — HIGH
- H-2: Problem-Set PATCH bypasses createApiHandler — HIGH
- H-3: Overrides route doesn't use createApiHandler — HIGH
- H-4: In-memory rate limiter for judge claims — HIGH
- H-5: Accepted solutions exposes userId for anonymous — HIGH
- DEFER-C30-4: `.json()` before `.ok` in non-critical components — MEDIUM
- DEFER-C30-5: Raw API error strings without i18n — MEDIUM
- DEFER-C30-6: `as { error?: string }` unsafe type assertions — MEDIUM

## No Agent Failures

All review agents completed successfully.
