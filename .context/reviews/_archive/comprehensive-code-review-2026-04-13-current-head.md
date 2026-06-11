# Comprehensive code review — 2026-04-13 (current head/worktree)

## Scope and inventory

This review was done against the current repository/worktree under `/Users/hletrd/flash-shared/judgekit`.

### Review-relevant inventory
I first built an inventory of tracked, review-relevant files (excluding generated/vendor/runtime artifacts such as `.git/`, `node_modules/`, `.next/`, `coverage/`, `test-results/`, `data/`, `.omx/`, `.omc/`, Rust `target/`, and local cache directories).

Tracked review surface inspected by category:
- `src/`: **428** files
- `tests/`: **216** files
- `docker/`: **104** files
- `drizzle/`: **53** files
- `docs/`: **17** files
- `scripts/`: **28** files
- `judge-worker-rs/`: **13** tracked source/config files
- `rate-limiter-rs/`: **9** tracked source/config files
- `code-similarity-rs/`: **6** tracked source/config files
- `static-site/`: inventoried and spot-checked deployment/runtime assets
- root-level configs/scripts/docs: compose files, Dockerfiles, README, env examples, ESLint/TS/Vitest/Playwright configs

### Examination method
I reviewed:
- root docs/config/deploy artifacts
- API routes and page/server-action surfaces
- shared auth/capability/db/realtime/file/chat/recruiting logic
- Rust worker / runner / validation and sidecars
- cross-file interactions between app ↔ worker, docs ↔ deploy config, TS fallback ↔ Rust sidecar, UI ↔ API ↔ server actions
- existing tests, especially where they masked or missed runtime behavior

### Final sweep focus
After the main pass, I did a specific missed-issues sweep for:
- custom-role assumptions
- aggregation / SQL shape mistakes
- filesystem persistence vs deployment config
- shared-state cleanup leaks
- cross-implementation drift (TS vs Rust)
- docs/config/runtime mismatches

---

## Executive summary

I did **not** find a new CRITICAL remote-code-execution-class issue in the current head, but I did find several **real, actionable HIGH/MEDIUM problems** that affect correctness, feature completeness, operational safety, and auditability.

### Severity summary
- **HIGH:** 4
- **MEDIUM:** 5
- **LOW:** 1

### Status summary
- **Confirmed issues:** 9
- **Likely issues:** 1
- **Risks needing manual validation:** 0 separate from the likely issue below

---

## Confirmed issues

### HIGH 1 — Uploaded files are not persisted in the shipped production Docker deployment
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/lib/files/storage.ts:4-16`
- `Dockerfile:97-100`
- `docker-compose.production.yml:78-96`
- `docker-compose.test-backends.yml:82-89`
- `.dockerignore:9`
- `deploy-docker.sh:280-295`

**Why this is a problem**
The file-storage layer writes uploads under `/app/data/uploads`. The runtime image creates `/app/data`, but the production compose file does **not** mount a persistent volume there. In contrast, `docker-compose.test-backends.yml` does mount `judgekit-data:/app/data`, which makes the omission in production especially clear. On top of that, `data/` is excluded from both the Docker build context and deployment rsync.

So in the shipped production deployment, uploaded blobs live only in the app container filesystem and disappear on rebuild/recreate/redeploy, while the database rows remain.

**Concrete failure scenario**
1. An admin uploads a PDF/image used in a problem statement.
2. The file row is stored in PostgreSQL and the blob lands in `/app/data/uploads/...` inside the app container.
3. `deploy-docker.sh` rebuilds/recreates the app container.
4. The container filesystem is replaced; the DB row still points at the old `storedName`.
5. `GET /api/v1/files/[id]` starts returning `404` because `readUploadedFile()` cannot find the blob.

**Suggested fix**
- Add a persistent volume for `/app/data` (or move uploads to object storage / a dedicated shared volume).
- Keep the storage path outside the ephemeral app image lifecycle.
- Add an integration/deployment test that uploads a file, recreates the app container, and verifies the file still serves.

---

### HIGH 2 — Custom-role support is still broken across user CRUD and several page-level flows
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/types/index.ts:1-7`
- `docs/api.md:1215-1248`
- `src/lib/users/core.ts:99-116`
- `src/lib/validators/profile.ts:30-59`
- `src/app/api/v1/users/route.ts:30-37,61-78,120-127`
- `src/app/api/v1/users/[id]/route.ts:24-33`
- `src/lib/actions/user-management.ts:226-257,376-396`
- `src/app/(dashboard)/dashboard/admin/users/page.tsx:70-86`
- `src/app/(dashboard)/dashboard/admin/users/add-user-dialog.tsx:103-128`
- `src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx:110-137`
- `src/app/(dashboard)/dashboard/contests/page.tsx:84-95`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:75-76`
- `src/lib/assignments/contests.ts:118-158`

**Why this is a problem**
The repository explicitly documents/supports **custom roles** (`src/types/index.ts`, `docs/api.md`, admin users UI loads `availableRoles` from DB), but several central validation and page paths still hard-code the 4 built-in roles:
- `validateRoleChangeAsync()` rejects any non-built-in `requestedRole`.
- `userCreateSchema` and `adminPatchUserSchema` only accept the built-in enum.
- API user create/update paths call `assertUserRole(...)`.
- server actions `createUser()` / `editUser()` also reject custom roles the same way.
- major pages still do `assertUserRole(session.user.role as string)` and then branch on built-in roles only.
- `getContestsForUser()` only understands built-in roles.

This means the repo claims and partially renders custom roles, but core CRUD and navigation flows still reject or crash on them.

**Concrete failure scenarios**
- An admin creates a custom role through `/api/v1/admin/roles` and sees it in the admin user dialogs, but creating/updating a user with that role fails with `invalidRole` / `createUserFailed` / `updateUserFailed`.
- A user authenticated with a custom role opens `/dashboard/contests` or `/dashboard/groups/[id]`; `assertUserRole()` throws because their role is not one of the 4 built-ins.
- A custom role that should have contest/group visibility gets silently treated like a student path in `getContestsForUser()`, returning the wrong dataset.

**Suggested fix**
- Stop using `UserRole`/`assertUserRole()` in flows that are supposed to accept custom roles.
- Replace built-in `z.enum([...])` role parsing with runtime validation against the role cache / DB-backed role registry.
- Refactor page-level role branching to capability-driven logic, not built-in-only unions.
- Add end-to-end tests for: create custom role → assign to user → login as that user → visit contests/groups/users surfaces.

---

### HIGH 3 — Chat transcript auditing can be bypassed and forged by the client
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/api/v1/plugins/chat-widget/chat/route.ts:22-37,163-202`
- `src/lib/plugins/chat-widget/chat-widget.tsx:116-129,152-165`
- `tests/unit/api/plugins.route.test.ts:400-412`

**Why this is a problem**
The server accepts a **client-controlled** `context.skipLog` flag and fully trusts client-supplied message history:
- if `skipLog === true`, the route skips DB logging entirely;
- the server writes the “previous assistant message” by taking the second-to-last assistant turn from the client-submitted `messages` array;
- the server does **not** log the actual streamed assistant response it is about to generate, so the final answer is only persisted if/when the client later re-submits it on the next request.

This means the chat log is not an authoritative server-side audit trail. A client can suppress logging, omit assistant turns, or inject fabricated assistant content.

**Concrete failure scenarios**
- A user calls the endpoint directly with `skipLog: true` and leaves no transcript, even though admin chat-log review and retention docs imply chats are reviewable.
- A malicious client submits a forged assistant message in `messages[-2]`; the server writes it into `chat_messages` as if it were a real model output.
- If a conversation ends after one assistant reply, that final assistant reply is never stored at all.

**Suggested fix**
- Remove client authority over transcript logging. `skipLog` must be server-internal only (or protected by a server-generated nonce/flag that clients cannot mint).
- Persist the actual server-generated assistant output, not a client replay of previous assistant turns.
- Treat the incoming `messages` array as prompt context only, not as authoritative historical records.
- Add tests that ensure forged assistant turns are not logged and that final streamed assistant replies are persisted server-side.

---

### HIGH 4 — The admin chat-log session index query is invalid on PostgreSQL, and its preview logic is wrong even if the SQL is fixed
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/api/v1/admin/chat-logs/route.ts:53-73`
- `tests/unit/api/admin-chat-logs.route.test.ts:66-125`

**Why this is a problem**
The grouped query selects:
- `chatMessages.userId`
- `chatMessages.problemId`
- `chatMessages.provider`
- `chatMessages.model`
- `users.name`
- `users.username`

while grouping only by `chatMessages.sessionId`.

That shape is invalid on PostgreSQL unless every non-aggregated selected column is grouped or functionally dependent in a way PostgreSQL can prove. Here it cannot. So the route will fail at runtime with the classic “must appear in the GROUP BY clause or be used in an aggregate function” error.

Separately, `firstMessage: min(chatMessages.content)` is not “the first message”; it is the **lexicographically smallest** message string.

**Concrete failure scenario**
- An admin opens the chat-log session index.
- The route executes the grouped query.
- PostgreSQL rejects it, producing a 500 instead of the session list.
- Even after SQL shape fixes, the session preview would still be wrong whenever the alphabetically smallest message is not the earliest message.

**Suggested fix**
- Rewrite the session-list query using either:
  - a subquery / CTE that aggregates by `sessionId` and separately joins the earliest/latest row, or
  - `DISTINCT ON (session_id)` plus window functions.
- Derive `firstMessage` from the earliest `createdAt`, not `min(content)`.
- Add at least one real DB-backed integration test for this route; the current unit test mocks the chain and cannot catch SQL-shape errors.

---

### MEDIUM 1 — Shared SSE coordination leaks connection slots for already-terminal submissions
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/api/v1/submissions/[id]/events/route.ts:174-181`
- `src/app/api/v1/submissions/[id]/events/route.ts:226-236`
- `src/app/api/v1/submissions/[id]/events/route.ts:244-253`

**Why this is a problem**
When PostgreSQL-backed realtime coordination is enabled, the route acquires a shared slot via `acquireSharedSseConnectionSlot(...)`. But if the submission is already in a terminal state, the short-circuit branch only calls `removeConnection(connId)` and returns the one-shot response. It does **not** call `releaseSharedSseConnectionSlot(sharedConnectionKey)`.

The shared slot is only released in the long-lived stream `close()` path.

**Concrete failure scenario**
1. Deployment enables `REALTIME_COORDINATION_BACKEND=postgresql`.
2. Many users open already-judged submissions (which take the short-circuit path).
3. Each request leaks a shared coordination slot until timeout.
4. Eventually the server starts returning `tooManyConnections` / `serverBusy` even though there are few or no open streams.

**Suggested fix**
- In the terminal-submission branch, release the shared slot when `useSharedCoordination` is true.
- Add a regression test specifically for the “terminal response after shared slot acquisition” path.

---

### MEDIUM 2 — The shipped Docker proxy config blocks the admin Docker image-management features it is supposed to support
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `docker-compose.production.yml:63-74`
- `docker-compose.worker.yml:18-27`
- `src/lib/docker/client.ts:6-8,202-236`
- `judge-worker-rs/src/runner.rs:764-773`

**Why this is a problem**
The app delegates Docker image management to the judge worker (`src/lib/docker/client.ts`), and the worker exposes `/docker/images`, `/docker/build`, `/docker/remove`, etc. But the production `docker-proxy` is configured with:
- `IMAGES=0`
- `BUILD=0`

and the dedicated worker compose does not enable `BUILD` either.

Those proxy flags disable exactly the Docker API surfaces the admin image-management UI/routes need.

**Concrete failure scenarios**
- `/dashboard/admin/languages` cannot reliably list image availability in the shipped production stack because `docker images` behind the proxy is blocked.
- “Build image” operations fail because the proxy does not expose build endpoints.
- “Remove image” may also behave inconsistently depending on which endpoint path the CLI hits.

**Suggested fix**
- If the deployment is supposed to support admin image management, enable the required proxy scopes (`IMAGES=1`, `BUILD=1`, and any other required image endpoints).
- If the deployment is **not** supposed to support those operations, disable/hide the UI and routes in that topology instead of shipping a broken control surface.
- Add an integration test that exercises the app → worker → docker-proxy chain, not just route-level mocks.

---

### MEDIUM 3 — TS and Rust code-similarity implementations normalize source differently, so production and fallback results diverge
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/lib/assignments/code-similarity.ts:8-13,17-47`
- `code-similarity-rs/src/similarity.rs:8-13,89-103`
- `tests/unit/assignments/code-similarity-normalize.test.ts:20-27`

**Why this is a problem**
The TS implementation preserves identifier casing (and there is an explicit test for that), while the Rust sidecar lowercases every non-whitespace character (`to_ascii_lowercase()` at line 102).

The codebase presents the Rust sidecar as the fast path and the TS logic as the fallback, but they are not semantically equivalent.

**Concrete failure scenario**
- In one environment, the Rust sidecar is available, so `Foo` and `foo` normalize the same.
- In another environment, the Rust sidecar is unavailable, so the TS fallback preserves case.
- The same pair of submissions can be flagged in one deployment and not flagged in another.

**Suggested fix**
- Define a single normalization contract and make both implementations match it exactly.
- Add parity tests that run the same fixtures through both TS and Rust normalizers.
- Decide explicitly whether identifier case should be preserved for case-sensitive languages; right now the repo disagrees with itself.

---

### MEDIUM 4 — Similarity normalization misses inline `#` comments for Python/shell-style languages, so comment churn can evade detection
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/lib/assignments/code-similarity.ts:39-47`
- `code-similarity-rs/src/similarity.rs:41-49`
- `docs/languages.md` / supported-language inventory (Python, Bash, R, etc.)

**Why this is a problem**
Both implementations only treat `# ...` as a comment when `#` appears at the **start of a line**. That matches C-preprocessor handling, but it misses inline comment syntax used heavily by supported languages such as Python and shell.

The code/comments claim to “strip comments”, but for many supported languages they only strip a subset.

**Concrete failure scenario**
Two Python submissions differ only in inline comments:
```py
print(total)  # candidate A
print(total)  # candidate B changed text here
```
Those comments survive normalization, reducing similarity and making comment-only obfuscation a viable way to dodge the checker.

**Suggested fix**
- Either implement language-aware comment stripping for supported families, or at least add correct handling for inline `#` comments outside string literals.
- Add regression fixtures for Python/shell/R-style inline comments in both TS and Rust test suites.

---

### MEDIUM 5 — Page-level contest/group flows still crash or mis-route for custom-role users even when the rest of the UI is custom-role aware
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `src/app/(dashboard)/dashboard/admin/users/page.tsx:70-86`
- `src/app/(dashboard)/dashboard/contests/page.tsx:84-95`
- `src/app/(dashboard)/dashboard/groups/[id]/page.tsx:75-76`
- `src/lib/assignments/contests.ts:118-158`

**Why this is a problem**
The admin users page already loads role definitions dynamically from the DB and renders custom role display names, so the UI clearly expects custom roles to exist. But key page flows still cast the active user to a built-in role via `assertUserRole(...)`, and the contest data loader only branches on built-in role names.

This is distinct from the CRUD validation bug above: even if user creation were fixed, page navigation would still fail.

**Concrete failure scenario**
- A custom “reviewer” role with the right capabilities logs in.
- `/dashboard/contests` throws because `assertUserRole(session.user.role as string)` rejects the custom role.
- `/dashboard/groups/[id]` fails for the same reason.
- Even if the page got past that, `getContestsForUser()` would route every non-built-in role through the student query path.

**Suggested fix**
- Remove built-in-role assertions from page entrypoints that should accept custom roles.
- Drive access/data selection from capabilities or DB-backed role levels, not built-in unions.
- Add at least one server-component test per affected page using a custom role session.

---

## Likely issue

### LOW 1 — The chat-widget tool layer leaks assignment metadata because `get_assignment_info` trusts client-supplied `assignmentId` without access checks
**Status:** Likely issue; needs a quick exploit validation pass  
**Confidence:** Medium

**Files / regions**
- `src/lib/plugins/chat-widget/tools.ts:249-272`
- `src/app/api/v1/plugins/chat-widget/chat/route.ts:22-37`

**Why this is likely a problem**
`handleGetAssignmentInfo()` looks up any assignment by `context.assignmentId` and returns its title/deadlines without checking whether the current user can access that assignment. The chat route accepts `assignmentId` from the client request body, so the value is caller-controlled.

The exploit path depends on getting the model to call `get_assignment_info`, which is why I am classifying this as likely rather than fully confirmed from code alone.

**Concrete failure scenario**
- An authenticated user submits a chat request with an arbitrary `assignmentId` and any valid `problemId` to force the tool-calling path.
- The model is prompted to call `get_assignment_info`.
- Private assignment title/deadline metadata is returned even if the user should not see that assignment.

**Suggested fix**
- Gate `get_assignment_info` with the same assignment/group/contest access checks used elsewhere.
- Do not trust `assignmentId` from the client without independently validating it against the current problem/user context.

---

## Documentation / test gaps worth fixing even if you defer the code changes

### LOW 1 — Environment examples and README still drift from actual runtime truth
**Status:** Confirmed  
**Confidence:** High

**Files / regions**
- `.env.example:35-39`
- `.env.production.example:21-24`
- `README.md:10`
- `README.md:218-225`
- `package.json:101`

**Why this matters**
- The env examples still say realtime coordination is “current implementation is process-local only,” while the README and code now document/support `REALTIME_COORDINATION_BACKEND=postgresql`.
- The README badge advertises “TypeScript 6” while `package.json` pins `typescript: 5.9.3`.

These are low-severity, but they are exactly the sort of operator drift that creates bad deploy assumptions and stale troubleshooting steps.

**Suggested fix**
- Update both env examples to describe the real current coordination options.
- Fix the README badge/version text to match the pinned toolchain.

---

## Final sweep / skipped-file confirmation

### Final missed-issues sweep performed
I did an explicit second pass for:
- custom-role regressions
- SQL grouping/aggregation mistakes
- shared-state cleanup leaks
- app ↔ worker ↔ docker-proxy contract mismatches
- filesystem persistence gaps across deploy artifacts
- TS/Rust duplicate-implementation drift
- docs/config drift

### What I intentionally excluded as non-review-relevant
I did **not** treat the following as primary logic surfaces:
- generated/build/runtime artifacts: `.next/`, `coverage/`, `test-results/`, local caches
- vendored dependencies: `node_modules/`
- local runtime/state/secrets: `.omx/`, `.omc/`, `data/`, local `.env` values
- Rust `target/` output

### Coverage conclusion
I inventoried the repository first, then reviewed the full tracked source/config/docs surface in categories. The strongest remaining defects are not isolated one-line mistakes; they are cross-file contract problems between:
- docs/types ↔ role validation/routes/pages
- app upload storage ↔ Docker image/runtime/deploy layout
- chat UI ↔ chat route ↔ admin log viewer
- shared realtime coordination ↔ SSE cleanup
- TS fallback ↔ Rust sidecar normalization
- app admin Docker UI ↔ worker Docker endpoints ↔ socket-proxy permissions

Those are the issues I would prioritize first.
