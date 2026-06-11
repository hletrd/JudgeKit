# RPF Cycle 15 — Code Reviewer

**Date:** 2026-04-20
**Base commit:** f0bef9cb

## Findings

### CR-1: Duplicate `getDbNowUncached()` call in recruiting invitation creation [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`

When `body.expiryDays` is provided, `getDbNowUncached()` is called at line 70. When `body.expiryDate` is provided, a *separate* `getDbNowUncached()` call is made at line 77. These two branches are mutually exclusive (if/else if), but the `expiryDate` branch should reuse the same `dbNow` value fetched once at the top of the handler, as the API keys route does.

**Concrete issue:** If the DB server time changes between the two calls (e.g., due to NTP adjustment or high load), the `expiresAt <= dbNow` comparison at line 78 uses a different `dbNow` than what was used to compute `expiresAt`. While practically unlikely, it violates the single-source-of-truth pattern established elsewhere in the codebase.

**Fix:** Fetch `dbNow` once before the if/else block and reuse it:
```typescript
const dbNow = await getDbNowUncached();
let expiresAt: Date | null = null;
if (body.expiryDays) {
  expiresAt = new Date(dbNow.getTime() + body.expiryDays * 86400000);
} else if (body.expiryDate) {
  expiresAt = new Date(`${body.expiryDate}T23:59:59Z`);
  if (expiresAt <= dbNow) throw new Error("expiryDateInPast");
}
```

**Confidence:** MEDIUM

### CR-2: Same duplicate `getDbNowUncached()` in bulk recruiting invitations [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:29,60,62`

The `dbNow` is fetched once at line 29 and reused correctly. No issue here — this was done correctly. Noting for completeness since CR-1 affects the single-create route but the bulk route is fine.

**Confidence:** N/A (verified correct)

### CR-3: `handleCopyLink` in recruiting invitations panel lacks error handling [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:197-203`

```typescript
async function handleCopyLink(invitation: Invitation) {
    const url = `${baseUrl}/recruit/${invitation.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(invitation.id);
    toast.success(t("linkCopied"));
    setTimeout(() => setCopiedId(null), 2000);
}
```

If `navigator.clipboard.writeText()` fails (e.g., insecure context, user denied permission), the unhandled promise rejection will crash the UI. The `handleCopyCreatedKey` in the API keys client wraps its clipboard call in try/catch, and the `access-code-manager.tsx` also wraps it. This function should follow the same pattern.

**Fix:** Wrap in try/catch and show an error toast on failure.

**Confidence:** MEDIUM

### CR-4: `recruiting-invitations-panel` copy-feedback timer not cleaned up on unmount [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:200-202`

The `setTimeout(() => setCopiedId(null), 2000)` in `handleCopyLink` is not tracked by a ref and not cleaned up on component unmount. If the component unmounts before the 2-second timer fires, it will attempt to set state on an unmounted component. The API keys client correctly uses a `useRef` for its timers.

**Fix:** Track the timer with a `useRef` and clear it in a cleanup `useEffect`, similar to `api-keys-client.tsx`.

**Confidence:** LOW

### CR-5: Redundant `new Date()` in `database-backup-restore.tsx` fallback path [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx:60`

The `const timestamp = new Date().toISOString().replace(/[:.]/g, "-")` is only used as a fallback when the server-provided filename is missing. This is acceptable as a degraded-mode fallback — when the server fails to provide `Content-Disposition`, the client-side timestamp is the best available option. Not a bug, but noting for completeness.

**Confidence:** LOW

### CR-6: Recruiting invitation `expiryDate` validation does not check for unreasonably far-future dates [LOW/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:72-79`

While `expiryDays` is constrained to `min(1).max(3650)` by the Zod schema, `expiryDate` (a bare `YYYY-MM-DD` string) has no upper-bound validation. A client could send `expiryDate: "2099-12-31"` to create an invitation that never expires. The API keys route has `expiryDays: max(3650)` but the recruiting invitations schema (`src/lib/validators/recruiting-invitations.ts:10`) uses `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` with no date range check.

**Fix:** Add a validation that `expiryDate` is not more than 10 years in the future (consistent with the 3650-day max for `expiryDays`), or compute the year difference from `dbNow` and reject if > 10.

**Confidence:** MEDIUM

## Verified Safe

- All `withUpdatedAt()` callers now pass `now: Date` as required parameter — verified across all 15 call sites.
- API key creation accepts `expiryDays` and computes `expiresAt` server-side — verified.
- API key PATCH endpoint also computes `expiresAt` server-side — verified.
- Recruiting invitations creation accepts `expiryDays`/`expiryDate` and computes `expiresAt` server-side — verified.
- Submissions page uses `getDbNow()` for period filter — verified.
- User profile heatmap uses `getDbNow()` — verified.
- `useEffect` cleanup in API keys client uses `[]` dependency array — verified.
- Backup route passes `dbNow` through pipeline — verified.
- Backup download uses server-provided filename from `Content-Disposition` — verified.
- All `new Date()` in schema `$defaultFn` are correct (INSERT-only defaults) — verified.
- Korean letter-spacing correctly conditioned on locale across all components — verified.
