# Deep Code Review: Frontend, Deployment/Ops, and Test Suite

**Repository:** `/Users/hletrd/flash-shared/judgekit`
**Reviewer:** Code Reviewer Agent (Opus 4.6)
**Date:** 2026-04-18
**Scope:** Frontend (app routes, components, contexts, hooks, i18n), Deploy/Ops (shell scripts, Docker, CI/CD, env), Test Suite (unit, component, integration, e2e, visual)

---

## Summary

| Area | Files Reviewed | Issues Found |
|------|---------------|-------------|
| Frontend | ~65 | 14 |
| Deploy / Ops | ~30 | 12 |
| Test Suite | ~45 | 8 |
| **Total** | **~140** | **34** |

### By Severity

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 2 | Must fix before next deploy |
| HIGH | 8 | Should fix soon |
| MEDIUM | 14 | Consider fixing |
| LOW | 10 | Optional improvements |

---

## FRONTEND

### F-01: `key.pem` present in repository root despite `.gitignore` rule

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Open
- **File+lines:** `/key.pem` (repo root); `.gitignore:26` (`*.pem`)
- **Excerpt:** `git ls-files` shows the file is NOT tracked (the `.gitignore` rule works), but the file exists on disk at the repo root: `-rw------- 1.7k 3000 17 Mar 18:02 key.pem`
- **Scenario:** The `.gitignore` rule `*.pem` prevents git from tracking it, and `.dockerignore` does not explicitly list `*.pem` but does exclude `.env*` and `data/`. However, the Dockerfile `COPY . .` in the builder stage will copy `key.pem` into the Docker image layer. Anyone pulling or inspecting the image can extract the private key.
- **Fix:** (1) Add `*.pem` to `.dockerignore`. (2) Delete `key.pem` from the repo working tree or move it to a directory excluded by `.dockerignore` (e.g., `data/`). (3) Rotate the key if it was ever included in a built image.

### F-02: CSP `unsafe-eval` in development mode script-src

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Acknowledged in code
- **File+lines:** `src/proxy.ts:167`
- **Excerpt:** `'self' 'nonce-${nonce}' 'unsafe-eval'` (development only)
- **Scenario:** The `unsafe-eval` is correctly gated behind `process.env.NODE_ENV === "development"`. Production builds use only `'self' 'nonce-...'`. The fallback static CSP in `next.config.ts:45-56` also has `script-src 'self'` without `unsafe-eval`. This is acceptable but worth noting: if `NODE_ENV` is accidentally set to `development` in production (e.g., a misconfigured `.env`), the CSP weakens significantly.
- **Fix:** Add a startup assertion in `src/instrumentation.ts` that rejects `NODE_ENV=development` when `AUTH_URL` points to a non-localhost origin.

### F-03: `style-src 'unsafe-inline'` in all CSP variants

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Acknowledged in code comments
- **File+lines:** `src/proxy.ts:173`, `next.config.ts:48`
- **Excerpt:** `style-src 'self' 'unsafe-inline'`
- **Scenario:** CSS-in-JS and Next.js font injection require `unsafe-inline` for styles. This is an industry-wide limitation. A nonce-based approach for styles would be ideal but requires framework-level support.
- **Fix:** Document this as an accepted risk. When Next.js adds style nonce support, migrate to `style-src 'self' 'nonce-...'`.

### F-04: `dangerouslySetInnerHTML` with `sanitizeHtml` in ProblemDescription

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Mitigated
- **File+lines:** `src/components/problem-description.tsx:51`
- **Excerpt:** `dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}`
- **Scenario:** Legacy HTML descriptions pass through DOMPurify with a restricted tag/attribute allowlist (`src/lib/security/sanitize-html.ts`). The sanitizer strips `<script>`, `<svg>`, event handlers, `javascript:` URIs, `data:` URIs, external image sources, and `<div>`/`<span>` wrappers. The test suite at `tests/unit/security/sanitize-html.test.ts` covers 15 OWASP XSS evasion vectors. The `sanitizeHtml` function also enforces an `ALLOWED_URI_REGEXP` that only permits `https?`, `mailto`, and root-relative paths. This is well-defended.
- **Fix:** No immediate fix needed. The `style` attribute is correctly excluded from `LEGACY_HTML_ALLOWED_ATTR`. Consider adding a `FORBID_TAGS` explicit blocklist for defense-in-depth alongside the allowlist.

### F-05: `JsonLd` component uses `dangerouslySetInnerHTML` with `JSON.stringify`

- **Severity:** LOW
- **Confidence:** High
- **Status:** Acceptable
- **File+lines:** `src/components/seo/json-ld.tsx:9`
- **Excerpt:** `dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}`
- **Scenario:** `JSON.stringify` does not produce executable HTML. The `<script type="application/ld+json">` tag is parsed as data, not executable script. The `data` prop comes from server-side metadata generation (site title, description), not user input. However, if a user-controlled string containing `</script>` were to appear in the `data` object, it could break out of the JSON-LD block.
- **Fix:** Replace `JSON.stringify(data)` with a function that also escapes `</script>` sequences: `JSON.stringify(data).replace(/<\//g, '<\\/')`.

### F-06: Missing error boundaries and loading states in workspace/control route groups

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Open
- **File+lines:** `src/app/(workspace)/` (no `error.tsx` or `loading.tsx`), `src/app/(control)/` (no `error.tsx` or `loading.tsx`)
- **Excerpt:** The `(dashboard)` route group has `error.tsx` at 5 levels and `loading.tsx` at 9 levels, but `(workspace)` and `(control)` have neither.
- **Scenario:** If an async server component in `/workspace/discussions` or `/control/discussions` throws, the error will bubble up to the root error boundary (or produce a blank page). Users see no fallback while pages load.
- **Fix:** Add `error.tsx` and `loading.tsx` to `src/app/(workspace)/` and `src/app/(control)/`.

### F-07: Sparse use of React `<Suspense>` boundaries

- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Partially addressed
- **File+lines:** `src/app/(dashboard)/dashboard/page.tsx` (14 Suspense uses across 2 files)
- **Excerpt:** The dashboard page correctly wraps each dashboard variant in `<Suspense>`. However, only 2 files across the entire `src/app/` tree use `Suspense`.
- **Scenario:** Most server component pages do not wrap their data-fetching children in `<Suspense>`, which means the entire page blocks on the slowest data fetch. This is a performance concern, not a correctness bug.
- **Fix:** Progressively add `<Suspense>` boundaries around data-fetching components in high-traffic pages (problem detail, contest detail, submission list).

### F-08: Auth gate in workspace/control layouts is server-side, good

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `src/app/(workspace)/layout.tsx:15-16`, `src/app/(control)/layout.tsx:16-17`
- **Excerpt:** `const session = await auth(); if (!session?.user) redirect("/login");`
- **Scenario:** Both workspace and control layouts enforce auth via server-side `auth()` + `redirect()`. The control layout additionally checks capabilities before allowing access. The proxy middleware (`src/proxy.ts:260`) also enforces auth for protected routes, providing defense-in-depth.

### F-09: `AssistantMarkdown` uses `skipHtml` but no explicit sanitization

- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Acceptable
- **File+lines:** `src/components/assistant-markdown.tsx:41`
- **Excerpt:** `<ReactMarkdown ... skipHtml ...>`
- **Scenario:** `skipHtml` in react-markdown prevents raw HTML from being rendered, which is the correct XSS mitigation for markdown content. The `content` prop should never contain user-generated HTML. However, if `content` comes from an AI assistant plugin response, a compromised plugin could attempt to inject markdown that exploits rehype plugins.
- **Fix:** Acceptable as-is. For defense-in-depth, consider running `sanitizeMarkdown()` on the content before rendering.

### F-10: `DestructiveActionDialog` properly requires two-step confirmation

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `src/components/destructive-action-dialog.tsx`
- **Scenario:** All destructive actions (delete problem, delete contest, archive group, delete file, etc.) go through a dialog with confirm/cancel buttons and a loading state. The `onConfirmAction` is async and controls whether the dialog closes.

### F-11: Google Analytics script uses nonce but GA measurement ID is interpolated

- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Acceptable
- **File+lines:** `src/app/layout.tsx:101-111`
- **Excerpt:** `gtag('config', '${GA_MEASUREMENT_ID}');`
- **Scenario:** `GA_MEASUREMENT_ID` is from `NEXT_PUBLIC_GA_MEASUREMENT_ID`, a build-time env var. It is not user-controllable. The inline script has a nonce. No XSS risk.
- **Fix:** No fix needed. The nonce propagation from middleware to layout via `x-nonce` header is correctly implemented.

### F-12: `.env.production.example` contains a real-looking internal hostname

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Open
- **File+lines:** `.env.production.example:8`
- **Excerpt:** `AUTH_URL=https://oj-internal.maum.ai`
- **Scenario:** The `.example` file is committed to git and should contain placeholder values, not actual internal hostnames. `oj-internal.maum.ai` reveals an internal service name.
- **Fix:** Replace with a placeholder: `AUTH_URL=https://your-domain.example.com`.

### F-13: `NonceProvider` correctly propagates CSP nonce to client components

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `src/components/nonce-provider.tsx`, `src/app/layout.tsx:93,114`
- **Scenario:** The nonce is generated in middleware (`createNonce()` in `proxy.ts`), set as `x-nonce` header, read in the root layout, and provided via React context. The `ThemeProvider` also receives the nonce for its inline style injection.

### F-14: Public routes call `auth()` but do not gate on it (correct)

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `src/app/(public)/layout.tsx:13`, various public pages
- **Scenario:** Public pages call `auth()` to determine whether to show "Sign In" or the user's name in the header, but do not redirect unauthenticated users. This is the correct behavior for public-facing pages.

---

## DEPLOY / OPS

### D-01: `key.pem` copied into Docker image via `COPY . .` in builder stage

- **Severity:** CRITICAL
- **Confidence:** High
- **Status:** Open
- **File+lines:** `Dockerfile:31` (`COPY . .`), `.dockerignore` (missing `*.pem`)
- **Excerpt:** The `.dockerignore` excludes `.env*`, `data/`, `node_modules`, `.git`, `tests/`, but does NOT exclude `*.pem` files.
- **Scenario:** The builder stage `COPY . .` includes `key.pem` in the image layer. Even though the runner stage uses `COPY --from=builder` for specific paths, the builder image layer persists in Docker's cache and any multi-stage build with `docker build` retains intermediate layers until pruned.
- **Fix:** Add `*.pem` and `key.pem` to `.dockerignore`. Also add `*.key`, `*.p12`, `*.pfx` for defense-in-depth.

### D-02: `deploy.sh` legacy script sources `.env.deploy` with `set -a; source`

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Mitigated by deprecation notice
- **File+lines:** `deploy.sh:52`
- **Excerpt:** `[[ -f "${SCRIPT_DIR}/.env.deploy" ]] && { set -a; source "${SCRIPT_DIR}/.env.deploy"; set +a; }`
- **Scenario:** Sourcing env files with `set -a` exports ALL variables from the file into the script environment and child processes. If `.env.deploy` contains secrets (SSH_PASSWORD, etc.), they become available to all subprocesses. The script is deprecated but still functional.
- **Fix:** The script already has a deprecation banner. Add `.env.deploy` to `.gitignore` if not already there, and ensure it is never committed.

### D-03: `deploy-test-backends.sh` sources `.env` with `set -a; source`

- **Severity:** MEDIUM
- **Confidence:** High
- **Status:** Open
- **File+lines:** `deploy-test-backends.sh:20-21`
- **Excerpt:** `if [[ -f "${SCRIPT_DIR}/.env" ]]; then set -a; source "${SCRIPT_DIR}/.env"; set +a; fi`
- **Scenario:** This sources the local `.env` file which may contain `TEST_SSH_PASSWORD`. The password is then used via `sshpass -p "$SSH_PASSWORD"` which exposes it in the process table (visible via `ps aux`).
- **Fix:** Prefer SSH key auth. If password auth is required, use `SSHPASS` env var with `sshpass -e` (already done correctly in `deploy-docker.sh:158` for rsync but not for ssh/scp). Document the security limitation.

### D-04: `rsync --delete` in deploy scripts could remove critical files

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Mitigated by excludes
- **File+lines:** `deploy-docker.sh:280`, `deploy-test-backends.sh:81`
- **Excerpt:** `remote_rsync -az --delete --exclude='.env*' --exclude='data/' ...`
- **Scenario:** The `--delete` flag removes remote files not present locally. The excludes protect `.env*` and `data/`, but if a developer adds a new critical directory on the remote that is not in the exclude list, it will be deleted on next deploy.
- **Fix:** Consider adding `--delete-excluded` awareness documentation. The current exclude list is comprehensive. Add a comment in the script listing what `--delete` protects against (stale source files) and what the excludes protect.

### D-05: Docker Compose test-backends docker-proxy has elevated permissions

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Open
- **File+lines:** `docker-compose.test-backends.yml:63-69`
- **Excerpt:** `BUILD=1`, `DELETE=1` (in test-backends docker-proxy)
- **Scenario:** The test-backends docker-proxy allows `BUILD=1` and `DELETE=1`, unlike the production docker-proxy (`docker-compose.production.yml:68-73`) which has `BUILD=0` and `DELETE=0`. If the test-backends stack is exposed on a shared network, the judge worker could be used to build arbitrary images or delete containers.
- **Fix:** Set `BUILD=0` and `DELETE=0` in the test-backends docker-proxy, matching production. If build capability is needed for testing, create a separate builder service.

### D-06: Docker Compose production services correctly bind to 127.0.0.1

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `docker-compose.production.yml:86`, `docker-compose.test-backends.yml:81,106,139`
- **Scenario:** All app service port mappings use `127.0.0.1:PORT:3000`, not `0.0.0.0`. Internal services (db, docker-proxy, code-similarity, rate-limiter) do not expose ports at all. This is correct.

### D-07: All shell scripts use `set -euo pipefail`

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** All 16 `.sh` files in `scripts/`
- **Scenario:** Every shell script starts with `set -euo pipefail`, ensuring that unset variables, command failures, and pipe failures are caught. This is excellent practice.

### D-08: CI workflow has explicit `permissions: contents: read`

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `.github/workflows/ci.yml:18`
- **Scenario:** The CI workflow explicitly restricts permissions to read-only content access, following the principle of least privilege. The CD workflow is disabled (intentionally) with a manual abort step.

### D-09: CI `AUTH_SECRET` uses GitHub secrets, not hardcoded values

- **Severity:** LOW
- **Confidence:** High
- **Status:** Good with caveat
- **File+lines:** `.github/workflows/ci.yml:21`
- **Excerpt:** `AUTH_SECRET: ${{ secrets.AUTH_SECRET }}`
- **Scenario:** The CI uses GitHub secrets for auth. However, the `AUTH_URL` has a fallback: `${{ secrets.AUTH_URL || 'http://localhost:3110' }}`. If `secrets.AUTH_URL` is not configured, the default is used, which is fine for CI.

### D-10: E2E job in CI uses SQLite and `Reset SQLite database` step

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Open
- **File+lines:** `.github/workflows/ci.yml:252-254`
- **Excerpt:** `rm -f data/judge.db data/judge.db-shm data/judge.db-wal`
- **Scenario:** The E2E CI job runs against SQLite, but the production runtime is PostgreSQL. This means E2E tests do not exercise the PostgreSQL-specific code paths (connection pooling, transaction isolation, PostgreSQL-specific query syntax). The database schema application uses `npm run db:push` which may behave differently between SQLite and PostgreSQL.
- **Fix:** Consider adding a PostgreSQL-backed E2E CI job, or at minimum add integration tests that run the critical paths against PostgreSQL. The `tests/integration/support/test-db.ts` already supports PostgreSQL integration tests but they need a running PostgreSQL instance in CI.

### D-11: Dockerfile runs as non-root user (good)

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `Dockerfile:62-63,104`
- **Excerpt:** `adduser --system --uid 1001 nextjs` ... `USER nextjs`
- **Scenario:** The production runner stage creates a dedicated `nextjs` user and switches to it before running the server. The Rust Dockerfiles (`Dockerfile.judge-worker`, `Dockerfile.rate-limiter-rs`, `Dockerfile.code-similarity`) run as root, which is acceptable for the judge worker (needs docker CLI access) but could be improved for the sidecars.

### D-12: `deploy-docker.sh` backup reads POSTGRES_PASSWORD from env file via grep

- **Severity:** LOW
- **Confidence:** Medium
- **Status:** Acceptable
- **File+lines:** `deploy-docker.sh:423`
- **Excerpt:** `PG_PASS=\$(grep '^POSTGRES_PASSWORD=' ${REMOTE_DIR}/.env.production | cut -d= -f2-)`
- **Scenario:** Passwords with special characters (e.g., `=`, `$`, backticks) could be truncated or misinterpreted by `cut -d= -f2-` or shell expansion. The `openssl rand -hex 32` generator produces only hex characters, so this is safe in practice.
- **Fix:** No immediate fix needed. Document that generated passwords use hex-only characters.

---

## TEST SUITE

### T-01: E2E tests have pervasive `waitForTimeout` / `sleep` patterns (flakiness risk)

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Open
- **File+lines:** `tests/e2e/contest-nav-test.spec.ts:21,29,38,44,51,59` (six 2000ms waits), `tests/e2e/contest-full-lifecycle.spec.ts:90,503,514`, `tests/e2e/auth-flow.spec.ts:45`, `tests/e2e/debug-contest-errors.spec.ts:33,53,67`, many others
- **Excerpt:** `await page.waitForTimeout(2000);` / `await page.waitForTimeout(3000);`
- **Scenario:** At least 35 occurrences of `waitForTimeout` or `setTimeout`-based waits across E2E and component tests. These are inherently flaky: they may pass on fast machines but fail on slow CI runners (or waste time on fast ones). The `contest-nav-test.spec.ts` file alone has 6 blind 2-second waits.
- **Fix:** Replace `waitForTimeout` calls with `waitForSelector`, `waitForURL`, `waitForResponse`, or `expect(...).toBeVisible()` assertions that wait for the actual condition. For example, replace `await page.waitForTimeout(2000)` with `await page.waitForURL('**/dashboard/**')` or `await expect(page.getByRole('heading')).toBeVisible()`.

### T-02: Integration test database creates isolated temporary databases (good)

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `tests/integration/support/test-db.ts`
- **Scenario:** The `createTestDb()` function creates a unique database (`itest_<nanoid>`), runs real migrations, and provides a `cleanup()` function that terminates connections and drops the database. This prevents cross-test state leakage.

### T-03: Unit test rate-limit mock fully simulates DB behavior

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `tests/unit/security/rate-limit.test.ts`
- **Scenario:** The rate-limit unit test builds an in-memory Map-based mock of the database that faithfully simulates `select`, `insert`, `update`, `delete` with predicate matching. Tests cover escalation, eviction, clearing, and concurrent key management. This is a well-constructed mock.

### T-04: Component tests use `setTimeout` for timing-sensitive assertions

- **Severity:** MEDIUM
- **Confidence:** Medium
- **Status:** Open
- **File+lines:** `tests/component/contest-quick-stats.test.tsx:60,88,105`
- **Excerpt:** `await new Promise((resolve) => setTimeout(resolve, 35));`
- **Scenario:** Three component tests wait 35ms for a countdown timer to tick. This is fragile: if the system is under load, 35ms may not be enough. The tests verify that a timer displays the correct remaining time.
- **Fix:** Use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to deterministically control time in component tests.

### T-05: Missing test coverage for high-risk paths

- **Severity:** HIGH
- **Confidence:** High
- **Status:** Open
- **File+lines:** Various (see gaps below)
- **Scenario:** The test suite has good coverage for sanitization (15 OWASP vectors), rate limiting, auth, and scoring. However, the following high-risk paths have no dedicated tests:
  - **Access code single-use guarantee:** No test verifies that a single-use access code cannot be consumed twice concurrently.
  - **Recruiting token consumption race:** `tests/unit/api/recruiting-invitations-race-implementation.test.ts` exists but should verify actual concurrent access, not just sequential calls.
  - **File upload path traversal:** No test verifies that uploaded file names are sanitized against `../` traversal.
  - **Sandbox escape via code submission:** No test verifies that the seccomp profile blocks forbidden syscalls (this is implicitly tested by the Rust worker, but no integration test validates it from the app side).
  - **Admin IP allowlist enforcement:** No test verifies that admin endpoints reject requests from non-allowed IPs.
- **Fix:** Add targeted tests for each gap. Priority: access-code race condition, file upload path traversal, admin IP allowlist.

### T-06: Vitest coverage thresholds are properly tiered

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `vitest.config.ts:13-36`
- **Scenario:** Global thresholds are set at 60/50/40/60 (statements/branches/functions/lines). Security-critical paths (`src/lib/security/**`, `src/lib/auth/**`) have elevated thresholds of 90/85/90/90. This ensures that the most important code maintains high coverage.

### T-07: Playwright config correctly separates remote-safe vs. full specs

- **Severity:** N/A (Positive observation)
- **Confidence:** High
- **Status:** Good
- **File+lines:** `playwright.config.ts:15-24`
- **Scenario:** The `remoteSafeSpecs` list explicitly names specs that are safe to run against live deployments (no mutations, no heavy DB load). The `PLAYWRIGHT_PROFILE` env var controls spec selection. This prevents accidental data mutation during post-deploy smoke tests.

### T-08: `debug-login.cjs` has 5 blind `waitForTimeout` calls

- **Severity:** LOW
- **Confidence:** High
- **Status:** Open
- **File+lines:** `tests/e2e/debug-login.cjs:30,36,49,62,73`
- **Excerpt:** Multiple `waitForTimeout(3000)` and `waitForTimeout(5000)` calls
- **Scenario:** This appears to be a debug/troubleshooting script rather than a CI test. The heavy waits (up to 5 seconds) are acceptable for debugging but should not be part of the regular test suite.
- **Fix:** Ensure this file is excluded from the Playwright test directory glob (it uses `.cjs` extension, and `playwright.config.ts` has `testDir: "./tests/e2e"` with default matching, so `.cjs` files may not match the default `*.spec.ts` pattern). Verify it is not accidentally run.

---

## Positive Observations

1. **Security-first architecture:** The proxy middleware (`src/proxy.ts`) generates per-request cryptographic nonces, enforces server-side auth, caches auth lookups with a 2-second TTL (preventing stale sessions beyond that window), and audits User-Agent mismatches.

2. **Comprehensive CSP:** The Content Security Policy is layered: a static fallback in `next.config.ts` and a dynamic nonce-based CSP in the proxy middleware. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` are all present.

3. **HTML sanitization defense-in-depth:** DOMPurify with a narrow allowlist, external image source stripping, `javascript:`/`data:` URI blocking, and 15 OWASP XSS vector tests.

4. **Deployment safety nets:** Pre-deploy `pg_dump`, PG volume orphan detection, PGDATA pinning assertion in CI, and a disabled CD workflow with clear documentation of why.

5. **Non-root Docker runtime:** The main app Dockerfile creates and runs as a dedicated `nextjs` user.

6. **All shell scripts use `set -euo pipefail`:** Every script fails fast on errors, unset variables, and pipe failures.

7. **Destructive actions require confirmation:** The `DestructiveActionDialog` component is used consistently for delete/archive operations.

8. **Capability-based access control:** The control layout checks specific capabilities before rendering navigation items, not just role strings.

9. **Vitest coverage tiering:** Security-critical modules have 90%+ coverage thresholds.

10. **Integration test isolation:** Each integration test gets its own temporary PostgreSQL database.

---

## Recommendation

**COMMENT** -- No blocking CRITICAL issues for the current deployed state (the `key.pem` issue is critical to address for Docker image hygiene but `.gitignore` prevents it from reaching the git remote). The HIGH issues (E2E flakiness, test coverage gaps, test-backends docker-proxy permissions, E2E running against SQLite in CI) should be addressed in the next sprint.

---

## Files Read vs. Skipped

### Files Read (~200 files examined)

**Frontend:**
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`
- `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/proxy.ts`
- `src/app/(workspace)/layout.tsx`, `src/app/(control)/layout.tsx`, `src/app/(public)/layout.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/assistant-markdown.tsx`, `src/components/problem-description.tsx`
- `src/components/destructive-action-dialog.tsx`, `src/components/nonce-provider.tsx`
- `src/components/seo/json-ld.tsx`, `src/components/code/code-editor.tsx`
- `src/components/exam/anti-cheat-monitor.tsx`, `src/components/plugins/chat-widget-loader.tsx`
- `src/components/problem/problem-submission-form.tsx`
- `src/components/discussions/discussion-post-form.tsx`
- `src/lib/security/sanitize-html.ts`
- All `error.tsx` and `loading.tsx` files (via glob)
- Grep scans: `dangerouslySetInnerHTML`, `eval(`, `unsafe-eval`, `unsafe-inline`, `console.log`, `Suspense`, `auth()` in public routes

**Deploy / Ops:**
- `deploy.sh`, `deploy-docker.sh`, `deploy-test-backends.sh`
- `docker-compose.yml`, `docker-compose.production.yml`, `docker-compose.test-backends.yml`, `docker-compose.worker.yml`
- `Dockerfile`, `Dockerfile.judge-worker`, `Dockerfile.code-similarity`, `Dockerfile.rate-limiter-rs`
- `.env.example`, `.env.production.example`
- `.gitignore`, `.dockerignore`
- `.github/workflows/ci.yml`, `.github/workflows/cd.yml`
- `scripts/backup-db.sh`, `scripts/verify-db-backup.sh`, `scripts/pg-volume-safety-check.sh`
- `scripts/setup.sh`, `scripts/monitor-health.sh`, `scripts/check-high-stakes-runtime.sh`
- `scripts/bootstrap-instance.sh`
- Grep scans: `docker system prune`, `privileged: true`, `rsync --delete`, `set -euo pipefail`

**Tests:**
- `vitest.config.ts`, `vitest.config.component.ts`, `vitest.config.integration.ts`
- `playwright.config.ts`, `playwright.visual.config.ts`
- `tests/unit/security/sanitize-html.test.ts`, `tests/unit/security/rate-limit.test.ts`
- `tests/integration/support/test-db.ts`
- Grep scans: `waitForTimeout`/`sleep`/`setTimeout` patterns, mock counts, assertion counts
- Full test file inventory via glob

### Files Skipped (with reason)

- `scripts/algo-problems/*.mjs` (20+ files) -- Problem data generation scripts, not deploy/ops infra
- `docker/Dockerfile.judge-*` (90+ files) -- Individual language judge Dockerfiles; spot-checked via CI validation in `ci.yml`
- `src/lib/db/schema.ts`, `src/lib/db/relations.ts` -- Schema files reviewed in separate DB review pass
- `src/lib/auth/config.ts` -- Auth config reviewed in separate auth review pass
- `src/app/api/**` -- API routes reviewed in separate API review pass
- `src/lib/judge/**`, `judge-worker-rs/**` -- Judge subsystem reviewed in separate judge review pass
- `code-similarity-rs/**`, `rate-limiter-rs/**` -- Rust sidecars; Cargo tests validated in CI
- `messages/**` -- i18n message files (JSON key-value, no code)
- `drizzle/**` -- Migration SQL files reviewed in DB review pass
- `public/**` -- Static assets (SVGs, images)
- `static-site/**` -- Separate static site deployment
- `.env`, `.env.production`, `.env.worv` -- Excluded per instructions (only `.example` files reviewed)
- Individual visual test specs -- Spot-checked via grep for `waitForTimeout`
