# Implementation plan — `.context/reviews/comprehensive-code-review-2026-04-10.md`

## Source review status
This is the freshest broad code review in the repo and currently has **no closure addendum**, so it is the highest-priority open review plan.

## Planning policy
Start every execution slice by revalidating the cited finding against `HEAD`; if already fixed, mark it closed in the execution log and skip implementation.

## Phase 1 — Critical data-integrity and runtime fixes
### Findings
- C-01 worker deregistration resets already-judged submissions
- C-02 seccomp retry uses `.all()` instead of `.any()`
- C-03 Docker timestamp duration breaks across midnight (Rust + TS path)
- C-04 misleading `SET CONSTRAINTS ALL DEFERRED`
- C-05 `recruitingInvitations.createdBy` delete behavior blocks user deletion
- C-06 import boolean coercion set is wrong/incomplete

### Files
- `src/app/api/v1/judge/deregister/route.ts`
- `judge-worker-rs/src/docker.rs`
- `src/lib/compiler/execute.ts`
- `src/lib/db/import.ts`
- `src/lib/db/schema.pg.ts`
- related migrations under `drizzle/pg/`

### Plan
- fix verdict-preserving status filters before any worker lifecycle cleanup
- parse full timestamps in both Rust and TS timing paths
- choose one honest import strategy: real deferrable constraints or no misleading deferral call
- derive boolean coercion and delete-behavior changes from schema truth, then add migration coverage

### Verification
- route tests for deregistration behavior
- Rust tests for seccomp retry and timestamp parsing
- import/migration tests for boolean coercion and FK/delete behavior

## Phase 2 — High-priority transactional integrity
### Findings
- H-01 user PATCH uniqueness outside transaction
- H-02 bulk user create aborts on first constraint violation
- H-03 worker deletion TOCTOU
- H-04 worker capacity accounting racy
- H-06 `recordRateLimitFailureMulti` not atomic across keys
- M-06 tag creation TOCTOU
- M-10 assignment PATCH validation split across transaction boundary
- M-11 bulk enrollment count drift

### Files
- user routes/helpers
- worker admin routes/helpers
- rate-limit helpers
- tag resolution helpers
- assignment / enrollment routes

### Plan
- move validation + mutation into one transaction per flow
- standardize partial-success behavior for bulk endpoints
- make worker capacity claim/deletion logic use the same authoritative state transitions
- add concurrency regression tests rather than only happy-path tests

## Phase 3 — Import/schema drift and metadata completeness
### Findings
- H-07 incomplete `TIMESTAMP_COLUMNS` and `JSON_COLUMNS`
- H-08 missing Drizzle relations
- H-09 schema/migration drift
- H-10 ambiguous `scoreOverrides` relations
- M-21 migrate/import JSON body may leak `password` field into import path

### Files
- `src/lib/db/{import,schema.pg,relations}.ts`
- `drizzle/pg/*`
- migrate/import routes

### Plan
- derive coercion lists from schema metadata where practical
- close all drift between `schema.pg.ts`, relations, and SQL migrations
- simplify ambiguous relation naming before more logic depends on it
- sanitize migrate/import envelope parsing before handing data to import code

## Phase 4 — Route/UI/client correctness fixes
### Findings
- H-11 plugin PATCH non-null assertion
- H-12 migrate/export JSON parse handling
- H-14 stale closure in submission event dispatch
- H-15 code snapshot timer resets on every keystroke
- M-16 background polling in `ContestQuickStats`
- M-17 test case change detection uses index mapping
- M-19 SSE cleanup leak on rapid remount
- M-20 localStorage read during render

### Files
- plugin admin route
- migrate/export route
- submission/event UI components
- code snapshot hooks
- contest stats components
- problem editor/test-case diff helpers
- fallback language hook

### Plan
- fix crash-prone null assertions and parser handling first
- then clean up closure/timer/polling/hydration bugs in a UI-focused pass
- preserve existing feature behavior with targeted component tests

## Phase 5 — Service/runtime hardening follow-ups
### Findings
- H-13 runner extension path traversal
- M-12 blocking `std::fs` in async context
- M-13 `code-similarity-rs` panic swallowing
- M-14 duplicated Docker-image validation helpers
- M-15 compile timeout calculation no-op
- M-18 empty `run_command` fall-through
- H-16 `deploy.sh` nginx heredoc issue

### Files
- `judge-worker-rs/src/{runner,docker}.rs`
- `code-similarity-rs/src/*`
- compiler runtime helpers
- `deploy.sh`

### Plan
- tighten path/command validation before runtime execution
- remove blocking or panic-swallowing behavior from services
- consolidate duplicated validators so TS/Rust policies cannot drift again
- repair deploy script quoting/expansion only after higher-risk correctness work is stable

## Acceptance criteria
- every critical finding and every still-reproducible high finding has an implementation slice and regression coverage
- schema, relations, and migrations agree with each other
- worker lifecycle operations preserve verdict integrity and correct timing data
- UI/runtime follow-up fixes stop the most obvious timers/closure/hydration regressions

## Verification targets
- `pnpm -s tsc --noEmit`
- targeted Vitest suites for routes, components, hooks, and DB helpers
- targeted Rust tests for `judge-worker-rs` and `code-similarity-rs`
- migration/schema validation when DB files change
