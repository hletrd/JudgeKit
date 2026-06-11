# Security Review — Cycle 39

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** c176d8f5

## SEC-1: Bulk invitation route missing `MAX_EXPIRY_MS` guard on `expiryDays` path [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:63-66`

**Description:** The bulk route checks `MAX_EXPIRY_MS` when `inv.expiryDate` is set (line 78) but does not check when `inv.expiryDays` is used (line 64-66). The Zod schema caps `expiryDays` at 3650, which is under `MAX_EXPIRY_MS`, so this is not exploitable today. However, the single-create route performs this check (line 90-92), making the bulk route inconsistent. If the Zod schema is ever relaxed, the bulk route would allow unreasonably far-future expiry dates.

**Concrete failure scenario:** Same as CR-1. The defense-in-depth `MAX_EXPIRY_MS` check is missing on one code path.

**Fix:** Add the `MAX_EXPIRY_MS` guard after `computeExpiryFromDays` in the bulk route.

**Confidence:** Medium (not exploitable today, but inconsistent defense-in-depth)

---

## SEC-2: `safeJsonForScript` replaces `</script` but does not handle `<script` injection [LOW/LOW]

**File:** `src/components/seo/json-ld.tsx:11-15`

**Description:** The `safeJsonForScript` function escapes `</script` and `<!--` sequences, which is the standard approach for safe JSON embedding in `<script>` tags. However, it does not escape `<script` opening tags. While `JSON.stringify` will produce `"<script>"` as `"<script>"` (with quotes), in a deeply nested object, a crafted string value containing `<script>alert(1)</script>` would be rendered as `<script>alert(1)<\/script>` which is safe because the closing tag is escaped. The opening `<script` tag within a JSON string value inside an existing `<script type="application/ld+json">` tag is not executed by browsers because the HTML parser doesn't start a new script context within an existing one. This is not a vulnerability, but worth documenting.

**Confidence:** Low (not a vulnerability, just a completeness note)

---

## SEC-3: Anti-cheat `details` field max 500 chars but no content validation [LOW/LOW]

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:29-31`

**Description:** The `antiCheatEventSchema` limits `details` to `z.string().max(500).optional()`. The client can send arbitrary content in this field (up to 500 chars), including PII or malicious content. This is already noted in prior deferrals (Prior SEC-3: Anti-cheat copies text content). The 80-char limit in the client-side `describeElement` function is a separate concern from the API-level 500-char limit.

**Confidence:** Low (already deferred)

---

## Verified Security Fixes This Cycle

- Bulk invitation case-insensitive email dedup (AGG-1 from cycle 38) — verified working
- API key auto-dismiss timer (AGG-4 from cycle 38) — verified working
- `safeJsonForScript` properly escapes `<!--` sequences (verified in commit afcd9b93)
- All LIKE/ILIKE queries use `ESCAPE '\\'` with `escapeLikePattern`
- DOMPurify sanitization properly configured for both legacy HTML and markdown
- CSRF protection properly skips for API key auth
