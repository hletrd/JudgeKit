# RPF Cycle 16 — Code Reviewer

**Date:** 2026-04-20
**Base commit:** 58da97b7

## Findings

### CR-1: Bulk recruiting invitations route missing `expiryDateInPast` validation [MEDIUM/HIGH]

- **File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:62-68`
- **Description:** The bulk invitations route computes `expiresAt` from `expiryDate` and checks the upper bound (`expiryDateTooFar`) but does NOT check whether the date is in the past. The single-create route (line 78-79) and the PATCH route (line 115-116) both have `if (expiresAt <= dbNow) throw new Error("expiryDateInPast")`. The bulk route omits this check.
- **Concrete failure scenario:** An admin sends a bulk create with `expiryDate: "2020-01-01"`. The server computes `expiresAt = new Date("2020-01-01T23:59:59Z")`, which is in the past. The invitation is immediately expired upon creation, which is nonsensical and likely a user error.
- **Fix:** Add `if (expiresAt <= dbNow) throw new Error("expiryDateInPast");` after line 63 (before the `expiryDateTooFar` check).
- **Confidence:** HIGH

### CR-2: `workers-client.tsx` copyToClipboard lacks try/catch [LOW/MEDIUM]

- **File:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:168-171`
- **Description:** The `copyToClipboard` function calls `navigator.clipboard.writeText(text)` without try/catch. If the clipboard API is unavailable or permission is denied, the promise rejection is unhandled and the success toast still fires on the next line.
- **Concrete failure scenario:** User on HTTP (non-HTTPS) context clicks "Copy". The clipboard API throws, causing an unhandled promise rejection. The toast still shows "Copied" (incorrectly).
- **Fix:** Wrap in try/catch; show error toast on failure.
- **Confidence:** HIGH

### CR-3: `file-management-client.tsx` copyUrl lacks try/catch and timer cleanup [LOW/MEDIUM]

- **File:** `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:90-96`
- **Description:** `copyUrl` function calls `navigator.clipboard.writeText(url)` without try/catch (can throw in insecure contexts). Also, the `setTimeout(() => setCopiedId(null), 2000)` at line 95 is not tracked by a ref and not cleaned up on unmount. The same patterns were fixed in `recruiting-invitations-panel.tsx` (M1 and M2 from rpf-15) but `file-management-client.tsx` was missed.
- **Concrete failure scenario:** (1) Clipboard failure on HTTP context causes unhandled rejection. (2) Component unmounts during the 2-second timeout, setting state on an unmounted component.
- **Fix:** Wrap clipboard in try/catch with error toast. Track timeout with ref and clean up in useEffect.
- **Confidence:** HIGH

### CR-4: `recruiting-invitations-panel.tsx` created-link copy button lacks try/catch [LOW/MEDIUM]

- **File:** `src/components/contest/recruiting-invitations-panel.tsx:308-312`
- **Description:** The inline onClick handler at line 310 calls `await navigator.clipboard.writeText(createdLink)` without try/catch. The same component's `handleCopyLink` function (line 207-212) correctly uses try/catch. This is a missed spot from the rpf-15 M1 fix.
- **Concrete failure scenario:** User on an insecure context clicks the copy button in the "Link Created" dialog. The clipboard write fails with an unhandled promise rejection.
- **Fix:** Wrap in try/catch; show error toast on failure.
- **Confidence:** HIGH

### CR-5: `access-code-manager.tsx` copy timer not tracked/cleaned up [LOW/LOW]

- **File:** `src/components/contest/access-code-manager.tsx:48`
- **Description:** `setTimeout(() => setCopied(false), 2000)` is not tracked by a ref and not cleaned up on unmount. Same pattern fixed in `recruiting-invitations-panel.tsx` (M2 from rpf-15) and `api-keys-client.tsx`.
- **Fix:** Track the timer with a ref and clean up in a useEffect return.
- **Confidence:** MEDIUM

## Verified Safe

- All `new Date()` in `schema.pg.ts` are `$defaultFn` for INSERT-only defaults — no temporal comparison usage.
- `new Date()` in health and audit routes are diagnostic timestamps — previously deferred (DEFER-3, DEFER-1).
- Korean letter-spacing correctly conditioned on `locale !== "ko"` across all public-facing components.
- No `innerHTML` assignments, `as any` casts, or `@ts-ignore` directives (only 2 eslint-disable with justification comments).
- Recruiting invitation routes correctly use `getDbNowUncached()` for server-side time.
