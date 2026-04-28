# Document Specialist Review — Cycle 1 (New Session)

**Reviewer:** document-specialist
**Date:** 2026-04-28
**Scope:** Doc/code mismatches against authoritative sources

---

## Findings

### DOC-1: [LOW] `ContestDetailLayout` comments reference Next.js 16 bug without upstream issue link

**File:** `src/app/(public)/contests/[id]/layout.tsx:7-9`

The comment says:
```
Next.js 16 RSC streaming bug: Host/X-Forwarded-Host headers from nginx
corrupt RSC payloads during client-side navigation on contest routes.
```

There is no link to the upstream Next.js issue or GitHub discussion. This makes it difficult to track when the bug is fixed.

**Fix:** Add a link to the upstream issue (if filed) or note that the issue needs to be filed/reported.

---

### DOC-2: [LOW] `assignmentContext` type comment does not explain why `examDurationMinutes` is missing

**File:** `src/app/(public)/practice/problems/[id]/page.tsx:152-162`

The `assignmentContext` type definition does not include `examDurationMinutes`, but there is no comment explaining the omission. This makes it appear intentional rather than an oversight.

**Fix:** If the omission is a bug (as confirmed by other reviewers), add `examDurationMinutes` to the type. If it was intentional, add a comment explaining why.

---

### DOC-3: [INFO] Anti-cheat monitor comments are accurate

**File:** `src/components/exam/anti-cheat-monitor.tsx`

The code comments accurately describe the retry logic, backoff calculation, and design decisions. The `describeElement` function has a clear comment explaining why text content is not captured. No doc/code mismatches found.

---

### DOC-4: [INFO] SSE connection tracking comments are accurate

**File:** `src/app/api/v1/submissions/[id]/events/route.ts`

The comments accurately describe the two-phase eviction strategy, the atomic guard flag for HMR, and the cleanup timer behavior. No doc/code mismatches found.
