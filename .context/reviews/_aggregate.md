# Aggregate Review — Cycle 38

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review, subagent spawning unavailable)
**Total findings:** 1 new (0 HIGH, 0 MEDIUM, 1 LOW) + 0 false positives + previously deferred items re-validated

---

## Deduplicated Findings

### AGG-1: [LOW] Anti-cheat monitor heartbeat permanently stops after tab-switch cycle

**Sources:** comprehensive-reviewer-cycle-38 Finding 1 | **Confidence:** HIGH

`src/components/exam/anti-cheat-monitor.tsx:190-191` — The `scheduleHeartbeat` timer callback gates the reschedule on `document.visibilityState === "visible"`. When the tab is hidden and the timer fires, the callback completes without calling `scheduleHeartbeat()`. When the tab becomes visible again, `handleVisibilityChange` sends an immediate heartbeat but does not restart the timer. Result: ongoing heartbeats permanently stop after any tab-switch cycle.

**Concrete failure scenario:** Student starts exam, heartbeats begin every 30s. Student switches tabs. Upon return, an immediate heartbeat is sent, but no further heartbeats are ever sent. A 10-minute gap with no user actions produces zero heartbeats, which the anti-cheat dashboard interprets as a potential anomaly.

**Root cause:** The cycle-34 fix (commit 474ea82d "gate heartbeat reschedule on document visibility") prevented heartbeats while hidden but also prevented timer rescheduling. The visibility-change handler does not restart the timer.

**Fix:** Always call `scheduleHeartbeat()` at the end of the timer callback regardless of visibility state, while keeping the heartbeat-send gated on visibility:

```ts
heartbeatTimerRef.current = setTimeout(async () => {
  if (!isHeartbeatActiveRef.current) return;
  if (document.visibilityState === "visible") {
    await reportEventRef.current("heartbeat");
  }
  scheduleHeartbeat();  // always reschedule
}, HEARTBEAT_INTERVAL_MS);
```

---

## Verified Fixes from Prior Cycles

### Cycle 37 — All Fixed
| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| AGG-1: parseInt || default in quick-create-contest-form | MEDIUM | FIXED | `quick-create-contest-form.tsx:133,172` |
| AGG-2: parseFloat || 0 in assignment-form-dialog | MEDIUM | FIXED | `assignment-form-dialog.tsx:410,654,457` |
| AGG-3: Flaky public-seo-metadata test timeout | LOW | FIXED | `public-seo-metadata.test.ts:103` |
| AGG-4: parseInt || null in assignment-form-dialog | LOW | FIXED | `assignment-form-dialog.tsx:457` |

### Cycle 36 — All Fixed
| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| C36-1: Analytics route unhandled rejection chain | MEDIUM | FIXED | `analytics/route.ts` — async IIFE + defensive .catch() |
| C36-2: database-backup-restore.tsx raw console.error | LOW | FIXED | Structured error message |
| C36-3: Chat widget parseInt || default | LOW | FIXED | Number.isFinite pattern |
| C36-4: Role editor parseInt || 0 | LOW | FIXED | Number.isFinite pattern |
| C36-5: parseInt(diskUsage.usePercent) || 0 | LOW | FIXED | Number.isFinite pattern |
| C36-6: Exam-session GET examModeInvalid (400) | LOW | FIXED | Changed to notFound("ExamSession") |

### Cycle 35 — All Fixed
| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| AGG-1: parseFloat() || null treats 0 as falsy | MEDIUM | FIXED | `create-problem-form.tsx:427-429` |
| AGG-2: Tags PATCH missing updatedAt | LOW | FIXED | `schema.pg.ts:1073-1074`, `tags/[id]/route.ts:28` |
| AGG-3: SUBMISSION_GLOBAL_QUEUE_LIMIT || pattern | LOW | FIXED | `constants.ts:27-30` |
| AGG-4: group-instructors-manager raw log | LOW | VERIFIED | Already properly gated |

### Cycle 34 — All Fixed
| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| C34-*: apiFetchJson silent parse failures | MEDIUM | FIXED | `client.ts:143` — dev-only warning added |
| C34-*: Rate limit eviction timer leak | MEDIUM | FIXED | `rate-limit.ts:83-88` — stopRateLimitEviction exported |
| C34-*: Anti-cheat heartbeat reschedules while hidden | LOW | PARTIALLY FIXED | `anti-cheat-monitor.tsx:187-191` — visibility gated but introduced regression (see AGG-1 above) |

### Cycle 33 — All Fixed
| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| C33-CR-2: apiFetchJson fetch throw | MEDIUM | FIXED | `client.ts:132-135` |
| C33-CR-3: export-button AbortController | MEDIUM | FIXED | `export-button.tsx` |
| C33-CR-5: sign-out race condition | MEDIUM | FIXED | `sign-out.ts` |

### Cycle 32 — All Fixed
| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| C32-1: SSE parser controller.close() after error() | MEDIUM | FIXED | `providers.ts:491-497` |
| C32-2: maxTokens || fallback | LOW | FIXED | `auto-review.ts:186` |

---

## Carried Deferred Items (unchanged from cycle 37)

### CRITICAL (requires architecture/product decision)
- **C-1**: Test/Seed localhost check spoofable
- **C-2**: Accepted solutions endpoint unauthenticated
- **C-3**: File DELETE CSRF ordering

### HIGH
- **H-1**: SSE result visibility bypass
- **H-2**: Problem-Set PATCH bypasses createApiHandler — FIXED
- **H-3**: Overrides route doesn't use createApiHandler — FIXED
- **H-4**: In-memory rate limiter for judge claims — FIXED
- **H-5**: Accepted solutions exposes userId for anonymous — FIXED

### MEDIUM
- **DEFER-C30-4**: `.json()` before `.ok` in non-critical components (30+ files)
- **DEFER-C30-5**: Raw API error strings without i18n (ongoing incremental)
- **DEFER-C30-6**: `as { error?: string }` unsafe type assertions (15 instances)
- **C29 AGG-10**: Admin routes bypass createApiHandler (partially fixed, 15 routes remain)
- **C29 AGG-12**: Recruiting validate endpoint token brute-force (mitigated by rate limit + format validation)

### LOW
- **DEFER-27**: Missing AbortController on polling fetches
- **DEFER-34**: Hardcoded English fallback strings
- **DEFER-35**: Hardcoded English strings in editor title attributes
- **DEFER-36**: `formData.get()` cast assertions without validation
- **C25-6**: Client-side console.error (remaining instances)
- **C25-7**: WeakMap complexity in api-rate-limit.ts
- **C29 AGG-13**: files/[id] GET selects storedName
- **C29 AGG-14**: Admin settings exposes DB host/port
- **C29 AGG-15**: Missing error boundaries
- **C29 AGG-17**: Hardcoded English in throw new Error (permissions.ts)
- **C29 AGG-18**: Hardcoded English fallback strings in code-editor.tsx
- **C29 AGG-19**: formData.get() cast assertions without validation

---

## Agent Failures

No agent failures. Subagent spawning was unavailable in this environment; review was performed as a single comprehensive pass by the primary agent.

---

## Security Observations (No New Issues)

1. **File upload validation** remains strong: MIME whitelist + magic bytes + ZIP bomb protection + image processing.
2. **Judge claim route** properly implements IP allowlist, rate limiting, worker auth, atomic SQL claims.
3. **Docker client** has path traversal prevention and image reference validation.
4. **API handler factory** consistently applies auth, CSRF, rate limiting, and Zod validation.
5. **Recruiting token validation** uses bounded regex to prevent ReDoS.

## Correctness Observations (No New Issues)

1. **Timer cleanup**: All examined components properly clear timers and event listeners on unmount (except the anti-cheat heartbeat regression noted above).
2. **Error handling**: `apiFetchJson` now correctly catches network errors and logs parse failures in development.
3. **Type safety**: No new unsafe type assertions found beyond previously deferred items.
4. **React patterns**: Ref patterns in anti-cheat monitor are sound (with the noted heartbeat scheduling exception).

## Performance Observations (No New Issues)

1. **No memory leaks detected**: All refs with timers/event listeners have proper cleanup.
2. **Fetch patterns**: External API calls use `AbortSignal.timeout()`. Internal calls use `apiFetch` with 30s timeout.
3. **DB queries**: The `getDbNow()` cache deduplicates DB time queries within a single render.
4. **Rate limit eviction**: Now has proper lifecycle management with `stopRateLimitEviction()`.
