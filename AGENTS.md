# JudgeKit — Agent Guide

## Project Overview

JudgeKit is a secure online judge platform for programming assignments. Next.js 16 frontend + API, Rust judge worker, Docker-sandboxed execution, SQLite database.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/` | Next.js app (App Router), components, lib, types |
| `judge-worker-rs/` | Rust judge worker (production) |
| `docker/` | Judge language Dockerfiles + seccomp profile |
| `scripts/` | Systemd services, deploy helpers, backup tools |
| `tests/` | Playwright E2E tests |
| `data/` | SQLite database (gitignored) |

## Adding a New Language

1. Add to `Language` union in `src/types/index.ts`
2. Add config in `src/lib/judge/languages.ts` (toolchain version, Docker image info, compile/run commands)
3. Add Rust enum variant in `judge-worker-rs/src/types.rs`
4. Add Rust config + match arm + test entry in `judge-worker-rs/src/languages.rs`
5. Create `docker/Dockerfile.judge-<name>`
6. Add A+B test solution in `tests/e2e/all-languages-judge.spec.ts`
7. Run `npm run languages:sync` to sync to database

## Build & Verify

```bash
npx tsc --noEmit                              # TypeScript check
npx vitest run                                # Unit tests
npx vitest run --config vitest.config.integration.ts  # Integration tests
cd judge-worker-rs && cargo test              # Rust tests
npx playwright test tests/e2e/               # E2E tests (needs PLAYWRIGHT_BASE_URL)
```

## Testing Rules (MANDATORY)

Every feature, fix, or enhancement MUST include appropriate tests. Do not merge or consider work complete without tests.

### Test Layers

| Layer | Tool | Location | When |
|-------|------|----------|------|
| **Unit** | Vitest | `tests/unit/` | Pure functions, validators, utilities, scoring logic |
| **API** | Vitest | `tests/unit/api/` | Route handlers with mocked DB/auth |
| **Integration** | Vitest | `tests/integration/` | Cross-module interactions, DB queries |
| **E2E** | Playwright | `tests/e2e/` | Full user flows against running server |

### What to Test

- **New feature**: Unit tests for logic + API tests for routes + E2E test for user flow
- **Bug fix**: Regression test that fails without the fix, passes with it
- **Refactor**: Existing tests must still pass; add tests if coverage gaps found
- **New language**: A+B solution in `tests/e2e/all-languages-judge.spec.ts` + Rust config test
- **New API route**: API test with auth/validation/happy-path/error cases
- **Validators**: Unit tests for valid/invalid inputs and edge cases
- **Scoring/contest logic**: Unit tests with known inputs and expected outputs

### Test Conventions

- Use factories from `tests/unit/support/factories.ts` for test data
- Mock external dependencies (DB, auth) in unit/API tests
- E2E tests run against the test server (`oj-internal.maum.ai`), never production
- Name test files as `<module>.test.ts` (unit/API) or `<feature>.spec.ts` (E2E)
- Group related assertions in `describe` blocks
- Test both success and error paths

### Quality Gates

- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all unit tests pass
- `cargo test` (in judge-worker-rs/) — all Rust tests pass
- E2E tests pass against test server before deploy to production

## Environment Variables (`ENV.md`)

All deployment credentials, SSH access, target hosts, and runtime secrets are documented in **`ENV.md`** (gitignored, never committed). Before any deployment, SSH, or E2E testing task, **always read `ENV.md` first** to get the correct values.

`ENV.md` contains:
- **Deployment targets** — host IPs, domains, SSH users/passwords/keys, remote directories, app ports
- **Web admin credentials** — username/password for each environment
- **E2E test credentials** — `PLAYWRIGHT_BASE_URL`, `E2E_USERNAME`, `E2E_PASSWORD`
- **SSH access commands** — ready-to-use `sshpass`/`ssh` commands for each target
- **Docker & Nginx** — container management commands, nginx config paths

## Deployment

The primary deploy script is `deploy-docker.sh`. Pass environment variables from `ENV.md`:
- `SSH_PASSWORD` — for password-based SSH auth (Target 1)
- `SSH_KEY` — for key-based SSH auth (Target 2)
- `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN` — target overrides
- `PLATFORM` — `linux/amd64` (default, Target 1) or `linux/arm64` (Target 2)

Always test against `oj-internal.maum.ai` (test), never against `oj.auraedu.me` (production).

## Conventions

- Semantic commits: `<type>(<scope>): <gitmoji> <description>`
- GPG-signed commits with gitminer (7 leading zeros)
- Fine-grained commits (one per feature/fix)
- Always `git pull --rebase` before `git push`
- Every commit MUST include relevant tests (see Testing Rules above)
