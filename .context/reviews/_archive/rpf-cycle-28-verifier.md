# RPF Cycle 28 — Verifier Report

**Date:** 2026-04-23
**Base commit:** ca62a45d
**Scope:** Evidence-based correctness check across API routes, components/hooks, and security infrastructure

---

## Previously Fixed Items (Verified Resolved)

All cycle 27 and cycle 9 aggregate findings have been verified as fixed in the current codebase:

- **AGG-1 (cycle 28)** localStorage crash in compiler-client and submission-detail-client: **FIXED** — both `localStorage.setItem` calls wrapped in try/catch (`compiler-client.tsx:188`, `submission-detail-client.tsx:94`)
- **V-1 (cycle 27)** Recruit page temporal logic: **FIXED** — uses `getDbNow()` instead of `new Date()` for expiry/deadline checks (`recruit/[token]/page.tsx:37,99,177`)
- **V-2 (cycle 27)** `toLocaleString()` locale: **FIXED** — replaced with `formatDateTimeInTimeZone(assignment.deadline, locale)` (`recruit/[token]/page.tsx:228`)
- **AGG-1 through AGG-4 (cycle 9)** Discussion component fixes: **FIXED** — all discussion components now use i18n labels via props, check `response.ok` before `.json()`, and use `.catch(() => ({}))` on error path JSON parsing
- **All localStorage writes** across the codebase: **VERIFIED** — all 5 `localStorage.setItem` calls are try/catch wrapped

---

## New Findings

### V-1: `normalizePage` accepts scientific notation — allows page=1e7 producing massive OFFSET [MEDIUM/HIGH]

**Confidence:** HIGH

**File:** `src/lib/pagination.ts:5-12`

**Description:** `Number("1e7")` = 10,000,000 passes all guards. `Number.isFinite(10000000)` is true, `10000000 >= 1` is true, `Math.floor(10000000)` = 10000000. With pageSize=50, this produces `OFFSET 499999950`, a full table scan that could time out or exhaust memory.

**Concrete failure scenario:** An attacker sends `?page=1e7` to any paginated endpoint. The query performs a full table scan with a massive OFFSET, consuming database resources and potentially causing a denial-of-service condition.

**Fix:** Use `parseInt(value, 10)` and add an upper bound:
```ts
export function normalizePage(value?: string) {
  const parsed = parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 10000);
}
```

---

### V-2: Judge routes return HTTP 500 for malformed JSON body instead of HTTP 400 [MEDIUM/HIGH]

**Confidence:** HIGH

**Files:**
- `src/app/api/v1/judge/register/route.ts:34`
- `src/app/api/v1/judge/claim/route.ts:64`
- `src/app/api/v1/judge/deregister/route.ts:24`
- `src/app/api/v1/judge/heartbeat/route.ts:30`
- `src/app/api/v1/judge/poll/route.ts:32`
- `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:33`
- `src/app/api/v1/groups/[id]/assignments/route.ts:109`

**Description:** These routes use `schema.safeParse(await request.json())` or `await request.json()` without a try/catch around the JSON parsing. When `request.json()` throws (malformed body, truncated payload, `null` body), the outer catch returns `{ error: "internalServerError" }` with status 500 instead of `{ error: "invalidJson" }` with status 400.

The `createApiHandler` wrapper correctly wraps `req.json()` in try/catch and returns 400 (`handler.ts:153-158`), but these routes are raw handlers that haven't been migrated yet (per DEFER-1).

**Concrete failure scenario:** A judge worker sends a truncated JSON body due to a network glitch. The route returns 500 "internalServerError". The worker interprets this as a server bug and retries indefinitely with the same malformed payload, creating a retry loop.

**Fix:** Wrap `request.json()` in try/catch returning 400 on parse failure, or migrate to `createApiHandler` with `schema`:
```ts
let raw: unknown;
try { raw = await request.json(); } catch { return apiError("invalidJson", 400); }
const parsed = schema.safeParse(raw);
```

---

### V-3: `test-connection/route.ts` uses `auth()` instead of `getApiUser()` — API key auth broken [MEDIUM/MEDIUM]

**Confidence:** HIGH

**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:24`

**Description:** The route sets `auth: false` in `createApiHandler` and performs its own auth check using `const session = await auth()` (the NextAuth server action). `auth()` only supports session cookie authentication. All other admin routes use `getApiUser()` which supports both session cookies and API key Bearer tokens.

**Concrete failure scenario:** An admin who uses API key authentication (e.g., CI/CD pipeline) calls `POST /api/v1/plugins/chat-widget/test-connection`. The `auth()` call returns null (no session cookie), and the endpoint returns 401 even with a valid API key.

**Fix:** Replace `auth()` with `getApiUser(req)`:
```ts
const user = await getApiUser(req);
if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
const caps = await resolveCapabilities(user.role);
if (!caps.has("system.plugins")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
```

---

### V-4: Race condition in `recruiting-invitations-panel.tsx` search — stale data displayed [MEDIUM/MEDIUM]

**Confidence:** HIGH

**File:** `src/components/contest/recruiting-invitations-panel.tsx:112-148`

**Description:** `fetchInvitations` is a `useCallback` depending on `search` and `statusFilter`. The `useEffect` at line 146 calls `fetchData()` whenever `fetchData` changes. Since `search` changes on every keystroke, each keystroke triggers an immediate API fetch with no debouncing and no `AbortController`. If an earlier fetch resolves after a later one, the invitations list shows stale results.

**Concrete failure scenario:** User types "abc" in the search field. Three fetches are initiated: one for "a", one for "ab", one for "abc". If the "a" fetch resolves last (slow server), the invitations list shows results for query "a" instead of "abc".

**Fix:** Either (a) debounce the `search` state value before passing it into `fetchInvitations`, or (b) use an `AbortController` in `fetchInvitations` that cancels the previous in-flight request before starting a new one.

---

### V-5: Raw API error string shown to user in `discussion-vote-buttons.tsx` [MEDIUM/MEDIUM]

**Confidence:** HIGH

**File:** `src/components/discussions/discussion-vote-buttons.tsx:46`

**Description:** When the vote API returns a non-ok response, the raw `errorBody.error` string is shown directly to the user via `toast.error`. This bypasses i18n. The sibling components (`discussion-post-form.tsx:48`, `discussion-thread-form.tsx:54`, `discussion-post-delete-button.tsx:30`) all correctly use `throw new Error(errorLabel)` (an i18n key), never surfacing the raw API error to the user.

**Concrete failure scenario:** A Korean-language user votes on a discussion post. The server returns `{ "error": "Rate limit exceeded" }`. The toast shows "Rate limit exceeded" in English instead of the localized `voteFailedLabel`.

**Fix:** Replace line 46 with `toast.error(voteFailedLabel);` and keep the raw error only in `console.error` for debugging, matching the pattern used in the other discussion components.

---

### V-6: Raw API error string shown to user in `problem-submission-form.tsx` handleRun [MEDIUM/MEDIUM]

**Confidence:** HIGH

**File:** `src/components/problem/problem-submission-form.tsx:185`

**Description:** The `handleRun` callback (compiler "Run" button) shows the raw `errorBody.error` string to the user. The same component's `handleSubmit` at line 248 correctly routes errors through `translateSubmissionError()`, which maps raw errors to i18n keys.

**Concrete failure scenario:** User clicks "Run" on code. The compiler API returns `{ "error": "Language python3 is not available on this judge" }`. The toast displays this raw English string. If the same user then clicks "Submit", the same class of error would be properly translated through `translateSubmissionError`.

**Fix:** Route the run-path error through `translateSubmissionError` the same way the submit path does, or at minimum show only `tCommon("error")` and log the raw error.

---

### V-7: `comment-section.tsx` silently ignores non-OK responses on fetch [MEDIUM/MEDIUM]

**Confidence:** HIGH

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:42-52`

**Description:** The `fetchComments` function has no `else` branch after `if (response.ok)`. Non-OK responses are silently ignored. If the API returns 401 (expired session) or 500, the user sees no feedback — the comment list just stays empty or stale.

**Concrete failure scenario:** A user's session expires while viewing a submission. The comments fetch returns 401. No error is shown. The user believes there are simply no comments.

**Fix:** Add an `else` branch with a toast error:
```ts
if (response.ok) {
  // ... existing logic
} else {
  toast.error(tComments("loadError"));
}
```

---

### V-8: Thread deletion has no confirmation dialog — inconsistent with post deletion [MEDIUM/MEDIUM]

**Confidence:** HIGH

**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:92`

**Description:** `deleteThread()` is called directly from the Button's `onClick`. Post deletion uses `DestructiveActionDialog`. Thread deletion is more destructive (destroys entire thread + all replies) but has less protection.

**Concrete failure scenario:** A moderator accidentally clicks the "Delete" button. The thread and all replies are permanently deleted with no confirmation step and no undo.

**Fix:** Add `DestructiveActionDialog` or `AlertDialog` wrapper matching the post deletion pattern.

---

### V-9: Unwrapped `localStorage.getItem` in `compiler-client.tsx` [LOW/MEDIUM]

**Confidence:** MEDIUM

**File:** `src/components/code/compiler-client.tsx:164`

**Description:** `window.localStorage.getItem("compiler:language")` is not wrapped in try/catch. The corresponding `localStorage.setItem` at line 188 IS wrapped in try/catch with a comment acknowledging private browsing. In older Safari versions and certain privacy-focused browser configurations, `localStorage.getItem()` can throw a `SecurityError`. Since this code runs inside a `useEffect`, an uncaught exception would be reported as an unhandled error in a React effect.

**Concrete failure scenario:** User opens the compiler page in Safari private browsing on an older iOS device. `localStorage.getItem()` throws. React logs an unhandled error. The language preference is not restored (benign) but the error is noisy and could trigger error boundaries.

**Fix:** Wrap in try/catch:
```ts
let savedLanguage: string | null = null;
try { savedLanguage = window.localStorage.getItem("compiler:language"); } catch { /* unavailable */ }
```

---

### V-10: `group-members-manager.tsx` success-first pattern violation in remove handler [LOW/MEDIUM]

**Confidence:** MEDIUM

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:219-222`

**Description:** The remove handler reads the response body (`await response.json().catch(() => ({}))`) before checking `!response.ok`. If the response is non-OK with a non-JSON body, `.catch(() => ({}))` returns `{}`, then `payload.error` is `undefined`, and the throw message falls back to `"memberRemoveFailed"` — which works but is inconsistent with the add/bulk handlers in the same file that use the success-first pattern (`if (!response.ok) { ... }` first, then `response.json()` on the success path).

**Concrete failure scenario:** Minor inconsistency — if the API returns a non-OK non-JSON response, the error message is always the generic fallback rather than the server's error message.

**Fix:** Use success-first pattern matching the other handlers in the same file.

---

### V-11: Judge IP allowlist defaults to "allow all" when not configured [LOW/MEDIUM]

**Confidence:** HIGH

**File:** `src/lib/judge/ip-allowlist.ts:77-83`

**Description:** When `JUDGE_ALLOWED_IPS` is not set in the environment, `isJudgeIpAllowed()` returns `true` for every IP. The comment on line 80 says "temporary for worker access". The Bearer token provides primary protection, but IP allowlisting is the defense-in-depth layer. If the `JUDGE_AUTH_TOKEN` ever leaks, there is no secondary network-layer boundary.

**Concrete failure scenario:** `JUDGE_AUTH_TOKEN` is leaked via log exposure or env dump. An attacker from any IP can submit fake judge results, corrupting submission verdicts.

**Fix:** In production, deny by default when no allowlist is configured, or emit a loud startup warning.

---

## Verified Safe / No Regression

- **No `as any`** in production code (grep confirmed zero matches)
- **No `@ts-ignore`/`@ts-expect-error`** in production code (grep confirmed zero matches)
- **All localStorage writes** try/catch wrapped (5 of 5)
- **Auth flow** robust with proper session validation, CSRF, and rate limiting
- **Argon2id** with OWASP-recommended parameters, timing-safe dummy hash for user enumeration prevention
- **Token revocation** on password change properly invalidates sessions
- **Atomic rate limiting** using `SELECT FOR UPDATE` in transactions (no TOCTOU)
- **Encryption** uses AES-256-GCM with HKDF-SHA256 key derivation and domain separation
- **Judge worker auth** uses hashed secrets with timing-safe comparison and claim tokens
- **CSRF** properly enforced on all cookie-authenticated mutation endpoints, correctly skipped for API key auth
- **Input validation** uses Zod schemas on all `createApiHandler` routes; raw routes manually validate
- **SQL injection** prevented via Drizzle ORM parameterized queries
- **File storage** protected against path traversal using nanoid names
- **CSP** uses nonces for script-src (no `unsafe-inline` for scripts)
- **Korean letter-spacing** compliance verified (no custom `tracking-*` on Korean text)
- **SSE connection tracking** uses per-connection IDs with periodic stale-entry cleanup
- **Sign-out** properly clears app-specific storage prefixes
- **npm audit** returns 0 vulnerabilities

---

## Carried-Forward Deferred Items

From prior cycles, still open:
- **DEFER-1**: Migrate raw route handlers to `createApiHandler` (18 routes remain — V-2 above is partially caused by this)
- **DEFER-24**: `window.location.origin` usage in 3 client components (`access-code-manager.tsx:134`, `recruiting-invitations-panel.tsx:97`, `file-management-client.tsx:96`)
- **DEFER-11/AGG-4 (cycle 28)**: Duplicated visibility-aware polling pattern across 4 components
- **DEFER-20**: Contest clarifications show raw userId instead of username (`contest-clarifications.tsx:237` shows `t("askedByOther")` for non-self users — no username available from API)
- **AGG-5 (cycle 9)**: Recruiter-candidates full endpoint fetch (low priority)
- **AGG-6 (cycle 9)**: Vote `router.refresh()` after local state update (low priority)
