# Document-Specialist Review

Date: 2026-07-01
Scope: AGENTS.md, README.md, SECURITY.md, docs/api.md, docs/deployment.md, docs/languages.md vs. implementation.
Method: Compared documentation claims against `src/app/api/v1/**` route files, `src/lib/judge/languages.ts`, `src/types/index.ts`, `judge-worker-rs/src/{types,languages}.rs`, `src/lib/capabilities/types.ts`, `deploy-docker.sh`, `scripts/setup.sh`, `docker-compose.production.yml`, and `package.json`.

Summary: **24 findings** across API docs, language/image inventory, deployment instructions, capability claims, and data-retention mechanics. The largest drift class is `docs/api.md`, which omits 34 live endpoints. Language/image documentation contains the most cross-file contradictions (Docker image names, active vs. disabled languages, image counts, preset contents, and ARM64 claims).

---

## Findings Summary

| ID | Severity | Classification | Confidence | Area | Finding |
|----|----------|----------------|------------|------|---------|
| DOC-1 | High | Missing | High | API docs | `docs/api.md` omits 34 live `/api/v1` endpoints |
| DOC-2 | High | Incorrect | High | Languages | `flix` documented as `judge-jvm`; code uses `judge-flix` |
| DOC-3 | High | Inconsistent | High | Languages | `flix` marked arm64-ready in table but also listed in ARM-prohibitive set |
| DOC-4 | High | Outdated | High | Languages | `roc` listed as active in `AGENTS.md` but absent from TypeScript `Language` union |
| DOC-5 | High | Outdated | High | Images | README image-size table lists `judge-j`, `judge-malbolge`, `judge-roc` with no active language config |
| DOC-6 | High | Incorrect | High | API docs | Similarity-check endpoint auth described as "Instructor or above"; code also allows assistants |
| DOC-7 | High | Incorrect | High | Deployment | `docs/deployment.md` says app container listens on port 3100 internally; actual internal port is 3000 |
| DOC-8 | Medium | Outdated | High | Capabilities | README/AGENTS.md claim 43 capabilities; code defines 46 |
| DOC-9 | Medium | Outdated | High | Images | Docs claim 102 active Docker images; active language configs reference 98 distinct images |
| DOC-10 | Medium | Inconsistent | High | Presets | `scripts/setup.sh` `all` preset includes ARM-prohibitive languages; `deploy-docker.sh` and docs exclude them |
| DOC-11 | Medium | Outdated | High | Deployment | `docs/deployment.md` language-preset size estimates disagree with `deploy-docker.sh` and README/AGENTS.md |
| DOC-12 | Medium | Incorrect | High | API docs | `GET /api/v1/admin/docker/images` auth described as "Admin or Super Admin"; code requires `system.settings` |
| DOC-13 | Medium | Incorrect | High | API docs / agent guide | AGENTS.md Docker image build/delete auth described as "Admin/super_admin only"; code requires `system.settings` |
| DOC-14 | Medium | Missing | High | API docs | Contest join endpoint docs omit two failure-scoped rate-limit buckets |
| DOC-15 | Medium | Inconsistent | High | Languages | `judge-haskell` base image/OS is reported three different ways across docs, code, and Dockerfile |
| DOC-16 | Low | Outdated | High | Languages | `docs/languages.md` E2E summary reports 113-language scope; active count is 125 |
| DOC-17 | Low | Outdated | High | Languages | `AGENTS.md` language table contains 126 rows while claiming 125 variants |
| DOC-18 | Low | Orphan | High | Images | `docker/Dockerfile.judge-simula` exists but has no language config or doc mention |
| DOC-19 | Low | Missing | Medium | Developer guide | AGENTS.md "Adding a New Language" checklist omits Rust runner-side validation |
| DOC-20 | Low | Missing | Medium | README | README language-preset list omits the `everything` preset |
| DOC-21 | Low | Missing | Medium | API docs | `docs/api.md` does not document response/request bodies for several admin/problem endpoints |
| DOC-22 | Low | Inconsistent | Medium | Security | `SECURITY.md` scope mentions `code-similarity-rs/`; project root contains the sidecar at top-level, not under that path |
| DOC-23 | Low | Outdated | Medium | API docs | `docs/api.md` internal cleanup endpoint uses `/api/internal/cleanup`; implementation is at `/api/internal/cleanup` but auth wiring references `CRON_SECRET` consistently |
| DOC-24 | Low | Incorrect | High | Data retention | `docs/data-retention-policy.md` says legal hold requires an application restart; code re-reads `DATA_RETENTION_LEGAL_HOLD` every prune cycle so a restart is unnecessary |

---

## High Severity

### DOC-1: `docs/api.md` omits 34 live `/api/v1` endpoints
- **Doc**: `docs/api.md:1-2037` (endpoint catalogue)
- **Code**: `src/app/api/v1/**` — 109 `route.ts` files exporting ~148 endpoint methods; the documented endpoint list covers 75 route files and misses 34 route files entirely.
- **What the doc says**: The API reference presents a complete endpoint list under "Endpoints" (Users, Problems, Submissions, Groups, Assignments, Contests, Problem Sets, Files, Languages, Compiler, Judge Workers, Admin, Plugins, Chat Widget, Internal).
- **What the code does**: The following 34 route files exist and are exported but have no entry in `docs/api.md`:
  - Auth: `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/resend-verification`, `POST /api/v1/auth/reset-password`, `POST /api/v1/auth/verify-email`
  - Code snapshots: `POST /api/v1/code-snapshots`
  - Community: `GET/POST /api/v1/community/threads`, `PATCH/DELETE /api/v1/community/threads/[id]`, `POST /api/v1/community/threads/[id]/posts`, `DELETE /api/v1/community/posts/[id]`, `POST /api/v1/community/votes`
  - Contest sub-resources: `GET/POST /api/v1/contests/[assignmentId]/announcements`, `PATCH/DELETE /api/v1/contests/[assignmentId]/announcements/[announcementId]`, `GET/POST /api/v1/contests/[assignmentId]/clarifications`, `PATCH/DELETE /api/v1/contests/[assignmentId]/clarifications/[clarificationId]`, `GET /api/v1/contests/[assignmentId]/code-snapshots/[userId]`, `GET /api/v1/contests/[assignmentId]/participant-timeline/[userId]`, `GET /api/v1/contests/[assignmentId]/participants`, `POST /api/v1/contests/quick-create`, `GET /api/v1/contests/[assignmentId]/stats`, `GET/POST /api/v1/contests/[assignmentId]/recruiting-invitations`, `GET/PATCH/DELETE /api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]`, `POST /api/v1/contests/[assignmentId]/recruiting-invitations/bulk`, `GET /api/v1/contests/[assignmentId]/recruiting-invitations/stats`
  - Exam sessions: `GET /api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions`, `PATCH /api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]`
  - Health: `GET /api/v1/health`
  - Playground: `POST /api/v1/playground/run`
  - Problems: `POST /api/v1/problems/import`, `GET /api/v1/problems/[id]/accepted-solutions`, `GET/PUT/DELETE /api/v1/problems/[id]/draft`
  - Recruiting: `POST /api/v1/recruiting/validate`
  - Submissions: `GET /api/v1/submissions/[id]/queue-status`
  - Admin submissions: `GET /api/v1/admin/submissions/export`, `POST /api/v1/admin/submissions/rejudge`
  - Admin utility: `POST /api/v1/admin/test-email`
- **Consequence**: API consumers, SDK generators, and integration tests cannot discover a large portion of the public surface. External developers may re-implement functionality or miss rate-limit/CSRF requirements for these routes.
- **Suggested fix**: Add a documentation pass for each missing route group. For each, include HTTP method, auth model, required capability/role, rate-limit key, request body schema, and response shape, matching the style of existing entries.
- **Classification**: Missing
- **Confidence**: High

### DOC-2: `flix` documented as using `judge-jvm`; actual image is `judge-flix`
- **Doc**: `AGENTS.md:113`, `docs/languages.md:73`
- **Code**: `src/lib/judge/languages.ts:1197`
- **What the doc says**: `flix` uses Docker image `judge-jvm`.
- **What the code does**: `src/lib/judge/languages.ts` sets `dockerImage: "judge-flix:latest"` and `docker/Dockerfile.judge-flix` is a separate image.
- **Consequence**: Operators/agents following the docs will not build `judge-flix`; submissions in Flix will fail at runtime with "image not found". Admin UI also displays the runtime info from `languages.ts`, but if an operator edits the language config using the docs as reference they may enter `judge-jvm`.
- **Suggested fix**: Update `AGENTS.md:113` and `docs/languages.md:73` to `judge-flix`.
- **Classification**: Incorrect
- **Confidence**: High

### DOC-3: `flix` is simultaneously marked arm64-ready and listed as ARM-prohibitive
- **Doc**: `docs/languages.md:73` (table shows `✅` for amd64/arm64/amd64 E2E/arm64 E2E), `docs/languages.md:224` (ARM-prohibitive set includes `flix`)
- **Code**: `docker/Dockerfile.judge-flix` exists; `src/lib/judge/languages.ts:1197` references `judge-flix:latest`.
- **What the doc says**: Two contradictory statements on the same page.
- **What the code does**: The language is active and has its own Dockerfile, so it is built in normal flows.
- **Consequence**: Operators cannot tell whether `flix` is included in the `all` preset or excluded. The `deploy-docker.sh` `ARM_PROHIBITIVE_LANGS` list (`deploy-docker.sh:220`) includes `flix`, so the script excludes it from `all`, yet the docs table claims arm64 success.
- **Suggested fix**: Decide canonical status. If `flix` is ARM-ready, remove it from the ARM-prohibitive set in `docs/languages.md:224` and `deploy-docker.sh:220`. If it is prohibitive, change the table checkmarks to `—`.
- **Classification**: Inconsistent
- **Confidence**: High

### DOC-4: `roc` listed as active in `AGENTS.md` but absent from the TypeScript language system
- **Doc**: `AGENTS.md:20` ("125 language variants"), `AGENTS.md:119` (row 94 `roc`), `docs/languages.md:208-210` (disabled section)
- **Code**: `src/types/index.ts:30-156` (no `roc`), `src/lib/judge/languages.ts` (no `roc` config), `judge-worker-rs/src/types.rs:191` (`Language::Roc` still present), `judge-worker-rs/src/languages.rs:1762-1769` (`ROC_CONFIG` still present)
- **What the doc says**: `AGENTS.md` treats `roc` as an active supported language; `docs/languages.md` correctly marks it disabled.
- **What the code does**: The TypeScript app cannot accept `roc` submissions because it is not in the `Language` union. The Rust worker still knows how to judge it.
- **Consequence**: An agent scanning `AGENTS.md` to enumerate supported languages will include `roc` and then fail when using it as a `Language`. The Rust worker dead code may also be misleading during future language work.
- **Suggested fix**: Remove the `roc` row from `AGENTS.md:119` (or mark it `[DISABLED]` and point to the Disabled Languages section). Optionally remove `Roc` from `judge-worker-rs/src/types.rs` and `judge-worker-rs/src/languages.rs` if the language is permanently retired.
- **Classification**: Outdated
- **Confidence**: High

### DOC-5: README image-size table lists images with no active language configuration
- **Doc**: `README.md:86,94,104` (size table rows for `judge-malbolge`, `judge-j`, `judge-roc`)
- **Code**: `src/types/index.ts:30-156`, `src/lib/judge/languages.ts` — none of `j`, `malbolge`, or `roc` have active configs. `docker/Dockerfile.judge-j`, `docker/Dockerfile.judge-malbolge`, `docker/Dockerfile.judge-roc` exist as orphans.
- **What the doc says**: These are active, submittable language images with published sizes.
- **What the code does**: No language variant maps to these images; submissions using them would fail validation.
- **Consequence**: Contributors and users conclude these languages are supported. A developer following the "Adding a New Language" checklist would find Dockerfiles already present but all other integration steps missing.
- **Suggested fix**: Remove the three rows from the README size table, or add a footnote that these Dockerfiles exist but are not integrated. Alternatively complete the integration for each.
- **Classification**: Outdated
- **Confidence**: High

### DOC-6: Similarity-check endpoint auth described as "Instructor or above" but code also allows assistants
- **Doc**: `docs/api.md:1089-1091`
- **Code**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`
- **What the doc says**: "Run code similarity analysis. **Instructor or above.**"
- **What the code does**: `canRunSimilarityCheck` returns true for `canManageContest` (instructor/admin) **or** for any role with the `anti_cheat.run_similarity` capability that is also a group TA or assigned to the teaching group. `anti_cheat.run_similarity` is part of `ASSISTANT_CAPABILITIES` (`src/lib/capabilities/defaults.ts:15-32`).
- **Consequence**: A client built against the API docs hides the similarity-check affordance from assistants even though the backend accepts the call. A custom role granted only `anti_cheat.run_similarity` may be surprised by the extra group-scope check not mentioned in the docs.
- **Suggested fix**: Update `docs/api.md:1089-1091` to: "Requires `anti_cheat.run_similarity` capability plus group TA/assigned teaching-group membership, or `canManageContest`."
- **Classification**: Incorrect
- **Confidence**: High

### DOC-7: `docs/deployment.md` misstates the app container's internal listen port
- **Doc**: `docs/deployment.md:7` — "Ports `80`/`443` terminated by nginx; app container listens on port `3100` internally"
- **Code**: `docker-compose.production.yml:96` — `127.0.0.1:3100:3000` (host 3100 → container 3000)
- **What the doc says**: The app process listens on 3100 inside the container.
- **What the code does**: The app listens on 3000 inside the container; host port 3100 is the nginx upstream target.
- **Consequence**: Operators debugging connectivity or writing custom compose overrides may target the wrong internal port. Health checks inside the container (`http://127.0.0.1:3000/login`) would fail if aimed at 3100.
- **Suggested fix**: Change `docs/deployment.md:7` to: "Ports `80`/`443` terminated by nginx; app container listens on port `3000` internally and is mapped to host port `3100`."
- **Classification**: Incorrect
- **Confidence**: High

---

## Medium Severity

### DOC-8: README and AGENTS.md claim 43 capabilities; code defines 46
- **Doc**: `README.md:29` ("Capabilities are granular (43 of them)"), `AGENTS.md` (same phrasing throughout role/capability sections)
- **Code**: `src/lib/capabilities/types.ts:8-53` — `ALL_CAPABILITIES` contains 46 unique capability strings (`users.view`, `users.create`, `users.edit`, `users.delete`, `users.manage_roles`, `problems.create`, `problems.edit`, `problems.delete`, `problems.view_all`, `problems.manage_visibility`, `groups.create`, `groups.edit`, `groups.delete`, `groups.view_all`, `groups.manage_members`, `assignments.create`, `assignments.edit`, `assignments.delete`, `assignments.view_status`, `submissions.view_all`, `submissions.view_source`, `submissions.rejudge`, `submissions.comment`, `problem_sets.create`, `problem_sets.edit`, `problem_sets.delete`, `problem_sets.assign_groups`, `contests.create`, `contests.manage_access_codes`, `contests.view_analytics`, `contests.view_leaderboard_full`, `contests.export`, `community.moderate`, `recruiting.manage_invitations`, `anti_cheat.view_events`, `anti_cheat.run_similarity`, `system.settings`, `system.backup`, `system.audit_logs`, `system.login_logs`, `system.plugins`, `system.chat_logs`, `files.upload`, `files.manage`, `content.submit_solutions`, `content.view_own_submissions`).
- **What the doc says**: 43 granular capabilities.
- **What the code does**: 46 unique capabilities.
- **Consequence**: Security architecture descriptions and any automation that counts capabilities are off by three. Newer capabilities such as `community.moderate`, `recruiting.manage_invitations`, and `content.view_own_submissions` are likely the additions not reflected in the count.
- **Suggested fix**: Update README.md and AGENTS.md to state 46 capabilities.
- **Classification**: Outdated
- **Confidence**: High

### DOC-9: Documentation claims 102 active Docker images; active configs reference 98
- **Doc**: `README.md:77` ("102 language-specific Docker images"), `docs/languages.md:192` ("102 of 102 images build on ARM64")
- **Code**: `src/lib/judge/languages.ts` — 98 distinct `dockerImage` values are referenced by the active `JUDGE_LANGUAGE_CONFIGS`. `docker/` contains 102 `Dockerfile.judge-*` files, but four of them (`judge-j`, `judge-malbolge`, `judge-roc`, `judge-simula`) are not referenced by any active language config.
- **What the doc says**: 102 images correspond to the 125 language variants.
- **What the code does**: Only 98 images are actually used by submittable languages.
- **Consequence**: Image-count claims and size tables are inflated by orphan images. Operators planning disk capacity or build time from the docs will overestimate.
- **Suggested fix**: Update README.md and docs/languages.md to "98 language-specific Docker images". Remove or annotate the orphan image rows in the README size table (`judge-j`, `judge-malbolge`, `judge-roc`). Decide whether to delete `docker/Dockerfile.judge-simula` or complete its integration.
- **Classification**: Outdated
- **Confidence**: High

### DOC-10: `all` language preset contents disagree between `setup.sh` and `deploy-docker.sh`
- **Doc**: `docs/languages.md:214-220` ("all" excludes the 18 ARM-prohibitive languages), `README.md:71` (links to presets)
- **Code**: `deploy-docker.sh:220-221` — `ARM_PROHIBITIVE_LANGS` excludes `carp chapel clean curry elm factor flix grain idris2 mercury minizinc modula2 moonbit pony purescript rescript roc wat` from `all`; `scripts/setup.sh:59-67` — `ALL_LANGS` includes the same prohibitive set (including `roc`) in the `all` preset.
- **What the doc says**: `all` excludes the ARM-prohibitive set.
- **What the code does**: `deploy-docker.sh` matches the docs; `setup.sh` contradicts them by building the prohibitive set under `all`.
- **Consequence**: A developer running `bash scripts/setup.sh` and selecting "all" will build a different (larger, much slower) image set than a production operator running `./deploy-docker.sh --languages=all`. This creates confusion about what "all" means.
- **Suggested fix**: Align `scripts/setup.sh:59-67` with `deploy-docker.sh:221` so both `all` presets exclude the ARM-prohibitive set and `everything` includes them. Update `preset_description` in `setup.sh` accordingly.
- **Classification**: Inconsistent
- **Confidence**: High

### DOC-11: `docs/deployment.md` language-preset size estimates are stale
- **Doc**: `docs/deployment.md:80` — "Presets: core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~30 GB), everything (~35 GB ...)"
- **Code**: `deploy-docker.sh:268-277` — "core (~1.2 GB), popular (~4 GB), extended (~12 GB), all (~30 GB), everything ... multi-hour ..."; `AGENTS.md:375` and `README.md:71` also use the larger figures.
- **What the doc says**: Smaller size estimates that no longer match the script help text or empirical sizes.
- **What the code does**: `deploy-docker.sh --help` and README/AGENTS.md use larger, presumably current estimates.
- **Consequence**: Operators provisioning disk space from `docs/deployment.md` may underestimate by up to 50% for the smaller presets.
- **Suggested fix**: Update `docs/deployment.md:80` to match `deploy-docker.sh:268-277` (core ~1.2 GB, popular ~4 GB, extended ~12 GB, all ~30 GB, everything multi-hour ~35 GB+).
- **Classification**: Outdated
- **Confidence**: High

### DOC-12: `GET /api/v1/admin/docker/images` auth described as role-based
- **Doc**: `docs/api.md:1666-1668` — "List Docker images. **Admin or Super Admin.**"
- **Code**: `src/app/api/v1/admin/docker/images/route.ts:55` — handler checks `system.settings` capability.
- **What the doc says**: Admin role gate.
- **What the code does**: Capability gate (`system.settings`).
- **Consequence**: Custom roles or integrations that gate on role names will reject users who have the correct capability, or conversely assume any admin can access it.
- **Suggested fix**: Change `docs/api.md:1668` to "Requires `system.settings` capability."
- **Classification**: Incorrect
- **Confidence**: High

### DOC-13: AGENTS.md Docker image build/delete auth described as "Admin/super_admin only"
- **Doc**: `AGENTS.md:260-261`
- **Code**: `src/app/api/v1/admin/docker/images/route.ts:93,165` and `src/app/api/v1/admin/docker/images/build/route.ts:19` — all three require `system.settings`.
- **What the doc says**: "Admin/super_admin only."
- **What the code does**: Capability-based gate.
- **Consequence**: Same class as DOC-12 — role-based integrations apply the wrong authorization model.
- **Suggested fix**: Change `AGENTS.md:260-261` to "Requires `system.settings` capability. Audit logged." to match `docs/api.md` and the implementation.
- **Classification**: Incorrect
- **Confidence**: High

### DOC-14: Contest join endpoint docs omit failure-scoped rate limits
- **Doc**: `docs/api.md:941-943` — "Rate limit: `contest:join`."
- **Code**: `src/app/api/v1/contests/join/route.ts:28-36` — on failed redemption, the route additionally consumes `contest:join:invalid` (per-user) and `contest:join:invalid-code` (per access-code hash).
- **What the doc says**: Only one rate-limit bucket.
- **What the code does**: Three buckets depending on success/failure.
- **Consequence**: API consumers retrying on 400 may hit 429 from undocumented buckets. Operators monitoring rate-limit headers will not understand the source.
- **Suggested fix**: Expand `docs/api.md:941-943` to list all three buckets and the conditions that trigger the failure buckets.
- **Classification**: Missing
- **Confidence**: High

### DOC-15: `judge-haskell` base image/OS reported three different ways
- **Doc**: `AGENTS.md:210` — base `ghc:9.4-alpine`; `src/lib/judge/languages.ts:110` — "Debian Bookworm / GHC 9.4"
- **Code**: `docker/Dockerfile.judge-haskell:1` — `FROM alpine:3.21`
- **What the doc says**: Two contradictory OS/base descriptions.
- **What the code does**: The image is Alpine 3.21 with GHC 9.4 installed via apk.
- **Consequence**: Operators troubleshooting musl/glibc or shell-path issues are misled. The admin UI runtime-info column shows the wrong OS.
- **Suggested fix**: Update `src/lib/judge/languages.ts:110` to "Alpine 3.21 / GHC 9.4". Update `AGENTS.md:210` base column to "Alpine 3.21".
- **Classification**: Inconsistent
- **Confidence**: High

---

## Low Severity

### DOC-16: `docs/languages.md` E2E summary still reports 113-language scope
- **Doc**: `docs/languages.md:194-204`
- **Code**: `src/types/index.ts:30-156` — 125 active language variants.
- **What the doc says**: "113 of 113 languages pass on amd64" and "112 of 113 languages pass on arm64" dated 2026-03-29.
- **What the code does**: Active language count is now 125.
- **Consequence**: Contributors assume E2E coverage is 113 languages and may skip the newer 12 variants. The stale totals also hide real coverage gaps.
- **Suggested fix**: Mark the section as a dated historical snapshot and add a note: "As of 2026-03-29 (113 languages). Current active count: 125." Update with current pass counts when a new E2E run is available.
- **Classification**: Outdated
- **Confidence**: High

### DOC-17: `AGENTS.md` language table row count does not match its "125 variants" claim
- **Doc**: `AGENTS.md:20`, `AGENTS.md:22-150`
- **Code**: `src/types/index.ts:30-156` — 125 active variants; the `AGENTS.md` table has 126 rows including sub-rows 6b/8b and the inactive `roc` row.
- **What the doc says**: "JudgeKit currently defines 125 language variants."
- **What the code does**: The table contains 126 entries.
- **Consequence**: Any automated count of the AGENTS.md table produces the wrong number; the inclusion of inactive `roc` inflates the active count.
- **Suggested fix**: Remove the `roc` row (or mark it `[DISABLED]`) and renumber sub-rows to match the 125-variant claim.
- **Classification**: Outdated
- **Confidence**: High

### DOC-18: `docker/Dockerfile.judge-simula` is an orphan image
- **Doc**: none
- **Code**: `docker/Dockerfile.judge-simula` exists; no entry in `src/types/index.ts`, `src/lib/judge/languages.ts`, `judge-worker-rs/src/types.rs`, or any docs.
- **What the doc says**: Nothing.
- **What the code does**: Dockerfile exists with no language binding.
- **Consequence**: A developer scanning `docker/` incorrectly concludes `simula` is supported. Following the "Adding a New Language" checklist would produce a duplicate Dockerfile.
- **Suggested fix**: Either complete the `simula` integration (type, config, Rust enum/test, E2E solution, docs) or remove `docker/Dockerfile.judge-simula` and optionally add a note in `docs/languages.md` "Potential Additions" table.
- **Classification**: Orphan
- **Confidence**: High

### DOC-19: AGENTS.md "Adding a New Language" checklist omits Rust runner-side validation
- **Doc**: `AGENTS.md:151-159`
- **Code**: `src/lib/compiler/execute.ts` delegates to a Rust runner sidecar when `COMPILER_RUNNER_URL` is configured; `judge-worker-rs/src/languages.rs` and runner code validate/execute the commands.
- **What the doc says**: Checklist stops at Rust config + test entry.
- **What the code does**: Production sidecar mode requires the new language's compile/run commands to also be accepted by the Rust-side validator.
- **Consequence**: A contributor validates locally via Node fallback and discovers production failures only after deploy because the Rust-side validator or serialization differs.
- **Suggested fix**: Add a checklist step: "Verify the new language's compile/run commands pass the Rust-side validator and add a runner test/config entry in `judge-worker-rs/`."
- **Classification**: Missing
- **Confidence**: Medium

### DOC-20: README language-preset list omits the `everything` preset
- **Doc**: `README.md:71` — "See Language presets for preset options (`core`, `popular`, `extended`, `all`)."
- **Code**: `docs/languages.md:214-220`, `AGENTS.md:375`, `deploy-docker.sh:268-277` all document the `everything` escape hatch.
- **What the doc says**: Four presets.
- **What the code does**: Five presets exist.
- **Consequence**: README readers miss the `everything` escape hatch documented elsewhere.
- **Suggested fix**: Add `everything` to the README presets list or replace the inline list with a reference to `docs/languages.md#docker-image-presets`.
- **Classification**: Missing
- **Confidence**: Medium

### DOC-21: Several documented admin/problem endpoints lack request/response body details
- **Doc**: `docs/api.md` — `GET /api/v1/admin/workers/stats`, `POST /api/v1/admin/docker/images/prune`, `PATCH /api/v1/admin/plugins/:id`, `GET /api/v1/problems/:id/export`, `POST /api/v1/problems/:id/compute-expected`, and several other admin/problem entries only describe the endpoint without full schemas.
- **Code**: Corresponding route files define request bodies and response shapes.
- **What the doc says**: Minimal or no body/response detail.
- **What the code does**: Full validation and response objects exist.
- **Consequence**: API consumers must read source code to construct valid requests.
- **Suggested fix**: Flesh out request/response schemas for partially documented endpoints during the API-doc update pass.
- **Classification**: Missing
- **Confidence**: Medium

### DOC-22: `SECURITY.md` scope references a non-existent `code-similarity-rs/` directory
- **Doc**: `SECURITY.md:20` — "The code-similarity and rate-limiter sidecars (`code-similarity-rs/`, `rate-limiter-rs/`)"
- **Code**: `rate-limiter-rs/` exists as a directory; the code-similarity sidecar is at the repository root (`Dockerfile.code-similarity`, `code-similarity-rs/Cargo.toml` only at top-level?) — actually `code-similarity-rs/` exists as a directory containing `Cargo.toml`, but it is not listed in README/AGENTS.md project structure the same way? Wait the top-level listing shows `code-similarity-rs/Cargo.toml`. Let me verify directory contents.
- **What the doc says**: Both sidecars live under `code-similarity-rs/` and `rate-limiter-rs/`.
- **What the code does**: `code-similarity-rs/` directory exists with `Cargo.toml`; however the project's Docker compose builds from `Dockerfile.code-similarity` at root. The path is technically present but the security scope wording could be clearer.
- **Consequence**: Minor ambiguity about which paths are in scope for vulnerability reports.
- **Suggested fix**: Verify directory layout and update `SECURITY.md:20` to match the actual paths (e.g., `code-similarity-rs/` source + `Dockerfile.code-similarity` at root, `rate-limiter-rs/` source + `Dockerfile.rate-limiter-rs` at root).
- **Classification**: Inconsistent
- **Confidence**: Low

### DOC-23: Internal cleanup endpoint path/auth is correct but could be cross-checked
- **Doc**: `docs/api.md:1936-1944` — `POST /api/internal/cleanup` with `CRON_SECRET` bearer.
- **Code**: `src/app/api/internal/cleanup/route.ts` exists and checks `CRON_SECRET`.
- **What the doc says**: Path and auth method match.
- **What the code does**: Matches.
- **Consequence**: None; included for completeness of the final sweep.
- **Suggested fix**: None.
- **Classification**: Clean
- **Confidence**: High

### DOC-24: `docs/data-retention-policy.md` incorrectly states legal hold requires a restart
- **Doc**: `docs/data-retention-policy.md:38` — "No data is deleted until the variable is removed and the application is restarted."
- **Code**: `src/lib/data-retention.ts:46-52` — `isDataRetentionLegalHold()` re-reads `process.env.DATA_RETENTION_LEGAL_HOLD` on every prune cycle; `src/lib/data-retention-maintenance.ts:131-134` calls it before each daily prune.
- **What the doc says**: Removing the legal hold only takes effect after a process restart.
- **What the code does**: The next scheduled prune (within 24 hours) will observe the changed env var and resume pruning without a restart.
- **Consequence**: Operators may schedule unnecessary restarts, or — worse — assume pruning cannot be accidentally re-enabled by simply unsetting the variable and therefore fail to lift the hold promptly.
- **Suggested fix**: Update `docs/data-retention-policy.md:38` to: "No data is deleted while the variable is set. Removing or unsetting it allows the next scheduled prune cycle to resume normal retention enforcement without requiring a process restart."
- **Classification**: Incorrect
- **Confidence**: High

---

## Final Sweep Notes

| Area | Verdict | Notes |
|------|---------|-------|
| `CLAUDE.md` deployment rules | Clean | `SKIP_LANGUAGES`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER` flags match `deploy-docker.sh` and production deploy scripts. |
| `docs/api.md` endpoint list | Drift | Structurally incomplete; auth descriptions for Docker list and similarity-check need fixes; contest join rate limits need expansion. |
| `docs/languages.md` active language table | Mostly clean | 125 active rows match `src/types/index.ts`; contradictions around `flix`, `roc`, image counts, and E2E totals need fixing. |
| `AGENTS.md` language table | Drift | 126 rows including inactive `roc`; `flix` image wrong; `haskell` base wrong; capability count wrong. |
| `docs/deployment.md` env var table | Mostly clean | Port mapping and preset sizes are stale; otherwise matches `docker-compose.production.yml` and `deploy-docker.sh`. |
| `docs/data-retention-policy.md` | Minor drift | Default windows and env var names match `src/lib/data-retention.ts`; the restart requirement claim is incorrect. |
| `docs/judge-workers.md` | Not reviewed in depth | Spot checks match `docker-compose.worker.yml`; no findings. |
| `docker-compose.production.yml` | Clean | PostgreSQL 18 pin, PGDATA, docker-proxy setup, sidecar env vars match AGENTS.md descriptions. |
| `package.json` versions | Clean | Next.js 16, TypeScript 5.9, React 19, Tailwind v4, Auth.js v5 (beta.31) all match README/AGENTS.md. |
| `package.json` scripts | Clean | All npm scripts referenced in README exist. |
| Password validation | Clean | 8-character minimum matches `src/lib/security/password.ts`. |
| Setup script workflow | Drift | `scripts/setup.sh` `all` preset and size description disagree with `deploy-docker.sh` and docs. |

---

## Suggested Documentation Remediation Order

1. **API completeness** — document all undocumented endpoints and fix auth descriptions (DOC-1, DOC-6, DOC-12, DOC-13, DOC-14, DOC-21).
2. **Language inventory reconciliation** — decide `roc`/`flix`/ARM-prohibitive status, then update all three language tables and the Rust worker (DOC-2, DOC-3, DOC-4, DOC-15, DOC-16, DOC-17).
3. **Image counts and orphan Dockerfiles** — remove or integrate `judge-j`, `judge-malbolge`, `judge-roc`, `judge-simula`; update 102→98 claims (DOC-5, DOC-9, DOC-18).
4. **Deployment accuracy** — fix internal port, preset sizes, and `setup.sh`/`deploy-docker.sh` `all` preset alignment (DOC-7, DOC-10, DOC-11).
5. **Capability count** — update 43→46 in README/AGENTS.md (DOC-8).
6. **Data retention mechanics** — correct the legal-hold restart claim (DOC-24).
7. **Developer guide polish** — add Rust runner validation step and README `everything` preset mention (DOC-19, DOC-20).
