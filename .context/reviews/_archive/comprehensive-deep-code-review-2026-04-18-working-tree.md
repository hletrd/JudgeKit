# Comprehensive Deep Code Review — 2026-04-18 (working tree)

## Scope and inventory

This review was performed against the **current working tree** in `/Users/hletrd/flash-shared/judgekit`, not just the last commit. At review time the tree was dirty (`.env.example`, `code-similarity-rs/src/main.rs`, `rate-limiter-rs/src/main.rs`, `src/lib/assignments/code-similarity-client.ts`, `src/lib/security/rate-limiter-client.ts`, plus several untracked utility scripts).

### Inventory built before review

Reviewed repository areas:
- `src/` — 559 relevant app/lib/component/hook/type files
- `judge-worker-rs/src/` — 10 Rust source files
- `rate-limiter-rs/src/` — 3 source files
- `code-similarity-rs/src/` — 3 source files
- `docker/` — 105 Dockerfiles/runtime assets
- `scripts/` — 60 operational scripts/service files
- `docs/` — 24 docs/assets
- `tests/` — 385 relevant test files
- `drizzle/`, `.github/`, `messages/`, `.context/development/`, `.context/algo-problems/`, `plans/`
- Root config/runtime files (`README.md`, `package.json`, `next.config.ts`, Docker Compose files, deployment scripts, etc.)

Explicitly excluded as non-reviewable/generated/runtime artifacts:
- `.git/`, `node_modules/`, `.next/`, `coverage/`, `test-results/`, `data/`
- Rust `target/` trees
- `__pycache__` and other build/cache outputs
- large generated/problem-solution corpora under `.context/solutions/`
- historical review outputs under `.context/reviews/` were treated as context only, not as source of truth

### Verification performed

- `npx tsc --noEmit` ✅
- targeted Vitest runs over findings-related areas ✅
- `cargo test --quiet` in `judge-worker-rs/` ✅
- `cargo test --quiet` in `rate-limiter-rs/` ✅
- `cargo test --quiet` in `code-similarity-rs/` ✅
- full `npx vitest run` ❌ — current suite is red with 4 failures:
  - `tests/unit/data-retention.test.ts`
  - `tests/unit/api/judge-register.route.test.ts`
  - `tests/unit/api/judge-poll.route.test.ts`
  - `tests/unit/infra/source-grep-inventory.test.ts`

## Summary

I found **13 noteworthy issues**:
- **1 CRITICAL**
- **6 HIGH**
- **5 MEDIUM**
- **1 LOW**

The most serious problems are:
1. the judge-worker IP allowlist logic appears to block worker traffic in the shipped production topology,
2. the backup/restore path is not actually full-fidelity and can corrupt the file store on failed restores,
3. the runner-backed compiler/playground path is inconsistent with the built-in language catalog,
4. problem/file/submission access controls are inconsistent across routes and pages.

---

## Findings

### F01 — CRITICAL — Confirmed — High confidence
**Judge worker API traffic is effectively blocked in the shipped production topology**

**Files / regions**
- `src/lib/judge/ip-allowlist.ts:5-7, 73-93`
- `src/lib/security/ip.ts:38-71`
- `docker-compose.production.yml:124-128`

**Why this is a problem**
- `isJudgeIpAllowed()` claims that an unset `JUDGE_ALLOWED_IPS` means “allow all”, but in production it actually returns `false` when the allowlist is absent.
- Even if an allowlist is configured, `extractClientIp()` only trusts `X-Forwarded-For` / `X-Real-IP`; in production, if those headers are missing it returns `null`.
- The shipped production compose file points the worker directly at `http://app:3000/api/v1`, i.e. container-to-container traffic with no reverse proxy in front of the app.
- Direct worker requests therefore have no trusted proxy headers, so the app cannot derive a client IP and the judge endpoints reject the request.

**Concrete failure scenario**
1. Deploy `docker-compose.production.yml` as documented.
2. `judge-worker` calls `http://app:3000/api/v1/judge/register`.
3. The request has no `X-Forwarded-For` or `X-Real-IP`.
4. `extractClientIp()` returns `null` in production.
5. `isJudgeIpAllowed()` returns `false`.
6. Register / claim / heartbeat / poll / deregister all fail with `403 ipNotAllowed`, so the judge system never comes online.

**Suggested fix**
- Decide on one consistent policy and enforce it everywhere:
  - either truly allow all when `JUDGE_ALLOWED_IPS` is unset, **or**
  - require the allowlist and document/populate it in all deployment templates.
- For the shipped Docker topology, handle direct worker→app traffic explicitly. Options:
  - trust direct container peer IPs when requests come from the internal worker network,
  - read the actual remote socket address instead of only forwarded headers,
  - or route worker traffic through a trusted proxy that injects validated forwarding headers.
- Add integration tests for the documented Docker topology.

---

### F02 — HIGH — Confirmed — High confidence
**“Full-fidelity” streamed backups silently redact password hashes**

**Files / regions**
- `src/lib/db/export.ts:96-100, 280-286`
- `src/app/api/v1/admin/backup/route.ts:80-97`
- `src/app/api/v1/admin/migrate/export/route.ts:54-80`
- `docs/data-retention-policy.md:43-47`

**Why this is a problem**
- The streamed export path used by both the backup route and `?full=true` export sets `activeRedactionMap` to `ALWAYS_REDACT` when `sanitize` is false.
- `ALWAYS_REDACT` contains `users.passwordHash`.
- The docs explicitly say full-fidelity exports include all fields and that the backup route always produces a full-fidelity copy.
- In reality, disaster-recovery exports produced through the streaming path permanently drop password hashes.

**Concrete failure scenario**
1. Admin downloads a “full-fidelity” backup through `/api/v1/admin/backup`.
2. Production is lost; operator restores from that backup.
3. All user rows come back with `passwordHash = null`.
4. Password-based logins stop working for normal accounts until passwords are reset manually.

**Suggested fix**
- Remove `passwordHash` from `ALWAYS_REDACT`, or stop using `ALWAYS_REDACT` for full-fidelity export paths.
- If there is a policy reason to exclude password hashes, stop calling the artifact “full-fidelity” and block restore from it.
- Add a regression test that restores a streamed full-fidelity backup and verifies a password hash round-trips.

---

### F03 — HIGH — Confirmed — High confidence
**ZIP restore writes uploaded files before the database payload is validated/imported, so failed restores can corrupt the live upload store**

**Files / regions**
- `src/app/api/v1/admin/restore/route.ts:74-90, 112-156`
- `src/lib/db/export-with-files.ts:221-266`

**Why this is a problem**
- `restoreFilesFromZip()` extracts files directly into the live uploads directory.
- The route validates `database.json` and runs `importDatabase()` **after** those writes have already happened.
- If validation fails or the DB import rolls back, the file writes are not rolled back.
- Existing uploads can be overwritten even though the restore itself failed.

**Concrete failure scenario**
1. Operator uploads a ZIP backup with valid file entries but a broken or incompatible `database.json`.
2. `restoreFilesFromZip()` writes hundreds of files into `data/uploads/`.
3. `validateExport()` or `importDatabase()` then fails.
4. Database state stays old (or rolls back), but the file store is now partially replaced/orphaned.

**Suggested fix**
- Stage restored files in a temp directory first.
- Validate and import the DB snapshot successfully.
- Only then atomically swap/move the staged upload set into place.
- On failure, delete the temp staging area.

---

### F04 — HIGH — Confirmed — High confidence
**The production compiler/playground path is inconsistent with the built-in language catalog; several shipped languages will fail when the Rust runner is enabled**

**Files / regions**
- `src/lib/compiler/execute.ts:119-123, 389-467, 498-510`
- `judge-worker-rs/src/runner.rs:116-137, 590-620`
- `src/lib/judge/languages.ts:513, 673, 893, 1362, 1455, 1465, 1495, 1505` (representative compile commands)
- `src/lib/judge/languages.ts:674, 734, 874, 997, 1027, 1170, 1200` (representative run commands)
- `docker-compose.production.yml:95-98`

**Why this is a problem**
- Production compose enables the Rust runner via `COMPILER_RUNNER_URL`.
- Node’s local validator explicitly allows trusted admin-configured shell chaining (`&&`, `;`) because many built-in language commands depend on it.
- The Rust runner’s validator rejects `&&`, `;`, `|`, redirections, etc.
- Multiple built-in languages in `languages.ts` use exactly those constructs.
- When the runner rejects them, `tryRustRunner()` falls back to local execution only if local fallback is enabled. In the documented production path it is disabled, so the feature degrades to “Compiler runner unavailable”.

**Concrete failure scenario**
- A user runs code in Nim, FreeBASIC, MoonBit, Elm, Flix, LOLCODE, Umjunsik, or other languages whose compile/run command uses `sh -c` with chaining or pipes.
- The app sends that command to `/run` on the Rust worker.
- The Rust worker returns `400 Invalid compile command` or `Invalid run command`.
- The app suppresses the actual reason and returns the generic fallback failure because local fallback is disabled in production.

**Suggested fix**
- Unify command validation in one place and generate both implementations from the same policy.
- Better: stop sending raw shell strings to the Rust runner; send structured argv arrays and let the runner own the allowlist.
- Add an end-to-end test that exercises runner-backed compiler execution for all built-in languages that use shell chaining.

---

### F05 — HIGH — Confirmed — High confidence
**Group co-instructors/TAs are treated as managers in some subsystems but are blocked from group-shared problems/files/discussions by the core problem access helper**

**Files / regions**
- `src/lib/auth/permissions.ts:107-145, 147-210`
- `src/lib/assignments/management.ts:132-167`
- `src/app/api/v1/problems/[id]/route.ts:42-55`
- `src/app/api/v1/files/[id]/route.ts:15-58`
- also affects all routes/pages that call `canAccessProblem()` / `getAccessibleProblemIds()`

**Why this is a problem**
- `canAccessProblem()` and `getAccessibleProblemIds()` only grant group-shared access through **student enrollments**.
- They do not consider `groupInstructors` / TA membership.
- Elsewhere, the codebase explicitly treats co-instructors/TAs as legitimate managers of group resources (`getManageableProblemsForGroup()` does include group-shared problems for them).
- This creates an inconsistent permission model across the app.

**Concrete failure scenario**
1. A TA/co-instructor is assigned to a group.
2. The group uses a private problem shared through `problemGroupAccess` but authored by someone else.
3. The TA can manage the assignment context that references the problem.
4. The TA then opens the problem detail page, a code snapshot, or a linked file and gets `403` because problem access only checks enrollment.

**Suggested fix**
- Centralize problem access on “manageable groups” / instructor-role logic instead of enrollment-only checks.
- Extend `canAccessProblem()` and `getAccessibleProblemIds()` to include group instructor/TA membership.
- Add unit coverage for co-instructor/TA access, not just student enrollment paths.

---

### F06 — HIGH — Confirmed — High confidence
**Public problem attachments cannot be fetched anonymously, so public problems with embedded files/images break for logged-out users**

**Files / regions**
- `src/app/(public)/_components/public-problem-detail.tsx:84-87`
- `src/lib/problem-management.ts:222-238`
- `src/app/api/v1/files/[id]/route.ts:65-83`

**Why this is a problem**
- Public problem pages render the problem statement for anonymous visitors.
- Problem descriptions can explicitly link uploaded files to problems (`syncProblemFileLinks`).
- The file-serving route always requires `getApiUser()` and returns `401` when unauthenticated.
- That means a public problem statement containing `/api/v1/files/:id` references cannot fully render for logged-out users.

**Concrete failure scenario**
1. Instructor publishes a public problem whose statement embeds a diagram via `/api/v1/files/<id>`.
2. Anonymous visitor opens the public practice page.
3. The HTML/Markdown renders, but the file fetch returns `401`.
4. The diagram never loads.

**Suggested fix**
- Allow anonymous `GET /api/v1/files/:id` when the linked file belongs to a **public** problem.
- Keep strict response headers (`no-store`, `nosniff`, CSP) and continue blocking unrelated files.
- Add a public-problem file-serving test.

---

### F07 — HIGH — Confirmed — High confidence
**Submission API routes bypass result-visibility rules that the page layer correctly enforces**

**Files / regions**
- `src/app/api/v1/submissions/[id]/route.ts:14-88`
- `src/app/api/v1/submissions/[id]/events/route.ts:226-240, 300-318, 365-383`
- safe page-side logic for comparison:
  - `src/app/(dashboard)/dashboard/submissions/[id]/page.tsx:72-160`
  - `src/app/(public)/submissions/[id]/page.tsx:101-173`

**Why this is a problem**
- The page layer respects:
  - `assignment.showResultsToCandidate`
  - `assignment.hideScoresFromCandidates`
  - `problem.showCompileOutput`
  - `problem.showDetailedResults`
  - `problem.showRuntimeErrors`
- The API route only strips hidden test-case output and optionally source code.
- The SSE route strips only source code for non-privileged viewers and otherwise pushes the full submission object.
- Owners/candidates can therefore retrieve details through the API/SSE that the rendered page intentionally hides.

**Concrete failure scenario**
1. Contest/exam config hides results or runtime details from candidates.
2. Candidate opens submission detail and waits on SSE, or directly calls `/api/v1/submissions/:id`.
3. API/SSE returns compile output, runtime error type, or per-test execution details that the page UI would hide.
4. Candidate learns information earlier than intended.

**Suggested fix**
- Move submission redaction into a shared server-side helper used by:
  - the page loader,
  - `GET /api/v1/submissions/:id`, and
  - `GET /api/v1/submissions/:id/events`.
- Cover all hide/show flags, not just source visibility and hidden test cases.

---

### F08 — MEDIUM — Confirmed — High confidence
**Submission cursor pagination can skip records that share the same timestamp**

**Files / regions**
- `src/app/api/v1/submissions/route.ts:50-99`

**Why this is a problem**
- Cursor mode orders only by `submittedAt DESC`.
- The next page filter uses `lt(submissions.submittedAt, cursorRow.submittedAt)`.
- If multiple submissions share the same `submittedAt` value, everything with the same timestamp but a lower relative position is skipped.

**Concrete failure scenario**
1. A user submits multiple times within the same millisecond/DB timestamp bucket.
2. First page ends on submission `A`.
3. Second page filters with `submittedAt < A.submittedAt`.
4. Submission `B` with the same timestamp is never returned.

**Suggested fix**
- Use a stable composite cursor/order: `(submittedAt DESC, id DESC)`.
- Filter with `(submittedAt < cursorTime) OR (submittedAt = cursorTime AND id < cursorId)`.
- Add a regression test with two rows sharing the same timestamp.

---

### F09 — MEDIUM — Confirmed — High confidence
**The dashboard problems page overexposes problem listings to custom roles that can create/edit problems but should not have global visibility**

**Files / regions**
- `src/app/(dashboard)/dashboard/problems/page.tsx:146-190`
- contrast with API behavior in `src/app/api/v1/problems/route.ts:26-55`

**Why this is a problem**
- The page sets `canManageProblems = problems.create || problems.edit || problems.view_all`.
- It then disables the access filter entirely whenever `canManageProblems` is true.
- That means a custom role with `problems.create` or `problems.edit` but **without** `problems.view_all` still gets the unfiltered global list.
- The API route does the narrower, correct thing and only bypasses filtering for `problems.view_all`.

**Concrete failure scenario**
1. Create a scoped custom role that may author or edit certain problems but should not enumerate every private problem.
2. User opens `/dashboard/problems`.
3. Server-side page query disables `accessFilter` and returns all problems.
4. Titles/metadata for unrelated private problems leak into the UI.

**Suggested fix**
- Make global list visibility depend only on `problems.view_all`.
- Keep create/edit affordances separate from list scope.
- Add a behavioral test for a custom role with `problems.create` but not `problems.view_all`.

---

### F10 — MEDIUM — Confirmed — High confidence
**Production compose does not pass sidecar auth tokens into the code-similarity and rate-limiter services, so their Bearer auth protections cannot actually be enabled there**

**Files / regions**
- `docker-compose.production.yml:146-175`
- `code-similarity-rs/src/main.rs:163-173`
- `rate-limiter-rs/src/main.rs:379-389`
- `.env.example:47-59`

**Why this is a problem**
- Both sidecars support optional Bearer-token auth.
- The production compose file does not load `env_file` or pass `CODE_SIMILARITY_AUTH_TOKEN` / `RATE_LIMITER_AUTH_TOKEN` into those containers.
- The sidecars therefore log a warning and accept unauthenticated requests on the internal Docker network.
- `.env.example` suggests these tokens are part of the intended deployment story, but the shipped production compose wiring does not honor that.

**Concrete failure scenario**
- An operator sets `CODE_SIMILARITY_AUTH_TOKEN` and `RATE_LIMITER_AUTH_TOKEN` in `.env.production`, expecting the sidecars to require auth.
- The `app` container gets the vars, but the sidecar containers do not.
- The services still run unauthenticated, contrary to operator expectations.

**Suggested fix**
- Pass these vars through to the `code-similarity` and `rate-limiter` services (preferably via `env_file: .env.production`).
- Add a deploy/integration test that fails if the sidecars start without their configured auth env vars.

---

### F11 — MEDIUM — Confirmed — High confidence
**ZIP “bomb” validation still fully inflates each entry into memory before enforcing the size limit**

**Files / regions**
- `src/lib/files/validation.ts:44-68`

**Why this is a problem**
- The function intends to protect against oversized decompressed ZIPs.
- But JSZip does not expose uncompressed size directly here, so the implementation calls `entry.async("uint8array")` for each entry.
- That allocates the entire decompressed entry before `totalUncompressed` is checked.
- A single huge entry can therefore exhaust memory before the limit is enforced.

**Concrete failure scenario**
1. Authenticated user uploads a ZIP with one highly-compressed entry that expands massively.
2. Validation begins decompressing the entry to count bytes.
3. Process memory spikes before the code reaches `if (totalUncompressed > max)`.
4. The request can trigger OOM or severe latency.

**Suggested fix**
- Use a ZIP parser that exposes central-directory uncompressed sizes without inflating payloads.
- Enforce both per-entry and total uncompressed limits before decompression.
- Consider rejecting pathological compression ratios and entry counts.

---

### F12 — MEDIUM — Likely — High confidence
**“Streaming” backup-with-files is actually fully buffered in memory**

**Files / regions**
- `src/lib/db/export-with-files.ts:110-176`

**Why this is a problem**
- The function reads the entire DB export into `dbChunks`, concatenates it into `dbJson`, reads each upload fully into memory, generates the ZIP fully into `blob`, then returns a one-chunk `ReadableStream`.
- For large deployments, this is not streaming behavior; it is whole-archive buffering.
- The backup route therefore scales poorly and can OOM long before network transfer begins.

**Concrete failure scenario**
- A production instance with a large DB export plus many uploaded files invokes `includeFiles=true`.
- Node accumulates the entire JSON snapshot, all file buffers, and the final ZIP buffer simultaneously.
- Memory spikes enough to crash the process or trigger container eviction.

**Suggested fix**
- Replace JSZip whole-buffer generation with a true streaming archive writer.
- Stream DB export directly into the ZIP entry and stream upload files entry-by-entry.
- Bound concurrent file reads.

---

### F13 — LOW — Confirmed — High confidence
**Language-count documentation is internally inconsistent**

**Files / regions**
- `README.md:18, 25-26`
- `AGENTS.md:18-20`
- `docs/languages.md:126-131`
- `src/types/index.ts:27-153`

**Why this is a problem**
- `README.md` says **124** language variants.
- `AGENTS.md` says **120** language variants.
- `docs/languages.md` and `src/types/index.ts` currently enumerate **125**.
- This kind of count drift is exactly the sort of operational/documentation mismatch that causes bad setup assumptions, stale tests, and incorrect release notes.

**Concrete failure scenario**
- A maintainer updates release notes or support matrices from README/AGENTS instead of the real source of truth, undercounting supported languages and missing recent additions.

**Suggested fix**
- Generate the count automatically from `src/lib/judge/languages.ts` / `src/types/index.ts` in docs or tests.
- Avoid hardcoding the number in README/AGENTS unless it is auto-updated.

---

## Coverage and test-gap observations

Several findings above are reinforced by **missing or stale test coverage**:
- `tests/unit/auth/permissions.test.ts:177-285` exercises only student/shared-problem cases for `canAccessProblem()` / `getAccessibleProblemIds()`; it does **not** cover co-instructor/TA access.
- `tests/unit/api/files-by-id.route.test.ts:132-289` exercises authenticated cases only; there is **no** anonymous public-problem attachment case.
- `tests/unit/api/submission-detail.route.test.ts:65-129` checks only source-code stripping and hidden test outputs; it does **not** cover `showCompileOutput`, `showDetailedResults`, `showRuntimeErrors`, or assignment hidden-results policies.
- `tests/unit/compiler/execute-implementation.test.ts:33-42` is a string-presence check and does **not** actually assert Node/Rust validator parity against real language commands.
- `tests/unit/infra/deploy-security.test.ts` checks network exposure but not that sidecar auth tokens are wired into the production compose services.
- The current full unit run is red, so CI confidence is already degraded by stale tests/baselines:
  - `tests/unit/data-retention.test.ts`
  - `tests/unit/api/judge-register.route.test.ts`
  - `tests/unit/api/judge-poll.route.test.ts`
  - `tests/unit/infra/source-grep-inventory.test.ts`

## Final missed-issues sweep

I did a final sweep specifically for commonly-missed problems across:
- auth bypasses / `auth: false` routes
- hidden-result / hidden-test-case leaks
- judge-worker registration/claim/heartbeat flow
- Docker/sidecar auth wiring
- file-serving/public-page interactions
- custom-role/capability inconsistencies
- backup/restore/data-retention correctness
- cursor pagination edge cases
- docs/code count drift
- current test health

No additional **confirmed** issues beyond the list above stood out more strongly than these. The main categories I intentionally excluded from detailed line-by-line findings were generated artifacts/build outputs (`node_modules`, `.next`, Rust `target/`, screenshots/test-results, cached solution corpora), because they are not source-of-truth implementation code.

## Overall verdict

**Request changes.**

The repository has strong test coverage and a lot of thoughtful security/operational work, but the current working tree still contains several high-impact cross-file defects:
- a production-breaking judge-worker IP gate,
- backup/restore correctness flaws,
- runner/catalog incompatibility for compiler execution,
- authorization inconsistencies across problem/file/submission surfaces.

Those should be addressed before treating this revision as release-ready.
