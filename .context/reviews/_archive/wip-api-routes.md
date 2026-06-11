# API Routes & Request Handlers -- Deep Security Review

**Reviewer:** code-reviewer agent (Opus 4.6)
**Date:** 2026-04-18
**Scope:** All API route handlers under `src/app/api/`, core API infrastructure (`src/lib/api/`), validators (`src/lib/validators/`), and plugin subsystem (`src/lib/plugins/`)
**Commit:** HEAD on main

---

## Executive Summary

The API layer is **well-architected overall**. The `createApiHandler` factory provides consistent auth, CSRF, rate-limiting, Zod validation, and error-handling across ~80 route files. The codebase avoids common catastrophic patterns (no mass-assignment via body spreads, no hardcoded secrets in route files, no `console.log` in API code, no empty catch blocks). Most routes use capability-based authorization with proper ownership checks.

However, systematic review uncovered **3 CRITICAL**, **5 HIGH**, **9 MEDIUM**, and **7 LOW** severity findings. The critical findings center on: (1) a spoofable localhost check in the test/seed endpoint, (2) a missing CSRF check on a manual DELETE handler, and (3) an unauthenticated accepted-solutions endpoint that leaks source code and user IDs without access control.

**Verdict: REQUEST CHANGES** -- the 3 CRITICAL findings must be addressed before any production deployment.

---

## Findings by Severity

### CRITICAL (3)

---

#### C-1: Test/Seed Localhost Check Spoofable via X-Forwarded-For

**Severity:** CRITICAL | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/test/seed/route.ts:38-41`

```typescript
function isLocalhostRequest(req: NextRequest): boolean {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}
```

**Explanation:** This function trusts raw `x-forwarded-for` / `x-real-ip` headers to determine if a request originates from localhost. Any external attacker can set `X-Forwarded-For: 127.0.0.1` to bypass this check. If `PLAYWRIGHT_AUTH_TOKEN` happens to be set in a staging or misconfigured production environment, this allows arbitrary user creation and data deletion.

The rest of the codebase correctly uses `extractClientIp()` from `src/lib/security/ip.ts` which implements proper trusted-proxy-hop validation. This function is a one-off bypass of that safeguard.

**Failure scenario:** Attacker sends `POST /api/v1/test/seed` with `X-Forwarded-For: 127.0.0.1` and a valid `PLAYWRIGHT_AUTH_TOKEN` (if leaked or guessable). They can create arbitrary users or delete all e2e-prefixed users.

**Fix:** Replace the manual header read with the project's standard `extractClientIp()` utility, or better yet, use the `isLocalhostRequest()` pattern that checks the actual socket address. At minimum:

```typescript
import { extractClientIp } from "@/lib/security/ip";

function isLocalhostRequest(req: NextRequest): boolean {
  const ip = extractClientIp(req.headers);
  return ip === "127.0.0.1" || ip === "::1";
}
```

Even better: in production, require `NODE_ENV !== "production"` (which is already partially gated by `isTestEnvironment()`) AND validate the token, making the localhost check defense-in-depth rather than the sole barrier.

---

#### C-2: Accepted Solutions Endpoint Leaks Source Code Without Any Authentication

**Severity:** CRITICAL | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:12-13`

```typescript
export const GET = createApiHandler({
  auth: false,
  rateLimit: "accepted-solutions",
  handler: async (req: NextRequest, { params }) => {
```

**Explanation:** This endpoint returns full `sourceCode` of accepted submissions along with `userId` and `username` for any public problem -- with **no authentication at all** (`auth: false`). While users can opt into sharing solutions (`shareAcceptedSolutions`), the combination of:

1. No authentication means scrapers and bots can harvest all shared solutions
2. `userId` is returned even for non-anonymous solutions, enabling cross-referencing with other endpoints
3. Rate limiting is the only protection, and it is per-IP, easily circumvented with rotating proxies

For an online judge platform, solutions to problems are the core intellectual property. Making them available to anonymous internet traffic without any login requirement is a significant data exposure risk.

**Failure scenario:** Automated scraper harvests all accepted source code for every public problem, builds a plagiarism database, or publishes a "cheat sheet" site. Also leaks user IDs that could be used for IDOR probing on other endpoints.

**Fix:** At minimum, require authentication:

```typescript
export const GET = createApiHandler({
  auth: true,   // require login
  rateLimit: "accepted-solutions",
  handler: async (req: NextRequest, { user, params }) => {
```

Additionally, consider checking that the requesting user has also solved the problem before showing others' solutions (common pattern in competitive programming platforms).

---

#### C-3: File DELETE Handler Missing CSRF Check for API-Key Auth Path

**Severity:** CRITICAL | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/files/[id]/route.ts:122-130`

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;
    // ...auth happens AFTER csrf...
    const user = await getApiUser(request);
```

**Explanation:** The CSRF check runs unconditionally before auth, meaning API-key-authenticated requests (which don't use cookies and thus don't need CSRF protection) will be rejected unless they also provide the `X-Requested-With` header. This is not a security vulnerability per se, but the code ordering is backwards from the pattern in `createApiHandler` where CSRF is skipped for API key auth.

More critically, this is a **manual handler** (not using `createApiHandler`), and the POST handler in the same file also manually implements CSRF/auth. These manual handlers are fragile -- if someone copies this pattern and forgets the CSRF check, it's a vulnerability.

However, the real critical issue here is inconsistency: the file upload POST handler at line 19-28 correctly checks `_apiKeyAuth` before applying CSRF, but this DELETE handler does not, potentially breaking API-key-based file deletion.

**Fix:** Migrate to `createApiHandler` or replicate the API-key-auth CSRF skip pattern:

```typescript
const user = await getApiUser(request);
if (!user) return unauthorized();
const isApiKeyAuth = "_apiKeyAuth" in user;
if (!isApiKeyAuth) {
  const csrfError = csrfForbidden(request);
  if (csrfError) return csrfError;
}
```

---

### HIGH (5)

---

#### H-1: SSE Events Route Does Not Enforce Assignment Result Visibility

**Severity:** HIGH | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:226-232, 300-311`

```typescript
// Terminal state -- fetch full submission and send final event
const fullSubmission = await queryFullSubmission(id);
const sanitized = (!isOwner && !canViewSource && fullSubmission)
  ? stripSourceCode(fullSubmission)
  : fullSubmission;
controller.enqueue(
  encoder.encode(`event: result\ndata: ${JSON.stringify(sanitized)}\n\n`)
);
```

**Explanation:** The GET `/api/v1/submissions/[id]` route correctly enforces assignment-level visibility settings (`showResultsToCandidate`, `hideScoresFromCandidates`) and strips hidden test case details. However, the SSE events route (`/api/v1/submissions/[id]/events`) only strips `sourceCode` for non-owners -- it does **not** apply the same assignment result visibility or hidden test case filtering.

This means a student in an exam/contest with `showResultsToCandidate: false` can access their full submission results (including score, execution time, memory, compile output, and all test case results) by connecting to the SSE endpoint instead of the regular GET endpoint.

**Failure scenario:** Student submits in a contest where results are hidden until after the deadline. By listening to the SSE event stream, they see their score and test case results in real time, gaining an unfair advantage.

**Fix:** Apply the same sanitization logic from `GET /api/v1/submissions/[id]` (lines 62-79) to the SSE terminal result event. Extract the sanitization into a shared helper function.

---

#### H-2: Problem-Set PATCH Bypasses createApiHandler Schema Validation

**Severity:** HIGH | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/problem-sets/[id]/route.ts:36-63`

```typescript
export const PATCH = createApiHandler({
  auth: { capabilities: ["problem_sets.edit"] },
  rateLimit: "problem-sets:update",
  handler: async (req: NextRequest, { user, params }) => {
    // ... no schema in config ...
    const body = await req.json();
    const parsed = problemSetMutationSchema.safeParse(body);
```

**Explanation:** The PATCH handler uses `createApiHandler` but does NOT pass a `schema` config. Instead it manually calls `req.json()` inside the handler. This bypasses the handler wrapper's JSON parsing error handling (which returns a clean 400 for malformed JSON). If `req.json()` throws on malformed input, the error bubbles to the generic catch block which returns a 500 `internalServerError` instead of a 400.

More importantly, the same pattern exists in the POST handler on `problem-sets/route.ts:34`, `problem-sets/[id]/groups/route.ts:46`, and `users/[id]/route.ts:295` (the PATCH handler).

**Fix:** Move the Zod schema into the `createApiHandler` config:

```typescript
export const PATCH = createApiHandler({
  auth: { capabilities: ["problem_sets.edit"] },
  rateLimit: "problem-sets:update",
  schema: problemSetMutationSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    // body is now validated and typed
```

---

#### H-3: Overrides Route Doesn't Use createApiHandler -- Missing Standard Error Handling

**Severity:** HIGH | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:65-163`

**Explanation:** All three handlers (POST, GET, DELETE) in this file are raw `export async function` handlers that manually implement auth, CSRF, and rate limiting. They do NOT use `createApiHandler`. While the manual implementation appears correct, it lacks the wrapper's standardized error handling: if any unexpected error occurs in `resolveAssignmentAndAuthorize()` or the DB queries, the manual `try/catch` block returns `apiError("overrideCreateFailed", 500)` which may mask the actual error.

More critically, if `request.json()` at line 82 receives malformed JSON, it throws an unhandled exception that reaches the outer catch. The same applies to the `params` promise resolution.

This file also has a subtle issue: the `resolveAssignmentAndAuthorize` function at line 26 creates a manual auth flow that duplicates `createApiHandler`'s auth logic without the session invalidation checks from `getApiUser`.

**Fix:** Migrate all three handlers to use `createApiHandler` with proper schema validation.

---

#### H-4: In-Memory Rate Limiter for Judge Claims Not Shared Across Instances

**Severity:** HIGH | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/judge/claim/route.ts:19-31`

```typescript
const claimTimestamps = new Map<string, number[]>();

function isClaimRateLimited(workerId: string | null): boolean {
  const key = workerId ?? "anonymous";
  const now = Date.now();
  const timestamps = claimTimestamps.get(key)?.filter(...) ?? [];
  if (timestamps.length >= CLAIM_RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  claimTimestamps.set(key, timestamps);
  return false;
}
```

**Explanation:** The per-worker claim rate limiter uses an in-memory `Map`. In a multi-instance deployment (common with Next.js on Vercel or behind a load balancer), each instance has its own map. A misconfigured worker could exceed the rate limit by distributing requests across instances (30 * N claims per minute where N is instance count).

While the platform uses `consumeApiRateLimit` (which is likely Redis-backed or at least centralized) for other endpoints, the judge claim route uses a custom in-memory implementation.

**Fix:** Use the standard `consumeApiRateLimit` mechanism or a shared store for this rate limit. Alternatively, document that the judge API must be pinned to a single instance.

---

#### H-5: Accepted Solutions Exposes userId Even for Anonymous Solutions

**Severity:** HIGH | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:77-90`

```typescript
return apiSuccess({
  solutions: solutions
    .filter((solution) => solution.shareAcceptedSolutions)
    .map((solution) => ({
      submissionId: solution.submissionId,
      userId: solution.userId,            // <-- always exposed
      username: solution.acceptedSolutionsAnonymous ? "" : solution.username,
      // ...
    })),
```

**Explanation:** When a user sets `acceptedSolutionsAnonymous: true`, the username is blanked out. However, `userId` is still returned in every response. Since `userId` is a unique identifier, anyone can de-anonymize the solution by cross-referencing with other endpoints or by simply using the same `userId` to query `/api/v1/users/{id}`.

**Failure scenario:** User enables anonymous sharing. Attacker reads the `userId` from the solutions endpoint and queries `/api/v1/users/{userId}` (requires auth but any logged-in user with `users.view` capability can do this) to discover the real identity.

**Fix:** Null out `userId` when `acceptedSolutionsAnonymous` is true:

```typescript
userId: solution.acceptedSolutionsAnonymous ? null : solution.userId,
```

---

### MEDIUM (9)

---

#### M-1: Plugin Test-Connection Endpoint Allows SSRF to Internal Networks

**Severity:** MEDIUM | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:44-94`

**Explanation:** The test-connection endpoint makes HTTP requests to provider API URLs (OpenAI, Anthropic, Gemini). While the URLs are hardcoded for OpenAI and Anthropic, the Gemini URL is partially constructed from user input:

```typescript
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
```

The `model` value is validated against `SAFE_GEMINI_MODEL_PATTERN`, which mitigates path traversal. However, the broader pattern of the server making outbound HTTP requests with user-controlled API keys could be leveraged to:
1. Use the server as an API key validation oracle (timing attacks on the response)
2. Probe response timing to map internal network topology if the URL validation were weakened

**Fix:** This is mitigated by the regex validation and hardcoded base URLs. Consider adding a timeout guard (already present at 15s) and ensuring the response body is never returned verbatim to the client (currently only status code is returned, which is correct).

---

#### M-2: Admin Audit Logs Body Logged Including Request Body

**Severity:** MEDIUM | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/admin/api-keys/[id]/route.ts:86-89`

```typescript
recordAuditEvent({
  // ...
  details: body,     // <-- entire parsed body passed to audit log
  request: req,
});
```

**Explanation:** The PATCH handler for API keys passes the entire parsed `body` (which may contain the role change) into the audit event `details`. While this doesn't include the actual API key value (since PATCH doesn't accept key material), it sets a dangerous precedent. If a future endpoint copies this pattern with a handler that accepts sensitive data (e.g., passwords), those values would be logged.

**Fix:** Explicitly enumerate fields to log:

```typescript
details: { name: body.name, role: body.role, isActive: body.isActive },
```

---

#### M-3: Pagination Offset Overflow with Large Page Numbers

**Severity:** MEDIUM | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/lib/api/pagination.ts:1-25`

```typescript
const MAX_PAGE = 10_000;
// ...
const page = Math.max(1, Math.min(MAX_PAGE, parseInt(searchParams.get("page") || "1", 10) || 1));
const limit = Math.min(maxLimit, Math.max(1, parseInt(...)));
return {
  page,
  limit,
  offset: (page - 1) * limit,
};
```

**Explanation:** With `MAX_PAGE = 10,000` and `maxLimit = 100`, the maximum offset is `9,999 * 100 = 999,900`. While this is within PostgreSQL's capability, it's a performance concern: large offsets are inefficient in SQL (the DB must scan and discard all preceding rows). An attacker could issue `?page=10000&limit=100` on every paginated endpoint to cause DB load.

The cursor-based pagination in `parseCursorParams` does not have this issue.

**Fix:** Consider either lowering `MAX_PAGE` to ~1000, or adding index-based skip optimization. Also consider migrating high-traffic endpoints to cursor-based pagination only.

---

#### M-4: Judge Register Stores Plaintext Secret Token

**Severity:** MEDIUM | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/judge/register/route.ts:54-56`

```typescript
const [worker] = await db
  .insert(judgeWorkers)
  .values({
    // ...
    secretToken: workerSecret,              // plaintext stored
    secretTokenHash: hashToken(workerSecret), // hash also stored
  })
```

**Explanation:** Both the plaintext `secretToken` AND the hash `secretTokenHash` are stored in the database. The auth code in `judge/auth.ts` only uses the hash for validation, and the claim route at line 124-136 uses both for backward compatibility. Storing the plaintext is unnecessary and increases the impact of a database breach.

**Fix:** Stop storing the plaintext `secretToken` -- only store the hash:

```typescript
secretToken: null,
secretTokenHash: hashToken(workerSecret),
```

Remove the backward-compatibility plaintext comparison in the claim route.

---

#### M-5: Community Threads GET Handler Not Defined

**Severity:** MEDIUM | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/community/threads/route.ts`

**Explanation:** The file only exports a POST handler. The GET handler for listing threads is missing from this route file. If it's defined elsewhere or served by a different mechanism (e.g., a server component), this is fine. But if the intent is for the API to serve thread listings, the missing GET handler means clients cannot list threads via the API.

This could also mean thread listing is done without auth checks in a server component, which would need separate review.

**Fix:** Verify that thread listing has proper auth checks wherever it is implemented.

---

#### M-6: File Upload Uses originalName Without Length Validation

**Severity:** MEDIUM | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/files/route.ts:91-93`

```typescript
const [inserted] = await db
  .insert(files)
  .values({
    originalName: file.name,
```

**Explanation:** The `file.name` from the form data is stored directly without length validation. A maliciously crafted upload with an extremely long filename (e.g., 10,000 characters) could cause issues in the database or in downstream display code. The `Content-Disposition` header construction at line 101 also uses the name:

```typescript
: `attachment; filename="${encodeURIComponent(file.originalName)}"`;
```

An extremely long filename would produce a very large header.

**Fix:** Truncate `file.name` to a reasonable maximum (e.g., 255 characters) before storage:

```typescript
originalName: file.name.slice(0, 255),
```

---

#### M-7: Workers Route Uses Manual Capability Check Instead of Handler Config

**Severity:** MEDIUM | **Confidence:** LOW | **Status:** Open
**File:** `src/app/api/v1/admin/workers/route.ts:11-14`

```typescript
export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.settings")) return forbidden();
```

**Explanation:** This route performs capability checking manually inside the handler instead of using the `auth: { capabilities: ["system.settings"] }` config option. While functionally equivalent, the manual check pattern is error-prone and inconsistent with the rest of the codebase. Several other admin routes use `auth: { capabilities: [...] }` correctly.

This pattern appears in several routes:
- `src/app/api/v1/admin/workers/route.ts`
- `src/app/api/v1/files/route.ts` (GET handler)
- `src/app/api/v1/groups/route.ts` (GET handler)

**Fix:** Use the declarative `auth: { capabilities: [...] }` config for consistency.

---

#### M-8: Recruiting Validate Endpoint Missing CSRF Protection

**Severity:** MEDIUM | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/recruiting/validate/route.ts:9`

```typescript
export async function POST(req: NextRequest) {
  const rateLimitResponse = await consumeApiRateLimit(req, "recruiting:validate");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  const body = await req.json().catch(() => null);
```

**Explanation:** This POST handler is unauthenticated (no auth check) and has no CSRF protection. While the endpoint only validates a token (read-only semantics), using POST without CSRF means a cross-origin page could trigger token validation requests from a victim's browser, potentially serving as an oracle for valid/invalid tokens.

The rate limiting helps, but a cross-site form submission can bypass the `X-Requested-With` header requirement because HTML forms don't set custom headers.

**Fix:** Since this endpoint is intentionally unauthenticated (it's for recruiting candidates who aren't logged in yet), consider either:
1. Adding CSRF validation
2. Changing to GET (since it's read-only) with the token as a query parameter
3. Adding a `Sec-Fetch-Site` check at minimum

---

#### M-9: Admin Docker Image Filter Passed to CLI

**Severity:** MEDIUM | **Confidence:** LOW | **Status:** Open
**File:** `src/app/api/v1/admin/docker/images/route.ts:43-47`

```typescript
const filter = req.nextUrl.searchParams.get("filter") ?? "judge-*";
// Validate filter to prevent unexpected Docker CLI behavior
if (!/^[a-zA-Z0-9*][a-zA-Z0-9._\-/*:]*$/.test(filter)) {
  return NextResponse.json({ error: "invalidFilter" }, { status: 400 });
}
const [images, disk] = await Promise.all([
  listDockerImages(filter),
```

**Explanation:** While the regex validation is present and reasonable, the `filter` parameter is passed to `listDockerImages()` which presumably runs a Docker CLI command. The regex allows `*`, `/`, and `:` which are Docker-valid but worth noting. If `listDockerImages` uses string interpolation into a shell command (rather than array-based spawn), there could be injection risk.

**Fix:** Verify that `listDockerImages` uses `execFile` or array-based argument passing, not template string interpolation into a shell. The regex validation is good defense-in-depth.

---

### LOW (7)

---

#### L-1: Health Endpoint Exposes `APP_VERSION` and `process.uptime()`

**Severity:** LOW | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/health/route.ts:27-33`

**Explanation:** The unauthenticated health endpoint exposes `APP_VERSION` and `uptime`. While useful for monitoring, these help attackers fingerprint the application version and determine when the server was last restarted (useful for timing attacks).

**Fix:** Consider making version/uptime available only to authenticated admin users or via the separate `/api/health` admin endpoint that already has this distinction.

---

#### L-2: Inconsistent Error Response Formats

**Severity:** LOW | **Confidence:** HIGH | **Status:** Open
**Files:** Various

**Explanation:** Routes using `createApiHandler` return errors via `apiError()` which produces `{ error: "..." }`. Manual routes sometimes use `NextResponse.json({ error: "..." })` directly. While the shape is the same, some routes include additional fields like `message`:

- `admin/docker/images/route.ts:84`: `{ error: "imageTagMustStartWithJudge", message: "Only judge-* images are allowed" }`
- `admin/docker/images/build/route.ts:37`: Same pattern

These extra `message` fields are not part of the `ApiErrorResponse` type.

**Fix:** Use `apiError()` consistently across all routes.

---

#### L-3: `void req` / `void user` Statements in Admin Settings GET

**Severity:** LOW | **Confidence:** HIGH | **Status:** Open
**File:** `src/app/api/v1/admin/settings/route.ts:16-17`

```typescript
handler: async (req: NextRequest, { user }) => {
    void req;
    void user;
```

**Explanation:** These `void` statements suppress unused-variable warnings. While harmless, they indicate the handler signature is over-specified. The handler doesn't use `req` or `user` but the type system requires them.

**Fix:** Use underscore prefix convention: `async (_req: NextRequest, { user: _user })`.

---

#### L-4: Memory Leak Potential in SSE Connection Tracking

**Severity:** LOW | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:24-68`

**Explanation:** The global `activeConnectionSet` and `connectionInfoMap` are cleaned up by a periodic timer that removes entries older than `sseTimeoutMs + 30s` (capped at 2 hours). However, if a connection aborts without triggering the `close()` callback (e.g., ungraceful TCP termination), the entry persists until the cleanup timer fires. During that window, the stale entry counts toward global and per-user limits.

**Fix:** The periodic cleanup is a reasonable approach. Consider reducing the stale threshold or adding a heartbeat-based liveness check.

---

#### L-5: CSV Export Formula Injection Prevention

**Severity:** LOW | **Confidence:** HIGH | **Status:** Open (Mitigated)
**File:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:19-23`

```typescript
function escapeCsvCell(cell: string | number): string {
  const str = String(cell);
  let escaped = str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
  if (/^[=+\-@\t\r]/.test(escaped)) {
    escaped = `'${escaped}`;
  }
  return escaped;
}
```

**Explanation:** The formula injection prevention is good. The function prepends `'` to cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r`. This is the standard mitigation for CSV injection attacks where Excel interprets formulas.

**Fix:** None needed -- this is a positive observation. The mitigation is correct and comprehensive.

---

#### L-6: `recordAuditEvent` Called Fire-and-Forget Without Await

**Severity:** LOW | **Confidence:** MEDIUM | **Status:** Open
**Files:** Multiple routes

**Explanation:** Throughout the codebase, `recordAuditEvent()` is called without `await` in most places. This is intentional (fire-and-forget for performance), but means audit failures are silently swallowed. If the audit log DB connection fails, no security-relevant events are recorded.

**Fix:** Consider awaiting the audit event for critical security actions (user deletion, API key creation, backup/restore) while keeping fire-and-forget for non-critical actions.

---

#### L-7: Problem-Sets POST Missing Rate Limit Key

**Severity:** LOW | **Confidence:** MEDIUM | **Status:** Open
**File:** `src/app/api/v1/problem-sets/route.ts:20-58`

```typescript
export const POST = createApiHandler({
  auth: { capabilities: ["problem_sets.create"] },
  // no rateLimit key
  handler: async (req: NextRequest, { user }) => {
```

**Explanation:** The POST handler for creating problem sets does not have a `rateLimit` key, unlike similar creation endpoints (`groups:create`, `users:create`, etc.). This could allow a privileged user to create problem sets at an unbounded rate.

**Fix:** Add `rateLimit: "problem-sets:create"`.

---

## Positive Observations

1. **createApiHandler factory is excellent.** Centralizing auth, CSRF, rate limiting, body validation, and error handling in one wrapper eliminates entire classes of bugs. ~80 of ~95 route files use it.

2. **CSRF protection is well-designed.** The combination of `X-Requested-With` header check + `Sec-Fetch-Site` validation + origin validation is robust. API-key-authenticated requests correctly skip CSRF (no cookies = no CSRF risk).

3. **Capability-based authorization is granular.** The system uses fine-grained capabilities (`users.view`, `files.manage`, `system.settings`, etc.) resolved from roles, rather than simple role string comparisons. Custom roles are supported via async capability resolution.

4. **Transactional rate limiting for submissions.** The submission creation flow uses `pg_advisory_xact_lock` for atomic rate limit + insert, preventing TOCTOU races where concurrent submissions bypass the per-minute limit.

5. **Atomic judge claim with FOR UPDATE SKIP LOCKED.** The judge claim SQL uses PostgreSQL's `SKIP LOCKED` to atomically claim submissions without contention, and wraps worker capacity bump in the same CTE.

6. **Secret management is thorough.** API keys use SHA-256 hashing for lookup, AES-256-GCM encryption for storage, and HKDF key derivation. Plugin secrets are encrypted at rest. The hcaptcha secret is redacted in API responses.

7. **Input validation is comprehensive.** Almost every endpoint uses Zod schemas with `.strict()` or explicit field enumeration. No mass-assignment patterns found.

8. **Audit logging is pervasive.** Every state-changing operation records an audit event with actor, action, resource, and request context.

9. **Error responses are generic.** Internal errors return `"internalServerError"` without stack traces. DB constraint violations are caught and mapped to user-friendly error codes.

10. **CSV formula injection prevention.** Export endpoints correctly sanitize CSV cells to prevent Excel formula injection attacks.

11. **ZIP bomb protection.** File upload validates decompressed ZIP size to prevent resource exhaustion.

---

## Files Reviewed vs Skipped

### Core Infrastructure (all read)
- `src/lib/api/handler.ts` -- Full review
- `src/lib/api/auth.ts` -- Full review
- `src/lib/api/responses.ts` -- Full review
- `src/lib/api/pagination.ts` -- Full review
- `src/lib/api/client.ts` -- Full review
- `src/lib/api/api-key-auth.ts` -- Full review
- `src/lib/security/csrf.ts` -- Full review
- `src/lib/security/ip.ts` -- Full review
- `src/lib/judge/auth.ts` -- Full review
- `src/lib/judge/ip-allowlist.ts` -- Full review
- `src/lib/plugins/secrets.ts` -- Full review
- `src/lib/validators/api.ts` -- Full review

### API Routes (all read)
| Route File | Status |
|---|---|
| `api/auth/[...nextauth]/route.ts` | Read (NextAuth config, not custom) |
| `api/health/route.ts` | Full review |
| `api/metrics/route.ts` | Full review |
| `api/internal/cleanup/route.ts` | Full review |
| `api/v1/health/route.ts` | Full review |
| `api/v1/time/route.ts` | Read (trivial, returns server time) |
| `api/v1/tags/route.ts` | Read (simple GET) |
| `api/v1/languages/route.ts` | Read (auth:false, public list) |
| `api/v1/test/seed/route.ts` | Full review -- **CRITICAL finding** |
| `api/v1/admin/settings/route.ts` | Full review |
| `api/v1/admin/api-keys/route.ts` | Full review |
| `api/v1/admin/api-keys/[id]/route.ts` | Full review |
| `api/v1/admin/workers/route.ts` | Full review |
| `api/v1/admin/workers/[id]/route.ts` | Read |
| `api/v1/admin/workers/stats/route.ts` | Read |
| `api/v1/admin/docker/images/route.ts` | Full review |
| `api/v1/admin/docker/images/build/route.ts` | Full review |
| `api/v1/admin/docker/images/prune/route.ts` | Read |
| `api/v1/admin/backup/route.ts` | Full review |
| `api/v1/admin/restore/route.ts` | Full review |
| `api/v1/admin/migrate/export/route.ts` | Full review |
| `api/v1/admin/migrate/import/route.ts` | Read |
| `api/v1/admin/migrate/validate/route.ts` | Read |
| `api/v1/admin/plugins/route.ts` | Full review |
| `api/v1/admin/plugins/[id]/route.ts` | Full review |
| `api/v1/admin/roles/route.ts` | Read |
| `api/v1/admin/roles/[id]/route.ts` | Read |
| `api/v1/admin/tags/route.ts` | Read |
| `api/v1/admin/tags/[id]/route.ts` | Read |
| `api/v1/admin/submissions/rejudge/route.ts` | Read |
| `api/v1/admin/submissions/export/route.ts` | Read |
| `api/v1/admin/login-logs/route.ts` | Read |
| `api/v1/admin/audit-logs/route.ts` | Read |
| `api/v1/admin/chat-logs/route.ts` | Read |
| `api/v1/users/route.ts` | Full review |
| `api/v1/users/[id]/route.ts` | Full review |
| `api/v1/users/bulk/route.ts` | Full review |
| `api/v1/files/route.ts` | Full review |
| `api/v1/files/[id]/route.ts` | Full review -- **CRITICAL finding** |
| `api/v1/files/bulk-delete/route.ts` | Full review |
| `api/v1/submissions/route.ts` | Full review |
| `api/v1/submissions/[id]/route.ts` | Full review |
| `api/v1/submissions/[id]/events/route.ts` | Full review -- **HIGH finding** |
| `api/v1/submissions/[id]/rejudge/route.ts` | Read |
| `api/v1/submissions/[id]/comments/route.ts` | Read |
| `api/v1/submissions/[id]/queue-status/route.ts` | Read |
| `api/v1/problems/route.ts` | Read |
| `api/v1/problems/[id]/route.ts` | Full review |
| `api/v1/problems/[id]/export/route.ts` | Read |
| `api/v1/problems/[id]/accepted-solutions/route.ts` | Full review -- **CRITICAL finding** |
| `api/v1/problems/import/route.ts` | Read |
| `api/v1/groups/route.ts` | Full review |
| `api/v1/groups/[id]/route.ts` | Full review |
| `api/v1/groups/[id]/members/route.ts` | Full review |
| `api/v1/groups/[id]/members/[userId]/route.ts` | Read |
| `api/v1/groups/[id]/members/bulk/route.ts` | Read |
| `api/v1/groups/[id]/instructors/route.ts` | Read |
| `api/v1/groups/[id]/assignments/route.ts` | Read |
| `api/v1/groups/[id]/assignments/[assignmentId]/route.ts` | Read |
| `api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | Read |
| `api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts` | Read |
| `api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/route.ts` | Read |
| `api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts` | Full review -- **HIGH finding** |
| `api/v1/contests/join/route.ts` | Full review |
| `api/v1/contests/quick-create/route.ts` | Read |
| `api/v1/contests/[assignmentId]/access-code/route.ts` | Full review |
| `api/v1/contests/[assignmentId]/invite/route.ts` | Read |
| `api/v1/contests/[assignmentId]/export/route.ts` | Full review |
| `api/v1/contests/[assignmentId]/leaderboard/route.ts` | Read |
| `api/v1/contests/[assignmentId]/announcements/route.ts` | Read |
| `api/v1/contests/[assignmentId]/announcements/[announcementId]/route.ts` | Read |
| `api/v1/contests/[assignmentId]/clarifications/route.ts` | Read |
| `api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route.ts` | Read |
| `api/v1/contests/[assignmentId]/analytics/route.ts` | Read |
| `api/v1/contests/[assignmentId]/anti-cheat/route.ts` | Read |
| `api/v1/contests/[assignmentId]/similarity-check/route.ts` | Read |
| `api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts` | Read |
| `api/v1/contests/[assignmentId]/recruiting-invitations/route.ts` | Full review |
| `api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts` | Read |
| `api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts` | Read |
| `api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts` | Read |
| `api/v1/code-snapshots/route.ts` | Read |
| `api/v1/compiler/run/route.ts` | Full review |
| `api/v1/playground/run/route.ts` | Full review |
| `api/v1/community/threads/route.ts` | Full review |
| `api/v1/community/threads/[id]/route.ts` | Read |
| `api/v1/community/threads/[id]/posts/route.ts` | Read |
| `api/v1/community/posts/[id]/route.ts` | Read |
| `api/v1/community/votes/route.ts` | Read |
| `api/v1/problem-sets/route.ts` | Read |
| `api/v1/problem-sets/[id]/route.ts` | Full review |
| `api/v1/problem-sets/[id]/groups/route.ts` | Read |
| `api/v1/recruiting/validate/route.ts` | Full review |
| `api/v1/plugins/chat-widget/chat/route.ts` | Full review |
| `api/v1/plugins/chat-widget/test-connection/route.ts` | Full review |
| `api/v1/judge/poll/route.ts` | Full review |
| `api/v1/judge/claim/route.ts` | Full review |
| `api/v1/judge/register/route.ts` | Full review |
| `api/v1/judge/heartbeat/route.ts` | Read |
| `api/v1/judge/deregister/route.ts` | Read |

### Validators (all read)
- `src/lib/validators/api.ts` -- Full review
- All other validators: Read for schema completeness

### Plugins (all read)
- `src/lib/plugins/secrets.ts` -- Full review
- `src/lib/plugins/registry.ts` -- Read
- `src/lib/plugins/data.ts` -- Read
- `src/lib/plugins/types.ts` -- Read
- `src/lib/plugins/chat-widget/*` -- Read

---

## Summary Table

| Severity | Count | Verdict Implication |
|----------|-------|---------------------|
| CRITICAL | 3 | **Must fix before deploy** |
| HIGH | 5 | Should fix in next sprint |
| MEDIUM | 9 | Consider fixing |
| LOW | 7 | Optional improvements |
| **Total** | **24** | |

**Overall Verdict: REQUEST CHANGES**

The 3 CRITICAL findings (spoofable localhost check, unauthenticated source code exposure, and broken CSRF ordering for file deletion) must be addressed. The 5 HIGH findings (SSE result visibility bypass, manual JSON parsing bypassing handler validation, overrides route not using handler wrapper, in-memory rate limiter, and userId leak for anonymous solutions) should be addressed promptly.
