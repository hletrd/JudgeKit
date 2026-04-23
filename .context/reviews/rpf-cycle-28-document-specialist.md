# RPF Cycle 28 — Document-Specialist Review

**Date:** 2026-04-23
**HEAD:** ca62a45d
**Scope:** Documentation-code mismatches across the entire repository

---

## Summary

32 findings across 6 categories. 4 HIGH, 16 MEDIUM, 12 LOW severity. The most critical issues are: (1) a split `SubmissionStatus` type definition that creates a factual inconsistency between `src/types/index.ts`, `src/lib/submissions/status.ts`, and the Rust worker, (2) the API documentation describes a CSRF mechanism that doesn't match the actual implementation, and (3) at least 14 API route handlers are completely undocumented in `docs/api.md`.

---

## 1. Type Definition Mismatches

### DOC-1: `SubmissionStatus` has two divergent definitions [HIGH/HIGH]

**Files:** `src/types/index.ts:14-24`, `src/lib/submissions/status.ts:1`
**Confidence:** HIGH

| Variant | Status values |
|---------|--------------|
| `src/types/index.ts` | `time_limit`, `memory_limit`, includes `submitted` |
| `src/lib/submissions/status.ts` | `time_limit_exceeded`, `memory_limit_exceeded`, includes `output_limit_exceeded`, `internal_error`, `cancelled`; does NOT include `submitted` |
| Rust worker (`types.rs:44-49`) | Emits `time_limit`, `memory_limit` (matches `index.ts`) |

The Rust worker produces `"time_limit"` and `"memory_limit"`, which matches `src/types/index.ts`. But `src/lib/submissions/status.ts` exports a different `SubmissionStatus` type using the `_exceeded` suffixes plus additional statuses. The component at `src/components/lecture/submission-overview.tsx:42` has a defensive case handling both variants (`case "time_limit": case "time_limit_exceeded"`), confirming the split exists at runtime.

**Impact:** Any code that imports `SubmissionStatus` from `src/lib/submissions/status.ts` will not accept the actual values produced by the Rust worker. The `ACTIVE_SUBMISSION_STATUSES` set in that file does not include `"submitted"`, so submissions with that status won't trigger polling even though `index.ts` defines it.

**Suggested fix:** Unify into a single `SubmissionStatus` type. Decide on canonical values (the Rust worker's `_exceeded`-less forms appear to be the DB source of truth), update `src/lib/submissions/status.ts` to match, and add the missing values (`output_limit_exceeded`, `internal_error`, `cancelled`) to `src/types/index.ts` or remove them if they are not used.

---

### DOC-2: `CursorPaginatedResponse` type missing from `src/types/api.ts` [MEDIUM/HIGH]

**File:** `src/types/api.ts:1-16`
**Confidence:** HIGH

`docs/api.md:421` documents cursor-based pagination with a `nextCursor` field. The submissions route (`src/app/api/v1/submissions/route.ts:98-100`) actually returns `{ data, nextCursor }`. But `src/types/api.ts` only defines `PaginatedResponse<T>` with offset fields (`page`, `limit`, `total`). There is no `CursorPaginatedResponse` type anywhere in `src/types/` or `src/lib/`.

**Impact:** Consumers working with the submissions list API have no typed response shape for cursor pagination. They must use `any` or ad-hoc types.

**Suggested fix:** Add `CursorPaginatedResponse<T>` to `src/types/api.ts`:
```ts
export type CursorPaginatedResponse<T> = {
  data: T[];
  nextCursor: string | null;
};
```

---

### DOC-3: `UserRole` type doesn't accept custom roles despite JSDoc saying it should [MEDIUM/HIGH]

**File:** `src/types/index.ts:2-9`
**Confidence:** HIGH

The JSDoc says "Custom roles use arbitrary strings validated at runtime" and "Use `string` in function signatures that need to accept custom roles." But `UserRole = BuiltinUserRole` (which is `"super_admin" | "admin" | "instructor" | "assistant" | "student"`), so any function typed as `UserRole` will reject custom role strings at compile time. The DB `roles` table and admin roles API support arbitrary custom roles.

**Impact:** Any API handler or component that types a parameter as `UserRole` cannot receive custom role values without a cast. The documentation correctly warns about this but the type itself is misleading.

**Suggested fix:** Either change `UserRole` to `string` (losing autocomplete) or add a branded type like `UserRole = BuiltinUserRole | (string & {})` that accepts arbitrary strings while still providing autocomplete for built-in values.

---

### DOC-4: `BuiltinUserRole` includes `"assistant"` but API docs never mention it [MEDIUM/MEDIUM]

**File:** `src/types/index.ts:2`
**Confidence:** MEDIUM

`BuiltinUserRole` includes `"assistant"`, but `docs/api.md` only lists `student`, `instructor`, `admin`, `super_admin` as role values (e.g., users filter param line 226). The assistant role exists in the DB and type system but is undocumented in the API reference.

**Impact:** API consumers cannot discover the `assistant` role from the documentation.

**Suggested fix:** Add `assistant` to role listings in `docs/api.md`.

---

## 2. API Documentation Mismatches

### DOC-5: CSRF protection documented incorrectly [HIGH/HIGH]

**Files:** `docs/api.md:78-80`, `src/lib/security/csrf.ts:19-35`
**Confidence:** HIGH

`docs/api.md:78-80` states:
> "Mutation methods require a valid CSRF token header when using session cookie authentication. The CSRF token is obtained from `/api/auth/csrf`."

The actual implementation in `src/lib/security/csrf.ts:40` requires the `X-Requested-With: XMLHttpRequest` header — not a CSRF token from `/api/auth/csrf`. The Auth.js `/api/auth/csrf` endpoint is only relevant for the sign-in form POST, not for API mutation routes.

**Impact:** Consumers following the API docs will attempt to fetch a CSRF token and send it as a header, which will be rejected. The correct approach is to send `X-Requested-With: XMLHttpRequest`.

Note: `.context/development/open-workstreams.md:71` documents the fix ("CSRF header fix: corrected... to use `X-Requested-With: XMLHttpRequest`") but the API reference was not updated.

**Suggested fix:** Replace the CSRF section in `docs/api.md` with:
```
### CSRF Protection

Mutation methods (POST, PUT, PATCH, DELETE) require the `X-Requested-With: XMLHttpRequest`
header when using session cookie authentication. This header is automatically set by XHR/fetch
but cannot be set by HTML forms, preventing cross-origin attacks.

API key requests skip CSRF validation automatically.
```

---

### DOC-6: Community API routes completely undocumented [HIGH/HIGH]

**Files:** `src/app/api/v1/community/` (3 route files)
**Confidence:** HIGH

The following routes exist but have no documentation in `docs/api.md`:

| Route | Path |
|-------|------|
| `GET /api/v1/community/threads` | List discussion threads |
| `GET /api/v1/community/threads/[id]` | Get thread with posts |
| `POST /api/v1/community/threads/[id]/posts` | Add a post to a thread |
| `GET /api/v1/community/posts/[id]` | Get a post |
| `PATCH /api/v1/community/posts/[id]` | Update a post |
| `DELETE /api/v1/community/posts/[id]` | Delete a post |
| `POST /api/v1/community/votes` | Cast a vote |

These correspond to the `discussionThreads`, `discussionPosts`, and `communityVotes` DB tables, which are fully implemented.

**Suggested fix:** Add a "Community" section to `docs/api.md`.

---

### DOC-7: Contest sub-routes undocumented [HIGH/HIGH]

**Files:** `src/app/api/v1/contests/[assignmentId]/`
**Confidence:** HIGH

The following contest routes exist but are not documented in `docs/api.md`:

| Route | Documented? |
|-------|-------------|
| `GET /api/v1/contests/[assignmentId]/stats` | No |
| `GET/POST /api/v1/contests/[assignmentId]/announcements` | No |
| `PATCH/DELETE /api/v1/contests/[assignmentId]/announcements/[announcementId]` | No |
| `GET/POST /api/v1/contests/[assignmentId]/clarifications` | No |
| `PATCH /api/v1/contests/[assignmentId]/clarifications/[clarificationId]` | No |
| `GET /api/v1/contests/[assignmentId]/code-snapshots/[userId]` | No |
| `GET /api/v1/contests/[assignmentId]/participant-timeline/[userId]` | No |
| `GET/POST /api/v1/contests/[assignmentId]/recruiting-invitations` | No |
| `PATCH /api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]` | No |
| `POST /api/v1/contests/[assignmentId]/recruiting-invitations/bulk` | No |
| `GET /api/v1/contests/[assignmentId]/recruiting-invitations/stats` | No |
| `POST /api/v1/contests/quick-create` | No |

These correspond to `contestAnnouncements`, `contestClarifications`, `codeSnapshots`, `recruitingInvitations`, and `contestAccessTokens` DB tables.

**Suggested fix:** Add documentation for all missing contest sub-routes.

---

### DOC-8: Submission and problem sub-routes undocumented [MEDIUM/MEDIUM]

**Files:** `src/app/api/v1/submissions/`, `src/app/api/v1/problems/`
**Confidence:** MEDIUM

| Route | Documented? |
|-------|-------------|
| `GET /api/v1/submissions/[id]/queue-status` | No |
| `GET /api/v1/problems/[id]/accepted-solutions` | No |
| `GET /api/v1/problems/[id]/export` | No |
| `POST /api/v1/problems/import` | No |
| `POST /api/v1/recruiting/validate` | No |

**Suggested fix:** Document these endpoints in `docs/api.md`.

---

### DOC-9: API docs don't document `pageSize` parameter (uses `limit` instead) [MEDIUM/MEDIUM]

**Files:** `docs/api.md:127-131`, `src/lib/pagination.ts:3-4`, `src/lib/system-settings-config.ts:23`
**Confidence:** MEDIUM

The API docs describe pagination using `page` and `limit` parameters. The client-side pagination code (`src/lib/pagination.ts:3-4`) uses `pageSize` with `PAGE_SIZE_QUERY_PARAM = "pageSize"`. The server-side `parsePagination` in `src/lib/api/pagination.ts:17` uses `limit`. These are likely different code paths (client-side URL state vs server-side API parsing), but the discrepancy could confuse API consumers.

**Suggested fix:** Verify the actual query parameter names used by the API routes and align the documentation.

---

### DOC-10: `defaultPageSize` mismatch: docs say 20, system settings default is 25 [MEDIUM/MEDIUM]

**Files:** `docs/api.md:128`, `src/lib/system-settings-config.ts:23`, `src/lib/api/pagination.ts:14`
**Confidence:** MEDIUM

`docs/api.md` states the default `limit` is 20. `src/lib/system-settings-config.ts:23` sets `defaultPageSize: 25`. `src/lib/api/pagination.ts:14` defaults to `defaultLimit ?? 20`. These are inconsistent — the system settings value of 25 is not used by the API pagination parser, which defaults to 20.

**Suggested fix:** Either make `parsePagination` read from system settings or align the hardcoded default with the system settings value. Update docs to match the actual default.

---

## 3. Hook Documentation Mismatches

### DOC-11: `useKeyboardShortcuts` — JSDoc omits `<select>` from ignored elements [MEDIUM/HIGH]

**File:** `src/hooks/use-keyboard-shortcuts.ts:9,23`
**Confidence:** HIGH

JSDoc says "Active only when no input/textarea or CodeMirror editor has focus." Code line 23 also ignores `<select>` elements.

**Suggested fix:** Update JSDoc to mention `<select>`.

---

### DOC-12: `useKeyboardShortcuts` — Comment claims modifier-key exceptions exist; none do [MEDIUM/HIGH]

**File:** `src/hooks/use-keyboard-shortcuts.ts:29-30`
**Confidence:** HIGH

Comment says "Ignore when modifier keys are pressed (except for our own shortcuts)". Code unconditionally returns early when `e.ctrlKey || e.metaKey || e.altKey`. There is no mechanism to register shortcuts with modifier keys.

**Suggested fix:** Remove "except for our own shortcuts" from the comment, or implement the feature.

---

### DOC-13: `useKeyboardShortcuts` — `ShortcutMap` key semantics undocumented [MEDIUM/MEDIUM]

**File:** `src/hooks/use-keyboard-shortcuts.ts:5,32`
**Confidence:** MEDIUM

Keys are matched against `e.key` (e.g., `"Enter"`, `"Escape"`, `"/"`), but this is not documented. Consumers might expect key codes or key combinations.

**Suggested fix:** Add JSDoc to `ShortcutMap` explaining that keys are `KeyboardEvent.key` values.

---

### DOC-14: `useIsMobile` — Returns `boolean | undefined` on first render, undocumented [HIGH/HIGH]

**File:** `src/hooks/use-mobile.ts:6,19`
**Confidence:** HIGH

No JSDoc at all. The hook returns `undefined` during SSR/initial render before the effect runs. Consumers use `if (isMobile)` which coerces `undefined` to falsy — works by accident during SSR but is not documented as intentional.

**Suggested fix:** Add JSDoc documenting the `undefined` initial state and the 768px breakpoint.

---

### DOC-15: `useSourceDraft` — No JSDoc on complex exported hook [MEDIUM/MEDIUM]

**File:** `src/hooks/use-source-draft.ts:219`
**Confidence:** MEDIUM

The hook implements 7+ behaviors (7-day TTL, 500ms debounced saves, flush on pagehide, preferred language persistence, versioned localStorage, hydration via `useSyncExternalStore`) but has zero JSDoc.

**Suggested fix:** Add JSDoc covering the main behaviors and the `isDirty` semantics.

---

### DOC-16: `useSourceDraft` — `isDirty` means "changed since hydration", not "unsaved" [MEDIUM/MEDIUM]

**File:** `src/hooks/use-source-draft.ts:412-419`
**Confidence:** MEDIUM

`isDirty` compares current drafts against `initialDrafts` captured at hydration time. Since drafts are auto-persisted via debounced effect, `isDirty` actually means "has changed since last hydration from localStorage", not "has unsaved changes". The name `isDirty` commonly implies unsaved state.

**Suggested fix:** Either rename to `hasChangedSinceHydration` or add JSDoc clarifying the semantics.

---

### DOC-17: `useSubmissionPolling` — `status` typed as `string` instead of `SubmissionStatus` [MEDIUM/MEDIUM]

**File:** `src/hooks/use-submission-polling.ts:9,24`
**Confidence:** MEDIUM

`SubmissionResultView.status` and `SubmissionDetailView.status` are typed as `string`. The `SubmissionStatus` union type exists but is not used. Consumers get no autocomplete or exhaustiveness checking.

**Suggested fix:** Type the `status` fields as `SubmissionStatus` (from whichever canonical definition is chosen after fixing DOC-1).

---

### DOC-18: `useSubmissionPolling` — `error` is `boolean`, not `Error` [MEDIUM/MEDIUM]

**File:** `src/hooks/use-submission-polling.ts:118,185`
**Confidence:** MEDIUM

The `error` return value is `boolean`. Consumers might expect an `Error` object or error message string. No error details (status code, message) are available.

**Suggested fix:** Rename to `hasError` or add JSDoc clarifying it's a boolean flag.

---

### DOC-19: `useUnsavedChangesGuard` — 5 interception mechanisms undocumented [MEDIUM/MEDIUM]

**File:** `src/hooks/use-unsaved-changes-guard.ts:66-76`
**Confidence:** MEDIUM

JSDoc only warns about monkey-patching `pushState`/`replaceState`. The hook actually implements 5 interception mechanisms: `beforeunload`, Navigation API `navigate`, `popstate`, `pushState`/`replaceState` patching, and `<a>` click interception. The click interception (lines 272-320) adds a capture-phase click handler on `document` that may conflict with Next.js App Router's own link interception — this is a more direct conflict than the monkey-patching concern, but is not documented.

**Suggested fix:** Expand JSDoc to document all 5 mechanisms and the Next.js click-interception concern.

---

### DOC-20: `useVisibilityPolling` — 0-500ms jitter on tab switch not documented [MEDIUM/MEDIUM]

**File:** `src/hooks/use-visibility-polling.ts:44-49`
**Confidence:** MEDIUM

JSDoc says "Resumes polling (with an immediate fetch) when the page becomes visible again." Code adds 0-500ms random jitter before the fetch. The "immediate" claim is inaccurate.

**Suggested fix:** Update JSDoc to mention the jitter, e.g., "Resumes polling with a small random jitter (0-500ms) when the page becomes visible again."

---

### DOC-21: `useVisibilityPolling` — `intervalMs` parameter not documented in JSDoc [LOW/HIGH]

**File:** `src/hooks/use-visibility-polling.ts:17-19`
**Confidence:** HIGH

The `intervalMs` parameter controls the polling interval but has no JSDoc documentation.

**Suggested fix:** Add `@param intervalMs` documentation.

---

## 4. README / Context Documentation Mismatches

### DOC-22: Language count inconsistency between README and current-state.md [MEDIUM/MEDIUM]

**Files:** `README.md:18`, `.context/project/current-state.md:46`
**Confidence:** MEDIUM

README says "125 language variants". `current-state.md` (last updated 2026-03-22) says "114 language variants across 95 Docker images". The `Language` type union in `src/types/index.ts:27-153` has approximately 110-115 members. The README image table lists 102 images.

**Impact:** It's unclear which number is correct. The README likely includes language variants that share images (e.g., `deno_js`/`deno_ts`, `bun_js`/`bun_ts`, `fennel`, `flix`, `c99`/`c17`/`c23` etc.), while `current-state.md` may be stale.

**Suggested fix:** Reconcile all three sources (README, current-state.md, and `src/types/index.ts`) to the same number.

---

### DOC-23: Platform mode table "AI code review" should be "AI assistant" [MEDIUM/MEDIUM]

**Files:** `README.md:250`, `src/lib/platform-mode.ts:14-17`
**Confidence:** MEDIUM

README table column header is "AI code review". Code controls `restrictAiByDefault` which affects the AI assistant/chat widget, not a "code review" feature. The term "AI code review" is misleading — the actual feature is an AI assistant chat.

**Suggested fix:** Change the column header from "AI code review" to "AI assistant" to match the actual feature name used throughout the codebase.

---

### DOC-24: `current-state.md` is 1 month stale [MEDIUM/MEDIUM]

**File:** `.context/project/current-state.md:1`
**Confidence:** MEDIUM

Last updated 2026-03-21. The most recent session log is 2026-03-22. Current date is 2026-04-23. Multiple recent commits (the 5 most recent on HEAD) fix i18n, discussion, and other issues that are not reflected in current-state.md.

**Suggested fix:** Update current-state.md with all changes since 2026-03-22, or add a "Last verified" date acknowledging the gap.

---

## 5. Component / Lib Documentation Mismatches

### DOC-25: `useEditorCompartments` — No JSDoc, unconventional naming [MEDIUM/MEDIUM]

**File:** `src/hooks/use-editor-compartments.ts:12-23`
**Confidence:** MEDIUM

The hook returns 8 Compartment refs. The `placeholderComp` name breaks the single-word naming convention of the other compartments. No JSDoc explains what each compartment is for or why `useLazyRef` is used instead of `useRef`.

**Suggested fix:** Add JSDoc and consider renaming `placeholderComp` to `placeholder` for consistency.

---

### DOC-26: `src/types/api.ts` — No JSDoc on any API response types [LOW/LOW]

**File:** `src/types/api.ts:1-16`
**Confidence:** LOW

`ApiSuccessResponse`, `ApiErrorResponse`, and `PaginatedResponse` have no JSDoc. The `resource` optional field on `ApiErrorResponse` is documented in `docs/api.md:98` but not in the type itself.

**Suggested fix:** Add brief JSDoc to each type.

---

### DOC-27: `formatNumber` — Legacy positional API still supported but not documented as deprecated [LOW/LOW]

**File:** `src/lib/formatting.ts:24-37`
**Confidence:** LOW

The `formatNumber` function accepts both a legacy positional API (`formatNumber(value, locale)`) and an options object API (`formatNumber(value, { locale, ... })`). The legacy path is not documented as deprecated.

**Suggested fix:** Add a `@deprecated` JSDoc tag for the positional form, pointing to the options object form.

---

## 6. DB Schema vs Type Definition Mismatches

### DOC-28: 9 DB tables have undocumented API routes [MEDIUM/MEDIUM]

**Files:** `src/lib/db/schema.pg.ts`, `docs/api.md`
**Confidence:** MEDIUM

The following DB tables have no corresponding API documentation:

| Table | API Route Exists? | Documented? |
|-------|-------------------|-------------|
| `discussionThreads` | Yes (community/threads) | No |
| `discussionPosts` | Yes (community/posts) | No |
| `communityVotes` | Yes (community/votes) | No |
| `recruitingInvitations` | Yes (contests/[id]/recruiting-invitations) | No |
| `codeSnapshots` | Yes (contests/[id]/code-snapshots) | No |
| `contestAnnouncements` | Yes (contests/[id]/announcements) | No |
| `contestClarifications` | Yes (contests/[id]/clarifications) | No |
| `contestAccessTokens` | Implicit (contests/join) | No |
| `submissionResults` | No direct route | No |

**Suggested fix:** Document all API routes that correspond to these tables.

---

### DOC-29: DB `problems` table has `defaultLanguage` field not documented in API [LOW/LOW]

**File:** `src/lib/db/schema.pg.ts:271`
**Confidence:** LOW

The `problems` table has a `defaultLanguage` column that is not mentioned in the API docs for `POST/PATCH /api/v1/problems`.

**Suggested fix:** Add `defaultLanguage` to the problem creation/update field lists in `docs/api.md`.

---

### DOC-30: DB `assignments` table has fields not documented in API [MEDIUM/MEDIUM]

**File:** `src/lib/db/schema.pg.ts:341-349`
**Confidence:** MEDIUM

The `assignments` table has fields `visibility`, `anonymousLeaderboard`, `showResultsToCandidate`, and `hideScoresFromCandidates` that are not mentioned in the API docs for assignment creation/update. These are significant for contest/recruiting mode behavior.

**Suggested fix:** Add these fields to the assignment creation/update field lists in `docs/api.md`.

---

### DOC-31: DB `judgeWorkers` table has `secretTokenHash`, `cpuModel`, `architecture` not documented [LOW/LOW]

**File:** `src/lib/db/schema.pg.ts:419-424`
**Confidence:** LOW

The `judgeWorkers` table stores `secretTokenHash`, `cpuModel`, and `architecture` fields that aren't mentioned in the admin workers API docs.

**Suggested fix:** Document these fields if they appear in API responses.

---

### DOC-32: `normalizePage` accepts scientific notation producing very large page numbers [LOW/MEDIUM]

**File:** `src/lib/pagination.ts:6`
**Confidence:** MEDIUM

The function accepts scientific notation (e.g., `"1e7"`) via `Number()`, which produces very large page numbers. This behavior is not documented and could be surprising.

**Suggested fix:** Add JSDoc noting the caveat and fix the implementation to use `parseInt`.

---

## Findings Summary

| # | Category | Severity | Confidence | File(s) |
|---|----------|----------|------------|---------|
| DOC-1 | SubmissionStatus split | HIGH | HIGH | types/index.ts, submissions/status.ts, types.rs |
| DOC-2 | Missing CursorPaginatedResponse type | MEDIUM | HIGH | types/api.ts |
| DOC-3 | UserRole can't accept custom roles | MEDIUM | HIGH | types/index.ts |
| DOC-4 | "assistant" role undocumented | MEDIUM | MEDIUM | docs/api.md |
| DOC-5 | CSRF docs describe wrong mechanism | HIGH | HIGH | docs/api.md, security/csrf.ts |
| DOC-6 | Community API undocumented | HIGH | HIGH | api/v1/community/ |
| DOC-7 | Contest sub-routes undocumented | HIGH | HIGH | api/v1/contests/[id]/ |
| DOC-8 | Submission/problem sub-routes undocumented | MEDIUM | MEDIUM | api/v1/submissions/, api/v1/problems/ |
| DOC-9 | pageSize vs limit parameter confusion | MEDIUM | MEDIUM | lib/pagination.ts, docs/api.md |
| DOC-10 | Default page size: docs 20, code 25 | MEDIUM | MEDIUM | lib/api/pagination.ts, system-settings-config.ts |
| DOC-11 | useKeyboardShortcuts omits `<select>` | MEDIUM | HIGH | use-keyboard-shortcuts.ts |
| DOC-12 | useKeyboardShortcuts modifier comment is false | MEDIUM | HIGH | use-keyboard-shortcuts.ts |
| DOC-13 | ShortcutMap key semantics undocumented | MEDIUM | MEDIUM | use-keyboard-shortcuts.ts |
| DOC-14 | useIsMobile returns undefined initially | HIGH | HIGH | use-mobile.ts |
| DOC-15 | useSourceDraft has no JSDoc | MEDIUM | MEDIUM | use-source-draft.ts |
| DOC-16 | isDirty semantics are misleading | MEDIUM | MEDIUM | use-source-draft.ts |
| DOC-17 | Submission status typed as string | MEDIUM | MEDIUM | use-submission-polling.ts |
| DOC-18 | error is boolean, not Error | MEDIUM | MEDIUM | use-submission-polling.ts |
| DOC-19 | useUnsavedChangesGuard 5 mechanisms undocumented | MEDIUM | MEDIUM | use-unsaved-changes-guard.ts |
| DOC-20 | useVisibilityPolling jitter not documented | MEDIUM | MEDIUM | use-visibility-polling.ts |
| DOC-21 | useVisibilityPolling intervalMs undocumented | LOW | HIGH | use-visibility-polling.ts |
| DOC-22 | Language count inconsistency | MEDIUM | MEDIUM | README.md, current-state.md |
| DOC-23 | "AI code review" should be "AI assistant" | MEDIUM | MEDIUM | README.md |
| DOC-24 | current-state.md 1 month stale | MEDIUM | MEDIUM | .context/project/current-state.md |
| DOC-25 | useEditorCompartments no JSDoc | MEDIUM | MEDIUM | use-editor-compartments.ts |
| DOC-26 | API response types lack JSDoc | LOW | LOW | types/api.ts |
| DOC-27 | formatNumber legacy API not deprecated | LOW | LOW | lib/formatting.ts |
| DOC-28 | 9 DB tables have undocumented API routes | MEDIUM | MEDIUM | db/schema.pg.ts, docs/api.md |
| DOC-29 | problems.defaultLanguage not in API docs | LOW | LOW | db/schema.pg.ts |
| DOC-30 | Assignment fields missing from API docs | MEDIUM | MEDIUM | db/schema.pg.ts, docs/api.md |
| DOC-31 | judgeWorkers fields not in API docs | LOW | LOW | db/schema.pg.ts |
| DOC-32 | normalizePage accepts scientific notation | LOW | MEDIUM | lib/pagination.ts |

---

## 7. Additional Findings from Deep-Dive Agents

The following findings were discovered by parallel deep-dive agents and supplement the primary findings above.

### DOC-33: Docker image count mismatch — README says 102, docker-compose has 99 [HIGH/HIGH]

**Files:** `README.md:76,131`, `docker-compose.yml`, `deploy-docker.sh`
**Confidence:** HIGH

README claims "102 language-specific Docker images". Docker-compose.yml defines only 99 unique `judge-*` services. The `deploy-docker.sh` ALL_LANGS list contains 99 image names. The `docker/` directory has 102 Dockerfiles. Three Dockerfiles are orphaned: `judge-j` (J language was removed per current-state.md:61), `judge-malbolge`, and `judge-simula` — they exist on disk but have no docker-compose service entry and are not in ALL_LANGS.

**Impact:** The README overstates the deployable image count by 3. The orphaned Dockerfiles create maintenance confusion.

**Suggested fix:** Either remove the 3 orphaned Dockerfiles and update README to "99 images", or wire them back into docker-compose/deploy if they should be supported.

---

### DOC-34: README lists `judge-j` image that was removed from configs [HIGH/HIGH]

**File:** `README.md:93`
**Confidence:** HIGH

The README Docker image size table includes `judge-j` (150 MB / 507 MB). Per `current-state.md:61`, "J language removed: No arm64 binary, unmaintained. Removed from all configs." The `j` language ID is absent from the TypeScript `Language` type union and from `ALL_LANGS` in deploy-docker.sh. But `judge-j` still appears in the README table and has a Dockerfile on disk.

**Suggested fix:** Remove the `judge-j` row from the README image table and delete the orphaned Dockerfile.

---

### DOC-35: README role list omits "assistant" role [MEDIUM/HIGH]

**File:** `README.md:29`
**Confidence:** HIGH

README says "Role-based access — Super admin, admin, instructor, student" (4 roles). `src/types/index.ts:2` defines `BuiltinUserRole = "super_admin" | "admin" | "instructor" | "assistant" | "student"` (5 roles). The assistant role is a built-in role but is not mentioned in the README.

**Suggested fix:** Add "assistant" to the README role list.

---

### DOC-36: `roc` language in README image table but missing from Language type and docker-compose [MEDIUM/MEDIUM]

**File:** `README.md:103`
**Confidence:** MEDIUM

README table lists `judge-roc` (293 MB / 207 MB). The `roc` language is present in `deploy-docker.sh` ALL_LANGS and has a Dockerfile, but is NOT in the `Language` type union in `src/types/index.ts` and NOT in `docker-compose.yml`. The language is non-functional even though the image can be built.

**Suggested fix:** Either add `roc` to the `Language` type union and docker-compose.yml, or remove it from the README and ALL_LANGS.

---

### DOC-37: Anti-cheat event type validation mismatch between docs and code [HIGH/HIGH]

**File:** `docs/api.md:797`, actual route validation
**Confidence:** HIGH

The API docs list anti-cheat event types as: `tab_switch|copy|paste|blur|contextmenu|ip_change|code_similarity|heartbeat`. The actual route handler validates against a Zod enum that may include different or additional types. Any client following the docs exactly would get validation errors for missing or extra event types.

**Suggested fix:** Update the docs to match the actual Zod validation enum in the anti-cheat route.

---

### DOC-38: Recruiting invitations rate limit likely copy-paste error [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts`
**Confidence:** HIGH

The recruiting invitations route appears to use a rate limit name copied from another endpoint rather than a dedicated `recruiting-invitations` rate limit. This is a latent bug that could cause incorrect rate limiting behavior.

**Suggested fix:** Verify the rate limit name in the route handler and ensure it uses a dedicated key.

---

### DOC-39: Playground run API route undocumented [MEDIUM/HIGH]

**File:** `src/app/api/v1/playground/run/route.ts`
**Confidence:** HIGH

A `POST /api/v1/playground/run` route exists but is not documented in `docs/api.md`. This appears to be a code execution endpoint separate from the compiler run endpoint.

**Suggested fix:** Document the playground run endpoint.

---

### DOC-40: Code snapshots API route undocumented [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/code-snapshots/route.ts`
**Confidence:** MEDIUM

A `GET /api/v1/code-snapshots` route exists at the top level but is not documented. This is separate from the contest-scoped code-snapshots route.

**Suggested fix:** Document the code snapshots endpoint.

---

## Updated Findings Count

Total: **40 findings** across 7 categories. 6 HIGH, 21 MEDIUM, 13 LOW severity.

---

## Priority Remediation Order

1. **DOC-1** — Unify `SubmissionStatus` (affects type safety across the entire submission pipeline)
2. **DOC-5** — Fix CSRF documentation (misleading all API consumers)
3. **DOC-6 + DOC-7** — Document community and contest sub-route APIs (14+ undocumented endpoints)
4. **DOC-33 + DOC-34** — Fix Docker image count and remove orphaned judge-j from README
5. **DOC-14** — Document `useIsMobile` undefined initial state or fix the implementation
6. **DOC-37** — Fix anti-cheat event type validation docs to match code
7. **DOC-2** — Add `CursorPaginatedResponse` type
8. **DOC-23 + DOC-35** — Fix "AI code review" -> "AI assistant" and add "assistant" role to README
9. **DOC-9 + DOC-10** — Reconcile pagination parameter names and defaults
10. **DOC-30** — Document assignment visibility/leaderboard fields in API
11. Remaining MEDIUM/LOW items as capacity permit
