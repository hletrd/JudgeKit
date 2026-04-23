# RPF Cycle 13 — Tracer

**Date:** 2026-04-20
**Reviewer:** tracer

---

## TR-1: Trace backup filename generation flow — server vs. client discrepancy [LOW/MEDIUM]

**Flow:**
1. `backup/route.ts:85`: `const dbNow = await getDbNowUncached(); const timestamp = dbNow.toISOString().replace(/[:.]/g, "-");`
2. `backup/route.ts:89`: `const backupName = \`judgekit-backup-${timestamp}\`;`
3. `backup/route.ts:110`: `contentDispositionAttachment(backupName, backupExtension)` sets `Content-Disposition: attachment; filename="judgekit-backup-<db-time>.zip"`
4. `database-backup-restore.tsx:52`: `const timestamp = new Date().toISOString().replace(/[:.]/g, "-");`
5. `database-backup-restore.tsx:53-55`: Creates download link with `judgekit-backup-<browser-time>.zip`

**Hypothesis:** The client overrides the server-provided filename with a browser-clock-based one.
**Evidence:** The server sets the correct filename in the `Content-Disposition` header, but the client code at line 50-56 creates a temporary `<a>` element with its own `a.download` attribute, overriding the server filename. The browser's download handler uses `a.download` over `Content-Disposition` when both are present.
**Conclusion:** CONFIRMED — the client filename wins, creating a mismatch with the DB-time snapshot inside.

## TR-2: Trace client-side expiry badge flow [LOW/MEDIUM]

**Flow:**
1. `recruiting-invitations-panel.tsx:248`: `if (inv.expiresAt && new Date(inv.expiresAt) < new Date())`
2. `inv.expiresAt` is a string from the API response (ISO format)
3. `new Date(inv.expiresAt)` parses it using the browser's local timezone
4. `new Date()` is the current browser time
5. Comparison is purely client-side

**Hypothesis:** Browser clock skew could cause incorrect badge display.
**Evidence:** If the browser clock is 1 hour behind, an invitation that expired 30 minutes ago would show "Pending" instead of "Expired". The server's `NOW()` check at redeem time would still correctly reject it.
**Conclusion:** CONFIRMED — cosmetic display issue only, not a security vulnerability.

## Verified Safe

- Server-side time flow: all paths correctly use `getDbNow()` or `getDbNowUncached()`.
- Recruiting token flow: atomic SQL `NOW()` is the authoritative gate.
