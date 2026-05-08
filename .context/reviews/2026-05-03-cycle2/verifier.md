# Verifier Review — Cycle 2 (2026-05-03)

**Reviewer:** verifier
**HEAD:** `689cf61d`

---

## C2-VER-1 (MEDIUM, HIGH confidence) — Magic-byte verification allows unknown MIME types by default

**File:** `src/lib/files/validation.ts:182-184`

```ts
if (!signatures) {
  // No signature defined for this MIME type — allow by default
  return true;
}
```

If a new MIME type is added to `ALLOWED_ATTACHMENT_TYPES` but not to `MAGIC_SIGNATURES`, uploads of that type bypass content verification entirely. The default-allow behavior means adding a new MIME type is a two-step process (add to allowlist, add to signatures) where the second step can be forgotten.

**Fix:** Change the default to reject unknown MIME types. Add a `SKIP_MAGIC_VERIFICATION_TYPES` set for types where verification is not feasible (like text types which are already handled). This ensures that adding a new MIME type to the allowlist without adding a signature is caught immediately.

---

## C2-VER-2 (LOW, HIGH confidence) — `verifyFileMagicBytes` returns true for images without checking content

**File:** `src/lib/files/validation.ts:167-169`

```ts
if (isImageMimeType(declaredMimeType)) {
  return true;
}
```

The comment says "Images are verified by sharp during processImage" but this is only true for the file upload route. If `verifyFileMagicBytes` is called from another context (e.g., a future API endpoint), images would bypass verification.

**Fix:** Add a JSDoc comment making the sharp-verification dependency explicit. Consider adding a parameter to control whether images should be verified.

---

## C2-VER-3 (LOW, MEDIUM confidence) — `escapeLikePattern` usage is consistent but not centrally enforced

**Files:** Multiple API routes using `sql` tagged template with LIKE patterns

All LIKE patterns correctly use `escapeLikePattern()` with `ESCAPE '\\'` clause. Verified: `files/route.ts:153`, `recruiting-invitations.ts:116`, `invite/route.ts:46-47`, `audit-logs/route.ts:62`, `export/route.ts:56-57`. This is correct and consistent.

**Fix:** No fix needed. Verified as correct.

---

## C2-VER-4 (LOW, HIGH confidence) — Cycle 1 fixes verified in place

Verified the following cycle 1 fixes at HEAD:
1. F1 (docker path validation): `validateDockerfilePath` function exists and is used in both local and remote paths. Verified.
2. F2 (RUNNER_AUTH_TOKEN fallback): `docker/client.ts:19` no longer falls back to `JUDGE_AUTH_TOKEN`. Production guard present at line 20. Verified.
3. F4 (magic-byte verification): `verifyFileMagicBytes` function exists and is called in `files/route.ts:45`. Verified.
4. C1-SEC-6 (console.warn): `metrics/route.ts` now uses `logger.warn`. Verified.

All cycle 1 fixes are in place and working correctly.

---

## Final Sweep

Verified: all SQL LIKE patterns use `escapeLikePattern()`, all redirect URLs use `getSafeRedirectUrl()`, all CSRF checks use `validateCsrf()`, all password hashing uses Argon2id, all timing-sensitive comparisons use `safeTokenCompare()`. The codebase is consistent in its security patterns.
