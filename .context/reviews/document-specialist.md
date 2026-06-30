# Document-Specialist Review

Date: 2026-06-30
Scope: entire repository
Summary: Documentation/code mismatch audit of AGENTS.md, README.md, docs/*, .context/development/*, and inline comments against the current implementation. The largest class of drift remains the language tables: Docker image names, active vs. disabled languages, and image-count claims disagree with the TypeScript Language union and languages.ts. Several API auth/rate-limit descriptions also lag recent code changes.
Findings count: 14

---

## HIGH: `flix` Docker image documented as `judge-jvm`; actual image is `judge-flix` (confidence: High)
- **File**: `AGENTS.md:113`, `docs/languages.md:73`, `src/lib/judge/languages.ts:1197`, `docker/Dockerfile.judge-flix:1`
- **Problem**: AGENTS.md and docs/languages.md list `flix` as using `judge-jvm`, but `languages.ts` sets `dockerImage: "judge-flix:latest"` and `docker/Dockerfile.judge-flix` exists as a distinct image (it extends `judge-jvm` but is named `judge-flix`). docs/languages.md also marks `flix` with ✅ for arm64 build and arm64 E2E while simultaneously listing it in the ARM-prohibitive set (`docs/languages.md:224`).
- **Failure scenario**: An operator or agent following the docs skips building `judge-flix`; an admin overriding the language via the UI may enter `judge-jvm`, breaking Flix judging. The contradictory arm64 claims create confusion about whether `flix` is in the `all` preset.
- **Suggested fix**: Change `judge-jvm` → `judge-flix` in AGENTS.md:113 and docs/languages.md:73. Reconcile the arm64 checkmarks with the ARM-prohibitive set (either remove from the prohibitive list or change checks to `—`).
- **Cross-references**: `src/types/index.ts:126` includes `flix` in the active Language union; `docker/Dockerfile.judge-flix` is the source-of-truth image.

## HIGH: `roc` listed in AGENTS.md active language table but absent from the `Language` type union (confidence: High)
- **File**: `AGENTS.md:119`, `src/types/index.ts:30-156`, `docs/languages.md:208-210`
- **Problem**: AGENTS.md row 94 lists `roc` as an active language (`judge-roc`), but `src/types/index.ts` does not include `roc` in the `Language` union. docs/languages.md correctly places `roc` in the Disabled Languages section.
- **Failure scenario**: An agent scanning AGENTS.md to enumerate supported languages includes `roc`, then fails at compile time when using it as a `Language`. The AGENTS.md "Adding a New Language" checklist (step 1) points to `src/types/index.ts` as the first source of truth, but the table itself violates that rule.
- **Suggested fix**: Remove row 94 from the AGENTS.md active table, or mark it `[DISABLED]` to match docs/languages.md. Keep the Disabled Languages section entry intact.
- **Cross-references**: `docker/Dockerfile.judge-roc` exists and is noted as preserved for future upstream fixes.

## HIGH: `judge-j` and `judge-malbolge` appear in README image table with no language config (confidence: High)
- **File**: `README.md:86-87,93-94`, `src/types/index.ts:30-156`, `src/lib/judge/languages.ts`, `docker/Dockerfile.judge-j`, `docker/Dockerfile.judge-malbolge`
- **Problem**: The README Docker image size table lists `judge-j` and `judge-malbolge`, implying they are submittable languages, but neither appears in the `Language` union nor in `languages.ts`. AGENTS.md and docs/languages.md also omit them.
- **Failure scenario**: A user or contributor reading the README concludes `j` and `malbolge` are supported. Submitting with those language IDs would fail validation. A developer following the "Adding a New Language" checklist would discover the Dockerfiles already exist but all other integration steps are missing.
- **Suggested fix**: Remove `judge-j` and `judge-malbolge` rows from the README image table, or add a footnote: "Dockerfile exists; language not yet integrated." If intended to be active, complete the integration.
- **Cross-references**: `docker/Dockerfile.judge-j`, `docker/Dockerfile.judge-malbolge`.

## HIGH: Similarity-check API docs say "Instructor or above" but code also allows scoped assistants (confidence: High)
- **File**: `docs/api.md:1089-1091`, `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:12-24`, `src/lib/capabilities/defaults.ts:15-32`
- **Problem**: docs/api.md describes `POST /api/v1/contests/:assignmentId/similarity-check` as "Instructor or above." The route implementation checks `canManageContest`, then falls back to the `anti_cheat.run_similarity` capability plus group-TA/assigned-teaching-group membership. `anti_cheat.run_similarity` is present in `ASSISTANT_CAPABILITIES`.
- **Failure scenario**: A client built against the API docs hides the similarity-check affordance from assistants, even though the backend would accept the call. Conversely, a custom role granted only `anti_cheat.run_similarity` may be surprised by the additional group-scope check not mentioned in the docs.
- **Suggested fix**: Update docs/api.md to describe the capability-based guard: "Requires `anti_cheat.run_similarity` capability plus group TA/assigned teaching-group membership, or `canManageContest`."
- **Cross-references**: `src/lib/capabilities/types.ts:160-162` defines the `anti_cheat` capability group.

## MEDIUM: Contest join docs omit the new per-user and per-code failure rate limits (confidence: High)
- **File**: `docs/api.md:941-943`, `src/app/api/v1/contests/join/route.ts:15-37`, `src/lib/security/api-rate-limit.ts`
- **Problem**: docs/api.md states only `Rate limit: "contest:join"`. The route now applies two additional buckets on failed redemption: `contest:join:invalid` scoped to the user, and `contest:join:invalid-code` scoped to a hash of the access code.
- **Failure scenario**: Integrators or operators monitoring rate-limit headers/buckets miss the failure-scoped limits, making brute-force mitigation appear undocumented. A client retrying on 400 may hit 429 from a bucket it did not know existed.
- **Suggested fix**: Expand the docs/api.md entry to list all three rate-limit buckets and the conditions under which each applies.
- **Cross-references**: `src/app/api/v1/contests/join/route.ts:28-36` consumes the additional limits.

## MEDIUM: AGENTS.md describes Docker build/delete API auth as "Admin/super_admin only"; code gates on `system.settings` capability (confidence: High)
- **File**: `AGENTS.md:260-261`, `src/app/api/v1/admin/docker/images/build/route.ts:19`, `src/app/api/v1/admin/docker/images/route.ts:93,165`, `docs/api.md:1702-1718`
- **Problem**: AGENTS.md says the build and delete Docker image endpoints are "Admin/super_admin only." The route handlers require the `system.settings` capability. docs/api.md is already correct.
- **Failure scenario**: Custom auth middleware or integration code built from AGENTS.md gates on role names rather than the capability, wrongly rejecting a custom role that has `system.settings`.
- **Suggested fix**: Change AGENTS.md:260-261 to "Requires `system.settings` capability. Audit logged." to match docs/api.md and the implementation.
- **Cross-references**: `docs/api.md:1704` and `docs/api.md:1693` already use the correct capability wording.

## MEDIUM: docs/api.md `GET /api/v1/admin/docker/images` says "Admin or Super Admin"; code uses `system.settings` capability (confidence: High)
- **File**: `docs/api.md:1666-1668`, `src/app/api/v1/admin/docker/images/route.ts:56`
- **Problem**: docs/api.md says the list-images endpoint is "Admin or Super Admin," but the route requires `system.settings`.
- **Failure scenario**: Same class as the previous finding — role-based integrations apply the wrong gate. AGENTS.md is also wrong for build/delete; docs/api.md is wrong for list.
- **Suggested fix**: Change docs/api.md:1668 to "Requires `system.settings` capability."
- **Cross-references**: `src/app/api/v1/admin/docker/images/route.ts:56`.

## MEDIUM: `judge-haskell` base image: three-way disagreement (confidence: High)
- **File**: `AGENTS.md:210`, `src/lib/judge/languages.ts:110`, `docker/Dockerfile.judge-haskell:1`
- **Problem**: AGENTS.md lists `judge-haskell` base as `ghc:9.4-alpine`. The Dockerfile uses `FROM alpine:3.21`. `languages.ts` `DOCKER_IMAGE_RUNTIME_INFO` displays "Debian Bookworm / GHC 9.4" for `judge-haskell:latest`.
- **Failure scenario**: Operators troubleshooting musl/glibc or shell-path issues are misled by both AGENTS.md and the admin UI runtime-info column. The admin UI reads from `languages.ts` and will show the wrong OS.
- **Suggested fix**: Update `src/lib/judge/languages.ts` `DOCKER_IMAGE_RUNTIME_INFO["judge-haskell:latest"]` to "Alpine 3.21 / GHC 9.4". Update AGENTS.md:210 base column to "Alpine 3.21".
- **Cross-references**: `docker/Dockerfile.judge-haskell:1` confirmed `FROM alpine:3.21`.

## MEDIUM: `.context/development/conventions.md` references a missing `ENV.md` (confidence: High)
- **File**: `.context/development/conventions.md:22`
- **Problem**: The conventions doc says "See `ENV.md` for credentials and deployment commands." No `ENV.md` exists in the project root or `.context/`. The actual template is `.env.example`.
- **Failure scenario**: An agent following the conventions doc cannot locate credential guidance and may guess or stall.
- **Suggested fix**: Replace the `ENV.md` reference with "See `.env` (gitignored, real secrets) and `.env.example` (template) for credentials and deployment commands."
- **Cross-references**: `.env.example` exists and is referenced by `AGENTS.md` and `README.md`.

## LOW: `docker/Dockerfile.judge-simula` is an orphan with no language config or docs mention (confidence: High)
- **File**: `docker/Dockerfile.judge-simula`, `src/types/index.ts:30-156`, `src/lib/judge/languages.ts`, `AGENTS.md`, `docs/languages.md`, `README.md`
- **Problem**: A Dockerfile for `simula` exists in `docker/`, but there is no `simula` Language type entry, no `languages.ts` config, and no mention in any documentation.
- **Failure scenario**: A developer scanning `docker/` for supported languages incorrectly concludes `simula` is supported. Following the "Adding a New Language" checklist would produce a duplicate Dockerfile.
- **Suggested fix**: Either complete the `simula` integration (type, config, Rust enum/test, E2E solution) or remove `docker/Dockerfile.judge-simula` and add a note in `docs/languages.md` "Potential Additions" table.
- **Cross-references**: `docker/Dockerfile.judge-simula`.

## LOW: AGENTS.md language table row count does not match claimed "125 language variants" (confidence: High)
- **File**: `AGENTS.md:20`, `AGENTS.md:22-150`, `src/types/index.ts:30-156`
- **Problem**: AGENTS.md says "JudgeKit currently defines 125 language variants," but the table contains 126 rows (including sub-rows 6b and 8b and the inactive `roc` row). The actual active `Language` union contains 125 entries.
- **Failure scenario**: Low direct impact, but any automated count of the AGENTS.md table produces the wrong number, and the inclusion of inactive `roc` inflates the active count.
- **Suggested fix**: Remove the `roc` row and renumber sub-rows, or add a clear note that sub-rows are compiler-variant aliases and that inactive languages are listed separately.
- **Cross-references**: docs/languages.md avoids this by listing exactly 125 active rows plus a separate Disabled Languages section.

## LOW: docs/languages.md E2E summary is stale against the 125-language reality (confidence: High)
- **File**: `docs/languages.md:194-204`
- **Problem**: The amd64/arm64 E2E summaries state "113 of 113 languages pass," but the active language count is now 125. The document itself notes (line 133) that output-only additions are not yet included in the historical totals.
- **Failure scenario**: Contributors reading the summary assume the E2E scope is 113 languages and may skip the newer 12 variants. The outdated totals also hide coverage gaps.
- **Suggested fix**: Mark the section as a dated historical snapshot: "As of 2026-03-29 (113 languages). Current count: 125." Update with current pass counts when a new E2E run is available.
- **Cross-references**: `docs/languages.md:1,133` acknowledges the 125-variant total.

## LOW: AGENTS.md `Adding a New Language` checklist omits the Rust sidecar (confidence: Medium)
- **File**: `AGENTS.md:151-159`, `src/lib/compiler/execute.ts:534-616`, `judge-worker-rs/src/languages.rs`
- **Problem**: The checklist instructs adding a Rust enum variant and config in `judge-worker-rs/src/languages.rs`, but it does not mention that `src/lib/compiler/execute.ts` delegates to a Rust runner sidecar when `COMPILER_RUNNER_URL` is configured. Local-only validation in execute.ts now mirrors the Rust validator, but a new language with a compile/run command that the TS validator accepts but the Rust validator rejects will fail in production sidecar mode.
- **Failure scenario**: A contributor adds a language, validates locally via the Node fallback, and discovers production failures only after deploy because the Rust-side validator or serialization differs.
- **Suggested fix**: Add a checklist step: "Verify the new language's compile/run commands pass the Rust-side validator in `judge-worker-rs/src/runner.rs#validate_shell_command` and add a Rust runner test/config entry."
- **Cross-references**: `execute.ts:150-176` documents the lock-step requirement with the Rust validator.

## LOW: `scripts/setup.sh` language-preset note in README does not list `everything` preset (confidence: Medium)
- **File**: `README.md:71`, `AGENTS.md:375`, `docs/languages.md:214-220`
- **Problem**: README.md line 71 links to "Language presets" and the table lists `core`, `popular`, `extended`, `all`. docs/languages.md and `AGENTS.md:375` both document an additional `everything` preset that builds the full image set including the ARM-prohibitive set.
- **Failure scenario**: A reader of the README presets table misses the `everything` escape hatch, which is documented elsewhere. This is a minor discoverability gap.
- **Suggested fix**: Add `everything` to the README presets list or replace the inline list with a reference to `docs/languages.md#docker-image-presets`.
- **Cross-references**: `docs/languages.md:219-220` describes `everything`; `AGENTS.md:375` references it.

---

## Final sweep

| Area | Verdict |
|------|---------|
| `CLAUDE.md` deployment rules | Clean — SKIP_LANGUAGES/BUILD_WORKER_IMAGE/INCLUDE_WORKER flags match `deploy-docker.sh` and the current production deploy scripts. |
| `docs/api.md` endpoint list | Structurally complete; auth descriptions for Docker list and similarity-check need fixes; contest join rate limits need expansion. |
| `docs/function-judging.md` | Clean — supported languages and double-return float comparison contract match `src/lib/judge/function-judging/registry.ts`. |
| `docs/deployment.md` env var table | Clean — matches docker-compose.production.yml and deploy-docker.sh env handling. |
| `docs/judge-workers.md` | Clean — lifecycle, heartbeat, and `RUNNER_AUTH_TOKEN` requirements match the worker implementation. |
| `docker-compose.production.yml` | Clean — PostgreSQL 18 pin, PGDATA, docker-proxy setup match AGENTS.md descriptions. |
| `package.json` scripts | Clean — all npm scripts referenced in README exist. |
| `extractClientIp` inline comments | Clean — comments now match the code: X-Real-IP is used only when XFF is absent (`src/lib/security/ip.ts:71-72,115`). |
| `executeCompilerRun` inline comments | Clean — comments state validation runs before both paths and match the current code (`src/lib/compiler/execute.ts:638-688`). |
| Password validation | Clean — AGENTS.md 8-char minimum matches `src/lib/security/password.ts`. |
| Inline TODO/FIXME | Non-actionable — the remaining `TODO: implement` strings are starter-stub placeholders in function-judging adapters; `src/app/(public)/contests/[id]/layout.tsx` and `manage/layout.tsx` TODOs reference an upstream Next.js workaround and are tracked in done plans. |

### Skipped / needs manual validation
- Full visual diff of generated nginx config against `scripts/online-judge.nginx.conf` and `static-site/static.nginx.conf` (the cycle-3 plan already tracks C3-1 through C3-5; this review focused on docs, not generated config semantics).
- Runtime behavior of the `similarity-check` route for assistants — the code path is clear, but a live capability/role test would confirm no UI or middleware gap remains.
