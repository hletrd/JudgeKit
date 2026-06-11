# RPF Cycle 15 Aggregate Review

**Date:** 2026-04-20
**Base commit:** f0bef9cb
**Review artifacts:** rpf-15-code-reviewer.md, rpf-15-security-reviewer.md, rpf-15-perf-reviewer.md, rpf-15-architect.md, rpf-15-critic.md, rpf-15-debugger.md, rpf-15-verifier.md, rpf-15-test-engineer.md, rpf-15-tracer.md, rpf-15-designer.md, rpf-15-document-specialist.md

## Deduped Findings (sorted by severity then signal)

### AGG-1: Recruiting invitation `expiryDate` lacks upper-bound validation — allows arbitrarily far-future expiry [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-6), security-reviewer (SEC-1), critic (CRI-1), verifier (VER-2), tracer (TR-1), test-engineer (TE-1)
**Files:**
- `src/lib/validators/recruiting-invitations.ts:10` — `expiryDate` Zod schema only validates format
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:72-79` — no upper-bound check on computed `expiresAt`

**Description:** The rpf-14 fix (H1) correctly replaced client-computed `expiresAt` with server-computed values from `expiryDays`/`expiryDate`. While `expiryDays` is constrained to `max(3650)` (~10 years), `expiryDate` (a bare `YYYY-MM-DD` string) has no upper-bound validation. A client with `recruiting.manage_invitations` capability can send `expiryDate: "2099-12-31"` to create an invitation that never expires, partially defeating the purpose of the rpf-14 fix.

**Concrete failure scenario:** User creates invitation with `expiryDate: "2099-12-31"`. Server computes `expiresAt = new Date("2099-12-31T23:59:59Z")`, which passes the `expiresAt <= dbNow` check (it's in the future). The invitation effectively never expires for ~73 years.

**Fix:** Add an upper-bound check on the computed `expiresAt` in the route handler:
```typescript
const MAX_EXPIRY_MS = 10 * 365.25 * 24 * 60 * 60 * 1000; // ~10 years
if (expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS) {
  return apiError("expiryDateTooFar", 400);
}
```
Also add a test case for far-future dates.

**Cross-agent signal:** 6 of 11 agents flagged this.

### AGG-2: Duplicate `getDbNowUncached()` call in recruiting invitation creation route [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-2), perf-reviewer (PERF-1), architect (ARCH-1), debugger (DBG-1), verifier (VER-1), tracer (TR-2)
**Files:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:70,77`

**Description:** The `expiryDays` branch fetches `dbNow` at line 70, while the `expiryDate` branch fetches it again at line 77. These are in mutually exclusive branches, but the value should be fetched once before the branching logic, consistent with the pattern used in the API keys route and the bulk invitations route. The duplicate fetch wastes a DB round-trip and creates a theoretical TOCTOU window if DB time shifts between calls.

**Fix:** Fetch `dbNow` once before the if/else block:
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

**Cross-agent signal:** 7 of 11 agents flagged this.

### AGG-3: `handleCopyLink` in recruiting invitations panel lacks error handling [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), critic (CRI-2), debugger (DBG-2)
**File:** `src/components/contest/recruiting-invitations-panel.tsx:197-203`

**Description:** `navigator.clipboard.writeText()` can throw in insecure contexts, when permissions are denied, or on browsers without clipboard API. The API keys client and access-code-manager both wrap their clipboard calls in try/catch. This function does not, so a clipboard failure will cause an unhandled promise rejection.

**Fix:** Wrap in try/catch and show an error toast on failure.

**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-4: Copy-feedback timer not cleaned up on unmount in recruiting invitations panel [LOW/LOW]

**Flagged by:** code-reviewer (CR-4), critic (CRI-3), debugger (DBG-3)
**File:** `src/components/contest/recruiting-invitations-panel.tsx:201`

**Description:** The `setTimeout(() => setCopiedId(null), 2000)` in `handleCopyLink` is not tracked by a ref and not cleaned up on unmount. The API keys client correctly uses refs for its timers.

**Fix:** Track the timer with a `useRef` and clear it in a cleanup `useEffect`.

**Cross-agent signal:** 3 of 11 agents flagged this.

### AGG-5: Recruiting invitations custom date picker lacks timezone hint [LOW/MEDIUM]

**Flagged by:** designer (DES-1)
**File:** `src/components/contest/recruiting-invitations-panel.tsx:381-388`

**Description:** The custom expiry date picker shows a bare `<Input type="date">` with no indication that the selected date will be interpreted as end-of-day UTC. An admin in UTC+9 selecting "April 30" might expect expiry at 23:59:59 JST but the server computes 23:59:59 UTC — 9 hours later.

**Fix:** Add helper text below the date picker: e.g., "Expires at end of day (UTC)".

**Cross-agent signal:** 1 of 11 agents (designer).

### AGG-6: `streamBackupWithFiles` buffers entire export in memory (carry from rpf-13, rpf-14) [MEDIUM/HIGH]

**Flagged by:** perf-reviewer (PERF-2)
**File:** `src/lib/db/export-with-files.ts:120-131`

**Description:** Carry-over from rpf-13 (AGG-6) / rpf-14 (AGG-6). The backup-with-files path collects the entire database export JSON into memory before creating the ZIP. Short-term mitigation (warning log for large exports) not yet implemented.

**Fix:** Short-term: add warning log. Long-term: migrate to streaming ZIP library.

**Cross-agent signal:** 1 of 11 agents (perf-specific). Previously flagged in rpf-13 and rpf-14.

### AGG-7: `streamBackupWithFiles` JSDoc does not document `dbNow` parameter [LOW/LOW]

**Flagged by:** document-specialist (DOC-1)
**File:** `src/lib/db/export-with-files.ts:112`

**Description:** Minor doc gap. The `dbNow` parameter was added in rpf-13 but JSDoc was not updated.

**Fix:** Add `@param dbNow` to JSDoc.

**Cross-agent signal:** 1 of 11 agents.

## Verified Safe / No Regression Found

- All rpf-14 remediation items (H1, H2, M1, M2, M3, L1) correctly implemented — verified.
- Prior rpf-13 fixes intact — verified.
- `withUpdatedAt()` requires `now: Date` — verified (all 15 callers).
- API key creation accepts `expiryDays`, computes `expiresAt` server-side — verified.
- Recruiting invitations creation accepts `expiryDays`/`expiryDate`, computes `expiresAt` server-side — verified.
- Backup download uses server-provided filename from `Content-Disposition` — verified.
- API key and invitation status badges use server-computed `isExpired` — verified.
- Submissions page and user heatmap use `getDbNow()` — verified.
- `useEffect` cleanup in API keys client uses `[]` dependency — verified.
- Backup route passes `dbNow` through pipeline — verified.
- All `new Date()` in schema `$defaultFn` are INSERT-only defaults — verified.
- Korean letter-spacing correctly conditioned on locale — verified.
- `(control)` and `(workspace)` route groups fully removed — verified.
- Auth: Argon2id with OWASP parameters, timing-safe dummy hash — verified.
- SQL injection: all parameterized, LIKE patterns escaped — verified.
- HTML sanitization: DOMPurify with strict allowlist — verified.
- Path traversal validation in backup ZIP — verified.
- SHA-256 integrity manifest for backups — verified.
- CSP headers with nonce-based script-src — verified.

## Agent Failures

None. All 11 review perspectives completed successfully.
