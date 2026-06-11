# RPF Cycle 28 — Architect Review

**Reviewer:** Architect Agent
**Date:** 2026-04-23
**HEAD:** ca62a45d
**Scope:** Full-repository architectural boundary analysis

---

## 1. Architecture Boundary Inventory

### 1.1 Layer Map

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| **Middleware** | `src/proxy.ts` | Request interception: auth gate, CSP, locale, session refresh |
| **API Routes** | `src/app/api/v1/` (84 route files, 217 handler functions) | HTTP endpoint layer |
| **Server Actions** | `src/lib/actions/` (9 files) | Mutation layer for client components |
| **Server Components** | `src/app/(dashboard)/`, `src/app/(public)/` | RSC page rendering with direct DB queries |
| **Client Components** | `src/components/` (72 `"use client"` files) | Interactive UI |
| **Auth** | `src/lib/auth/`, `src/lib/api/auth.ts`, `src/lib/api/handler.ts`, `src/lib/judge/auth.ts` | Authentication & authorization |
| **Data** | `src/lib/db/` | Drizzle ORM schema, queries, connection pool |
| **Security** | `src/lib/security/` | CSRF, rate limiting, encryption, IP extraction |
| **Realtime** | `src/lib/realtime/` | SSE coordination, shared connection management |
| **Judge** | `src/lib/judge/` | Worker auth, verdicts, language configs, Docker |
| **Domain** | `src/lib/discussions/`, `src/lib/assignments/`, `src/lib/problems/`, etc. | Domain-specific business logic |

### 1.2 Module Interaction Map

```
proxy.ts ──► @/lib/api/auth (getActiveAuthUserById)
         ──► @/lib/auth/secure-cookie, session-security
         ──► @/lib/security/env
         ──► @/lib/audit/events

API Routes ──► @/lib/api/handler (createApiHandler)   [24% of routes]
            ──► @/lib/api/auth (getApiUser, forbidden)  [76% of routes — manual]
            ──► @/lib/auth/permissions (canAccessGroup, canAccessProblem, canAccessSubmission)
            ──► @/lib/security/csrf (via csrfForbidden)
            ──► @/lib/db (drizzle)

Server Actions ──► @/lib/auth/index (auth)
               ──► @/lib/security/server-actions (isTrustedServerActionOrigin)
               ──► @/lib/capabilities/cache (resolveCapabilities)
               ──► @/lib/db

Server Components ──► @/lib/auth/permissions (direct DB-backed checks)
                  ──► @/lib/discussions/data (domain query layer)
                  ──► @/lib/db
```

---

## 2. Findings

### ARC-01: Fragmented Auth Surface — Dual Pathways Without Convergence

**Confidence:** High

**Files:**
- `src/lib/api/auth.ts:61-74` — `getApiUser()` (session cookie + API key fallback)
- `src/lib/api/handler.ts:87-201` — `createApiHandler()` (wraps auth + CSRF + rate limit + validation)
- `src/lib/auth/permissions.ts:61-65` — `getSession()` / `assertAuth()` (wraps `auth()` from next-auth)
- `src/lib/auth/index.ts:8-17` — `auth()`, `signIn()`, `signOut()` (NextAuth core)
- `src/lib/judge/auth.ts:29-38,51-91` — `isJudgeAuthorized()`, `isJudgeAuthorizedForWorker()` (judge-specific bearer auth)
- `src/lib/security/server-actions.ts:20-40` — `isTrustedServerActionOrigin()` (origin validation for server actions)

**Risk:** The codebase has **six** separate auth entry points that implement overlapping but subtly different checks. API routes use two patterns in parallel: ~24% use `createApiHandler` (which bundles auth + CSRF + rate limit + validation), while ~76% manually compose `getApiUser()` + `csrfForbidden()` + `consumeApiRateLimit()` in each handler. The manual pattern is error-prone — a developer who forgets `csrfForbidden()` on a mutation route silently disables CSRF protection.

Server actions use a completely separate path (`isTrustedServerActionOrigin` + `auth()` + capability checks) that doesn't go through `@/lib/api/auth` at all. The judge routes have yet another custom bearer-token path.

**Failure Scenario:** A developer adds a new mutation endpoint (POST/PATCH/DELETE) using the manual pattern and forgets to call `csrfForbidden()`. The route accepts cross-origin form submissions because CSRF is opt-in per-route when using the manual pattern, unlike `createApiHandler` where it defaults to required for mutations.

**Fix:** Migrate all remaining manual-pattern API routes to `createApiHandler`. The wrapper already supports all needed options (`auth`, `csrf`, `rateLimit`, `schema`). Add a lint rule or CI check that flags direct imports of `getApiUser`/`csrfForbidden` outside `handler.ts` to prevent regression.

---

### ARC-02: SSE Events Route — 492-Line God Function With Mixed Concerns

**Confidence:** High

**File:** `src/app/api/v1/submissions/[id]/events/route.ts`

**Risk:** This single file implements five distinct concerns:
1. In-process connection tracking (Set/Map-based, lines 26-95) with global state, timer-based cleanup, and eviction logic
2. Shared polling manager (lines 106-183) — a subscription/dispatch system with its own interval timer
3. SSE stream lifecycle (lines 282-441) — ReadableStream construction, heartbeat emission, re-auth checks, terminal result delivery
4. Auth + rate limit + access check orchestration (lines 188-261)
5. Full submission query helper (lines 463-491)

All five are interleaved within a single `GET()` function. The connection tracking uses module-level mutable state (`activeConnectionSet`, `connectionInfoMap`, `userConnectionCounts`, `submissionSubscribers`) that persists across requests.

**Failure Scenario:** A bug in the connection eviction logic (e.g., off-by-one in the O(n) oldest-entry scan at line 47) silently drops a tracking entry for an active connection. The `userConnectionCounts` map becomes inconsistent with `connectionInfoMap`, causing per-user connection limits to be enforced incorrectly — either blocking legitimate users or allowing connection limit bypass.

**Fix:** Extract connection tracking into `src/lib/realtime/connection-tracker.ts` and the shared polling manager into `src/lib/realtime/submission-poll-manager.ts`. The route handler should only contain HTTP-level orchestration (auth, headers, stream wiring). This also enables unit testing the connection/polling logic independently.

---

### ARC-03: Middleware Proxy — Overloaded Concerns in a Single 340-Line Function

**Confidence:** High

**File:** `src/proxy.ts:220-318`

**Risk:** The `proxy()` function handles seven distinct concerns:
1. JWT token extraction and auth user resolution (with in-process cache)
2. User-Agent mismatch detection (audit signal)
3. Auth page redirect logic (logged-in user → dashboard)
4. Protected route gate (unauthenticated → login)
5. `mustChangePassword` enforcement (redirect to /change-password)
6. API key pass-through for Bearer requests
7. CSP header construction, nonce generation, locale resolution, security headers (in `createSecuredNextResponse`, lines 130-218)

The auth cache at line 23 uses a module-level FIFO `Map` with a 2-second TTL, which means a deactivated or role-changed user retains access for up to 2 seconds. The CSP construction at lines 192-204 builds a string via array join — any typo in a directive silently produces an invalid CSP that browsers ignore.

**Failure Scenario:** A new developer adds a route pattern to the `config.matcher` array without understanding that auth pages (`/login`, `/signup`) are deliberately excluded from the proxy matcher. They add `/api/auth/` to the matcher, which causes `x-forwarded-host` to be deleted (line 156) for OAuth callbacks, breaking `validateTrustedAuthHost()` with `UntrustedHost` errors. The comment at line 153 explicitly warns about this, but the risk remains because the constraint is enforced only by a comment.

**Fix:** Split `proxy.ts` into:
- `src/middleware/auth-gate.ts` — auth resolution, redirect logic, mustChangePassword
- `src/middleware/security-headers.ts` — CSP, HSTS, nonce, Cache-Control
- `src/middleware/locale.ts` — locale resolution and cookie

Extract the auth cache into a testable class. Add a runtime assertion that `/api/auth/` is NOT in the matcher, failing fast if someone adds it.

---

### ARC-04: Semantic Overloading of `rateLimits` Table

**Confidence:** Medium

**Files:**
- `src/lib/db/schema.pg.ts:592-610` — `rateLimits` table definition
- `src/lib/realtime/realtime-coordination.ts:92-131` — SSE connection tracking reuses `rateLimits` rows
- `src/lib/realtime/realtime-coordination.ts:147-184` — Heartbeat deduplication reuses `rateLimits` rows

**Risk:** The `rateLimits` table is used for three semantically distinct purposes:
1. Actual rate limiting (login attempts, API throttling)
2. SSE connection slot tracking (key prefix `realtime:sse:user:`)
3. Heartbeat deduplication (key prefix `realtime:heartbeat:`)

The table schema has columns like `attempts`, `consecutiveBlocks`, and `windowStartedAt` that are meaningless for SSE connection tracking. When SSE connections are stored, `attempts` is always 1 and `consecutiveBlocks` is always 0. The `blockedUntil` column is repurposed as an expiration timestamp for connection slots.

**Failure Scenario:** A database administrator runs a bulk cleanup query like `DELETE FROM rate_limits WHERE blocked_until < NOW()` intending to clear expired rate-limit windows. This also deletes active SSE connection slot entries, causing the connection tracker to lose track of live connections. Subsequent per-user connection count queries return incorrect values, allowing users to exceed their SSE connection limits.

**Fix:** Create a dedicated `sse_connections` table (or at minimum a separate `realtime_slots` table) with a schema that matches its actual use: `key`, `userId`, `connectionId`, `expiresAt`, `createdAt`. This makes the data self-documenting and prevents accidental cross-concern cleanup.

---

### ARC-05: Inconsistent Error Response Shapes Between Handler Patterns

**Confidence:** High

**Files:**
- `src/lib/api/responses.ts:8-16` — `apiError(error, status, resource?)` → `{ error, resource? }`
- `src/lib/api/auth.ts:80-90` — `unauthorized()` → `{ error: "unauthorized" }`, `forbidden()` → `{ error: "forbidden" }`
- `src/lib/api/handler.ts:157-158` — Zod validation → `{ error: message }` with status 400
- `src/lib/api/handler.ts:196-198` — Unhandled catch → `{ error: "internalServerError" }` with status 500
- Manual routes: 317 occurrences of `throw new Error` / `apiError` / `NextResponse.json({error})` across 67 files

**Risk:** Error responses lack a consistent envelope. Some routes return `{ error: string }`, others return `{ error: string, resource: string }`. The `apiError` helper supports an optional `resource` field but most manual routes construct JSON directly. Zod validation errors from `createApiHandler` return `parsed.error.issues[0]?.message` as the error string — which could be a raw English validation message leaking implementation details, not an i18n key.

**Failure Scenario:** A client-side error handler expects `{ error: string }` where `error` is an i18n key like `"unauthorized"`. A route that returns `{ error: "Expected string, received number at path userId" }` (from Zod) bypasses the i18n lookup and renders a raw English validation message to a Korean-speaking user.

**Fix:** Standardize on the `apiError` / `apiSuccess` / `apiPaginated` helpers from `@/lib/api/responses`. In `createApiHandler`, map Zod errors to i18n keys (e.g., `"validationError"`) rather than exposing raw messages. Add a shared type `ApiErrorResponse` (already exists in `@/types/api`) and enforce it at the TypeScript level for all route return types.

---

### ARC-06: Server Components Directly Query Database Without a Service Layer

**Confidence:** Medium

**Files:**
- `src/app/(public)/practice/problems/[id]/page.tsx` — imports `canAccessProblem`, `listProblemDiscussionThreads`, etc.
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx` — imports `canAccessGroup`
- `src/app/(public)/community/threads/[id]/page.tsx` — imports `getDiscussionThreadById`
- Multiple page components import directly from `@/lib/db`

**Risk:** Server components bypass any potential service-layer abstraction, directly importing from `@/lib/db` and domain modules. While Next.js RSC encourages this pattern, it creates two problems:

1. **Authorization scattering**: Each page component must individually call `canAccessGroup` / `canAccessProblem` / `canAccessSubmission` before fetching data. A missing check leaks data.
2. **Query duplication**: Multiple pages construct similar query patterns independently. The discussions module (`@/lib/discussions/data.ts`) is a partial service layer, but other domains (submissions, assignments) have no equivalent.

**Failure Scenario:** A developer creates a new page component that displays submission data. They query the submission from `db.query.submissions` but forget to call `canAccessSubmission`. The page renders the submission for any authenticated user, creating an IDOR vulnerability. The existing pages that do check access do so as a convention, not an enforced pattern.

**Fix:** For high-risk domains (submissions, assignments, problems), create service-layer modules like `@/lib/submissions/queries.ts` that combine data fetching with authorization checks. The function signature `getSubmissionForViewer(submissionId, userId, role)` would enforce access control internally. This is the pattern already used by `@/lib/discussions/data.ts`.

---

### ARC-07: Recruiting Access Context — Cross-Cutting Concern via AsyncLocalStorage

**Confidence:** Medium

**Files:**
- `src/lib/api/handler.ts:109` — `withRecruitingContextCache()` wraps every `createApiHandler` request
- `src/lib/recruiting/access.ts` — recruiting access resolution
- `src/lib/auth/permissions.ts:22-28` — `canAccessGroup()` and `canAccessProblem()` both call `getRecruitingAccessContext()`

**Risk:** Every API request processed through `createApiHandler` wraps itself in `withRecruitingContextCache()`, even if the request has nothing to do with recruiting. The recruiting access check permeates the permission system — `canAccessGroup`, `canAccessProblem`, and `getAccessibleProblemIds` all check `getRecruitingAccessContext()` as a first-class code path. This creates a hidden coupling: any change to the recruiting module can affect authorization decisions across the entire application.

Manual-pattern routes that don't use `createApiHandler` miss the recruiting context cache entirely. If they call `canAccessGroup` or `canAccessProblem`, the recruiting access check runs without the request-scoped cache, potentially performing redundant DB queries.

**Failure Scenario:** A change to `getRecruitingAccessContext()` that introduces a bug (e.g., returning `isRecruitingCandidate: true` for all users due to a null check error) would silently grant problem access to every user in the system through `canAccessProblem`, bypassing group-enrollment checks. The recruiting path is not obvious when reading `canAccessProblem` — it looks like a simple visibility + enrollment check.

**Fix:** Isolate the recruiting access check behind a feature flag or move it out of the core permission functions. The `canAccessGroup`/`canAccessProblem`/`canAccessSubmission` functions should contain only the core authorization logic. Recruiting-specific access should be injected via a separate middleware or composed at the route level, not baked into every permission check.

---

### ARC-08: Dual Auth Helper Re-exports Create Confusion

**Confidence:** Medium

**Files:**
- `src/lib/api/handler.ts:204` — re-exports `unauthorized`, `forbidden`, `notFound` from `@/lib/api/auth`
- `src/lib/api/auth.ts:80-90` — defines `unauthorized()`, `forbidden()`, `notFound()`

**Risk:** Some routes import `forbidden` from `@/lib/api/handler`, others from `@/lib/api/auth`. The two are identical (handler re-exports auth), but the import path inconsistency makes it harder to audit which routes are using the wrapper vs. manual pattern. A future refactor that changes one but not the other would create divergent behavior.

**Failure Scenario:** A developer changes the `forbidden()` function in `@/lib/api/auth.ts` to add audit logging, not realizing that `@/lib/api/handler.ts` also re-exports it. They test a handler-pattern route and see the logging work, then deploy — but all manual-pattern routes that import `forbidden` directly from `@/lib/api/auth` also get the logging, while `createApiHandler` routes go through a different code path that calls `forbidden()` internally. The audit trail becomes inconsistent.

**Fix:** Make `@/lib/api/auth` the single source of truth for response helpers. Remove the re-exports from `handler.ts` and import from the canonical location. Add a naming convention: `handler.ts` only exports `createApiHandler` and types.

---

### ARC-09: Global Mutable State in SSE Module

**Confidence:** High

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:26-29,77-95,108-109`

**Risk:** The SSE route maintains six module-level mutable variables:
- `activeConnectionSet` (Set)
- `connectionInfoMap` (Map)
- `userConnectionCounts` (Map)
- `submissionSubscribers` (Map)
- `sharedPollTimer` (interval reference)
- `globalThis.__sseCleanupTimer` (global interval reference)

These persist across all requests in the Node.js process. The stale connection cleanup at lines 81-95 runs on a `setInterval` that scans the entire `connectionInfoMap` every 60 seconds with an O(n) scan. With 500 connections, this is manageable; with 10,000 (a DDoS scenario), this timer becomes a CPU hot loop.

**Failure Scenario:** Under heavy load, the 60-second cleanup timer evicts entries based on `createdAt` age, not on whether the underlying TCP connection is still alive. A long-lived legitimate connection (e.g., a user watching a slow-judging submission for 30 minutes) could be evicted by the cleanup timer, causing the connection count to become inconsistent. The user can no longer receive SSE events, but their client doesn't know the server-side tracking entry was removed.

**Fix:** Move connection state into a dedicated class with explicit lifecycle methods (`register()`, `unregister()`, `cleanup()`). Add a heartbeat mechanism where each SSE client must periodically ACK, and only evict connections that have missed N heartbeats. Set an upper bound on `connectionInfoMap` size that triggers 429 responses rather than silent eviction.

---

### ARC-10: No Consistent Transaction Pattern for Multi-Step Mutations

**Confidence:** Medium

**Files:**
- `src/lib/actions/user-management.ts:312-341` — `editUser` uses `execTransaction` for uniqueness checks + update
- `src/app/api/v1/contests/[assignmentId]/invite/route.ts` — likely multi-step without transaction
- `src/app/api/v1/submissions/route.ts` — submission creation without transaction wrapper

**Risk:** Some mutations that touch multiple tables use `execTransaction` (e.g., user management), while others perform multi-step DB operations without transaction wrapping. If a failure occurs mid-operation (e.g., the submission is inserted but the assignment reference fails), the database is left in an inconsistent state.

The `execTransaction` helper in `src/lib/db/index.ts:64-72` has a subtle behavior: during build phase, it runs the callback without a transaction, which means build-time type checks don't validate transactional correctness.

**Failure Scenario:** An invitation creation route inserts a `recruitingInvitations` row then sends an audit event. If the audit event write fails (e.g., column constraint violation on a new field), the invitation is already committed but the audit trail is lost. Without transaction wrapping, there's no rollback.

**Fix:** Audit all multi-step mutation routes for transaction usage. Create a pattern document or lint rule: any route that performs more than one write operation must use `execTransaction`. Consider a `withAuditTransaction` helper that wraps `execTransaction` + audit event recording in a single transactional boundary.

---

### ARC-11: `@/lib/auth/permissions` Queries DB Directly — No Abstraction for Access Control Rules

**Confidence:** Medium

**File:** `src/lib/auth/permissions.ts` (241 lines)

**Risk:** The permissions module contains 6 exported functions (`canAccessGroup`, `canAccessProblem`, `getAccessibleProblemIds`, `canAccessSubmission`, `getSession`, `assertAuth`) that embed DB queries directly. The access control rules (who can see what) are scattered across SQL-like Drizzle queries mixed with capability checks and recruiting checks. There is no centralized access control list or policy definition — the policy is the code.

**Failure Scenario:** A new resource type (e.g., `problemSets`) needs access control. A developer copies the pattern from `canAccessProblem` and creates `canAccessProblemSet` in the same file, duplicating the group-enrollment check logic. Over time, subtle differences emerge between the two implementations (e.g., one checks recruiting access, the other doesn't), creating an inconsistency in the access control model.

**Fix:** Extract access control rules into declarative policy definitions. Something like:
```ts
const policies = {
  problem: { visibility: "public" | "private", groupAccess: true, authorAccess: true, recruitingAccess: true },
  submission: { ownerAccess: true, capability: "submissions.view_all", assignmentInstructorAccess: true },
  group: { enrollmentAccess: true, instructorAccess: true, capability: "groups.view_all" },
};
```
A generic `canAccess(resource, action, context)` function evaluates policies against the defined rules. This makes the access control model auditable and consistent.

---

## 3. Positive Architectural Observations

1. **Clean component boundary**: No `@/lib/db` imports in `src/components/`. Components are purely presentation + client-side state, with data fetching done at the page/API level.

2. **No Prisma coexistence**: The codebase uses Drizzle exclusively (no Prisma imports found). No ORM conflict.

3. **Server actions are properly secured**: All 9 server action files use `"use server"`, `isTrustedServerActionOrigin()`, `auth()`, capability checks, and rate limiting. The server-action auth pattern is consistent.

4. **`createApiHandler` is well-designed**: The wrapper provides a solid abstraction with auth, CSRF, rate limiting, Zod validation, and error handling. It supports role checks, capability checks, and API key auth bypass for CSRF.

5. **Schema is well-indexed**: The `schema.pg.ts` file has appropriate indexes for all foreign keys and common query patterns. Check constraints enforce data integrity at the DB level.

6. **CSRF protection is multi-layered**: `X-Requested-With` header + `Sec-Fetch-Site` + Origin validation, not relying on a single signal.

7. **API key auth is properly constrained**: API keys use the lesser of the key's declared role and the creator's current role, preventing privilege escalation.

---

## 4. Summary of Risk by Severity

| ID | Finding | Confidence | Risk Level | Effort |
|----|---------|-----------|------------|--------|
| ARC-01 | Fragmented auth surface — 76% of routes use manual pattern | High | High | Medium |
| ARC-02 | SSE events route — 492-line god function | High | High | Medium |
| ARC-03 | Middleware proxy — overloaded 340-line function | High | Medium | Medium |
| ARC-04 | Semantic overloading of `rateLimits` table | Medium | Medium | Low |
| ARC-05 | Inconsistent error response shapes | High | Medium | Low |
| ARC-06 | Server components query DB without service layer | Medium | Medium | High |
| ARC-07 | Recruiting access context permeates permission system | Medium | Medium | Medium |
| ARC-08 | Dual auth helper re-exports | Medium | Low | Low |
| ARC-09 | Global mutable state in SSE module | High | High | Medium |
| ARC-10 | No consistent transaction pattern for multi-step mutations | Medium | Medium | Medium |
| ARC-11 | Permissions module embeds DB queries — no declarative policy | Medium | Medium | High |
| ARC-12 | Single route file mixing manual and wrapper auth patterns | High | Medium | Low |
| ARC-13 | Lib module imports from components — minor layer inversion | Medium | Low | Low |
| ARC-14 | No `server-only` package — DB access guarded by convention only | Medium | Medium | Low |

---

## 5. Supplementary Findings

### ARC-12: Single Route File Mixing Manual and Wrapper Auth Patterns

**Confidence:** High

**File:** `src/app/api/v1/files/route.ts`

**Risk:** This file splits its HTTP methods across two patterns: the `GET` handler uses `createApiHandler`, while the `POST` handler is manually written with separate `getApiUser()`, `csrfForbidden()`, and `consumeApiRateLimit()` calls. This is the only route file that mixes both patterns in a single file. A developer reading the `GET` handler would assume CSRF and rate limiting are handled, then add a `DELETE` handler using the same pattern — missing the manual CSRF/rate-limit calls that the `POST` handler requires.

**Failure Scenario:** A new `DELETE` handler is added using `createApiHandler` without realizing the `POST` handler has custom logic (e.g., special API-key CSRF skip) that the wrapper doesn't replicate. The delete endpoint accepts requests that the manual POST handler would reject.

**Fix:** Migrate the `POST` handler to `createApiHandler`. If the manual pattern was needed for streaming or special request handling, document why in a comment and add it to an exception list.

---

### ARC-13: Lib Module Imports from Components — Minor Layer Inversion

**Confidence:** Medium

**Files:**
- `src/lib/plugins/chat-widget/chat-widget.tsx` — imports from `@/components/assistant-markdown`
- `src/lib/plugins/chat-widget/admin-config.tsx` — imports from `@/components/ui/*`

**Risk:** The `src/lib/` layer is intended as a pure business-logic layer that components consume. These two files contain React components (`.tsx`) and import UI primitives from `src/components/`. While this doesn't create a circular dependency (the imported components don't re-import from the chat-widget module), it establishes a bidirectional dependency between `lib/` and `components/` that could harden into a cycle over time.

**Failure Scenario:** A future change to `assistant-markdown.tsx` adds an import from `@/lib/plugins/chat-widget/tools.ts` for some shared formatting logic. Now there is a circular dependency between `lib/` and `components/`, which can cause build failures or undefined module resolution at runtime.

**Fix:** Move `chat-widget.tsx` and `admin-config.tsx` from `src/lib/plugins/chat-widget/` to `src/components/plugins/` (where `chat-widget-loader.tsx` already lives). The `src/lib/plugins/` directory should contain only `.ts` files (schemas, tools, providers, definitions) with no React imports.

---

### ARC-14: No `server-only` Package — DB Access Guarded by Convention Only

**Confidence:** Medium

**Risk:** The codebase relies on the convention that client components never import from `@/lib/db`. There is no `server-only` package or runtime guard that would cause a build-time or runtime error if a client component accidentally imported a server-only module. The convention is currently well-followed (zero `@/lib/db` imports in `src/components/`), but it is not enforced.

**Failure Scenario:** A developer adds `import { db } from "@/lib/db"` in a client component to avoid an extra API round-trip for a small lookup. The code compiles (Drizzle/pg are in `serverExternalPackages`), but at runtime the import fails silently or causes the entire client bundle to include the `pg` module, bloating the client-side JavaScript by hundreds of kilobytes and potentially leaking database credentials in the source map.

**Fix:** Add the `server-only` package as a re-export from `@/lib/db/index.ts`:
```ts
import "server-only";
```
This causes any client-side import of `@/lib/db` to throw at build time, enforcing the boundary mechanically rather than by convention.

---

**Recommended priority order for remediation:** ARC-01 → ARC-09 → ARC-02 → ARC-05 → ARC-14 → ARC-10 → ARC-04 → ARC-07 → ARC-03 → ARC-12 → ARC-06 → ARC-11 → ARC-13 → ARC-08
