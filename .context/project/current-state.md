# Current State

Last updated: 2026-03-20

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
- `README.md` now reflects 55 supported language variants including the Whitespace and 11 additional languages batch (Ada, Clojure, Prolog, Tcl, AWK, Scheme, Groovy, Octave, Crystal, PowerShell, PostScript), the esoteric language batch (Befunge-93, Aheui, Hyeong, Whitespace), and the Clang C/C++ variants added in the earlier upstream batch.
- `AGENTS.md` now includes a comprehensive 55-language table, contest system documentation (IOI/ICPC scoring, scheduled/windowed modes, anti-cheat, leaderboard freeze), Docker deployment architecture details (server-side builds, architecture auto-detection, privileged:true, /judge-workspaces volume, seccomp deny-list), and the complete deploy-docker.sh workflow.
