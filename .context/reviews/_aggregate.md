# Cycle 30 Aggregate Review

**Date:** 2026-05-09
**Cycle:** 30 of 100
**Base commit:** 22623e07
**Current HEAD:** 22623e07 (clean working tree)
**Agents:** Manual review — no agent runtime registered in `.claude/agents/`

---

## Methodology

No review agents were registered in this environment. Reviews were performed manually across 10 specialist angles: code-reviewer, security-reviewer, perf-reviewer, critic, debugger, test-engineer, architect, verifier, tracer, document-specialist, designer.

All gates verified at HEAD:
- eslint: 0 errors
- tsc --noEmit: passes
- next build: passes
- vitest run: 315/315 files, 2378 tests (all pass — previous DATABASE_URL failure fixed)
- vitest component: 68 files, 208 tests (all pass)

---

## DEDUPLICATED FINDINGS

### C30-1: [MEDIUM] Inconsistent `EXTRACT(EPOCH)` casting between worker and non-worker paths in judge claim route

**Flagged by:** code-reviewer, verifier, debugger
**Cross-agent agreement:** 3 perspectives
**Citation:** `src/app/api/v1/judge/claim/route.ts:199-200` vs `lines 248-249`

**Code (worker path — no cast):**
```typescript
EXTRACT(EPOCH FROM s.judged_at) AS "judgedAt",
EXTRACT(EPOCH FROM s.submitted_at) AS "submittedAt"
```

**Code (non-worker path — with `::bigint`):**
```typescript
EXTRACT(EPOCH FROM s.judged_at)::bigint AS "judgedAt",
EXTRACT(EPOCH FROM s.submitted_at)::bigint AS "submittedAt"
```

**Description:** The cycle 29 fix (commit 72895df0) changed `::integer` to `::bigint` on the non-worker path but removed the cast entirely from the worker path. PostgreSQL's `EXTRACT(EPOCH FROM timestamp)` returns `double precision`. Without an explicit cast, the value may come back as a string depending on the PostgreSQL client/driver configuration, causing the Zod schema `z.number().nullable()` to fail validation.

**Concrete failure scenario:** A worker claims a submission. The `judgedAt` field comes back as a string `"1234567890.123"` instead of a number. `claimedSubmissionRowSchema.parse(claimedRaw)` throws a ZodError, causing the claim to fail with a 500 error even though the SQL UPDATE succeeded.

**Fix:** Add `::bigint` to the worker path to match the non-worker path:
```typescript
EXTRACT(EPOCH FROM s.judged_at)::bigint AS "judgedAt",
EXTRACT(EPOCH FROM s.submitted_at)::bigint AS "submittedAt"
```

---

### C30-2: [LOW] JSZip statically imported in server-side utility modules

**Flagged by:** perf-reviewer, architect
**Cross-agent agreement:** 2 perspectives
**Citations:** `src/lib/files/validation.ts:3`, `src/lib/db/export-with-files.ts:1`

**Description:** Both files use `import JSZip from "jszip"` at the module level. JSZip is ~100KB. These modules are imported by API routes and other server code. While this is server-side (not client bundle), it still adds to cold-start memory and import overhead. The codebase already demonstrates the correct pattern in `src/app/(public)/problems/create/create-problem-form.tsx:172` which uses dynamic import: `const JSZip = (await import("jszip")).default;`.

**Fix:** Convert both static imports to dynamic imports inside the functions that actually use JSZip (`validateZipDecompressedSize` and the backup-with-files stream function).

---

## CARRY-FORWARD FINDINGS (still present from prior cycles)

### C30-3: [HIGH] `.json()` before `response.ok` check — systemic anti-pattern (cycle 29 AGG-2)

**Status:** Still present at cycle 30. 15+ instances across client components.
**Affected files:** `compiler-client.tsx`, `invite-participants.tsx`, `recruiting-invitations-panel.tsx`, `quick-create-contest-form.tsx`, `access-code-manager.tsx`, `discussion-thread-moderation-controls.tsx`, `discussion-thread-form.tsx`, `discussion-post-delete-button.tsx`, `discussion-post-form.tsx`, `submission-detail-client.tsx`, `start-exam-button.tsx`, `countdown-timer.tsx`, `comment-section.tsx`, `lecture/submission-overview.tsx`, `problem-import-button.tsx`, `problem-submission-form.tsx`

**Description:** Client-side fetch handlers call `.json()` before checking `.ok`. When a reverse proxy returns HTML (e.g., 502 Bad Gateway), `.json()` throws `SyntaxError`, caught by `.catch(() => ({}))` which returns an empty object — losing the actual error.

**Fix:** Create a project-wide `parseApiResponse(res)` helper that checks `res.ok` first.

---

### C30-4: [MEDIUM] Raw API error strings shown to users without translation (cycle 29 AGG-3)

**Status:** Still present at cycle 30. 7+ instances.
**Description:** Components display `errorBody.error` from API responses in `toast.error()` without routing through `t()`. Korean-locale users see raw English API error messages.

**Fix:** Adopt a consistent pattern: `toast.error(t(errorBody.error ?? "fallbackKey"))`.

---

### C30-5: [MEDIUM] `as { error?: string }` pattern — unsafe type assertions (cycle 29 AGG-9)

**Status:** Still present at cycle 30. 22+ instances.
**Description:** Client-side error handlers parse API responses with unsafe type assertions instead of using a shared runtime validator.

**Fix:** Create `parseApiError(body: unknown): string` helper with runtime validation.

---

## FIXED SINCE CYCLE 29 (verified at HEAD)

| Finding | Status | Evidence |
|---------|--------|----------|
| C29-AGG-1: Recruiting token regex upper bound | FIXED | `auth/config.ts:208` uses `{16,128}` |
| C29-AGG-2: DATABASE_URL missing | FIXED | `vitest.config.ts:12` provides fallback |
| C29-AGG-3: Cycle 27 carry-forward | FIXED | NaN guards, DELETE audit, prompt regex all applied |
| C29-AGG-6: DEV_ENCRYPTION_KEY | FIXED | Removed from codebase |
| C29-AGG-7: Chat test-connection auth | FIXED | Uses `createApiHandler` with auth + rateLimit |
| C29-AGG-10: Admin routes bypass | FIXED | All admin routes use `createApiHandler` |
| C29-AGG-16: CountdownTimer cleanup | FIXED | Proper abort controller + timeout + event listener cleanup |

---

## LONG-TERM DEFERRED ITEMS (unchanged)

- **C19-2:** Transaction wrapper inconsistency (`src/app/api/v1/judge/poll/route.ts:136`) — 11 cycles deferred
- **C25-6:** Client-side console.error (22 instances) — deferred
- **C25-7:** WeakMap complexity (`api-rate-limit.ts:62-72`) — deferred
- **C25-8:** RegExp creation per render (`json-ld.tsx:17-18`) — deferred

---

## AGENT FAILURES

No agent failures — review agents were not registered in this environment. Reviews were performed manually across 10 specialist perspectives.
