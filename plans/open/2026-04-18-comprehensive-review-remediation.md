# 2026-04-18 comprehensive review remediation plan

## Source
- `/.context/reviews/comprehensive-code-review-2026-04-18.md` (aggregate)
- `/.context/reviews/wip-auth-security.md`
- `/.context/reviews/wip-judge-sandbox.md`
- `/.context/reviews/wip-api-routes.md`
- `/.context/reviews/wip-db-logic.md`
- `/.context/reviews/wip-frontend-deploy-tests.md`

## Goal
Burn down every CRITICAL and HIGH finding from the 2026-04-18 review. Medium / Low findings are tracked but not blocking; each deferral must be explicitly recorded in `progress.txt`.

Every fix in this plan will be committed and pushed individually with a semantic + gitmoji message, GPG-signed. Each commit must map one-to-one to a story in `.omc/prd.json`.

## CRITICAL lane (9 stories)
| ID | Finding | File | Commit scope |
|---|---|---|---|
| CRIT-1 | Heartbeat compares plaintext `secretToken` instead of hash | `src/app/api/v1/judge/heartbeat/route.ts:45-51` | Switch to `secretTokenHash`; share helper with deregister. |
| CRIT-2 | `/test/seed` localhost gate trusts raw `X-Forwarded-For` | `src/app/api/v1/test/seed/route.ts:38-41` | Use `extractClientIp()` so spoofed headers fail. |
| CRIT-3 | `accepted-solutions` is `auth: false` and leaks source + userId | `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:12-13,77-90` | Require auth; null out `userId` when anonymous. |
| CRIT-4 | File DELETE runs CSRF before auth → breaks API-key path | `src/app/api/v1/files/[id]/route.ts:122-130` | Migrate to `createApiHandler` (or mirror POST ordering). |
| CRIT-5 | Axum runner has no request-body size limit | `judge-worker-rs/src/runner.rs`, `main.rs` | Add `DefaultBodyLimit::max(2 MiB)` layer. |
| CRIT-6 | Plaintext secret columns in DB (`secretToken`, recruiting `token`, hcaptchaSecret) | `src/lib/db/schema.pg.ts:416,517,919` | Stop persisting plaintext on insert; add migration + null-out; rename hcaptcha column. |
| CRIT-7 | `loginEvents` has no retention; audit pruning ignores legal hold | `src/lib/audit/events.ts:175`, `src/lib/data-retention-maintenance.ts` | Move audit retention into the centralized maintainer; add `pruneLoginEvents`; honor `DATA_RETENTION_LEGAL_HOLD`. |
| CRIT-8 | `code-similarity-rs` + `rate-limiter-rs` services have no auth | `code-similarity-rs/src/main.rs`, `rate-limiter-rs/src/main.rs` | Add Bearer token auth + body-size limits. |
| CRIT-9 | `key.pem` on disk leaks into Docker image layer | `/key.pem`, `.dockerignore` | Add `*.pem`/`*.key`/`*.p12`/`*.pfx` to `.dockerignore`, delete on-disk copy, document rotation. |

## HIGH lane (23 stories)
| ID | Finding | File |
|---|---|---|
| HIGH-1 | SSE terminal event bypasses assignment visibility filter | `src/app/api/v1/submissions/[id]/events/route.ts` |
| HIGH-2 | Open redirect in `getSafeRedirectUrl` (backslash, CRLF, `@`) | `src/app/(auth)/login/login-form.tsx`, signup form, `src/proxy.ts` |
| HIGH-3 | Password-change signOut→signIn race → silent lockout | `src/lib/actions/change-password.ts`, `src/app/change-password/change-password-form.tsx` |
| HIGH-4 | Heartbeat blindly overwrites `activeTasks`, defeating SQL atomic updates | `src/app/api/v1/judge/heartbeat/route.ts` |
| HIGH-5 | Scoring/status queries include non-terminal submission statuses | `src/lib/assignments/contest-scoring.ts`, `src/lib/assignments/submissions.ts` |
| HIGH-6 | Windowed exam scoring ignores per-user `personalDeadline` | `src/lib/assignments/contest-scoring.ts` |
| HIGH-7 | `communityVotesRelations` missing from Drizzle relations | `src/lib/db/relations.pg.ts` |
| HIGH-8 | seccomp still allows full socket syscall family | `docker/seccomp-profile.json` |
| HIGH-9 | TS vs Rust shell validator divergence (`&&`, `;`, `||`) | `src/lib/compiler/execute.ts`, `judge-worker-rs/src/runner.rs` |
| HIGH-10 | PATCH handlers bypass `createApiHandler` schema validation | `src/app/api/v1/problem-sets/[id]/route.ts` and siblings |
| HIGH-11 | Overrides route is raw `export async` (no handler wrapper) | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts` |
| HIGH-12 | Judge claim in-memory rate limit is per-pod | `src/app/api/v1/judge/claim/route.ts` |
| HIGH-13 | `accepted-solutions` anonymous still leaks `userId` | (covered by CRIT-3) |
| HIGH-14 | Similarity compares best-per-user across languages | `src/lib/assignments/code-similarity.ts` |
| HIGH-15 | Compile commands run via `sh -c` with DB-admin trust | (partially mitigated by HIGH-9; document trust boundary) |
| HIGH-16 | CI E2E runs on SQLite, not PostgreSQL | `.github/workflows/ci.yml` |
| HIGH-17 | test-backends docker-proxy has `BUILD=1 DELETE=1` | `docker-compose.test-backends.yml` |
| HIGH-18 | E2E `waitForTimeout` flakiness | `tests/e2e/**` |
| HIGH-19 | Missing tests: access-code race, upload traversal, admin IP allowlist, seccomp | `tests/unit/**`, `tests/integration/**` |
| HIGH-20 | `chatMessages.problemId` has no FK or index | `src/lib/db/schema.pg.ts:822` |
| HIGH-21 | `activeTasks` has no CHECK (>= 0) constraint | `src/lib/db/schema.pg.ts:419` |
| HIGH-22 | `submissions.assignmentId onDelete: set null` orphans rows | `src/lib/db/schema.pg.ts:451-452` |
| HIGH-23 | Missing composite `(submittedAt, status)` index for retention | `src/lib/db/schema.pg.ts` |

## Medium / Low lane
Tracked in `.context/reviews/comprehensive-code-review-2026-04-18.md` §3.* and §7. These do not block this plan but remain open for follow-up.

## Status ledger
| Story | Status | Commit |
|---|---|---|
| CRIT-1 | Open | — |
| CRIT-2 | Open | — |
| CRIT-3 | Open | — |
| CRIT-4 | Open | — |
| CRIT-5 | Open | — |
| CRIT-6 | Open | — |
| CRIT-7 | Open | — |
| CRIT-8 | Open | — |
| CRIT-9 | Open | — |
| HIGH-1 | Open | — |
| HIGH-2 | Open | — |
| HIGH-3 | Open | — |
| HIGH-4 | Open | — |
| HIGH-5 | Open | — |
| HIGH-6 | Open | — |
| HIGH-7 | Open | — |
| HIGH-8 | Open | — |
| HIGH-9 | Open | — |
| HIGH-10 | Open | — |
| HIGH-11 | Open | — |
| HIGH-12 | Open | — |
| HIGH-13 | Open (closed by CRIT-3) | — |
| HIGH-14 | Open | — |
| HIGH-15 | Open | — |
| HIGH-16 | Open | — |
| HIGH-17 | Open | — |
| HIGH-18 | Open | — |
| HIGH-19 | Open | — |
| HIGH-20 | Open | — |
| HIGH-21 | Open | — |
| HIGH-22 | Open | — |
| HIGH-23 | Open | — |

Each status update lands in the same commit as the fix.

## Commit style
- Semantic commit: `<type>(<scope>): <gitmoji> <subject>`
- GPG-signed via `git commit -S`
- One logical change per commit
- After each commit: `git pull --rebase origin main && git push origin main`

## Verification
- `npm run build`
- `npx tsc --noEmit`
- `npx vitest run` (full suite)
- `cargo test` in each Rust workspace (when touched)
- `lsp_diagnostics` on changed files
- Architect review once the CRITICAL + HIGH lane completes
