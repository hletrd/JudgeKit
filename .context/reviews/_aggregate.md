# Aggregate Review — Cycle 36

**Date:** 2026-05-10
**Reviewers:** comprehensive-reviewer (single-agent review)
**Total findings:** 0 new (0 HIGH, 0 MEDIUM, 0 LOW) + 0 false positives + previously deferred items re-validated

---

## Deduplicated Findings

No new findings in this cycle.

---

## Verified Fixes from Prior Cycles

### Cycle 35 — All Fixed

| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| AGG-1: parseFloat() || null treats 0 as falsy | MEDIUM | FIXED | `create-problem-form.tsx:427-429` |
| AGG-2: Tags PATCH missing updatedAt | LOW | FIXED | `schema.pg.ts:1073-1074`, `tags/[id]/route.ts:28` |
| AGG-3: SUBMISSION_GLOBAL_QUEUE_LIMIT || pattern | LOW | FIXED | `constants.ts:27-30` |
| AGG-4: group-instructors-manager raw log | LOW | VERIFIED | Already properly gated |

### Cycle 32 — All Fixed

| Finding | Severity | Status | Location |
|---------|----------|--------|----------|
| C32-1: SSE parser controller.close() after error() | MEDIUM | FIXED | `providers.ts:491-497` |
| C32-2: maxTokens || fallback | LOW | FIXED | `auto-review.ts:186` |

### Cycle 33 — All Fixed

All 6 cycle-33 findings verified as fixed. See `plans/closed/2026-05-10-cycle-33-review-remediation.md` for details.

---

## Carried Deferred Items (unchanged from cycle 35)

### CRITICAL (requires architecture/product decision)
- **C-1**: Test/Seed localhost check spoofable
- **C-2**: Accepted solutions endpoint unauthenticated
- **C-3**: File DELETE CSRF ordering

### HIGH
- **H-1**: SSE result visibility bypass
- **H-2**: Problem-Set PATCH bypasses createApiHandler
- **H-3**: Overrides route doesn't use createApiHandler
- **H-4**: In-memory rate limiter for judge claims
- **H-5**: Accepted solutions exposes userId for anonymous

### MEDIUM
- **DEFER-C30-4**: `.json()` before `.ok` in non-critical components (30+ files)
- **DEFER-C30-5**: Raw API error strings without i18n (ongoing incremental)
- **DEFER-C30-6**: `as { error?: string }` unsafe type assertions (15 instances)
- **C29 AGG-10**: Admin routes bypass createApiHandler (partially fixed)
- **C29 AGG-12**: Recruiting validate endpoint token brute-force

### LOW
- **DEFER-27**: Missing AbortController on polling fetches
- **DEFER-34**: Hardcoded English fallback strings
- **DEFER-35**: Hardcoded English strings in editor title attributes
- **DEFER-36**: `formData.get()` cast assertions without validation
- **C25-6**: Client-side console.error (8 remaining instances)
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
4. **Anti-cheat monitor** correctly gates heartbeat on document visibility after recent fix.
5. **API handler factory** consistently applies auth, CSRF, rate limiting, and Zod validation.

## Correctness Observations (No New Issues)

1. **Timer cleanup**: All examined components properly clear timers and event listeners on unmount.
2. **Error handling**: `apiFetchJson` now correctly catches network errors (fetch throwing) since cycle 33 fix.
3. **Type safety**: No new unsafe type assertions found beyond previously deferred items.
4. **React patterns**: `React.cache()` usage is correct for React 19. Ref patterns in anti-cheat monitor are sound.

## Performance Observations (No New Issues)

1. **No memory leaks detected**: All refs with timers/event listeners have proper cleanup.
2. **Fetch patterns**: External API calls use `AbortSignal.timeout()`. Internal calls use `apiFetch` with 30s timeout.
3. **DB queries**: The `getDbNow()` cache deduplicates DB time queries within a single render.
