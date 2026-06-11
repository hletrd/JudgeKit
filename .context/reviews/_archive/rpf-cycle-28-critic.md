# RPF Cycle 28 — Multi-Perspective Critic Review

**Date:** 2026-04-23 | **HEAD:** ca62a45d | **Reviewer:** critic
**Scope:** Full repository — auth, API, components, DB, realtime, i18n, cross-cutting

---

## Summary

The codebase is mature and well-structured for a Next.js competitive programming platform. The core abstractions — `createApiHandler`, capability-based auth, Drizzle ORM schema, SSE realtime — are solid. However, this review surfaced **22 findings** across security, consistency, UX, and operational perspectives. The most critical cluster around: **inconsistent auth middleware coverage** (some routes bypass the standard handler), **residual plaintext secrets in the schema**, **a hardcoded English error string in the proxy**, and **a silent error-swallowing pattern in discussion components**.

---

## Findings

### CRIT-01: Inconsistent auth/CSRF/rate-limit across API routes
**File:** `src/app/api/v1/files/route.ts:20-141` (POST handler) vs `:143-195` (GET handler)
**Perspectives:** Developer, Security
**Confidence:** High

`POST` manually calls `getApiUser`, `csrfForbidden`, `consumeApiRateLimit`, and `resolveCapabilities`. `GET` uses `createApiHandler` which bundles all of these. Across the codebase, ~50 files use `createApiHandler` while ~11 files still manually call `getApiUser`. The manual routes must replicate CSRF checks, rate limiting, capability checks, and error formatting — any omission is a security gap.

**Failure scenario:** A developer adds a new mutation to a manual-auth route and forgets the CSRF check, enabling cross-origin attacks.

**Fix:** Migrate all remaining manual-auth routes to `createApiHandler`. For routes that cannot use it (e.g., SSE streaming, multipart/form-data), extract the middleware checks into a composable function so the pattern is DRY even when the handler wrapper cannot be used.

---

### CRIT-02: Hardcoded English string in proxy middleware
**File:** `src/proxy.ts:311`
**Perspectives:** User, i18n
**Confidence:** High

```typescript
return NextResponse.json({ error: "Password change required" }, { status: 403 });
```

Every other auth-layer error uses a machine-readable key (e.g., `"unauthorized"`, `"csrfValidationFailed"`). This one uses a human-readable English sentence. Client code that matches on `error` strings will fail for Korean users.

**Failure scenario:** A client-side error handler checks `error === "Password change required"` — it works in English but the string is never translated, creating an inconsistent UX. Worse, if someone later changes the wording, the API contract silently breaks.

**Fix:** Change to a key like `"mustChangePassword"` and handle the display text on the client via i18n.

---

### CRIT-03: Plaintext `secretToken` column still exists on `judgeWorkers`
**File:** `src/lib/db/schema.pg.ts:418`
**Perspectives:** Security, Operator
**Confidence:** Medium

The column `secretToken: text("secret_token")` persists in the schema despite being deprecated in favor of `secretTokenHash`. The register route (`src/app/api/v1/judge/register/route.ts:56`) writes `secretToken: null` on insert, but the column remains. If any legacy code path or migration script writes the plaintext, it becomes a credential leak vector.

**Failure scenario:** A database backup or admin query tool exposes the `secretToken` column. If any worker was registered before the hash migration, its plaintext token is readable.

**Fix:** Add a migration to drop the `secretToken` column entirely. Until then, add a DB-level check constraint or trigger that rejects non-null inserts.

---

### CRIT-04: Plaintext `token` column on `recruitingInvitations` with unique index
**File:** `src/lib/db/schema.pg.ts:960-961`
**Perspectives:** Security
**Confidence:** Medium

```typescript
token: text("token"),
// ...
uniqueIndex("ri_token_idx").on(table.token),
```

The schema comment says "Plaintext token is deprecated" but the column and its unique index remain. Lookups now use `tokenHash` (line 961), but the `token` column with a unique index means the plaintext invite token is stored and indexed in the database — a direct credential exposure risk.

**Failure scenario:** A DB dump or SQL injection exposes all active recruiting tokens, allowing unauthorized access to the recruitment flow.

**Fix:** Drop the `token` column and its index in a migration. If backwards compatibility is needed during rollout, add a migration that nullifies all existing `token` values first, then drops the column.

---

### CRIT-05: Discussion components use `console.error` instead of structured logging
**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:51,71`
**File:** `src/components/discussions/discussion-post-form.tsx:47`
**File:** `src/components/discussions/discussion-thread-form.tsx:53`
**File:** `src/components/discussions/discussion-post-delete-button.tsx:29`
**Perspectives:** Developer, Operator
**Confidence:** Medium

Five `console.error` calls in discussion components log raw error objects to the browser console. In production, this leaks API error structure to anyone with DevTools open. The rest of the codebase uses `logger.error` on the server and `toast.error` on the client.

**Failure scenario:** An attacker opens DevTools during a failed discussion action and sees the full API error response structure, including internal error codes that reveal backend behavior.

**Fix:** Remove all `console.error` calls from client components. If client-side error logging is needed, use a thin wrapper that respects `NODE_ENV` and strips sensitive details in production. The `toast.error` already shows the user-facing message — the `console.error` is redundant.

---

### CRIT-06: `users.isActive` is nullable boolean — three-state trap
**File:** `src/lib/db/schema.pg.ts:35`
**Perspectives:** Developer, Security
**Confidence:** High

```typescript
isActive: boolean("is_active").default(true),
```

The column has no `.notNull()` constraint, meaning it can be `true`, `false`, or `null`. Auth checks like `if (!user?.isActive)` treat `null` as falsy (blocking access), but query filters like `eq(users.isActive, true)` will NOT match rows where `isActive` is `null`. This creates an inconsistency: a user with `isActive = null` would pass some checks but fail others.

**Failure scenario:** An admin sets `isActive` to null instead of false. The proxy auth check (`!activeUser`) blocks the user, but the `getApiUser` query's `eq(users.isActive, true)` filter also misses them — resulting in confusing 401s with no audit trail.

**Fix:** Add `.notNull()` to the schema column definition and a migration to set `isActive = true` where it is null.

---

### CRIT-07: SSE connection tracking O(n) eviction scan
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Perspectives:** Operator, Perf
**Confidence:** Medium

When `connectionInfoMap` exceeds `MAX_TRACKED_CONNECTIONS` (1000), eviction scans all entries to find the oldest by `createdAt`:

```typescript
while (connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS) {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, info] of connectionInfoMap) { ... }
```

This is O(n) per eviction. Under high connection churn, this runs on every new SSE connection.

**Failure scenario:** During a contest with many participants, a burst of SSE connections triggers repeated O(n) scans, causing latency spikes in the SSE handshake path.

**Fix:** Use a doubly-linked-list + Map pattern (LRU cache) for O(1) eviction by insertion order, or use a MinHeap keyed on `createdAt` for O(log n) oldest-first eviction.

---

### CRIT-08: Code snapshot timer silently swallows errors
**File:** `src/components/problem/problem-submission-form.tsx:110-114`
**Perspectives:** Developer, Operator
**Confidence:** High

```typescript
void apiFetch("/api/v1/code-snapshots", {
  method: "POST",
  ...
}).catch(() => {});
```

The code snapshot upload silently swallows all errors with `.catch(() => {})`. If the code snapshot endpoint is down or returns 500, there is zero visibility. During an exam with anti-cheat enabled, these snapshots are the primary forensic record.

**Failure scenario:** The code-snapshots API endpoint starts returning 500 errors. Students' code snapshots are silently lost. During an integrity investigation, there is no snapshot history for the affected period — and nobody was alerted.

**Fix:** At minimum, log the error (server-side or via `logger` in an API route). Consider adding a client-side counter and showing a subtle warning if N consecutive snapshot uploads fail, since these are exam-critical.

---

### CRIT-09: Countdown timer threshold warnings missed on background tabs
**File:** `src/components/exam/countdown-timer.tsx:99-139`
**Perspectives:** User
**Confidence:** Medium

The timer uses `setInterval(recalculate, 1000)` which is throttled in background tabs. There IS a `visibilitychange` handler (line 128-132) that recalculates on tab focus — this mitigates drift. However, the threshold-based toast warnings (15min, 5min, 1min) are only fired inside `recalculate()`, so if the tab is in the background during a threshold crossing, the student never sees the warning.

**Failure scenario:** A student works in another window during an exam. The 5-minute warning fires while the tab is hidden. The student switches back with 2 minutes left, having missed the warning. They feel the timer is inaccurate.

**Fix:** When the tab becomes visible, check if any thresholds were crossed while hidden and fire the missed toasts retroactively. The `firedThresholds` ref already tracks which thresholds fired, so the fix is to compare the current `diff` against all thresholds on visibility change and fire any that were missed.

---

### CRIT-10: Recruiting invitations panel — no debounce on search
**File:** `src/components/contest/recruiting-invitations-panel.tsx:112-128`
**Perspectives:** Perf, Operator
**Confidence:** High

`fetchInvitations` is called on every `search` or `statusFilter` change via the `fetchData` effect (line 146-148). Each keystroke triggers an API request. The `search` state is bound directly to the input `onChange`.

**Failure scenario:** A recruiter types a candidate name rapidly. Each keystroke fires a separate API request, creating 10+ concurrent requests. Under load, this causes API rate-limit hits (429s) and slow responses for all users.

**Fix:** Add a debounce (300-500ms) on the `search` input before triggering `fetchData`. Use `useDeferredValue` or a simple `useRef`+`setTimeout` pattern.

---

### CRIT-11: Recruiting invitations — token exposed in client-side link construction
**File:** `src/components/contest/recruiting-invitations-panel.tsx:192-194`
**Perspectives:** Security
**Confidence:** Medium

```typescript
const link = `${baseUrl}/recruit/${token}`;
setCreatedLink(link);
```

The raw recruiting token is embedded in a client-side URL and stored in React state. It's also displayed in a `<code>` element (line 331). The token grants access to the recruitment flow — if the browser history, screenshot, or screen sharing exposes this URL, the token is compromised.

**Failure scenario:** A recruiter shares their screen during a meeting. The created invitation link with the plaintext token is visible in the dialog. An attendee uses the token to access the recruiting contest.

**Fix:** This is partially inherent to the invite-link model (similar to password-reset tokens). Mitigation: auto-copy to clipboard without displaying the full URL, or show a truncated/masked version with an explicit "reveal" toggle.

---

### CRIT-12: `rateLimits` table repurposed for SSE connection tracking
**File:** `src/lib/realtime/realtime-coordination.ts:120-128`
**Perspectives:** Developer, Operator
**Confidence:** Medium

The `rateLimits` table is used both for actual rate limiting and for SSE connection slot tracking (via key prefix `realtime:sse:user:`). The `acquireSharedSseConnectionSlot` function inserts rows with `attempts: 1` and uses `blockedUntil` as the slot expiry. This overloads the table's semantics.

**Failure scenario:** An operator queries `rate_limits` to understand login throttling and sees thousands of rows with `key LIKE 'realtime:sse:%'`. The `attempts` and `consecutiveBlocks` columns are meaningless for SSE slots, creating confusion. A retention policy that prunes old rate limit entries may also inadvertently release SSE slots early.

**Fix:** Either add a `category` column to `rateLimits` to distinguish purposes, or create a dedicated `sse_connection_slots` table with appropriate columns (userId, connectionId, expiresAt).

---

### CRIT-13: Proxy middleware route classification is implicit
**File:** `src/proxy.ts:228-239`
**Perspectives:** Security, Developer
**Confidence:** Medium

The proxy middleware classifies routes into `isAuthPage`, `isChangePasswordPage`, `isProtectedRoute` via string matching. Routes that fall through all checks (like `/recruit/:path*`) are treated as public by default. There is no explicit `isPublicPage` classification — the recruit page's public status is accidental rather than intentional.

**Failure scenario:** A developer adds a new route to the matcher but doesn't realize it's not classified as protected. They assume it's auth-guarded because it's in the matcher, but it's actually fully public.

**Fix:** Add an explicit `isPublicPage` classification and document which routes are intentionally public vs protected. Consider inverting the logic: routes are protected by default unless explicitly marked public.

---

### CRIT-14: i18n locale resolution has duplicate logic
**File:** `src/proxy.ts:85-111` and `src/i18n/request.ts:6-45`
**Perspectives:** Developer
**Confidence:** Medium

Both files implement locale resolution with the same priority order: explicit query param > cookie > Accept-Language > system default. The implementations are slightly different — `proxy.ts` uses `x-locale-override` / `x-public-locale-mode` headers to communicate the resolved locale to `request.ts`. This works but the logic is duplicated and the two implementations can drift.

**Failure scenario:** A developer adds a new locale source (e.g., user profile preference) to `request.ts` but forgets to update `proxy.ts`. The proxy's CSP headers and `Vary` headers are now based on stale locale resolution logic.

**Fix:** Extract locale resolution into a single shared function. The proxy can call it and pass the result via headers; `request.ts` can either use the proxy's result or call the same function.

---

### CRIT-15: `rawQueryOne`/`rawQueryAll` accept arbitrary SQL with named parameters
**File:** `src/lib/db/queries.ts:31-52`
**Perspectives:** Security, Developer
**Confidence:** Medium

These functions accept raw SQL strings with named parameter substitution (`@name` → `$1`). The parameter names are validated with a regex (`/^[a-zA-Z_]\w*$/`), but the SQL itself is not sanitized or restricted. Any caller can pass arbitrary SQL including DDL statements.

**Failure scenario:** A developer writes `rawQueryAll("DROP TABLE users")` — it executes. Or more subtly, a string concatenation error introduces SQL injection through the SQL parameter rather than the named params.

**Fix:** This is a known trade-off for raw SQL access. Mitigation: restrict these functions to read-only queries by running them in a read-only transaction, or add a lint rule that flags all callers of `rawQuery*` for review.

---

### CRIT-16: Build-phase drizzle instance uses fake connection string
**File:** `src/lib/db/index.ts:31`
**Perspectives:** Developer
**Confidence:** Low

```typescript
db = drizzle("postgres://build:build@localhost:5432/build", {
  schema: schemaWithRelations,
});
```

During build phase, a dummy connection string is used. If the build accidentally executes a real query (not just type-checking), it will fail with a connection error — but the error message will reference `build:build@localhost:5432/build`, which could confuse developers. More importantly, if `DATABASE_URL` is set during build but points to a real database, the build-phase check (`NEXT_PHASE === "phase-production-build"`) would be bypassed and real queries could execute.

**Failure scenario:** A CI pipeline sets `DATABASE_URL` to a test database and also runs `next build`. If the phase detection fails, the build could accidentally run queries against the test database.

**Fix:** Add a defensive check: if `DATABASE_URL` is set during build phase, log a warning. Consider also asserting that no queries are actually executed during the build.

---

### CRIT-17: Recruiting panel password-reset response not wired to UI
**File:** `src/components/contest/recruiting-invitations-panel.tsx:255-274`
**Perspectives:** User, Security
**Confidence:** High

When an admin resets a candidate's password, the `handleResetAccountPassword` function calls the API but never reads the generated password from the response. The component has a `revealedTemporaryPassword` state (line 85) with a 60-second auto-clear timer (line 99-103), but the handler never sets it. The password reset succeeds on the server but the admin never sees the new password.

**Failure scenario:** An admin resets a candidate's password. The API returns the new password, but the UI doesn't display it. The candidate is locked out because nobody knows the new password. The admin must reset again.

**Fix:** Parse the API response for the generated password and set `revealedTemporaryPassword` state. Display it in a dialog with copy-to-clipboard support.

---

### CRIT-18: AntiCheatMonitor copy/paste captures DOM element text snippets
**File:** `src/components/exam/anti-cheat-monitor.tsx:197-205`
**Perspectives:** Security, Privacy
**Confidence:** Medium

The `describeElement` function captures up to 80 characters of element `textContent` when reporting copy/paste events:

```typescript
const text = (el.textContent ?? "").trim().slice(0, 80);
return `${tag.toLowerCase()} in .${parentClass}${text ? `: "${text}"` : ""}`;
```

This means that if a student copies a portion of the problem description, the copied text snippet is sent to the server as part of the anti-cheat event. While this is arguably useful for forensic analysis, it also means the anti-cheat events table contains snippets of problem content.

**Failure scenario:** A student copies a math formula from the problem description. The formula text is stored in `anti_cheat_events.details`. An admin reviewing anti-cheat logs can see what portion of the problem the student was viewing, which may include answer-revealing hints.

**Fix:** Limit the `describeElement` output to structural information only (tag, parent class) without the text content. If text snippets are needed for forensics, make it an opt-in configuration at the assignment level.

---

### CRIT-19: Vote button `router.refresh()` after every vote
**File:** `src/components/discussions/discussion-vote-buttons.tsx:57`
**Perspectives:** Perf, User
**Confidence:** Medium

```typescript
router.refresh();
```

After a successful vote, `router.refresh()` triggers a full server component revalidation. The vote response already returns the updated `score` and `currentUserVote` (lines 49-56), so the optimistic state update is immediately visible. The `router.refresh()` is redundant for the voter's own UI and causes a full page revalidation.

**Failure scenario:** A user votes on a post. The UI updates instantly via the state update, but then `router.refresh()` causes a brief loading flash as the entire page revalidates. On slow connections, this creates a visible flicker.

**Fix:** Remove `router.refresh()` from the vote handler. The score is already updated via `setScore`. If other components on the page need the updated vote count, use a React context or revalidation key instead of a full page refresh.

---

### CRIT-20: CSP allows `'unsafe-eval'` in development mode
**File:** `src/proxy.ts:189`
**Perspectives:** Security
**Confidence:** Low (development-only)

```typescript
const scriptSrc = isDev
  ? `'self' 'nonce-${nonce}' 'unsafe-eval'${isSignupPage ? ` ${hcaptchaDomains}` : ""}`
  : `'self' 'nonce-${nonce}'${isSignupPage ? ` ${hcaptchaDomains}` : ""}`;
```

In development, `'unsafe-eval'` is added to script-src. This is needed for Hot Module Replacement (HMR). However, if someone accidentally sets `NODE_ENV=development` in production, CSP is significantly weakened.

**Failure scenario:** A misconfigured production deployment sets `NODE_ENV=development`. The CSP now allows arbitrary `eval()` calls, defeating a major XSS mitigation.

**Fix:** Add a startup warning when `NODE_ENV === "development"` and `DATABASE_URL` points to a non-localhost address. Consider an additional env var (e.g., `ALLOW_UNSAFE_EVAL=true`) as an explicit opt-in.

---

### CRIT-21: `systemSettings` default locale fallback silently catches errors
**File:** `src/i18n/request.ts:26-34`
**Perspectives:** Developer
**Confidence:** Low

```typescript
try {
  const settings = await getResolvedSystemSettings({ siteTitle: "", siteDescription: "" });
  locale = settings.defaultLocale ?? DEFAULT_LOCALE;
} catch {
  locale = DEFAULT_LOCALE;
}
```

If `getResolvedSystemSettings` throws (e.g., DB connection failure), the locale silently falls back to `"en"`. For a Korean user on a Korean-language site, this means the entire UI suddenly switches to English with no error message.

**Failure scenario:** The database is temporarily unreachable. All users see the English UI instead of Korean. There is no indication that something is wrong.

**Fix:** Log the error before falling back. Consider caching the last-known locale settings so a transient DB failure doesn't cause a language switch.

---

### CRIT-22: `execTransaction` bypasses transaction in build phase
**File:** `src/lib/db/index.ts:64-72`
**Perspectives:** Developer
**Confidence:** Low

```typescript
if (isBuildPhase) {
  return Promise.resolve(fn(db as unknown as TransactionClient));
}
```

During build phase, `execTransaction` runs the callback without a transaction wrapper. If the callback performs multiple writes, they execute outside a transaction — but during build, there should be no writes. The risk is that a developer writes code that uses `execTransaction` assuming atomicity, then tests it in a build-phase context where it's not atomic.

**Failure scenario:** A developer writes a migration script that uses `execTransaction` for atomic multi-step updates. During build phase, the steps execute non-atomically, and a partial failure leaves the database in an inconsistent state.

**Fix:** This is a known design trade-off. Add a comment in `execTransaction` warning that it does NOT guarantee atomicity during build phase. Consider throwing an error if any write operation is detected during build phase.

---

## Cross-Cutting Themes

### 1. Dual auth pattern (critical)
The coexistence of `createApiHandler` and manual `getApiUser` routes is the most significant architectural inconsistency. It creates a maintenance burden and a security risk — every new manual-auth route is an opportunity to miss CSRF or rate-limit checks. **Priority: migrate all routes to `createApiHandler` or extract shared composable middleware.**

### 2. Deprecated-but-not-removed columns
Both `secretToken` (judgeWorkers) and `token` (recruitingInvitations) are deprecated but still exist in the schema with unique indexes. These are latent security risks. **Priority: plan migrations to drop these columns.**

### 3. Client-side error logging via `console.error`
Five discussion components use `console.error` in production. This is inconsistent with the rest of the codebase and leaks API error structure to the browser console. **Priority: replace with environment-aware logging or remove.**

### 4. Nullable booleans creating three-state traps
`users.isActive` can be `true | false | null`. This is a common DB schema anti-pattern that creates subtle bugs across different query styles. **Priority: add `.notNull()` and migrate nulls.**

### 5. Recruiting panel incomplete password-reset UX
The `revealedTemporaryPassword` state and timer exist but `handleResetAccountPassword` never sets it — the response parsing is incomplete. **Priority: complete the implementation or remove the dead code.**

### 6. uaHash stored in JWT but never verified at runtime
`src/lib/auth/config.ts:376-379` (set), `:391-405` (refresh). The `uaHash` is computed at login and stored in the JWT, but on subsequent token refreshes it is preserved without comparing against the current request's user-agent. The proxy middleware does audit-log UA mismatches (`src/proxy.ts:258-272`) but does not block the request. This makes `uaHash` decorative — it provides zero runtime protection against session hijacking. **Priority: add uaHash verification on token refresh, blocking requests with mismatched UAs.**

### 7. In-memory rate limiter is dead code — no fallback if DB is unavailable
`src/lib/security/in-memory-rate-limit.ts` exports `consumeInMemoryRateLimit` but it is never imported. The app relies entirely on PostgreSQL-backed rate limiting with an optional Rust sidecar. If the database is slow/unreachable AND the sidecar is not deployed, there is zero rate limiting on login attempts. **Priority: wire up the in-memory fallback as a tier-3 defense when both sidecar and DB fail.**

### 8. Missing global `X-Content-Type-Options` and `Referrer-Policy` headers
`src/proxy.ts:192-214`. The proxy sets CSP and HSTS but omits `X-Content-Type-Options: nosniff` (only set on the file download route) and `Referrer-Policy: strict-origin-when-cross-origin`. Without `nosniff`, browsers may MIME-sniff uploaded files, enabling XSS via file uploads. Without `Referrer-Policy`, full URLs with tokens/IDs leak via Referer headers. **Priority: add both headers globally in `createSecuredNextResponse`.**

### 9. API key hash comparison not timing-safe
`src/lib/api/api-key-auth.ts:70-81`. The API key authentication hashes the provided key with SHA-256 and queries the DB for a matching hash via `eq(apiKeys.keyHash, keyHash)`. The equality comparison occurs in SQL, which is not timing-safe. The `safeTokenCompare` function in `src/lib/security/timing.ts` exists for this purpose but is not used. **Priority: fetch by key prefix, then use `safeTokenCompare` on the hash.**

---

## OWASP Top 10 Snapshot

| Category | Status | Notes |
|----------|--------|-------|
| A01: Broken Access Control | PASS | Capability-based RBAC enforced via `createApiHandler` |
| A02: Cryptographic Failures | MEDIUM | Argon2id strong; hardcoded dev encryption key; PII in JWT |
| A03: Injection | PASS | Drizzle ORM parameterizes queries; DOMPurify for HTML |
| A04: Insecure Design | LOW | Recruiting token as password-equivalent; unbounded session max age |
| A05: Security Misconfiguration | MEDIUM | Missing global `nosniff`/`Referrer-Policy`; CSP + HSTS correct |
| A06: Vulnerable Components | PASS | `npm audit` reports zero vulnerabilities |
| A07: Auth Failures | HIGH | uaHash never verified; in-memory rate limiter not integrated |
| A08: Integrity Failures | PASS | API keys use SHA-256 hashes; AES-256-GCM with auth tags |
| A09: Logging Failures | PASS | Login events with IP/UA/outcome; rate-limited events tracked |
| A10: SSRF | PASS | `getSafeRedirectUrl` validates callback URLs |

---

## Methodology

- Examined ~100 source files across `src/lib/`, `src/app/api/`, `src/components/`, `src/contexts/`, `src/hooks/`
- Focused on: auth/security, API consistency, component UX, database schema, realtime/SSE, i18n, error handling
- Cross-referenced with dedicated security-reviewer agent findings (10 additional findings, key ones incorporated above)
- Each finding includes exact file+line, problem description, concrete failure scenario, and suggested fix
- Confidence ratings: High (reproducible, clear impact), Medium (likely but depends on usage), Low (edge case or mitigated)
