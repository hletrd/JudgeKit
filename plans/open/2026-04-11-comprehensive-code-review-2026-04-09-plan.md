# Implementation plan — `.context/reviews/comprehensive-code-review-2026-04-09.md`

## Source review status
This review still appears to contain **open work**. No later addendum in the source file marks it as fully remediated.

## Progress updates
- ✅ Revalidated at `HEAD`: PostgreSQL-only runtime/support docs are already aligned; the earlier SQLite/MySQL runtime-support finding is closed by current docs and the migration helper now explicitly labels the SQLite flow as legacy/unsupported.
- ✅ Completed in this plan execution: `GET /api/v1/groups/[id]` now returns explicit `enrollmentsMeta` (`totalCount`, `returnedCount`, `isComplete`) so the embedded enrollment payload is no longer an ambiguous preview-vs-full-list contract.
- ✅ Revalidated at `HEAD`: stored admin API keys are no longer re-disclosed by the management GET route or table UX; only the one-time creation dialog returns the raw key and later views stay masked.
- ✅ Revalidated at `HEAD`: bulk user creation no longer returns or renders generated passwords; the API now returns only created usernames/names plus failure reasons.
- ✅ Revalidated at `HEAD`: `scripts/setup.sh` no longer uses raw `eval`, so the setup-wizard injection finding is already closed.
- ✅ Revalidated at `HEAD`: `importDatabase()` is wrapped in a single transaction, so partial-commit-on-error behavior from the review is no longer reproducible.
- ✅ Revalidated at `HEAD`: file storage request paths now use async `node:fs/promises` helpers rather than blocking synchronous disk I/O.
- ✅ Revalidated at `HEAD`: `rate-limiter-rs` already ships Rust tests in `src/main.rs`, so the earlier “zero real tests” note is stale.
- ✅ Revalidated at `HEAD`: similarity normalization already has regression tests proving comment markers inside string literals are not treated as comments.
- ✅ Completed in this plan execution: file download authorization no longer falls back to scanning problem descriptions; access now relies on explicit `files.problemId` linkage or normal owner/manage capabilities.
- ✅ Completed in this plan execution: legacy HTML sanitization now strips external `<img>` sources by default while preserving first-party root-relative assets, closing the review's remote tracking-image concern without removing all historical HTML rendering.
- ✅ Completed in this plan execution: recruiting invitation routes now authorize via `recruiting.manage_invitations` capability checks instead of admin-only role gates, moving one more route cluster onto the capability model.
- ✅ Completed in this plan execution: contest-management routes that used `canManageContest` now inherit the async group-resource capability/co-instructor logic instead of hard-coding admin/owner-instructor checks.
- ✅ Completed in this plan execution: admin audit-log and login-log APIs now authorize through their existing `system.audit_logs` / `system.login_logs` capabilities instead of hard-coded admin-only gates.
- ✅ Completed in this plan execution: problem-set routes plus submission comment/rejudge routes now authorize through `problem_sets.*` / `submissions.*` capabilities instead of built-in admin/instructor-only role gates.
- ✅ Completed in this plan execution: admin tag routes, contest quick-create, and contest code-snapshot history now authorize through `system.settings`, `contests.create`, and `contests.view_analytics` capabilities instead of admin-only role checks.
- ✅ Completed in this plan execution: server-action user management now uses dynamic role levels from the capability cache for password-reset privilege comparisons, so custom roles no longer collapse to the built-in `ROLE_LEVEL` fallback there.
- ✅ Completed in this plan execution: group deletion now authorizes through `groups.delete` capability instead of hard-coded admin/super-admin role gates.
- ✅ Completed in this plan execution: group list/create and problem list/create routes now use `groups.*` / `problems.*` capability checks instead of built-in admin/instructor branching.
- ✅ Completed in this plan execution: user list/create/detail/update/delete routes now use `users.*` capabilities for privileged access instead of hard-coded admin-only gates, while still preserving self-service access where intended.
- ✅ Completed in this plan execution: problem detail/update/delete now use `problems.edit` / `problems.delete` capabilities for privileged management while preserving author ownership access.
- ✅ Completed in this plan execution: group detail email visibility now follows the shared async group-management permission helper, so co-instructors and custom manager roles can see the same member emails as primary instructors/admins.
- ✅ Completed in this plan execution: bulk user creation now honors `users.create` for custom roles while preserving the legacy built-in instructor student-only carve-out.
- ✅ Completed in this plan execution: exam-session routes now use shared group-management checks (plus `contests.view_analytics` for elevated reads) instead of built-in admin-only branching.
- ✅ Completed in this plan execution: server-action user-management auth now honors `users.create` / `users.edit` / `users.delete` capabilities instead of relying only on built-in role checks.
- ✅ Completed in this plan execution: submissions list now keys its all-submissions view off `submissions.view_all` capability instead of a built-in admin-only branch.

## Findings covered by this plan
1. PostgreSQL-only runtime still documented as SQLite/MySQL-capable
2. Group details endpoint truncates enrollments without pagination contract
3. File authorization still depends on description `LIKE`
4. Stored admin API keys can still be re-disclosed
5. Bulk user creation still exposes generated passwords
6. Custom-role behavior still inconsistent outside remediated surfaces
7. Export path may keep doing full work after client abort
8. Node-only imports still leak into Edge-reachable modules
9. `scripts/setup.sh` still uses raw `eval`
10. Email identity normalization remains inconsistent
11. Multi-instance SSE / anti-cheat still lacks code-level guard
12. `rate-limiter-rs` still lacks real tests
13. `importDatabase()` can still partially commit failed imports
14. File request paths still use sync disk I/O
15. TS similarity fallback still mis-parses comment markers in string literals

## Phase 0 — Revalidate the review against `HEAD`
Before changing code, re-check the current implementation for each numbered finding and drop anything already fixed.

**Primary files to inspect first**
- `README.md`, `docs/deployment.md`, `AGENTS.md`, `scripts/migrate-sqlite-to-pg.ts`
- `src/app/api/v1/groups/[id]/route.ts`
- `src/app/api/v1/files/[id]/route.ts`
- admin API-key and bulk-user surfaces / routes
- `src/lib/db/{import,export}.ts`
- `src/lib/files/*`
- `scripts/setup.sh`
- `rate-limiter-rs/src/*`

## Phase 1 — Runtime-truth, identity, and setup safety
### Track 1A — Make runtime support claims honest
**Files**
- `README.md`
- `docs/deployment.md`
- `AGENTS.md`
- `scripts/migrate-sqlite-to-pg.ts`

**Plan**
- decide whether SQLite/MySQL support is truly dead or needs restoration
- if dead, remove the claims everywhere and replace the migration script with explicit historical/offline guidance
- if alive, repair the documented path and add a smoke test

### Track 1B — Remove unsafe shell evaluation
**Files**
- `scripts/setup.sh`

**Plan**
- replace raw `eval`-based parsing with explicit case handling / array-safe shell logic
- add shell-level regression coverage or at least a deterministic script harness

### Track 1C — Normalize email identity rules
**Files**
- login/auth helpers
- user creation/update helpers
- bulk user import/create paths

**Plan**
- pick one canonical rule for case folding + uniqueness
- apply it at creation, update, login, and bulk-import boundaries
- add tests for `Foo@Example.com` vs `foo@example.com`

## Phase 2 — Authorization and secret disclosure cleanup
### Track 2A — Replace description-based file access
**Files**
- `src/app/api/v1/files/[id]/route.ts`
- problem/file relationship storage code

**Plan**
- add an explicit relational attachment model or metadata field
- migrate callers away from description scans
- remove the brittle `LIKE` fallback once migration is complete
- **Status:** done for the live read path — the file route now trusts only explicit `files.problemId` linkage plus owner/manage capabilities. Any historical rows missing linkage should be handled by existing problem save/import syncing or future backfill work, not runtime description scans.

### Track 2B — End redisclosure of stored secrets
**Files**
- admin API-key routes/UI
- bulk user creation route/UI/export helpers

**Plan**
- split one-time reveal from later management views
- keep only masked previews after creation
- provide explicit CSV/download semantics for bulk-user bootstrap flows without keeping raw passwords in normal browser state
- add component/route tests proving later fetches never include the secret value

### Track 2C — Finish custom-role consistency sweep
**Files**
- remaining built-in-role-only routes/actions/pages outside Docker-image management
- capability helpers

**Plan**
- inventory every route/page still using hard-coded role checks
- decide whether to convert to capabilities or keep built-in-only intentionally
- align UI gating and server enforcement
- **Status:** recruiting invitation APIs, contest-management routes, admin log APIs, user management routes/actions, problem-set routes, submission moderation routes, admin tag routes, contest quick-create, contest code-snapshot history, exam-session routes, group list/detail/create/delete/export, problem list/detail/create/update/delete, submissions listing, bulk-user creation, and server-action user-management auth now use capability-aware or dynamic-role-aware logic. The only remaining built-in carve-outs are explicitly intentional and documented in code: (1) legacy instructor student-only bulk create access, and (2) the built-in-admin-only break-glass override for changing assignment problem links after submissions exist.

### Track 2D — Tighten legacy HTML rendering instead of trusting external media
**Files**
- `src/lib/security/sanitize-html.ts`
- `src/components/problem-description.tsx`

**Plan**
- keep the current sanitized legacy HTML path only for safe inline formatting
- strip external/tracking image sources by default
- preserve first-party root-relative assets used by existing problem statements
- **Status:** external `<img>` sources are now stripped by the sanitizer; full legacy-HTML deprecation remains a possible future hardening step if the risk profile changes.

## Phase 3 — Import/export, file I/O, and abort handling
### Track 3A — Make import failure semantics honest
**Files**
- `src/lib/db/import.ts`
- backup/restore/migrate routes

**Plan**
- wrap import batching in a single success/failure contract
- ensure partial batch failure cannot be reported as success or committed silently
- add fixtures covering mixed-valid/invalid batch input

### Track 3B — React to export client aborts
**Files**
- `src/lib/db/export.ts`
- backup/export endpoints

**Plan**
- thread `AbortSignal`/stream cancellation through the export loop
- stop DB pagination and serialization work when the client disconnects
- add a cancellation-focused test or harness

### Track 3C — Move blocking file I/O off hot request paths
**Files**
- `src/lib/files/*`
- upload/download/delete routes

**Plan**
- inventory synchronous disk APIs in request handlers
- switch the hot paths to async equivalents or isolate sync work behind bounded worker code
- keep file lifetime semantics unchanged

## Phase 4 — Edge/runtime and scale correctness
### Track 4A — Eliminate Edge-reachable Node imports
**Files**
- shared modules imported by Edge runtime entrypoints

**Plan**
- split Node-only helpers behind dynamic/server-only boundaries
- add lint/test guard so Edge paths cannot import `fs`, `path`, or other Node-only APIs accidentally

### Track 4B — Make pagination contracts explicit
**Files**
- `src/app/api/v1/groups/[id]/route.ts`
- any UI consuming embedded enrollments

**Plan**
- either paginate enrollments properly with metadata or rename the embedded field to a preview contract
- update consumer tests accordingly
- **Status:** done for the current route contract — explicit `enrollmentsMeta` now accompanies the embedded list so consumers can tell whether they received a full set or a preview.

### Track 4C — Add missing guardrails/tests
**Files**
- SSE/anti-cheat deployment/runtime config
- `rate-limiter-rs`
- similarity fallback parser

**Plan**
- add a code-level single-instance guard or explicit startup warning for SSE/anti-cheat assumptions
- add real Rust tests for rate-limiter behavior
- harden similarity parser tokenization so string literals do not look like comment delimiters

## Acceptance criteria
- every still-reproducible finding above has either a merged fix plan or an explicit "not reproducible at HEAD" note
- no admin or bulk-user management view re-discloses long-lived secrets after creation time
- file authorization no longer depends on problem-description text matching
- import/export failure and abort behavior are covered by regression tests
- pagination/runtime-truth contracts are explicit in code and docs

## Verification targets
- targeted Vitest route/component tests per track
- Rust tests for `rate-limiter-rs`
- `pnpm -s tsc --noEmit`
- docs/script checks (`bash -n scripts/setup.sh`, relevant smoke tests)
