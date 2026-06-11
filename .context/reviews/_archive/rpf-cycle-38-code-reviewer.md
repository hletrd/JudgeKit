# Code Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** code-reviewer
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/` — Single, bulk, PATCH, stats routes
- `src/app/api/v1/contests/quick-create/route.ts` — Quick-create route
- `src/app/api/v1/admin/api-keys/` — Create, update, list routes
- `src/lib/assignments/recruiting-invitations.ts` — Core invitation logic
- `src/lib/assignments/recruiting-constants.ts` — Shared constants
- `src/lib/realtime/realtime-coordination.ts` — SSE shared coordination
- `src/lib/plugins/chat-widget/chat-widget.tsx` — Chat widget component
- `src/lib/security/password-hash.ts` — Password hashing utilities
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events route
- `src/components/exam/anti-cheat-monitor.tsx` — Anti-cheat monitoring
- `src/components/exam/countdown-timer.tsx` — Exam countdown timer
- `src/lib/data-retention-maintenance.ts` — Data pruning
- `src/lib/db/import.ts` — Database import engine
- `src/lib/recruiting/access.ts` — Recruiting access context
- `src/components/seo/json-ld.tsx` — JSON-LD structured data

## Findings

### CR-1: Bulk invitation duplicate email check is case-sensitive — inconsistent with single route [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:41-49`

**Description:** The bulk invitation route checks for duplicate emails using `inArray(recruitingInvitations.candidateEmail, orderedEmails)`. The `orderedEmails` array contains lowercased emails (line 21-23), but the DB comparison uses the raw `candidateEmail` column without `lower()`. The single invitation route (line 46-57 in `[assignmentId]/route.ts`) correctly uses `sql\`lower(${recruitingInvitations.candidateEmail}) = ${normalizedEmail}\`` for case-insensitive matching.

This means if an invitation already exists with email "User@Example.COM" and a bulk request includes "user@example.com", the bulk route will NOT detect the duplicate. Two invitations will be created for what is functionally the same email address.

**Concrete failure scenario:** An instructor bulk-creates invitations for 50 candidates. One candidate, "Alice@University.edu", already has a pending invitation from a previous single-create with email "alice@university.edu". The bulk route does not detect the duplicate because `inArray` does a case-sensitive match. Alice receives two invitations with different casing — confusing the candidate and creating data inconsistency.

**Fix:** Use a case-insensitive query for the bulk duplicate check:
```typescript
if (orderedEmails.length > 0) {
  const existing = await tx
    .select({ email: sql<string>`lower(${recruitingInvitations.candidateEmail})` })
    .from(recruitingInvitations)
    .where(
      and(
        eq(recruitingInvitations.assignmentId, assignmentId),
        sql`lower(${recruitingInvitations.candidateEmail}) = ANY(${orderedEmails})`
      )
    );
  if (existing.length > 0) {
    throw new Error("emailAlreadyInvited");
  }
}
```

Or more portably, use `inArray` with a `lower()` expression:
```typescript
sql`lower(${recruitingInvitations.candidateEmail}) IN (${sql.join(orderedEmails.map(e => sql`${e}`), sql`, `)})`
```

**Confidence:** High

---

### CR-2: `expiryDays * 86400000` day-conversion arithmetic duplicated across 5 route files — DRY violation [LOW/MEDIUM]

**Files:**
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:72`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:112`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:61`
- `src/app/api/v1/admin/api-keys/route.ts:78`
- `src/app/api/v1/admin/api-keys/[id]/route.ts:61`

**Description:** The `new Date(dbNow.getTime() + expiryDays * 86400000)` pattern appears identically in 5 route files. While `MAX_EXPIRY_MS` was extracted to `recruiting-constants.ts` in cycle 37, the day-to-millisecond conversion is still duplicated. If the conversion ever needs adjustment (e.g., for calendar-day precision with DST), all 5 sites must be updated in lockstep.

**Concrete failure scenario:** A developer adds a new route that computes expiresAt from expiryDays but uses `86400 * 1000` instead of `86400000` (different whitespace/formatting). A linter or reviewer might not catch the duplication. The risk is low but the DRY fix is straightforward.

**Fix:** Extract a shared helper in `recruiting-constants.ts` (or a new `date-utils.ts`):
```typescript
export function computeExpiryFromDays(baseDate: Date, expiryDays: number): Date {
  return new Date(baseDate.getTime() + expiryDays * 86400000);
}
```

**Confidence:** Medium

---

### CR-3: Chat widget error messages lack ARIA role for screen reader announcement [LOW/MEDIUM]

**File:** `src/lib/plugins/chat-widget/chat-widget.tsx:353-356`

**Description:** The error message div renders `text-destructive` styled text but has no ARIA role. Screen readers will not announce the error when it appears. The messages container already has `role="log"` (line 320) but the error div is outside the message flow — it appears after the messages.

**Concrete failure scenario:** A visually impaired user sends a message that fails (rate limit, network error). The error text is visible on screen but the screen reader does not announce it. The user thinks their message is still processing and waits indefinitely.

**Fix:** Add `role="alert"` to the error div:
```tsx
<div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
  {error}
</div>
```

**Confidence:** High

---

## Previously Found Items (Still Present, Not New)

- Console.error in client components (deferred)
- SSE O(n) eviction scan (deferred)
- Manual routes duplicate createApiHandler boilerplate (deferred)
- Global timer HMR pattern duplication (deferred)
- Docker build error leaks paths (deferred)
