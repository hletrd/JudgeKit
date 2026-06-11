# Cycle 12 — Aggregate Review (2026-05-11)

**Date:** 2026-05-11
**HEAD reviewed:** `ecfa0b6c`
**Reviewers:** Code reviewer, perf reviewer, security reviewer, debugger, test engineer, architect, critic, verifier, tracer.
**Prior aggregate:** `_aggregate.md` (HEAD `b5008708`, cycle 11)

---

## Total deduplicated NEW findings (still applicable at HEAD `ecfa0b6c`)

**1 MEDIUM, 8 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C12-1 | MEDIUM | High | `src/lib/api/client.ts:97-98` | apiFetch leaks timeout signals when no caller signal provided |
| C12-2 | LOW | High | `src/hooks/use-submission-polling.ts:48,50,52,75,77,79,82,257` | normalizeSubmission still has unsafe `as` casts after cycle 11 fix |
| C12-3 | LOW | High | `src/components/exam/countdown-timer.tsx:89` | Unsafe `as` cast in syncTime JSON parse chain |
| C12-4 | LOW | High | `src/lib/compiler/execute.ts:567` | Unsafe `as` cast after JSON parse in compiler runner |
| C12-5 | LOW | High | `src/lib/db/import-transfer.ts:67,89` | Unsafe `JSON.parse(text) as T` casts in import functions |
| C12-6 | LOW | High | `src/lib/security/rate-limiter-client.ts:83,134,156` | Unsafe `as T` and `as Record<string,unknown>` casts after fetch |
| C12-7 | LOW | High | `src/lib/system-settings.ts:90,107,121` | Unsafe DB result casts bypass Drizzle type safety |
| C12-8 | LOW | High | `src/lib/system-settings-config.ts:147,173,180` | `as ConfiguredSettings` on spread default objects |
| C12-9 | LOW | Medium | `src/components/exam/countdown-timer.tsx:192-193` | Rapid visibility changes create redundant sync requests |

---

## Cross-Agent Agreement

**High signal (5+ agents agree):**
- C12-1 (apiFetch leak): flagged by code-reviewer, perf-reviewer, security-reviewer, debugger, architect, critic, verifier, tracer (8/9)
- C12-2 (remaining as casts): flagged by code-reviewer, security-reviewer, debugger, architect, critic, verifier, tracer (7/9)

**Medium signal (3-4 agents agree):**
- C12-3 through C12-8 (specific `as` cast instances): flagged by code-reviewer, security-reviewer, debugger (3/9)

---

## Resolved at current HEAD (verified by inspection)

- **C11-1 (cycle-11):** Dead `staggeredTimerIdsRef` — fixed. Removed from countdown-timer.tsx.
- **C11-2 (cycle-11):** Redundant `as string` cast in SSE handler — fixed. Replaced with runtime narrowing.
- **C11-3 (cycle-11):** Unsafe `as Record<string, unknown>` casts in normalizeSubmission — PARTIALLY fixed. Some casts remain (see C12-2).
- **C11-4 (cycle-11):** `lastAuditEventWriteFailureAt` uses app time — fixed. Now accepts optional `dbNow`.

All prior cycle fixes verified intact at HEAD.

---

## Carry-forward DEFERRED items (status verified at HEAD `ecfa0b6c`)

All deferred items from cycle-11 aggregate remain applicable. See `_aggregate.md` for full list.

No HIGH findings deferred. No security/correctness/data-loss findings deferred without exit criteria.

---

## Agent Failures

None. All 9 review perspectives completed (code-reviewer, perf-reviewer, security-reviewer, debugger, test-engineer, architect, critic, verifier, tracer). Designer and document-specialist did not find new issues this cycle.
