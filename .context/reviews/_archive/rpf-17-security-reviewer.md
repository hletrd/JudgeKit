# RPF Cycle 17 — Security Reviewer Report

**Date:** 2026-04-20
**Reviewer:** security-reviewer
**Base commit:** HEAD (2af713d3)

---

## SEC-1: Client-side `toLocaleString`/`toLocaleDateString` without timezone leaks browser TZ info to server logs via timing [LOW/LOW]

**Files:** Multiple files using `toLocaleString(locale)` without `timeZone`
**Description:** When client components format dates without specifying a timezone, the browser's local timezone is used. This is not a direct security vulnerability, but in a contest environment where timezone uniformity matters for anti-cheat, inconsistent timezone rendering could create confusion in audit logs if a proctor reports timestamps that don't match server records.

**Fix:** Consistency fix — use `formatDateTimeInTimeZone` everywhere.
**Confidence:** LOW

---

## SEC-2: `access-code-manager.tsx` uses `confirm()` for destructive revoke action [LOW/MEDIUM]

**Files:** `src/components/contest/access-code-manager.tsx:88`
**Description:** `handleRevoke` uses `if (!confirm(t("revokeConfirm"))) return;` — the browser's native `confirm()` dialog. The rest of the app uses `AlertDialog` components for destructive actions (e.g., recruiting-invitations-panel uses `AlertDialog` for revoke, delete, and password reset). Using `confirm()` is inconsistent and has accessibility issues (not controllable via React, no ARIA, different styling per browser).

**Fix:** Replace `confirm()` with an `AlertDialog` component matching the pattern used in `recruiting-invitations-panel.tsx`.
**Confidence:** MEDIUM

---

## SEC-3: Public problem detail page double-fetches problem data without visibility re-check [LOW/LOW]

**Files:** `src/app/(public)/practice/problems/[id]/page.tsx:112-123`
**Description:** `generateMetadata` checks `problem.visibility !== "public"` and returns `NO_INDEX_METADATA`. The page component also calls `findFirst` for the same problem and checks `problem.visibility !== "public"` before calling `notFound()`. This is correct. However, between the two requests (metadata vs page render), the problem's visibility could change. `React.cache()` deduplicates within a single server render, but `generateMetadata` and the page component are separate render phases. In Next.js, both run in the same request, so `React.cache()` should deduplicate. This is safe.

**Fix:** No action needed — `React.cache()` deduplicates within the same request.
**Confidence:** LOW

---

## Verified Safe

- Auth flow uses Argon2id with timing-safe dummy hash
- CSRF protection in place for server actions
- Rate limiting has two-tier strategy (sidecar + PostgreSQL with SELECT FOR UPDATE)
- Recruiting token flow uses atomic SQL transactions
- `getDbNow()` is used for clock-skew prevention in recruit page
- All `dangerouslySetInnerHTML` uses are properly sanitized
- No secrets exposed in client code
- `sign-out.ts` properly clears all app localStorage prefixes
