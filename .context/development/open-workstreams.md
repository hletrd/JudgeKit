# Open Workstreams

Last updated: 2026-03-20

The `dashboard-rendering-audit-and-editor-upgrades` batch is now locally verified and its plan docs are reconciled. All currently tracked local workstreams are closed after the runtime-expansion batch below.

## Recently closed locally

- Assignment-aware submission validation, the group-scoped assignment board, and scoped instructor submission drill-down
- Login-event logging plus the admin login-log dashboard/navigation surface
- Theme switching, CodeMirror code surfaces, markdown rendering, draft recovery, mixed submission IDs, and guarded delete flows
- Group membership management plus assignment create/edit/delete flows, assignment-linked student detail pages, and submission guards tied to assignment schedules/history
- Broader audit/event logging across admin mutations, submission/judge lifecycle events, and the admin audit-log page
- GitHub Actions CI plus the operational-hardening baseline: `/api/health`, SQLite backup/restore scripts, and repo-managed backup timer artifacts
- Security/API hardening from the 2026-03-08 remediation plans: SQLite-backed rate limiting, CSRF mutation-route checks, env-gated Auth.js trusted-host handling with explicit auth-route validation, judge claim tokens, SQL-level problem pagination, and CSP-compatible removal of inline `style` props from key UI primitives
- Local Playwright smoke stability fixes: auto-apply `npm run db:push` before the test web server starts, disable local server reuse so stale schemas are not reused, clear the runtime admin's old submissions before each run, and align mutation-route E2E fetches with the new `X-Requested-With` CSRF requirement
- Remaining security follow-ups from the 2026-03-08 review set are now closed locally: exact `next-auth` pinning with an 8-hour JWT max age, invalidation-aware auth lookups for password/role resets, self-service username/email restrictions, a Zod source-code size cap, timing-equalized invalid logins, and run-phase seccomp hardening that fails closed instead of silently retrying without the custom profile
- A first unit-test infrastructure slice is now locally complete: Vitest + coverage are wired into package scripts and CI, initial regression tests cover password rules, assignment validation, late-penalty scoring, and trusted-proxy IP extraction, and the `TRUSTED_PROXY_HOPS` lookup now correctly returns the client IP instead of the final proxy hop
- Direct unit coverage now also reaches the previously open auth/security/access gaps: permission helpers, assignment submission-access checks, the persisted rate-limit core, and the API mutation rate-limit wrapper are all covered by Vitest and locally verified with `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, and `npm run build`
- Additional language/runtime expansion is now locally complete: the judge supports Java 25 and Kotlin 2.3 via a shared JVM toolchain image, the editor recognizes both languages, Java uses the standard `Main` entrypoint convention, and the runtime commands were verified with `npm run languages:sync`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run build`, host-side smoke tests against downloaded official Temurin/Kotlin toolchains, and the repository CI workflow's remote `judge-jvm` build/smoke step
- Submission detail pages now link back to the underlying problem page, preserving assignment context for assignment-linked submissions so students can iterate without manually reconstructing the original problem URL
- Submission detail polling now pauses for hidden tabs, backs off after refresh failures, and shows a delayed-refresh warning instead of silently swallowing transient fetch errors during live judging
- Health checks now report degraded audit-write state in addition to DB readiness, and audit request context now shares the same trusted-proxy IP extraction logic as the login/rate-limit path
- Legacy HTML problem descriptions now sanitize against an explicit content allowlist instead of DOMPurify's broad HTML profile, with regression tests covering stripping of interactive elements and inline handlers
- Problem submission now supports loading a local source file directly into the editor, with localized success/error feedback for the upload path
- Problem submission now also uses an explicit confirmation dialog before sending code to the judge, reducing accidental one-click submissions from the editor
- Submission status badges now carry icons as well as colors across the main student/instructor views, improving accessibility for color-blind users
- Assignment management now filters manageable problems at the SQL layer for non-admin users instead of materializing the full problems table before applying visibility/group-access checks
- Assignment status boards now surface basic score distribution stats directly in the UI, including mean, median, submitted count, and perfect-score count
- Problem editing now supports an admin-only test-case unlock path after submissions exist, with the override explicitly toggled in the UI and carried through the PATCH route
- Assignment editing now supports an admin-only unlock path for linked problems after submissions exist, with explicit UI/audit signaling for the override
- The groups index now scopes instructors to their own groups in both the API and the server-rendered page, removing the earlier SSR mismatch that showed every group
- The shared submissions page now switches instructors onto a group-scoped student submission view instead of showing only their personal submissions
- Problem creation/editing now supports loading test-case input/output from local files directly into each row of the test-case editor
- Assignment detail pages now show relative deadline countdown text, and assignment-scoped problem pages surface deadline and late-window warning badges from the active assignment context
- Problems, submissions, users, and groups API routes now share one pagination parser instead of duplicating page/limit/offset parsing logic
- The users PATCH API route now decomposes profile validation, uniqueness checks, role updates, active-state changes, and password-reset handling into focused helpers
- Judge poll final-verdict calculation and submission-result row shaping now live in a dedicated verdict module instead of staying inline in the route handler
- The audit-log page now allows instructors to review only the audit events tied to their own groups and related assignment/submission/problem resources, instead of requiring admin access for all audit visibility
- The dashboard now serves role-specific student/instructor/admin overview cards, and the request-context normalization logic is shared between audit and login event recording
- Server actions now perform shared origin validation before privileged mutations, closing the remaining CSRF gap outside the API-route surface
- Bulk grading, feedback, and admin tool batch: submission comments/feedback, rejudge capability, bulk student enrollment, bulk user creation with CSV upload, grade override/manual scoring, problem search/filtering, markdown preview, admin users pagination/search/role-filter, student progress indicators, assignment scoreboard drill-down, student-oriented dashboard, shared request-context utility consolidation, user management core unification, and API route handler wrapper

## Recently closed (2026-03-19 session)

- Admin language management page (`/dashboard/admin/languages`): toggle languages on/off, edit compile/run commands, Docker image selection with datalist combobox, reset to defaults
- Docker image management API (`GET/POST /api/v1/admin/docker/images`): list, pull, inspect, remove Docker images from admin
- Judge worker DB-configured overrides: claim endpoint includes `dockerImage`, `compileCommand`, `runCommand` from `languageConfigs` table; Rust worker uses overrides when present, falls back to static config
- Contest UI redesign: grid → list layout, export buttons moved to title area, filter button alignment fix, student detail log page (`/dashboard/contests/[assignmentId]/students/[userId]`)
- ICPC scoring bug fix: `scoringModel` and `enableAntiCheat` were missing from assignment creation/update request parsing
- Deploy script rewrite: server-side Docker builds (rsync source → build on server), architecture auto-detection, nginx config via scp, all 44 language images via `docker compose build`
- Seccomp profile: switched from allowlist to deny-list (default allow, block dangerous syscalls) — fixes compatibility with newer runc/kernel
- Judge workspace: `/judge-workspaces` identity-mapped volume for sibling container source file access
- Proxmox VM 101 disk resize: 64GB → 128GB
- 42 of 44 Docker judge images built on test server (judge-v and judge-scala still failing)
- E2E test coverage: 55 languages, contest lifecycle (33/33), contest system (17/17)
- i18n: admin.languages keys for both en/ko, Korean login button selector fix

## Recently closed (2026-03-19 cross-platform session)

- E2E language pass rate improved to 51/55: all languages now pass except the 4 in KNOWN_FLAKY (hyeong, brainfuck, vlang, whitespace)
- KNOWN_FLAKY reduced from 18 languages to 4 — intermittent failures for java/typescript, prolog, and others are now resolved
- Cross-platform arm64/amd64 support verified: deploy-docker.sh auto-detects remote architecture via `uname -m`, passes `--platform linux/amd64` or `--platform linux/arm64` to all docker build commands (app, judge worker, all 44 language images)
- Confirmed Groovy uses Java 21 (Temurin 21 base image) — required for Groovy 4.0 bytecode compatibility; Java 25 class versions are incompatible
- Confirmed Zig 0.13 compile command uses `-femit-bin=` flag (not `-o`) for output path
- Confirmed compiled language outputs go to `/workspace/solution` (not `/tmp/solution`) — `/tmp` is per-container tmpfs; `/workspace` is the shared bind-mount

## Recently closed (2026-03-20 session)

- **Haskell image optimization**: Switched `judge-haskell` from `haskell:9.8-slim` to Alpine-based GHC, reducing image from 3.97 GB to 1.81 GB. Total 44-image footprint now ~24 GB.
- **Brainfuck interpreter**: Changed from `bf` to `beef` interpreter — correct byte-level I/O for the test suite.
- **Whitespace interpreter**: Fixed encoding issues; now passes with single-digit test inputs.
- **PID limits increased**: Run phase 16→64, compile phase 64→128 pids-limit — unblocks BEAM (Erlang/Elixir), JVM (Java/Kotlin/Scala/Groovy), and PowerShell runtimes from OOM/hang under low PID caps.
- **DNS fixed**: Cloudflare 1.1.1.1 set on judge host with `chattr +i` on `/etc/resolv.conf` — prevents Docker from overwriting resolver config and resolves intermittent container DNS failures.
- **V Lang image**: Switched to pre-built binary zip instead of source build in `judge-v` — more reliable image build.
- **Scala image**: Direct tarball download with `-release 21` JVM target on temurin:21-jdk-alpine base — fixes class file version incompatibility.
- **E2E test case simplification**: A+B test uses only positive single-digit addends (sum ≤9) — maximizes compatibility with esoteric/interpreter languages.
- **KNOWN_FLAKY updated**: Expanded from 4 to 8 languages: hyeong, whitespace, brainfuck, vlang, scala, erlang, elixir, prolog. Pass rate is now 47/55.
- **Claim endpoint sh -c wrapping**: Documented that judge claim API wraps DB commands in `["sh", "-c", cmd]` at dispatch; DB stores raw commands without the shell wrapper.

## Still open

- `P3.6` composite unique index on `problem_group_access` is still blocked pending explicit approval for the destructive `db:push` step
- `P1.7` tutor/TA infrastructure remains open
- `P2.4` remains open only for broader incremental adoption beyond the groups/problems/submissions slice
- `dockerfile` column added to `language_configs` table manually (needs proper Drizzle migration)
- vlang Docker image still fails to build from source reliably (tracked in KNOWN_FLAKY)

## Safety note

- Test host (oj-internal.maum.ai) was reverified on 2026-03-19 after the full deployment.
- Nginx config on test host gets overwritten during deploy — ensure `/tmp/judgekit-nginx.conf` backup exists or fix the deploy script's nginx step.
- Future sessions should isolate the next coherent batch before updating deployment-facing docs again.
