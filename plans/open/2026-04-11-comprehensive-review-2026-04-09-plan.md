# Implementation plan — `.context/reviews/comprehensive-review-2026-04-09.md`

## Source review status
This review still appears to contain **open work**. It is broad and overlaps with the 2026-04-10 code review, so execution should dedupe fixes instead of treating every item as isolated work.

## Progress updates
- ✅ Completed in this plan execution: admin role creation now treats insert-time unique violations as `roleNameExists` instead of surfacing a raw 500, closing the concurrent create race on custom role names.
- ✅ Completed in this plan execution: user creation now maps insert-time unique username/email races to the same conflict responses as the preflight checks instead of leaking a raw 500.
- ✅ Completed in this plan execution: user updates now also translate insert-time username/email unique races into stable conflict responses instead of leaking a raw 500.
- ✅ Completed in this plan execution: single and bulk recruiting-invitation creation now take assignment/email advisory locks and recheck duplicates inside the transaction before inserting, closing the duplicate-email invite race.
- ✅ Completed in this plan execution: group member removal now locks the enrollment row inside the final transaction before checking assignment submissions and deleting the enrollment, closing the stale pre-transaction lookup race.
- ✅ Revalidated at `HEAD`: password rehash is awaited, recruiting-token auth is rate-limited through the same atomic limiter path, and submission creation already holds an advisory lock for the submission-rate limit check.

## Critical / high themes to address
- auth and rate-limit races
- worker/judge claim lifecycle races
- unsafe or overly broad admin/docker operations
- stale built-in-role / member / invite TOCTOU flows
- legacy HTML / XSS risk in problem descriptions
- file-delete and backup/export safety gaps

## Phase 0 — Revalidate and dedupe
Before any code change, cross-check each finding against:
- `plans/open/2026-04-11-comprehensive-code-review-2026-04-10-plan.md`
- `plans/open/2026-04-11-comprehensive-code-review-2026-04-09-plan.md`

Use this plan for findings that are still unique after dedupe.

## Phase 1 — Auth and rate-limit atomicity
### Findings
- NEW-C04, NEW-C03, OPEN-C01, NEW-H19, NEW-H20, OPEN-H04

### Files
- `src/lib/auth/config.ts`
- `src/lib/security/{rate-limit,api-rate-limit}.ts`
- user create/update/bulk-user routes
- recruiting-token auth path

### Plan
- stop fire-and-forget password rehash for the login path
- make rate-limit check/consume flows atomic with row locking or a single transactional primitive
- use the same atomic pattern for recruiting-token auth
- collapse uniqueness checks and writes into the same transaction for user create/update flows
- **Status:** password rehash, submission-rate limiting, and atomic login/recruit-token checks were already fixed at `HEAD`; user create/update conflict handling is now robust against insert-time uniqueness races, while any remaining auth/identity concurrency gaps still need revalidation.

### Tests
- concurrent auth attempts
- concurrent user rename/create collisions
- password-rehash failure handling

## Phase 2 — Judge/worker lifecycle integrity
### Findings
- NEW-C02, NEW-H09, NEW-H10, NEW-H11, NEW-H12, OPEN-H01

### Files
- `src/app/api/v1/judge/{heartbeat,claim,poll,deregister,rejudge}/route.ts`
- worker capacity / submission claim helpers
- compiler/judge workspace lifecycle code

### Plan
- remove fire-and-forget worker sweeps from request paths or make them awaited and race-safe
- ensure claim, poll, rejudge, and deregister all agree on status transitions and `judgeWorkerId` clearing
- make concurrency/capacity accounting atomic
- re-check the workspace/container-isolation fixes against the still-open container-escape concern

### Tests
- in-progress submission lifecycle regression tests
- worker deregister / rejudge behavior
- concurrent claim behavior under capacity limits

## Phase 3 — Admin/route hardening and dangerous fallback removal
### Findings
- NEW-C01, NEW-H07, NEW-H08, NEW-H13, NEW-H14, NEW-H15, NEW-H17, OPEN-H02, OPEN-H03

### Files
- docker image admin route
- migrate/export endpoints
- recruiting invitation/admin routes
- file delete path
- any raw SQL helper entrypoints
- admin API-key / plugin secret flows

### Plan
- constrain admin Docker image operations to allowed tags/namespaces
- add CSRF/password reconfirmation where destructive export/import/admin flows still need it
- replace fragile file-delete and raw-SQL helper behavior with safer primitives
- close remaining stored-secret redisclosure and weak-key fallback paths

### Tests
- route authz/validation tests for image delete, migrate export, recruiting status transitions, and file delete failure ordering

## Phase 4 — Membership / invite / role TOCTOU sweep
### Findings
- NEW-H02..NEW-H06 plus any overlapping 2026-04-10 transactional findings

### Files
- contest invite route(s)
- role create/delete routes
- member enrollment/removal/group membership routes

### Plan
- move uniqueness/existence checks plus writes into the same transaction
- standardize conflict handling (`23505` / no-op outcomes / partial-success reporting)
- verify role cache invalidation and refresh semantics after mutations
- **Status:** role-create conflict handling, recruiting-invitation duplicate-email races, and group member removal TOCTOU are now robust; additional role/member/invite mutation paths still need revalidation or fixes.

### Tests
- concurrent invite creation
- concurrent role create/delete
- concurrent member add/remove

## Phase 5 — Medium-priority correctness backlog
### Findings
- NEW-M01..NEW-M23 and OPEN-M01..OPEN-M06

### Plan
Handle these in thematic batches after critical/high fixes:
1. request-boundary correctness (settings spread, Docker build path, limit bounds)
2. SSE/anti-cheat process-local assumptions and timer leaks
3. export/import memory behavior and index gaps
4. UI/hook correctness for drafts/unsaved changes/problem metadata leakage
5. CSP / retry-after / plugin isolation / stale-auth follow-ups

## Acceptance criteria
- every critical/high finding in this review is either fixed, merged into another review plan, or explicitly marked non-reproducible at `HEAD`
- judge worker lifecycle cannot regress already-scored submissions or over-claim work
- rate-limiting and identity mutations are atomic under concurrency
- dangerous admin routes validate inputs and enforce the right protections

## Verification targets
- targeted route/unit tests for auth, judge, recruiting, roles, and files
- concurrency-focused tests where feasible
- `pnpm -s tsc --noEmit`
- any Rust/service tests touched by worker lifecycle changes
