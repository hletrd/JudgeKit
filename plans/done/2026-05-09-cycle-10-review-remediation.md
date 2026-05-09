# Cycle 10 Review Remediation Plan

**Date:** 2026-05-09
**Review source:** `.context/reviews/_aggregate.md` (cycle 10/100)
**HEAD:** main / 988882aa
**Goal:** Fix all findings from cycle 10 code review.

---

## Items to implement this cycle

### 1. C10-1 — Release stream reader lock in `readStreamBytesWithLimit` on fileTooLarge
- **File:** `src/lib/db/import-transfer.ts` (lines 21-29)
- **Severity:** LOW
- **Task:** Wrap the `reader.read()` loop in try/finally so the reader lock is released even when `fileTooLarge` is thrown.
- **Approach:** Add `try { ... } finally { reader.releaseLock(); }` around the while loop in `readStreamBytesWithLimit`.
- **Status:** DONE — committed in `80e11f69`

### 2. C10-2 — Add `languages` dependency to compiler-client language hydration effect
- **File:** `src/components/code/compiler-client.tsx` (lines 160-182)
- **Severity:** LOW
- **Task:** Add `languages` to the useEffect dependency array so the saved language preference is re-evaluated when languages populate.
- **Approach:** Change deps from `[]` to `[languages, initialLanguage]`.
- **Status:** DONE — committed in `1f7a6377`

### 3. C10-S1 — Add path traversal checks to backup manifest upload path validation
- **File:** `src/lib/db/export-with-files.ts` (lines 94-105)
- **Severity:** LOW
- **Task:** Add `!upload.path.includes("..")` and `!upload.path.slice("uploads/".length).includes("/")` checks in `parseBackupIntegrityManifest`.
- **Approach:** Extend the existing validation loop to reject paths containing `..` or `/` after the `uploads/` prefix.
- **Status:** DONE — committed in `c2cd2016`

### 4. C10-S2 — Add AbortController to file upload dialog for cancellation support
- **File:** `src/app/(dashboard)/dashboard/admin/files/file-upload-dialog.tsx` (lines 105-132)
- **Severity:** LOW
- **Task:** Create an AbortController per upload and pass its signal to `apiFetch`. Abort on dialog close.
- **Approach:** Use a ref to hold the AbortController, abort it in `handleClose` when `!open`, and create a new one for each upload batch.
- **Status:** DONE — committed in `47705899`

---

## Deferred items

None — all findings are straightforward fixes with no security/correctness tradeoffs.

---

## Gate results (post-fix)

- `npx eslint .` — PASS (0 errors, 0 warnings)
- `npx tsc --noEmit` — PASS
- `npx next build` — PASS
- `npx vitest run` — PASS (314 files, 2338 tests)
- `npx vitest run --config vitest.config.component.ts` — PASS (66 files, 179 tests)

## Deployment (per-cycle)

- **worv (`test.worv.ai`)** — PASS
  - Build: `judgekit-app:latest` (linux/arm64), `judgekit-code-similarity:latest`, `judgekit-rate-limiter:latest`
  - Pre-deploy DB backup preserved
  - DB migrations: No changes detected
  - Containers: All healthy, nginx reloaded, HTTPS verified (HTTP 200)
- **algo (`algo.xylolabs.com`)** — PASS
  - Build: `judgekit-app:latest` (linux/arm64), `judgekit-code-similarity:latest`, `judgekit-rate-limiter:latest`
  - Pre-deploy DB backup preserved
  - DB migrations: No changes detected
  - Containers: All healthy, nginx reloaded, HTTPS verified (HTTP 200)
