# Aggregate Review — Cycle 34

**Date:** 2026-05-10
**Cycle:** 34 of 100
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, test-engineer, architect, debugger, verifier, critic, tracer, document-specialist
**Total findings:** 3 new (2 MEDIUM, 1 LOW) + 8 deferred items re-validated

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] `apiFetchJson` silently swallows JSON parse failures in development

**Sources:** C34-CR-1, C34-SR-1, C34-DB-3, C34-VR-1, C34-CT-1, C34-TR-2, C34-DS-1 | **Confidence:** HIGH
**File:** `src/lib/api/client.ts:138-144`

When `res.json()` throws (non-JSON body, malformed JSON), `apiFetchJson` silently catches the error and returns the fallback value. In development, this makes debugging impossible — developers cannot distinguish between network errors, server misconfigurations returning HTML, or actual data issues.

**Failure scenario:** A new API endpoint accidentally returns HTML due to middleware misconfiguration. The client shows fallback data with no indication of what went wrong. Developer wastes time debugging client-side state when the issue is server-side.

**Fix:** Add development-only warning:
```typescript
} catch {
  if (process.env.NODE_ENV === "development") {
    console.warn("apiFetchJson: JSON parse failed for", input, "status:", res.status);
  }
  data = fallback;
}
```

**Cross-agent agreement:** 7 agents flagged this. HIGH confidence.

---

### AGG-2: [MEDIUM] Rate limit eviction timer has no cleanup function

**Sources:** C34-CR-2, C34-PR-1, C34-TE-1, C34-AR-1, C34-DB-1, C34-VR-2, C34-CT-2, C34-TR-1, C34-DS-2 | **Confidence:** HIGH
**File:** `src/lib/security/rate-limit.ts:68-80`

`startRateLimitEviction()` creates a `setInterval` stored in a module-level variable with no corresponding stop function. This causes open handle warnings in test environments and prevents clean process shutdown.

**Failure scenario:** Vitest runs with `--detectOpenHandles` and reports an unref'd timer originating from rate-limit.ts. CI fails or developers ignore the warning, masking real leaks.

**Fix:** Export `stopRateLimitEviction()`:
```typescript
export function stopRateLimitEviction() {
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}
```

**Cross-agent agreement:** 9 agents flagged this. HIGH confidence.

---

### AGG-3: [LOW] `anti-cheat-monitor` heartbeat reschedules while tab is hidden

**Sources:** C34-PR-2, C34-VR-3, C34-CT-3, C34-DS-3 | **Confidence:** MEDIUM
**File:** `src/components/exam/anti-cheat-monitor.tsx:185-191`

The heartbeat timer callback skips sending events when the document is hidden, but unconditionally calls `scheduleHeartbeat()` to reschedule. Over an 8-hour hidden tab, this creates ~960 no-op timer callbacks.

**Failure scenario:** Student opens exam, switches to research reference material, leaves tab hidden for hours. Heartbeat timers accumulate unnecessarily. Low impact but wasteful.

**Fix:** Gate reschedule on visibility:
```typescript
if (document.visibilityState === "visible") {
  await reportEventRef.current("heartbeat");
}
if (document.visibilityState === "visible") {
  scheduleHeartbeat();
}
```

**Cross-agent agreement:** 4 agents flagged this. MEDIUM confidence.

---

## Previously Fixed Findings (cycles 30-33)

- C33-AGG-1 (timer leak): **FIXED** — `mountedRef` guard in submission-list-auto-refresh
- C33-AGG-2 (apiFetchJson fetch throw): **FIXED** — try/catch around `apiFetch` call
- C33-AGG-3 (ungated console.error): **FIXED** — all error boundaries gated behind `NODE_ENV === "development"`
- C33-AGG-4 (export-button AbortController): **FIXED** — `abortRef` and `blobUrlRef` with cleanup
- C33-AGG-5 (contests layout TODO): **FIXED** — upstream issue link added
- C33-AGG-6 (sign-out race condition): **FIXED** — keys snapshotted before iteration

## Carried Deferred Items (re-validated)

- C-1: Test/Seed localhost check spoofable — **STILL PRESENT** — CRITICAL (X-Forwarded-For processing allows spoofing with TRUSTED_PROXY_HOPS=1)
- C-2: Accepted solutions endpoint unauthenticated — **FIXED** — requires `auth: true`
- C-3: File DELETE CSRF ordering — **FIXED** — auth before CSRF with API key bypass
- H-1: SSE result visibility bypass — Needs re-check (no SSE routes found in current scan)
- H-2: Problem-Set PATCH bypasses createApiHandler — **FIXED** — uses `createApiHandler`
- H-3: Overrides route doesn't use createApiHandler — Needs re-check
- H-4: In-memory rate limiter for judge claims — **FIXED** — DB-backed only
- H-5: Accepted solutions exposes userId for anonymous — **FIXED** — properly anonymizes
- DEFER-C30-4: `.json()` before `.ok` in non-critical components — Still present in docker client but wrapped in try/catch (safe)
- DEFER-C30-5: Raw API error strings without i18n — Still present in many client components
- DEFER-C30-6: `as { error?: string }` unsafe type assertions — Still present in ~15 instances

## No Agent Failures

All review agents completed successfully.
