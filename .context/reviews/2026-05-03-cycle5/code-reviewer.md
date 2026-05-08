# Code Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`
**Scope:** Full `src/` tree (574 files). Focus on recruiting, submissions, auth, file-upload, and API-handler paths.

---

## C5-CR-1 (MEDIUM, HIGH confidence) — `SubmissionStatusBadge` renders `compileOutput` tooltip for guests on public submissions list

**File:** `src/components/submission-status-badge.tsx:71-79`

The public submissions page (`src/app/(public)/submissions/page.tsx:202,435,477`) passes `compileOutput` directly to `SubmissionStatusBadge` without sanitization for guest viewers. The badge's `TooltipBody` renders `compileOutput` as a `<pre>` element when `status === "compile_error"`. Compiler errors can contain fragments of the submitted source code (variable names, line numbers, partial code snippets), which guests should not see.

The per-id detail page (`src/app/(public)/submissions/[id]/page.tsx:154`) correctly nulls `compileOutput` for non-owners, but the list page has no such guard. The `sanitizeSubmissionForViewer` function in `src/lib/submissions/visibility.ts:112-113` can null it out, but the list page does not call that function — it builds its own query.

**Fix:** In the public submissions page, do not pass `compileOutput` to `SubmissionStatusBadge` when `isGuest` is true (or pass `null`). This is a one-line conditional.

---

## C5-CR-2 (MEDIUM, HIGH confidence) — Public submissions page selects `compileOutput` from DB for all viewers including guests

**File:** `src/app/(public)/submissions/page.tsx:202`

Even if the tooltip rendering is fixed, the SQL query fetches `compileOutput` from the `submissions` table for every row, including guest-visible rows. This is unnecessary data transfer — the column is never rendered for guests in the corrected version.

**Fix:** Conditionally exclude `compileOutput` from the select when `isGuest` is true, or always exclude it from the list view (the list only shows it in a tooltip, not inline).

---

## C5-CR-3 (LOW, MEDIUM confidence) — `createHash("sha256")` still inline in `auth/config.ts:385` and `api-key-auth.ts:22`

**Files:** `src/lib/auth/config.ts:385`, `src/lib/api/api-key-auth.ts:22`

Cycle 4 consolidated `hashToken` in `recruiting-token.ts` and `recruiting/validate/route.ts`, but two more files still use inline `createHash("sha256")`:

1. `auth/config.ts:385` — hashes the user-agent string for `uaHash`. This is a different semantic purpose (fingerprinting, not token verification), so divergence from `hashToken` is less critical. However, if the hash algorithm changes in `token-hash.ts`, this site will not follow.
2. `api-key-auth.ts:22` — hashes raw API keys. This is also a verification hash (stored in DB), similar to `hashToken`. If the algorithm changes in `token-hash.ts`, API key verification will silently break.

**Fix for api-key-auth.ts:** Replace inline hash with `hashToken` import (same algorithm, same purpose). For `auth/config.ts`, the UA fingerprint is non-critical — document the divergence or extract a separate `hashForFingerprint` utility.

---

## C5-CR-4 (LOW, LOW confidence) — `getPeriodStart` uses app-server time while the main query uses DB time

**File:** `src/app/(public)/submissions/page.tsx:65-86,162`

The function `getPeriodStart(currentPeriod, await getDbNow())` correctly passes DB time. However, the function constructs `new Date(now)` and uses `.setHours()`, `.setDate()`, etc. which operate in the local timezone of the app server. Since `getDbNow()` returns a UTC Date, the period-start calculation may be wrong if the app server's timezone differs from UTC. The impact is low because most deployments run in UTC, but it is a latent bug.

**Fix:** Use UTC methods (`setUTCHours`, etc.) or document that the app server must run in UTC.

---

## C5-CR-5 (MEDIUM, HIGH confidence) — `updateRecruitingInvitationSchema` does not enforce `_sys.` namespace at the Zod level

**File:** `src/lib/validators/recruiting-invitations.ts:13-19`

The `metadata` field is `z.record(z.string(), z.string()).optional()` — it accepts any key-value pairs. The `_sys.` namespace guard is enforced only in the runtime function `updateRecruitingInvitation` (added in cycle 4). However, the `createRecruitingInvitationSchema` also has the same issue — no Zod-level enforcement. While the runtime check is correct, a Zod `refine()` would catch violations earlier (at parse time) and produce consistent error messages.

**Fix:** Add a `.refine()` to both schemas rejecting keys starting with `_sys.`. This is defense-in-depth; the runtime check remains the authoritative guard.

---

## C5-CR-6 (LOW, MEDIUM confidence) — `recruiting-invitations-panel.tsx:99` uses `window.location.origin` for invite link construction

**File:** `src/components/contest/recruiting-invitations-panel.tsx:99`

This is the same pattern flagged in prior cycles (C2-AGG-7). `window.location.origin` may be incorrect when the app is accessed through a reverse proxy, CDN, or custom domain. The server-side `NEXTAUTH_URL` / `AUTH_URL` is the authoritative base URL.

**Fix:** Derive from a server-provided config or environment variable. (Deferred from prior cycles.)

---

## No other findings

The recruiting brute-force lockout, atomic counter, `_sys.` namespace guard, shared `hashToken` module, `sql.raw` documentation, and `mailto` nofollow links from prior cycles are all verified as correctly implemented at HEAD `eb4429a5`.
