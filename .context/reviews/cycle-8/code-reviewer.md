# Code Quality Review — Cycle 8/100

**Date:** 2026-05-11
**HEAD:** main / 05752cdb
**Reviewer:** code-reviewer

---

## Findings

### C1 — LOW — `create-problem-form.tsx` trusts client-controlled `file.type` for drag-and-drop filtering

- **File:** `src/app/(public)/problems/create/create-problem-form.tsx:562,574`
- **Description:** The `onPaste` and `onDrop` handlers use `file.type.startsWith("image/")` to decide whether to intercept and process dropped/pasted content. The `file.type` property is set by the browser based on the file extension or OS metadata, and can be spoofed by renaming a non-image file with an image extension. While the actual upload path goes through `file.type` validation on the server (which then verifies magic bytes), the drag-and-drop preview could misleadingly accept a spoofed file before the user even submits.
- **Confidence:** MEDIUM
- **Suggested fix:** Use a client-side magic-byte check or FileReader inspection before calling `handleImageUpload` on dropped files. Alternatively, remove the drag-and-drop type filter entirely and let the server reject non-images after upload.

### C2 — LOW — `admin/submissions/export` uses `as` cast for searchParams type narrowing

- **File:** `src/app/api/v1/admin/submissions/export/route.ts:46-47`
- **Description:**
  ```ts
  const statusFilter = STATUS_FILTER_VALUES.includes((searchParams.get("status") ?? "") as (typeof STATUS_FILTER_VALUES)[number])
    ? ((searchParams.get("status") ?? "") as (typeof STATUS_FILTER_VALUES)[number])
    : "";
  ```
  The first `as` is required because `Array.includes` is strictly typed in TypeScript, but the pattern is slightly awkward. The second `as` is redundant because the value was already validated by `includes`.
- **Confidence:** LOW
- **Suggested fix:** Extract a small helper that returns the validated value without double-casting, or use a type predicate.

### C3 — LOW — `verify-email/page.tsx` includes unused dependency in useEffect

- **File:** `src/app/(auth)/verify-email/page.tsx:61`
- **Description:** The `useEffect` dependency array includes `[token, t, redirect]`, but `redirect` is never used inside the effect callback. It is only used in the JSX (`router.push(redirect || "/login")`). This is harmless but adds an unnecessary dependency that could cause the effect to re-run if `redirect` changes.
- **Confidence:** HIGH
- **Suggested fix:** Remove `redirect` from the useEffect dependency array.

### C4 — MEDIUM — `compiler/execute.ts` timeout kill lacks timeout on the kill itself

- **File:** `src/lib/compiler/execute.ts:459-464`
- **Description:** The timeout handler calls `child?.kill("SIGKILL")` which returns a boolean. If the process is in an uninterruptible state or the Node.js process object is in a bad state, `kill` may fail silently. The subsequent `stopContainer(containerName)` is then called, but that is fire-and-forget via `spawn` with `.unref()`. There's no guarantee the container is actually stopped.
- **Confidence:** MEDIUM
- **Suggested fix:** Wrap `child.kill("SIGKILL")` in a retry with a short delay, or add a follow-up timer that force-removes the container after a grace period if the process hasn't exited.

### C5 — LOW — `pre-restore-snapshot.ts` uses cross-runtime type assertion

- **File:** `src/lib/db/pre-restore-snapshot.ts:87`
- **Description:** `streamDatabaseExport` returns a global Web ReadableStream, but `Readable.fromWeb` expects the Node.js `stream/web` type. The code uses `as unknown as NodeReadableStream<Uint8Array>` to bridge the gap. This works at runtime but is a type-system workaround.
- **Confidence:** LOW
- **Suggested fix:** Document why the cast is safe, or update `streamDatabaseExport` to return the correct Node.js stream type.

---

## Verified Fixes from Prior Cycles

- Cycle 7 Task 1 (playground platform mode): correctly enforced in `src/app/api/v1/playground/run/route.ts`
- Cycle 7 Task 2 (getDbNowUncached out of lock): correctly moved before `withPgAdvisoryLock`
- Cycle 7 Task 3 (cursor timestamp validation): correctly validates `typeof decoded.t === "string"`
- Cycle 7 Task 4 (anti-cheat early check): correctly moved before enrollment checks
