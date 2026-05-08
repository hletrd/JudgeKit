# Comprehensive Review — Cycle 38

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full repository deep review

---

## NEW-1: [MEDIUM] `error.message` used as control-flow discriminator in API routes — fragile, leaks internal state

**Confidence:** HIGH
**Files:**
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:77` — `switch (error.message)`
- `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts:191-196`
- `src/app/api/v1/admin/restore/route.ts:91`
- `src/app/api/v1/admin/migrate/validate/route.ts:40,49,52`
- `src/app/api/v1/admin/migrate/import/route.ts:80,128,131`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:118-127`
- `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:111`
- `src/app/api/v1/groups/[id]/members/[userId]/route.ts:87`
- `src/app/api/v1/admin/roles/route.ts:105`
- `src/app/api/v1/users/route.ts:135,138`
- `src/app/api/v1/judge/poll/route.ts:168`
- `src/lib/assignments/recruiting-invitations.ts:541,544`
- `src/lib/actions/user-management.ts:326,329,439,442`
- `src/lib/actions/public-signup.ts:120`

**Problem:** Numerous catch blocks use `error.message === "someString"` to discriminate error types. This is a well-known anti-pattern: Error messages can be refactored, i18n'd, or have typos, silently breaking the control flow. Additionally, at `exam-session/route.ts:81`, `apiError("examModeInvalid", 400)` is returned from the catch block, but the same condition is handled pre-emptively at line 29. The dual-path handling is confusing.

**Note:** This was previously deferred as DEFER-24 (for migrate/import) and is a broader pattern. The new finding here is that the pattern extends far beyond the originally deferred scope and is present in 15+ catch blocks across the API layer.

**Fix:** Use custom error classes (e.g., `class AssignmentError extends Error { code: string }`) or result objects instead of string-matching on `error.message`. This is a large refactor, so it should be planned incrementally.

---

## NEW-2: [MEDIUM] Import route uses `as JudgeKitExport` unsafe cast after Zod validation of wrapper but NOT of the export data itself

**Confidence:** HIGH
**File:** `src/app/api/v1/admin/migrate/import/route.ts:164-166`

**Problem:** The JSON import path validates the wrapper with `jsonImportBodySchema` (which checks `password` is a string and `data?` is optional+unknown), but then casts `parsedBody.data.data as JudgeKitExport` without Zod validation of the export structure. The `data` field is `z.unknown()` — it passes Zod but gets cast to `JudgeKitExport` unsafely. While `validateExport(data)` is called afterwards, the cast itself is technically unsound between Zod validation and `validateExport`. The `restFields as unknown as JudgeKitExport` on line 166 is a double cast that bypasses type safety entirely.

**Failure scenario:** A malformed JSON body with `{ password: "x", data: { malformed: true } }` passes Zod validation, gets cast to `JudgeKitExport`, then `validateExport` may or may not catch all issues depending on its validation depth.

**Fix:** Replace `data: z.unknown().optional()` with `data: judgeKitExportSchema.optional()` (where `judgeKitExportSchema` is a proper Zod schema for the export format). The `validateExport` function should be backed by a Zod schema rather than manual checks.

---

## NEW-3: [LOW] `db/import.ts` error messages leak internal DB error text to API responses

**Confidence:** HIGH
**File:** `src/lib/db/import.ts:136,200,214`

**Problem:** When a table truncation or batch insert fails, `err.message` is included in the error array: `throw new Error(\`Failed to truncate ${tableName}: ${message}\`)` and `result.errors.push(\`${tableName} batch ${i}: ${message}\`)`. These messages propagate through `importDatabase` result to the API response at `route.ts:108` (`details: result.errors`). This leaks PostgreSQL internal error text (table names, constraint names, column types) to the admin client. While the route is admin-only, this is still an information disclosure risk.

**Failure scenario:** A constraint violation error like `Key (user_id)=(abc) is not present in table "users"` gets returned verbatim in the API response, exposing schema details.

**Fix:** Sanitize error messages before including them in `result.errors`. Use a generic message for the API response and log the detailed error server-side only.

---

## NEW-4: [LOW] Anti-cheat monitor captures text snippets from problem description — user text content in event details

**Confidence:** MEDIUM
**File:** `src/components/exam/anti-cheat-monitor.tsx:206-210`

**Problem:** The `describeElement` function captures up to 80 characters of element text content for headings, paragraphs, spans, etc.: `const text = (el.textContent ?? "").trim().slice(0, 80)`. This text is included in the anti-cheat event details (via `reportEvent("copy", { target: describeElement(e.target) })`). When a student copies from a problem description, the actual problem text snippet is sent to the server and stored in the audit log. This is a privacy concern (DEFER-45 noted this as a design decision, but the text snippet capture specifically was not called out).

**Note:** This was previously deferred as DEFER-45, but the specific risk of capturing exam problem text content (not just "user text snippets") is worth re-highlighting because it could include copyrighted problem content from external sources.

**Fix:** For copy/paste events, only capture the element type and CSS class (already partially done), not the text content. Change `describeElement` to not include `text` for copy/paste events, or limit to a much shorter snippet (e.g., 10 chars as a hash indicator).

---

## NEW-5: [LOW] `CountdownTimer` uses `Date.now()` for exam deadline but server-synced time for offset

**Confidence:** LOW
**File:** `src/components/exam/countdown-timer.tsx:46-47,97`

**Problem:** The `remaining` state is initialized with `deadline - Date.now()` (client time), then periodically recalculated with `deadline - (Date.now() + offsetRef.current)` (server-corrected time). But the initial render uses the uncorrected client time. If the client clock is significantly off, the initial badge display could flash an incorrect time (e.g., showing "00:05:00" when the real remaining time is "00:15:00") before the server time sync completes. For exam countdown timers, this initial inaccuracy could alarm students.

**Fix:** Consider showing a loading state or "Syncing..." indicator until the first server time sync completes, or initialize with a conservative estimate. This is LOW because the sync happens quickly (within 5 seconds) and the flash is brief.

---

## NEW-6: [LOW] SSE cleanup timer uses O(n) scan to find oldest entry

**Confidence:** LOW
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-53`

**Problem:** The `addConnection` function iterates all entries in `connectionInfoMap` to find the oldest-by-age entry when `MAX_TRACKED_CONNECTIONS` is exceeded. This is O(n) per eviction. With `MAX_TRACKED_CONNECTIONS = 1000`, this is acceptable under normal load but could become a bottleneck during connection bursts (e.g., exam start time with many students connecting simultaneously).

**Fix:** Consider using an ordered data structure (e.g., a sorted array or linked list) for O(1) oldest-entry lookup, or increase the eviction batch size to amortize the cost. This is LOW because the threshold is rarely hit in practice.

---

## Previously Known Issues (Validated, Still Present)

All previously deferred items from cycle 37 remain unchanged:
- DEFER-22 through DEFER-45 (see cycle 37 aggregate for full list)

---

## Sweep Confirmation

All source files in `src/` were scanned via grep for the following patterns:
- `parseInt(...) || ` / `parseFloat(...) || ` — CONFIRMED FIXED (0 instances)
- `.json()` without `.ok` check — 30+ instances (known DEFER-22)
- `as { error?: string }` — 15 instances (known DEFER-28)
- `innerHTML` / `dangerouslySetInnerHTML` — 2 instances (properly sanitized with DOMPurify and safeJsonForScript)
- `eval()` / `new Function()` — 0 instances
- `catch (...) {}` (empty catch) — 0 instances
- `as any` — 0 instances (only in comments)
- `process.env` — all properly guarded with validation
- Timer cleanup — all properly handled with cleanup functions
- SQL injection via `sql` template — all uses are parameterized via Drizzle's tagged template

No new `parseInt || default` or `parseFloat || default` regressions found.
