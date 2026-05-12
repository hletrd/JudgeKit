# Security Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** security-reviewer

---

## Findings

### S1 — LOW — Drag-and-drop in create-problem-form trusts `file.type`

- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:562,574`
- **Description:** The paste and drop handlers filter files by `file.type.startsWith("image/")`. A malicious user could rename a non-image file to have an image extension, drag it into the editor, and trigger the image upload path. However, the server-side upload handler in `src/app/api/v1/files/route.ts` performs magic-byte verification, image processing via sharp, and size validation, so the spoofed file would be rejected server-side. The impact is limited to UX confusion (user thinks they uploaded an image but the server rejects it).
- **Confidence:** MEDIUM
- **Suggested fix:** Perform client-side validation with FileReader or remove the type-based filter.

### S2 — LOW — SSE re-auth same-user check correctly implemented

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts:466-470`
- **Description:** Verified that the fix from cycle 7 is correctly in place. The re-auth check compares `reAuthUser.id !== viewerId` and closes the connection if they differ. This prevents deactivated users from continuing to receive SSE events.
- **Confidence:** HIGH
- **Status:** Fix verified.

### S3 — LOW — Restore route no longer consults client-controlled `file.type`

- **File:** `src/app/api/v1/admin/restore/route.ts:74-76`
- **Description:** Verified that the fix from cycle 7 is correctly in place. The restore route now uses only `file.name?.endsWith(".zip")` and `file.name?.endsWith(".json")` for format detection, with a comment explaining that `file.type` is client-controlled.
- **Confidence:** HIGH
- **Status:** Fix verified.

### S4 — MEDIUM — Compiler runner response uses `as` after JSON parse

- **File:** `src/lib/compiler/execute.ts:567`
- **Description:** `const data = (await response.json().catch(() => null)) as CompilerRunResult | null;`. While this is followed by shape validation (lines 577-588), the `as` cast could hide type errors if the validation logic changes. The `catch(() => null)` means malformed JSON becomes null, which is handled.
- **Confidence:** LOW
- **Suggested fix:** Remove the `as` cast and rely on the subsequent shape validation. TypeScript will infer `any` from `response.json()` which is fine since validation follows.

---

## Deferred Security Items (Still Present)

- **DEFER-3:** Compiler route `assignmentId` information disclosure (cycle 7)
- **DEFER-4:** `sanitizeHtml` allows `mailto:` (cycle 7)
