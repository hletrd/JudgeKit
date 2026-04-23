# RPF Cycle 35 — Aggregate Review

**Date:** 2026-04-23
**Base commit:** 218a1a93
**Review artifacts:** rpf-cycle-35-code-reviewer.md, rpf-cycle-35-perf-reviewer.md, rpf-cycle-35-security-reviewer.md, rpf-cycle-35-architect.md, rpf-cycle-35-critic.md, rpf-cycle-35-verifier.md, rpf-cycle-35-debugger.md, rpf-cycle-35-test-engineer.md, rpf-cycle-35-tracer.md, rpf-cycle-35-designer.md, rpf-cycle-35-document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: Import route Sunset header date is in the past — false deprecation signal [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), critic (CRI-1), verifier (V-1)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/app/api/v1/admin/migrate/import/route.ts:183, 191`

**Description:** The `Sunset` header on the deprecated JSON body path reads `"Sat, 01 Nov 2025 00:00:00 GMT"`, which is over 5 months in the past. Per RFC 8594, a past Sunset date signals the endpoint has been retired, yet the route still accepts requests. This has security implications (the insecure password-in-JSON-body path remains active while signaling retirement), API contract implications (clients honoring RFC 8594 will stop using the endpoint), and monitoring implications (tools may exclude the endpoint from active checks).

**Concrete failure scenario:** A security audit tool flags the Sunset date as past and marks the endpoint as "retired," removing it from ongoing monitoring. Meanwhile, the JSON body path continues accepting passwords in plaintext, creating an unmonitored attack surface.

**Fix:** Update the Sunset date to a future date (e.g., `"Sat, 01 Nov 2026 00:00:00 GMT"`). If the JSON path should be removed now, remove it rather than setting a past Sunset date.

---

### AGG-2: Recruiting invitation NaN bypass — Invalid Date construction skips all validation [MEDIUM/MEDIUM]

**Flagged by:** security-reviewer (SEC-2), critic (CRI-2), verifier (V-2), debugger (DBG-1), tracer (TR-1)
**Signal strength:** 5 of 11 review perspectives

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:73-83`

**Description:** When `body.expiryDate` contains a time component (e.g., `"2026-01-01T00:00:00Z"`), `new Date(\`${body.expiryDate}T23:59:59Z\`)` produces `Invalid Date`. All subsequent numeric comparisons with NaN return false, bypassing both the "date in past" check (`expiresAt <= dbNow` → `NaN <= Date` → false) and the "too far future" check (`NaN > MAX_EXPIRY_MS` → false). The invitation is stored with an invalid/null expiry date, making it effectively never-expiring.

**Concrete failure scenario:** An attacker sends `expiryDate: "2026-01-01T00:00:00Z"`. The constructed Date is invalid, but validation checks are bypassed. The invitation is stored with no expiry, granting permanent access.

**Fix:** Add defense-in-depth after constructing the Date:
```typescript
if (expiresAt && !Number.isFinite(expiresAt.getTime())) {
  return apiError("invalidExpiryDate", 400);
}
```
Also consider adding strict YYYY-MM-DD format validation in the Zod schema.

---

### AGG-3: Contest stats query scans submissions table twice — unnecessary DB I/O [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-2), critic (CRI-4), verifier (V-3), tracer (TR-2)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/app/api/v1/contests/[assignmentId]/stats/route.ts:80-119`

**Description:** The `solved_problems` CTE independently scans the `submissions` table (with the same filters) instead of reusing the `user_best` CTE which already computed `MAX(score)` per user+problem. This doubles I/O and CPU cost for the stats query.

**Concrete failure scenario:** A contest with 500 participants and 10 problems generates ~5000 submissions. The stats endpoint scans all 5000 submissions twice, doubling query time from ~50ms to ~100ms.

**Fix:** Refactor `solved_problems` to reference `user_best`:
```sql
solved_problems AS (
  SELECT COUNT(DISTINCT ub.problem_id)::int AS solved_count
  FROM user_best ub
  INNER JOIN assignment_problems ap ON ap.assignment_id = @assignmentId AND ap.problem_id = ub.problem_id
  WHERE ROUND(ub.best_score, 2) >= ROUND(COALESCE(ap.points, 100), 2)
)
```

---

### AGG-4: Chat widget scrollToBottom uses isStreaming state instead of ref — inconsistent with sendMessage fix [LOW/LOW]

**Flagged by:** perf-reviewer (PERF-3), critic (CRI-3), designer (DES-2), tracer (TR-3)
**Signal strength:** 4 of 11 review perspectives

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:87-105`

**Description:** The cycle 34 fix correctly moved `isStreaming` to a ref for the `sendMessage` callback. However, `scrollToBottom` still depends on `isStreaming` from state and has it in its dependency array, causing unnecessary callback recreation and scroll effect re-subscription. This is inconsistent with the ref-based approach adopted for `sendMessage`.

**Fix:** Use `isStreamingRef.current` inside `scrollToBottom` and remove `isStreaming` from the dependency array.

---

### AGG-5: Console.error in client components instead of structured logging [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2, CR-3), architect (ARCH-3)
**Signal strength:** 3 of 11 review perspectives

**Files:** `src/components/discussions/*.tsx`, `src/app/(dashboard)/dashboard/groups/*.tsx`

**Description:** Multiple client components use `console.error` for error reporting instead of the structured `logger`. While client-side code cannot use the server-side logger directly, this creates a gap where client errors are invisible to the server-side observability pipeline.

**Fix:** Consider adding a lightweight client-side error reporting mechanism or ensuring API routes log enough context to reconstruct failures.

---

### AGG-6: SSE connection tracking O(n) eviction scan [LOW/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1), debugger (DBG-3)
**Signal strength:** 2 of 11 review perspectives

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`

**Description:** The eviction logic finds the oldest connection by scanning all entries, which is O(n). Under high connection churn near capacity, this adds latency. Additionally, the tracking map entries are not automatically removed when SSE connections close — they rely on the stale cleanup timer.

**Fix:** Use a sorted data structure or maintain a separate sorted index for efficient eviction. Ensure tracking entries are removed when `close()` is called (which already happens).

---

### AGG-7: Manual API routes duplicate createApiHandler boilerplate [MEDIUM/MEDIUM]

**Flagged by:** architect (ARCH-1)
**Signal strength:** 1 of 11 review perspectives

**Files:** `src/app/api/v1/admin/migrate/import/route.ts`, `src/app/api/v1/admin/restore/route.ts`

**Description:** The migrate/import and restore routes manually implement auth, CSRF, rate limiting, and error handling that `createApiHandler` already provides. The main reason they can't use `createApiHandler` is the multipart file upload path. This creates risk of missing security checks in new routes that follow the manual pattern.

**Fix:** Extend `createApiHandler` to support multipart file upload, or document the architectural decision for why these routes remain manual.

---

### AGG-8: Global timer HMR pattern duplicated across four modules [LOW/MEDIUM]

**Flagged by:** architect (ARCH-2)
**Signal strength:** 1 of 11 review perspectives

**Files:** SSE events route, audit events, rate-limit, data-retention-maintenance

**Description:** Four modules use the same `globalThis.__xxxTimer` pattern for HMR-safe timers, each with identical boilerplate (check exists, clear, create, unref). This is a DRY violation and there's no coordinated cleanup during graceful shutdown.

**Fix:** Extract a `createManagedInterval(fn, ms, globalKey)` utility.

---

## Carry-Over Items (Still Unfixed from Prior Cycles)

- **Prior AGG-6:** Chat widget scrolls on every streaming chunk (mitigated with rAF, may still need throttling)
- **DES-2 (carry-over):** Chat widget textarea lacks explicit `aria-label` (placeholder present as fallback)

## Deferred Items

| Finding | File+Line | Severity/Confidence | Reason for Deferral | Exit Criterion |
|---------|-----------|-------------------|--------------------|---------------|
| SEC-3: Anti-cheat copies user text content | `anti-cheat-monitor.tsx:206` | LOW/LOW | Privacy concern, not vulnerability; 80-char limit mitigates | Privacy audit or user complaint |
| SEC-4: Docker build error leaks paths | `docker/client.ts:169` | LOW/LOW | Only visible to admin users; Docker output is expected | Admin role permission review |
| CR-5: In-memory rate limiter eviction during iteration | `in-memory-rate-limit.ts:27-48` | LOW/LOW | Spec-safe; bounded by 10K cap | Performance profiling shows bottleneck |
| CR-6: Problem import client/server size limit mismatch | `problem-import-button.tsx:22` | LOW/MEDIUM | Server returns clear error message; no data loss | User confusion report |
| DOC-1: Import route lacks JSDoc for dual-path | `migrate/import/route.ts` | LOW/MEDIUM | Documentation-only; code comments present | Next documentation cycle |
| DOC-2: Stats endpoint docs don't mention query structure | `stats/route.ts` | LOW/LOW | Documentation-only | Next documentation cycle |
| DOC-3: Anti-cheat event types not documented | `anti-cheat/route.ts:19-26` | LOW/LOW | Documentation-only; code is self-explanatory | Next documentation cycle |
| DBG-2: Anti-cheat fire-and-forget heartbeat on mount | `anti-cheat-monitor.tsx:155` | LOW/MEDIUM | React refs handle cleanup; no unmount error observed | Race condition observed in production |
| TE-3: No test for contest stats edge cases | `stats/route.ts` | LOW/LOW | Functional correctness verified via manual testing | Next test coverage cycle |
