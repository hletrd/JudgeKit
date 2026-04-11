# Master review backlog — deduped from open reviews

## Source reviews
- `.context/reviews/comprehensive-code-review-2026-04-09.md`
- `.context/reviews/comprehensive-review-2026-04-09.md`
- `.context/reviews/comprehensive-code-review-2026-04-10.md`

## Planning rule
Treat every item below as **needs revalidation against `HEAD` before code changes**. These reviews were written at different points in time, and some findings may already be partially fixed.

## Missing tasks still worth planning

### 1. Transactionality and TOCTOU cleanup
**Why first:** this is the biggest repeated theme across the open reviews.

**Findings feeding this track**
- 2026-04-10: C-01, H-01, H-02, H-03, H-04, H-06, M-06, M-10, M-11
- 2026-04-09 comprehensive review: NEW-C03, OPEN-C01, NEW-H01..NEW-H18 (especially invite/role/member/user/judge lifecycles)
- 2026-04-09 code review: items 10 and 13 (email identity + partial import behavior)

**Representative files**
- `src/app/api/v1/users/[id]/route.ts`
- `src/app/api/v1/users/bulk/route.ts`
- `src/app/api/v1/judge/{claim,deregister,poll}/route.ts`
- `src/lib/security/{rate-limit,api-rate-limit}.ts`
- `src/lib/tags/*`, assignment/group/member routes

**Planned output**
- move check-then-act flows into single transactions / locks
- add regression tests for concurrent uniqueness, rate-limit, invite/member, and judge-claim flows

### 2. Import/export and schema-truth hardening
**Why next:** multiple reviews still question whether DB import/export is correct, atomic, and aligned with schema/migrations.

**Findings feeding this track**
- 2026-04-10: C-04, C-05, C-06, H-07, H-08, H-09, H-10, M-21
- 2026-04-09 code review: items 1, 7, 13, 14
- 2026-04-09 comprehensive review: NEW-M10, NEW-M11

**Representative files**
- `src/lib/db/import.ts`
- `src/lib/db/export.ts`
- `src/lib/db/schema.pg.ts`
- `src/lib/db/relations.ts`
- `drizzle/pg/*`
- admin backup/restore/migrate routes

**Planned output**
- make import behavior transactionally honest
- align import column coercion sets with schema metadata
- close schema-vs-SQL drift
- add import/export regression coverage for partial failures and migration edges

### 3. Authorization, secret disclosure, and dangerous fallback removal
**Why next:** several reviews still flag routes that rely on brittle text matching, secret redisclosure, or stale built-in-role checks.

**Findings feeding this track**
- 2026-04-09 code review: items 3, 4, 5, 6
- 2026-04-09 comprehensive review: OPEN-C02, NEW-C01, NEW-H07, OPEN-H02, OPEN-H03, OPEN-M03
- 2026-04-10: M-07

**Representative files**
- `src/app/api/v1/files/[id]/route.ts`
- `src/components/problem-description.tsx`
- admin API-key / bulk-user surfaces
- capability-aware routes still using built-in-role guards
- docker image admin routes

**Planned output**
- replace description-`LIKE` authorization with explicit relations
- remove or quarantine legacy HTML rendering/XSS path
- stop secret redisclosure flows (API keys, generated passwords)
- finish custom-role consistency sweep on routes and actions

**Progress**
- ✅ Explicit file authorization has been moved off description-text scanning for the live `GET /api/v1/files/[id]` path; remaining work in this track is legacy HTML handling, secret redisclosure cleanup, and custom-role consistency.

### 4. Judge/worker runtime correctness
**Why next:** the latest code review still has critical worker/runtime findings that can corrupt verdicts or mis-measure execution.

**Findings feeding this track**
- 2026-04-10: C-01, C-02, C-03, H-13, M-12, M-14, M-15, M-18
- 2026-04-09 comprehensive review: NEW-H09, NEW-H10, NEW-H11, NEW-H12, OPEN-H01

**Representative files**
- `judge-worker-rs/src/{docker,executor,runner}.rs`
- `src/lib/compiler/execute.ts`
- judge routes around claim/poll/deregister/rejudge

**Planned output**
- correct lifecycle/status filters
- parse full timestamps
- close seccomp retry bug
- validate path/command/image inputs consistently
- regression tests around claim, rejudge, and timing boundaries

### 5. Client/UI correctness and long-tail request-path cleanup
**Why later:** important, but lower blast radius than integrity/security work.

**Findings feeding this track**
- 2026-04-10: H-11, H-14, H-15, M-16, M-17, M-19, M-20
- 2026-04-09 code review: item 2 (group pagination), item 8 (Edge/Node imports), item 9 (`eval`), item 15 (similarity fallback parsing)
- 2026-04-09 comprehensive review: NEW-M14..NEW-M19

**Representative files**
- client hooks/components around polling, code snapshots, fallback language, group pages
- `scripts/setup.sh`
- edge-reachable shared modules
- similarity parsing helpers

**Planned output**
- reduce hydration/render hazards
- make long lists paginated by contract
- remove `eval` from setup wizard
- move blocking sync I/O off request paths where practical

### 6. Ops/testing/documentation truth
**Why last:** some items may be documentation-only, but they still need explicit closure so the backlog doesn't linger.

**Findings feeding this track**
- 2026-04-09 code review: items 1, 11, 12
- 2026-04-10: H-16 and low-summary bucket
- 2026-04-09 comprehensive review: various docs/runtime truth findings

**Representative files**
- `README.md`, `docs/*`, `AGENTS.md`
- deploy/setup scripts
- `rate-limiter-rs` tests
- multi-instance/SSE guardrails

**Planned output**
- make runtime support claims match reality
- add missing sidecar tests
- document or enforce unsupported multi-replica behavior

## Recommended execution order
1. Transactionality / TOCTOU
2. Import/export + schema truth
3. Authorization / secret disclosure
4. Judge/worker runtime correctness
5. Client/UI correctness
6. Ops/testing/docs

## Shared verification bar for every execution phase
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for touched routes/components/hooks
- relevant Rust tests when touching `judge-worker-rs/`
- schema/migration checks when touching `src/lib/db/**` or `drizzle/pg/**`
