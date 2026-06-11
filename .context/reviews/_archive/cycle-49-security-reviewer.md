# Cycle 49 — Security Reviewer

**Date:** 2026-05-12
**HEAD reviewed:** `17a35892`
**Scope:** Security analysis of all changes since cycle 48

---

## Findings

### C49-SEC-1: [MEDIUM] `judge/claim/route.ts` — orphaned queued submissions enable claim-loop DoS

**File:** `src/app/api/v1/judge/claim/route.ts:329-331`
**Confidence:** HIGH

When a claimed submission references a deleted problem, the route returns 422 but leaves the submission in `status = 'queued'`. This means:

1. The submission will be re-claimed when the stale claim timeout expires
2. Each re-claim consumes worker capacity (bumps `active_tasks` then fails to decrement it — the decrement only happens on successful `/poll`)
3. A malicious actor could potentially exploit this by submitting to problems they know will be deleted
4. Even without malice, accidental problem deletion creates a resource leak on workers

**Severity:** MEDIUM. Not directly exploitable for data breach, but creates a DoS vector against worker capacity and pollutes the queue with permanently-failing submissions.

**Fix:** Reset submission to `pending` and clear claim fields before returning 422. See C49-CODE-1 for code fix.

---

### C49-SEC-2: [LOW] `submissions/[id]/page.tsx` — instructor access check uses `session.user.role ?? "user"` fallback

**File:** `src/app/(public)/submissions/[id]/page.tsx:87-93`
**Confidence:** MEDIUM

```typescript
canViewAsInstructor = await canViewAssignmentSubmissions(
  submission.assignmentId,
  session.user.id,
  session.user.role ?? "user"
);
```

The `?? "user"` fallback means if `session.user.role` is somehow undefined, the user gets the least-privileged role. This is defensive but could mask a token/session integrity issue. The `canViewAssignmentSubmissions` function should handle null/undefined role robustly regardless.

**Fix:** Remove the `?? "user"` fallback and let `canViewAssignmentSubmissions` handle the undefined case explicitly. Or assert that role is always present for authenticated sessions.

---

### C49-SEC-3: [LOW] `participant-timeline-bar.tsx` — event markers expose submission IDs in DOM

**File:** `src/components/contest/participant-timeline-bar.tsx:206-211`
**Confidence:** LOW

Submission IDs appear in `href` attributes on timeline event markers. While submission IDs are not sensitive cryptographic material (they're nanoid-based), exposing them in the DOM could facilitate enumeration if combined with other vulnerabilities.

**Risk assessment:** LOW. Submission IDs are already visible in public URLs (`/submissions/{id}`). This is not a new exposure vector.

---

## No New HIGH Security Findings

All HIGH-severity security findings from prior cycles remain addressed. No new SQL injection, XSS, auth bypass, or secret leakage detected in the changed code.

## Verified Security Posture

- `dangerouslySetInnerHTML` usages remain wrapped with `sanitizeHtml` or `safeJsonForScript`
- No `eval()` or `new Function()` patterns found
- No `@ts-ignore` suppressions found
- Rate limiting active on all API endpoints
- Advisory lock serialization prevents race conditions in submission creation
- Zod schema validation added to judge claim response (prevents type confusion attacks)

---

## No Agent Failures

Single-agent comprehensive review (subagent fan-out unavailable).
