# Current State

Last updated: 2026-03-21

## Shipped and deployed

- The public host is `your-domain.example`; the legacy hostname `oj-demo.atik.kr` was retired at nginx during the 2026-03-09 cutover.
- The deployed demo host serves the public login page over HTTP 200, redirects protected dashboard routes through login, and keeps both `online-judge.service` and `online-judge-worker.service` active.
- Admin system settings support a default timezone in addition to the site title and description.
- Rendered timestamps use the configured timezone on student/admin submission pages, admin user pages, and group assignment schedule views.

## Locally verified, not yet deployed

- The `dashboard-rendering-audit-and-editor-upgrades` plan is complete in the local repository.
- Local main now includes the instructor assignment status board and scoped assignment submission drill-down, admin login logs, theme switching, CodeMirror-based code surfaces, markdown-safe problem rendering, source-draft recovery, mixed submission ID support, and guarded user/problem delete flows.
- Local main also includes group membership management, assignment create/edit/delete flows, student assignment detail pages, assignment-linked submission paths, assignment-context enforcement from the generic problem view, synchronized problem-group access for assignment problems, and safety blocks on removing members, deleting assignments, or deleting groups after assignment submissions exist.
- Local main now also includes broader audit/event logging: append-only `audit_events`, an admin audit-log dashboard with request-context visibility, system-actor rendering, resource-ID search, and mutation coverage for settings, user-management, problems, groups, memberships, assignments, submissions, judge updates, profile edits, and password changes.
- Local main now also includes repository-native CI plus an operational-hardening baseline: GitHub Actions CI, a public `/api/health` readiness route, verified SQLite backup/restore scripts, and repo-managed systemd timer artifacts for scheduled backups.
- Local main now also includes the 2026-03-08 security/API hardening batch: SQLite-backed rate limits, shared client-IP extraction, CSRF checks on authenticated mutation APIs, env-gated Auth.js trusted-host handling with explicit auth-route host validation, judge claim-token verification, SQL-level accessible-problem pagination, and CSP-compatible sidebar/toaster/code-surface rendering without inline `style` props.
- Local main now also includes the follow-up auth/sandbox hardening slice from the same remediation set: exact `next-auth` beta pinning with an 8-hour JWT max age, token invalidation timestamps enforced in JWT/proxy/API auth, session revocation on admin password resets and role changes plus self password changes, self-service username/email restrictions, a Zod source-code size cap, timing-equalized invalid login checks, and run-phase seccomp hardening that fails closed instead of silently retrying without the custom profile.
- Local verification passed on 2026-03-08 with directory TypeScript diagnostics, `npm run lint`, `npm run build`, backup/restore script verification, targeted Playwright for `tests/e2e/ops-health.spec.ts`, targeted Playwright for `tests/e2e/admin-audit-logs.spec.ts tests/e2e/group-assignment-management.spec.ts tests/e2e/task12-destructive-actions.spec.ts`, and full `npx playwright test`.
- The current remediation batch was re-verified locally on 2026-03-08 with `npm run db:push`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --grep @smoke`.
- Follow-up cleanup in the same local batch corrected the submission rate-limit timestamp comparison to use a typed Drizzle timestamp comparison, documented `AUTH_TRUST_HOST` in the example/deployment docs, and disabled Playwright local server reuse so `db:push` cannot be skipped by a stale process.
- The auth/sandbox follow-up batch was re-verified locally on 2026-03-09 with `npm run db:push`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --grep @smoke`.
- The broader `P1.8` unit-test expansion batch was verified locally on 2026-03-10 with `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, and `npm run build`; direct Vitest coverage now includes permission helpers, assignment submission-access checks, the persisted rate-limit core, and the API mutation rate-limit wrapper.
- Local main now also includes the 2026-03-16 esoteric language batch: Befunge-93, 아희 (Aheui), and 혀엉 (Hyeong) via a shared `judge-esoteric` Docker image (Befunge-93 C reference interpreter, PyPI `aheui`, Rust `hyeong`). Whitespace, Rockstar, and Shakespeare were prototyped but removed due to line-based I/O incompatibility with space-separated input. Clang C23/C++23 were added upstream in a prior batch via `judge-clang`.
- Local main now also includes Java 25 and Kotlin 2.3 judge support via a shared JVM image, plus CodeMirror syntax support for both languages in the submission/editor surfaces. Java submissions currently follow the standard `Main` entrypoint convention inside the judge.
- The runtime-expansion batch was verified on 2026-03-10 with `npm run languages:sync`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run build`, host-side Java/Kotlin compile-run smoke checks using downloaded official Temurin 25.0.2 and Kotlin 2.3.10 toolchains, and a passing GitHub Actions `CI` run that built and smoke-tested the `judge-jvm` image before completing the full Playwright suite.

## Operational notes

- **Test host**: `oj-internal.maum.ai` (10.50.1.116, amd64), deployed via `deploy-docker.sh` with server-side Docker builds.
- **Production host**: `oj.auraedu.me` (arm64 Ampere Altra), deployed via `deploy-docker.sh` with SSH key auth.
- Both hosts run Docker Compose with `judgekit-app` and `judgekit-judge-worker` containers.
- The judge worker runs with `privileged: true` and `/judge-workspaces:/judge-workspaces` volume mount (identity-mapped so sibling judge containers can access source files).
- `TMPDIR=/judge-workspaces` is set on the worker so temp files land on the shared host path.
- The seccomp profile uses a **deny-list** approach (default allow, block dangerous syscalls like mount/ptrace/bpf). The old allowlist approach was incompatible with newer runc/kernel versions.
- Nginx config is written via `scp` + `sudo cp` (not heredoc tee, which fails silently with sudo password prompts).
- The deploy script auto-detects server architecture (`uname -m` → `linux/amd64` or `linux/arm64`) and passes `--platform` to all Docker builds.
- Do not assume the long-lived hosts still accept the seeded credentials unless freshly reset.

## 2026-03-22 session changes (PL/compiler research languages — Phase 3)

- **14 new judge languages added**: Picat (logic+constraint), Mercury (logic/functional), WebAssembly WAT (compiler IR), PureScript (row polymorphism), Modula-2 (GCC gm2), Factor (concatenative), SPARK (formal verification, Ada subset), MiniZinc (constraint modeling), Curry/PAKCS (functional-logic), Clean (uniqueness typing), Roc (fast functional), Carp (Lisp+ownership), Grain (functional→Wasm), Pony (reference capabilities).
- **13 new Docker images**: `judge-picat`, `judge-mercury`, `judge-wat`, `judge-purescript`, `judge-modula2`, `judge-factor`, `judge-minizinc`, `judge-curry`, `judge-clean`, `judge-roc`, `judge-carp`, `judge-grain`, `judge-pony`. SPARK reuses existing `judge-ada`.
- **Total language count**: 114 language variants across 95 Docker images (was 100/82).
- **TypeScript**: All 14 languages added to Language union type, JUDGE_LANGUAGE_CONFIGS, DOCKER_IMAGE_RUNTIME_INFO, and CODE_SURFACE_LANGUAGE_MAP.
- **Rust worker**: All 14 languages added to types.rs enum, languages.rs configs with compile/run commands, get_config() match, and test array.
- **docker-compose.yml**: 13 new service entries added.
- **deploy-docker.sh**: ALL_LANGS updated with 13 new image names.
- **E2E tests**: A+B solutions added for all 14 new languages with appropriate timeouts.
- **docs/languages.md**: Updated to 114 variants across 95 images.
- **Target audience**: PL/compiler researchers — languages chosen for type theory, algebraic effects, formal verification, constraint solving, and novel memory/ownership models.

## 2026-03-21 session changes (production arm64 deployment)

- **Production deployed**: Full deploy to `oj.auraedu.me` (arm64 Ampere Altra) via `deploy-docker.sh`.
- **69 of 70 Docker images built on arm64**. 2 are amd64-only: `judge-b` (x86 inline asm), `judge-apl` (make fails on arm64).
- **PowerShell fixed for arm64**: Switched from Microsoft container registry (no arm64) to GitHub tar.gz release with arch-aware download.
- **J language removed**: No arm64 binary, unmaintained. Removed from all configs.
- **Racket Dockerfile fixed**: Switched from `racket/racket:8.17` (amd64-only) to Debian `racket` package (multi-arch).
- **Dart Dockerfile fixed**: Reverted to `dart:3.8` multi-arch base image.
- **FreeBASIC**: SourceForge has no aarch64 binary — amd64-only on production.
- **Umjunsik Dockerfile fixed**: Switched to Python pip install (`umjunsik==2.0.2`).
- **Worker Dockerfile hardened**: `cargo clean` before build + arch verification to prevent stale binary issues.
- **Deploy script fixed**: `.env.production` is now preserved per-target (not overwritten on redeploy). `AUTH_URL` is patched to match the target domain on first deploy only.
- **Nginx fixed**: Production `online-judge` config proxy_pass updated from port 3000 to 3100.
- **AUTH_URL fixed**: Production `.env.production` set to `https://oj.auraedu.me` (was incorrectly `http://oj-internal.maum.ai`).
- **DB restored**: Old production DB (13 users, 46 problems, 404 submissions) restored from `/home/ubuntu/online-judge/data/judge.db`. Rate_limits table recreated with new schema (key, consecutive_blocks columns).
- **Language compile commands fixed on production**: vlang (VMODULES), zig (cache dir), scala (mkdir), nim (nimcache), dart (compile exe), prolog, clojure, groovy.
- **E2E on arm64**: Rate limits prevent full 88-language serial E2E on production. First 14-28 languages pass consistently. Full E2E should run against oj-internal.maum.ai (test server).

## 2026-03-20 session changes (new runtimes batch)

- **8 new language variants added**: Deno JS/TS (`judge-deno`), Bun JS/TS (`judge-bun`), Gleam (`judge-gleam`), Standard ML (`judge-sml`), Fennel (reuses `judge-lua`), Flix (reuses `judge-jvm`).
- **4 new Docker images**: `judge-deno` (official Alpine), `judge-bun` (official Alpine), `judge-gleam` (Erlang 27 + Gleam 1.7), `judge-sml` (Debian + Poly/ML).
- **2 existing images modified**: `judge-lua` (+fennel binary), `judge-jvm` (+flix.jar).
- **Total language count**: 93 language variants across 73 Docker images.
- **F# / VB.NET upgraded**: .NET SDK 8.0 → 10.0.
- **Assembly cross-platform**: `judge-nasm` now uses NASM on x86-64 and GNU `as` on AArch64, with an `asm-compile` wrapper script.
- **FIFO queue fix**: Judge claim endpoint uses `ORDER BY submitted_at ASC, rowid ASC` for deterministic ordering when submissions share the same second.

## 2026-03-20 session changes (Docker build fixes batch)

- **10 failing Docker images fixed**: All 10 languages whose Docker builds failed in the expansion batch are now fixed:
  - **umjunsik, uiua**: Added explicit DNS (`1.1.1.1`) to builder stage `resolv.conf` before `cargo install`.
  - **forth**: Switched from Alpine (no `gforth` package) to `debian:bookworm-slim` with `apt-get install gforth`.
  - **intercal**: Built C-INTERCAL from source (`gitlab.com/esr/intercal`) with multi-stage build, since `intercal` package doesn't exist in bookworm.
  - **icon**: Built standard Icon from source (`github.com/gtownsend/icon`) instead of the non-existent `unicon` Debian package.
  - **apl**: Switched from multi-stage source build to Debian `gnu-apl` package (simpler, works on both architectures).
  - **bqn**: Added `g++` to deps, used `--recurse-submodules` for git clone, switched to `make o3n` (non-SIMD, cross-platform).
  - **lolcode**: Added `g++` and `libedit-dev` build dependencies for the `lci` cmake build.
  - **snobol4**: Switched from dead `ftp.snobol4.org` URL to Phil Budne's GitHub mirror, added `autoconf`.
  - **simula**: Added `texinfo`, `flex`, `bison` build deps and `autoreconf -fi` before configure for GNU Cim.
- **odin**: Removed broken `+date` nightly tarball URL placeholder; now always builds from source on all architectures.
- **raku**: Switched from `rakudo-star:alpine` base image (unreliable on arm64) to `debian:bookworm-slim` with `apt-get install rakudo`.
- **DNS handled in Dockerfiles**: Languages needing network access during build (umjunsik, uiua) set DNS via `resolv.conf` override in their Dockerfiles. `--dns` flag not used in deploy script (incompatible with BuildKit/buildx).
- **KNOWN_FLAKY reduced**: Removed the 10 fixed build-failure languages from E2E KNOWN_FLAKY. Only `fsharp` and `freebasic` remain (runtime issues).

## 2026-03-20 session changes (language expansion batch)

- **24 new judge languages added**: sed, dc, CoffeeScript, LLVM IR, VB.NET (Group A — reuse existing images), plus NASM, BQN, LOLCODE, Forth, Algol 68, Umjunsik, INTERCAL, K, Haxe, Raku, Malbolge, Shakespeare, Unlambda, SNOBOL4, Icon, Simula, Uiua, Odin, Objective-C (Group B — 19 new Docker images).
- **Total language count**: 86 language variants across 69 Docker images (was 62 across 50).
- **3 existing images modified**: `judge-bash` (+bc for dc), `judge-node` (+coffeescript npm package), `judge-clang` (+llvm for lli interpreter).
- **19 new Dockerfiles** created for Group B languages with appropriate build-from-source or package-based installations.
- **docker-compose.yml**: 25 new service entries added (19 new + 6 previously missing: fsharp, j, apl, freebasic, smalltalk, b).
- **deploy-docker.sh**: ALL_LANGS updated with all 69 image names.
- **E2E tests**: A+B solutions added for all 24 new languages. All new languages added to KNOWN_FLAKY set until images prove stable.
- **Rust worker**: All 24 languages added to types.rs enum, languages.rs configs, and test array. `cargo test` passes (25 tests).
- **TypeScript**: All 24 languages added to Language union type and JUDGE_LANGUAGE_CONFIGS. `tsc --noEmit` passes with 0 errors.
- **E2E test improvements**: Batch submit phase 1/phase 2 architecture, exponential backoff on rate limits, retry up to 5 attempts.

## 2026-03-21 session changes (new languages batch — Phase 1+2)

- **12 new judge languages added**: MicroPython, Squirrel, Rexx, Hy, Arturo, Janet (Phase 1 — EASY), C3, Vala, Nelua, Hare, Koka, Lean 4 (Phase 2 — MODERATE compiled).
- **12 new Docker images**: `judge-micropython` (Alpine edge), `judge-squirrel` (Debian bookworm), `judge-rexx` (Debian bookworm / Regina REXX), `judge-hy` (Python 3.13 Alpine / Hy), `judge-arturo` (official arturolang/arturo), `judge-janet` (Alpine multi-stage build), `judge-c3` (Debian bookworm / C3C prebuilt), `judge-vala` (Debian bookworm / valac), `judge-nelua` (Debian bookworm / Nelua source build), `judge-hare` (Alpine / qbe+harec+hare source build), `judge-koka` (Ubuntu 22.04 / Koka release), `judge-lean` (Ubuntu 24.04 / Lean 4 release).
- **Total language count**: 100 language variants across 82 Docker images (was 88/70). _(superseded by Phase 3: now 114/95)_
- **TypeScript**: All 12 languages added to Language union type, JUDGE_LANGUAGE_CONFIGS, and DOCKER_IMAGE_RUNTIME_INFO.
- **Rust worker**: All 12 languages added to types.rs enum, languages.rs configs with compile/run commands, get_config() match, and test array.
- **docker-compose.yml**: 12 new service entries added.
- **deploy-docker.sh**: ALL_LANGS updated with 12 new image names.
- **E2E tests**: A+B solutions added for all 12 new languages. KNOWN_FLAKY set removed entirely — all tests must pass or be in KNOWN_FAILING with documented reasons.
- **docs/languages.md**: Restructured with separate `amd64 E2E` and `arm64 E2E` columns. Updated to 100 variants across 82 images.
- **README.md**: Updated language count from 88 to 100 variants, 70 to 82 images.
- **Plan source**: `.context/new-languages-plan.md` — 55 languages researched, 18 selected (6 EASY + 12 MODERATE), Phase 1+2 implemented this session.

## 2026-03-20 session changes (latest)

- **Docker CLI in app container**: `Dockerfile` installs `docker-cli` (Alpine package). The `nextjs` user is added to the `docker` group (gid 987). `docker-compose.production.yml` mounts `/var/run/docker.sock` on both `app` and `judge-worker` containers. This enables the admin language management UI to build/remove Docker images without a separate privileged sidecar.
- **CSRF header corrected**: Mutation API routes check for `X-Requested-With: XMLHttpRequest` (not `x-csrf-token`). All admin UI fetches and E2E helpers use this header on POST/DELETE/PATCH requests.
- **Disk usage on language admin page**: `/dashboard/admin/languages` now shows a progress bar at the top with total Docker disk usage on the host, color-coded green/yellow/red. Fetched live via the Docker images API on page load.
- **Per-image sizes on language admin page**: Each language row shows the local image size fetched live from `GET /api/v1/admin/docker/images`. Rows where the image is not pulled show "Not built".
- **Deploy builds use `--no-cache`**: `deploy-docker.sh` passes `--no-cache` for `judgekit-app` and `judgekit-judge-worker` builds to ensure clean rebuilds on every deploy.

## 2026-03-20 session changes (earlier)

- **Haskell image optimized**: Switched from `haskell:9.8-slim` (Debian-based) to Alpine-based GHC build, shrinking `judge-haskell` from 3.97 GB to 1.81 GB (-54%). Total across 44 images now ~24 GB (was ~26 GB).
- **Brainfuck interpreter**: Changed from `bf` to `beef` interpreter in `judge-brainfuck`. Confirmed working for single-digit inputs.
- **Whitespace interpreter**: Fixed file encoding issues; interpreter now handles test input correctly for single-digit sums.
- **PID limits increased**: Run phase raised from 16 to 64 pids-limit; compile phase raised from 64 to 128. Required for VM-based runtimes (BEAM/Erlang/Elixir, JVM/Java/Kotlin/Scala/Groovy, PowerShell) that spawn many OS threads.
- **DNS fixed**: Judge containers now use Cloudflare 1.1.1.1. `/etc/resolv.conf` locked with `chattr +i` to prevent Docker from overwriting it. Resolves intermittent DNS failures in BEAM/JVM language containers.
- **V Lang image**: Switched from source build to pre-built binary zip install in `judge-v` Dockerfile, improving build reliability.
- **Scala image**: Now uses direct tarball download with `-release 21` JVM target flag for JDK 21 compatibility (temurin:21-jdk-alpine base).
- **E2E pass rate**: 47/55 languages pass. KNOWN_FLAKY expanded to 8: hyeong, whitespace, brainfuck, vlang, scala, erlang, elixir, prolog.
- **Test cases simplified**: A+B E2E test cases now use only positive single-digit addends (sum ≤9) to maximize esoteric/interpreter language compatibility.
- **Claim endpoint wrapping**: Confirmed the judge claim API wraps DB-stored commands in `["sh", "-c", cmd]` at dispatch time. DB stores raw commands without sh -c prefix.

## 2026-03-19 session changes

- E2E all-languages test: KNOWN_FLAKY reduced from 18 to 4 languages (hyeong, brainfuck, vlang, whitespace). All other 51/55 variants pass the A+B judge test.
- Cross-platform arm64/amd64 support verified end-to-end: `deploy-docker.sh` uses `uname -m` on the remote host to detect architecture, then passes `--platform linux/amd64` or `--platform linux/arm64` to all `docker build` invocations including app, judge worker, and all 44 language images.
- Groovy judge image confirmed using Java 21 (Temurin 21 base) — required for Groovy 4.0 class file compatibility; Java 25 bytecode is incompatible.
- Zig 0.13 compile command confirmed using `-femit-bin=` flag (not `-o`).
- All compiled language outputs confirmed targeting `/workspace/solution` — `/tmp` is per-container ephemeral tmpfs and not shared between worker and sibling judge containers.
- `AGENTS.md`, `README.md`, `.context/development/open-workstreams.md`, and this file updated to reflect the above.

## Documentation sync points

- `README.md` now treats the classroom-management, audit, CI, and operational-hardening batches as current main capabilities.
- `README.md` and `docs/review.md` now treat assignment CRUD, audit logging, CI, and backup/observability baseline work as current completed batches.
- `README.md`, `.context/development/open-workstreams.md`, and `docs/review.md` now treat broader audit/event logging as locally complete rather than open roadmap work.
- `README.md`, `.context/development/open-workstreams.md`, and `docs/review.md` now treat CI and backup/observability baseline work as locally complete.
- `docs/deployment.md` now captures the deployed revision, the `time_zone` schema requirement, and the shared-host credential/env caveats.
- `docs/review.md` now records the timezone rollout plus the newer classroom/audit/ops and security-hardening status without leaving those batches marked as pending deploy.
- `docs/review-plan.md`, `docs/security-review-2026-03-08.md`, `docs/deployment.md`, and `.context/development/open-workstreams.md` now also record the locally completed security/API hardening batch and its verification state.
- `README.md`, `docs/deployment.md`, `docs/review-plan.md`, `docs/security-review-2026-03-08.md`, and `.context/development/open-workstreams.md` now also record the 2026-03-09 auth/session and seccomp follow-up batch, including the fail-closed run-phase sandbox behavior and self-service identity restrictions.
- `docs/review-plan.md`, `.context/development/open-workstreams.md`, and this file now also record the 2026-03-10 `P1.8` test-expansion follow-up batch and its local verification state.
- `docs/feature-plan.md`, `docs/review-plan.md`, `.context/development/open-workstreams.md`, and this file now also record the 2026-03-10 Java/Kotlin runtime-expansion batch.
- `AGENTS.md` already reflects that `system_settings` carries title, description, and timezone overrides.
- `README.md` now reflects 86 supported language variants across 69 Docker images, including the 24-language expansion batch (sed, dc, CoffeeScript, LLVM IR, VB.NET, NASM, BQN, LOLCODE, Forth, Algol 68, Umjunsik, INTERCAL, K, Haxe, Raku, Malbolge, Shakespeare, Unlambda, SNOBOL4, Icon, Simula, Uiua, Odin, Objective-C).
- `AGENTS.md` now includes a comprehensive 86-language table, contest system documentation (IOI/ICPC scoring, scheduled/windowed modes, anti-cheat, leaderboard freeze), Docker deployment architecture details (server-side builds, architecture auto-detection, privileged:true, /judge-workspaces volume, seccomp deny-list), and the complete deploy-docker.sh workflow.
- `docs/languages.md` now lists all 86 variants across 69 Docker images with the full language table.
