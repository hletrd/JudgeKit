# RPF Cycle 15 Review Remediation Plan

**Date:** 2026-04-20
**Source:** `.context/reviews/rpf-15-aggregate.md` and per-agent review files

---

## Scope

This cycle addresses the new rpf-15 findings from the multi-agent review:
- AGG-1: Recruiting invitation `expiryDate` lacks upper-bound validation [MEDIUM/HIGH]
- AGG-2: Duplicate `getDbNowUncached()` call in recruiting invitation creation route [LOW/MEDIUM]
- AGG-3: `handleCopyLink` in recruiting invitations panel lacks error handling [LOW/MEDIUM]
- AGG-4: Copy-feedback timer not cleaned up on unmount in recruiting invitations panel [LOW/LOW]
- AGG-5: Recruiting invitations custom date picker lacks timezone hint [LOW/MEDIUM]
- AGG-6: `streamBackupWithFiles` buffers entire export in memory (carry from rpf-13, rpf-14) [MEDIUM/HIGH]
- AGG-7: `streamBackupWithFiles` JSDoc does not document `dbNow` parameter [LOW/LOW]

Plus the user-injected architectural directive: incremental progress on workspace-to-public migration.

No rpf-15 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Add upper-bound validation for recruiting invitation `expiryDate` (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/validators/recruiting-invitations.ts:10`, `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:72-79`
- **Problem:** The `expiryDate` field only validates format (`YYYY-MM-DD`) with no upper bound. While `expiryDays` is constrained to `max(3650)`, a client can send `expiryDate: "2099-12-31"` to create an invitation that never expires. 6 of 11 agents flagged this.
- **Plan:**
  1. In `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`, after computing `expiresAt` from `expiryDate`, add an upper-bound check:
     ```typescript
     const MAX_EXPIRY_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;
     if (expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS) {
       return apiError("expiryDateTooFar", 400);
     }
     ```
  2. Apply the same check in `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts` (PATCH endpoint)
  3. Apply the same check in `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts`
  4. Add i18n key for `expiryDateTooFar` error message
  5. Add test case for far-future `expiryDate` (e.g., "2099-12-31" → 400)
  6. Add test case for date within 10-year limit (e.g., today + 1 year → 201)
  7. Verify tsc --noEmit passes
  8. Verify existing tests pass
- **Status:** DONE

### H2: Consolidate duplicate `getDbNowUncached()` in recruiting invitation routes (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`
- **Problem:** The `expiryDays` and `expiryDate` branches each call `getDbNowUncached()` independently. Should be fetched once before the branching logic, consistent with the API keys route and bulk route. 7 of 11 agents flagged this.
- **Plan:**
  1. In `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`, move `getDbNowUncached()` call before the if/else block and reuse the result in both branches
  2. Verify the same pattern is correct in the PATCH endpoint (`[invitationId]/route.ts`) — it already fetches once (line 109)
  3. Verify the bulk route already fetches once (line 29) — confirmed correct
  4. Verify tsc --noEmit passes
  5. Verify existing tests pass
- **Status:** DONE

### M1: Add error handling to `handleCopyLink` in recruiting invitations panel (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:197-203`
- **Problem:** `navigator.clipboard.writeText()` can throw but is not wrapped in try/catch. Other clipboard operations in the codebase (API keys client, access-code-manager) use try/catch. 3 of 11 agents flagged this.
- **Plan:**
  1. Wrap `navigator.clipboard.writeText(url)` in try/catch
  2. On failure, show error toast (consistent with API keys client pattern)
  3. Verify the copy functionality still works
- **Status:** DONE

### M2: Track copy-feedback timer with ref in recruiting invitations panel (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:201`
- **Problem:** The `setTimeout` for resetting `copiedId` is not tracked or cleaned up on unmount. The API keys client correctly uses refs. 3 of 11 agents flagged this.
- **Plan:**
  1. Add a `copiedKeyIdTimer` ref similar to API keys client
  2. Track the timeout with the ref
  3. Add cleanup in the existing `useEffect` (or create a new one for the timer)
  4. Verify no state leak on unmount
- **Status:** DONE

### M3: Add timezone hint to custom expiry date picker (AGG-5)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:381-388`
- **Problem:** The custom expiry date picker has no indication that the date will be interpreted as end-of-day UTC. Admins in different timezones may set unintended expiry times.
- **Plan:**
  1. Add a `<p className="text-xs text-muted-foreground">` hint below the date picker
  2. Add i18n key `expiryDateUtcHint` with value like "Expires at end of day (UTC)"
  3. Verify the hint renders correctly in both English and Korean
- **Status:** DONE

### L1: Update `streamBackupWithFiles` JSDoc to document `dbNow` parameter (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/db/export-with-files.ts:112`
- **Problem:** The `dbNow` parameter was added in rpf-13 but JSDoc was not updated.
- **Plan:**
  1. Add `@param dbNow` to the JSDoc of `streamBackupWithFiles`
- **Status:** PENDING

---

## Workspace-to-public migration (user-injected directive)

### W1: Auth-aware public pages — add "Edit" affordances on problem detail pages

- **Source:** User-injected workspace-to-public-migration.md (Phase 4, item 1)
- **Priority:** MEDIUM
- **Problem:** Public pages like `/practice/problems/[id]` do not show any auth-specific UI. When an instructor is logged in, they should see an "Edit" button or similar affordance linking to `/dashboard/problems/[id]/edit`.
- **Plan:**
  1. In `src/app/(public)/practice/problems/[id]/page.tsx`, check for session and capabilities
  2. If the user has `problems.create` capability, render an "Edit" link/button pointing to `/dashboard/problems/[id]/edit`
  3. Style consistently with existing UI patterns
  4. Verify Korean text does not use custom letter-spacing
- **Status:** DONE

---

## Deferred items

### DEFER-1: Audit events failure tracker `new Date()` for `lastAuditEventWriteFailureAt` (carried from rpf-11)

- **Source:** AGG-4 (rpf-11)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/audit/events.ts:117`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Purely diagnostic output. Not used for comparison, access control, or data integrity. Replacing with `getDbNowUncached()` would require making the flush path async-aware.
- **Exit criterion:** When the audit events module is next refactored, or when a developer reports diagnostic timestamp confusion.

### DEFER-2: `streamBackupWithFiles` memory buffering architecture (AGG-6, carried from rpf-13, rpf-14)

- **Source:** AGG-6 (rpf-13, rpf-14, rpf-15)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/lib/db/export-with-files.ts:112-182`
- **Original severity preserved:** MEDIUM / HIGH
- **Reason for deferral:** Architectural limitation of JSZip (non-streaming). Migrating to a streaming ZIP library is a significant refactor. Current approach works for small/medium databases. Short-term mitigation (warning log for large exports) not yet implemented but also low urgency.
- **Exit criterion:** When a database reaches a size where memory pressure during backup becomes a production issue, or when a dedicated backup infrastructure cycle is scheduled.

### DEFER-3: Health endpoint timestamps using `new Date()` (carried from rpf-13)

- **Source:** CR-5, CR-6 (code-reviewer, rpf-13)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/ops/admin-health.ts:53`, `src/app/api/v1/health/route.ts:31`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Diagnostic timestamps that should reflect "when this health check ran" from the app server's perspective. Adding a DB round-trip to every health check is counterproductive.
- **Exit criterion:** When a monitoring system requires DB-synchronized health check timestamps.

### DEFER-4: `document.execCommand("copy")` deprecation (carried from rpf-14)

- **Source:** CR-7 (code-reviewer)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/code/copy-code-button.tsx:28`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:220`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** `document.execCommand("copy")` is deprecated but still functional in all major browsers. It's used only as a fallback when `navigator.clipboard.writeText()` fails. No browser has announced removal timeline yet.
- **Exit criterion:** When a major browser removes support for `document.execCommand("copy")`, or when a dedicated UI modernization cycle is scheduled.

### DEFER-5: Redundant `new Date()` in `database-backup-restore.tsx` fallback path (rpf-15, CR-5)

- **Source:** CR-5 (code-reviewer, rpf-15)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:60`
- **Original severity preserved:** LOW / LOW
- **Reason for deferral:** Only used as a fallback when the server-provided `Content-Disposition` filename is missing. In degraded mode, client-side timestamp is the best available option. The primary path correctly uses server-provided filename.
- **Exit criterion:** When the server always provides `Content-Disposition` headers (confirmed by removing the fallback path).

---

## Progress log

- 2026-04-20: Plan created from rpf-15 aggregate review. 7 findings, 6 scheduled for implementation (H1, H2, M1, M2, M3, L1), 1 carry-over deferred (AGG-6/DEFER-2). Plus 1 workspace-to-public migration item (W1). Previous DEFER-1, DEFER-3, DEFER-4 carried forward. New DEFER-5 added.
- 2026-04-20: All scheduled items implemented. H1 (expiryDate upper-bound), H2 (consolidate getDbNowUncached), M1 (clipboard error handling), M2 (timer cleanup), M3 (timezone hint), L1 (JSDoc), W1 (edit button). All gates green.
