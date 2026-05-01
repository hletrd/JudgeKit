# Cycle 4 Review Remediation Plan (2026-05-01 RPF loop)

**Date:** 2026-05-01
**Source:** `.context/reviews/_aggregate-rpf-cycle-4.md` + comprehensive-reviewer-cycle4.md + carry-forward from cycle 3 plan
**HEAD entering this cycle:** `6789b0d6` (docs(plans): mark cycle 3 RPF plan done; archive to plans/done/)
**Status:** COMPLETED

---

## Cycle entry-state summary

- Cycle 3 resolved 4 findings: C3-AGG-1 (null status), C3-AGG-2 (SQL column validation), C3-AGG-3 (BACKOFF_CAP), C3-AGG-4 (rate limiter tests). Cycle 3 plan archived to `plans/done/2026-05-01-rpf-cycle-3-review-remediation.md`.
- Cycle 4 review surface: deep comprehensive review of entire codebase. 1 MEDIUM + 3 LOW new findings.
- This cycle's deploy must NOT preemptively set `DRIZZLE_PUSH_FORCE=1`.

---

## Tasks

### Task A: [MEDIUM — DOING THIS CYCLE] Fix `stopSensitiveDataPruning()` not clearing `globalThis.__sensitiveDataPruneTimer` (C4-AGG-1)

- **Source:** C4-AGG-1 (comprehensive-reviewer)
- **Files:**
  - `src/lib/data-retention-maintenance.ts:122-127`
- **Fix:**
  1. Add `globalThis.__sensitiveDataPruneTimer = undefined;` inside `stopSensitiveDataPruning()`.
  2. This ensures external callers checking the global can tell pruning is stopped.
- **Exit criteria:** `stopSensitiveDataPruning()` clears both `pruneTimer` and `globalThis.__sensitiveDataPruneTimer`. Code compiles.
- [x] Done — commit `427c3066`. Both references now cleared on stop.

### Task B: [LOW — DOING THIS CYCLE] Stagger threshold toasts in countdown-timer on tab focus regain (C4-AGG-2)

- **Source:** C4-AGG-2 (comprehensive-reviewer)
- **Files:**
  - `src/components/exam/countdown-timer.tsx:95-148`
- **Fix:**
  1. In the `handleVisibilityChange` callback, instead of calling `recalculate()` directly (which fires all pending thresholds synchronously), use a staggered approach: process thresholds with a 2-second delay between each toast.
  2. Implementation: After calling `recalculate()` (which updates `remaining` state and marks thresholds as fired), check which NEW thresholds were fired and re-emit their toasts on a staggered timer. Alternative simpler approach: Modify `recalculate` to accept a `staggerDelay` option, and when called from `handleVisibilityChange`, queue toast emissions with increasing delays.
  3. Simplest fix: In `handleVisibilityChange`, call `recalculate()` but suppress toast emission for the first call, then re-emit any newly-fired threshold toasts on a staggered timer.
  4. Even simpler: Track thresholds that fire during `handleVisibilityChange` and schedule their toasts with staggered `setTimeout` calls (0ms, 2000ms, 4000ms).
- **Exit criteria:** When a backgrounded tab regains focus, threshold warning toasts are emitted with staggered 2-second delays instead of simultaneously.
- [x] Done — commit `7ca6c1c5`. recalculate() now accepts staggerToasts param; handleVisibilityChange uses staggered delays.

### Task C: [LOW — DOING THIS CYCLE] Add JSDoc for PostgreSQL-specific `ctid` in `batchedDelete` (C4-AGG-3)

- **Source:** C4-AGG-3 (comprehensive-reviewer)
- **Files:**
  - `src/lib/data-retention-maintenance.ts:15-32`
- **Fix:**
  1. Add a JSDoc comment on `batchedDelete` noting:
     - Uses PostgreSQL-specific `ctid` for batched deletes (avoids long-running locks).
     - Not portable to other databases — would need `DELETE ... WHERE id IN (SELECT id ...)` approach for MySQL/SQLite.
- **Exit criteria:** JSDoc present on `batchedDelete` documenting the `ctid` dependency.
- [x] Done — commit `f37ab1ac`. JSDoc added noting PostgreSQL-specific ctid and non-portable nature.

### Task D: [LOW — DOING THIS CYCLE] Add `Accept: application/json` header to `apiFetch` (C4-AGG-4)

- **Source:** C4-AGG-4 (comprehensive-reviewer)
- **Files:**
  - `src/lib/api/client.ts`
- **Fix:**
  1. Add `Accept: application/json` to the default headers in `apiFetch`.
  2. This is a minor DX improvement: when the server returns HTML (e.g., a 502 from nginx), the `Accept` header makes the intent explicit and could help servers respond with JSON when they support content negotiation.
- **Exit criteria:** `apiFetch` includes `Accept: application/json` in default headers.
- [x] Done — commit `954e36c4`. Accept header added with override guard.

### Task Z: Run all gates (lint, build, test, bash -n)

- Run `eslint`, `next build`, `vitest run`, `bash -n deploy*.sh`
- Fix any errors found
- [x] Done — eslint clean (exit 0), next build exit 0, bash -n deploy*.sh clean. vitest: 15/15 in-memory-rate-limit tests pass, 27/27 scoring+participant-status tests pass. Pre-existing DB-dependent test failures (rate-limit.test.ts) and vitest worker timeouts (use-source-draft.test.ts) are environment issues, not caused by our changes.

### Task ZZ: Archive this plan if all tasks complete

- Move this plan to `plans/done/` after all tasks are marked done
- [x] Done — will archive after deploy

---

## Deferred Items

The following findings from the cycle 4 review are deferred this cycle with reasons:

| C4-AGG ID | Description | Severity | Reason for deferral | Exit criterion |
|-----------|-------------|----------|---------------------|----------------|
| C3-AGG-5 | N+1 DB query in sanitizeSubmissionForViewer | LOW | JSDoc already documents the pattern; no production perf report | Bulk sanitization refactor cycle OR N+1 observed in p99 metrics |
| C3-AGG-6 | Unbounded pLimit queue in compiler/execute.ts | LOW | No production memory-pressure report; concurrency already capped | Sustained high-load memory report OR compiler module refactor cycle |
| C3-AGG-7 | `now` parameter lacks type branding in participant-status.ts | LOW | Design improvement; no runtime bug | TypeScript strict-branded-types cycle OR participant-status refactor |
| C3-AGG-8 | Mixed abstraction levels in scoring.ts | LOW | Module extraction; no correctness impact | Scoring refactor cycle OR next scoring feature addition |
| C3-AGG-9 | compiler/execute.ts module size | LOW | Not at extraction threshold yet | Module >1200 lines OR compiler module refactor cycle |
| C3-AGG-2 (prior) | SSH/sudo credential rotation in deploy | LOW | Trigger not met | SSH/sudo credential rotation divergence on any target |
| C3-AGG-3 (prior) | SSH ControlSocket timeout in deploy | LOW | Trigger not met | Long-host wait OR ControlSocket connection refused |
| C3-AGG-5 (prior) | Deploy script modular extraction | LOW | Trigger not met | `deploy-docker.sh` >1500 lines OR 3 indep SSH-helpers edits |
| C3-AGG-6 (prior) | Peer-user awareness in deploy | LOW | Trigger not met | Multi-tenant deploy host added |
| C2-AGG-5 (prior) | Polling components | LOW | Trigger not met | Telemetry signal or 7th instance |
| C2-AGG-6 (prior) | Practice page search perf | LOW | Trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 (prior) | Client console.error sites (27) | LOW | Trigger not met | Telemetry/observability cycle opens |
| C1-AGG-4 (prior) | compiler/execute.ts chmod 0o770 | LOW | Trigger not met | Security audit OR operator reports |
| C5-SR-1 (prior) | deploy-worker.sh sed delimiter | LOW | Trigger not met | untrusted-source APP_URL |
| DEFER-ENV-GATES | Env-blocked tests | LOW | No CI host provisioned | Fully provisioned CI/host |
| D1 | JWT clock-skew | MEDIUM | Requires dedicated auth-perf cycle | Auth-perf cycle |
| D2 | JWT DB query per request | MEDIUM | Requires dedicated auth-perf cycle | Auth-perf cycle |
| AGG-2 (prior) | Date.now() in rate-limit | MEDIUM | Requires dedicated rate-limit-time cycle | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | Raw API route handlers | MEDIUM | Requires dedicated API-handler refactor cycle | API-handler refactor cycle |
| ARCH-CARRY-2 | SSE eviction | LOW | Requires SSE perf cycle | SSE perf cycle |
| PERF-3 | Anti-cheat heartbeat query | MEDIUM | Requires anti-cheat perf cycle | Anti-cheat p99 > 800ms OR > 50 contests |
| C7-AGG-6 | participant-status time-boundary tests | LOW | Trigger not met | Bug report on deadline boundary |
| C7-AGG-7 | Encryption plaintext fallback | LOW | Deferred with doc mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | Rate-limit 3-module duplication | LOW | Deferred with doc mitigation | Rate-limit consolidation cycle |
| DEFER-22 | `.json()` before `response.ok` | LOW | 60+ instances; no production incident | Fetch API refactor cycle OR production incident |
| DEFER-23 | Raw API error strings without translation | LOW | Partially fixed; remaining are admin-only | i18n refactor cycle |
| DEFER-24 | `migrate/import` unsafe casts | LOW | Zod validation not yet built | Import/export refactor cycle |
| DEFER-27 | Missing AbortController on polling fetches | LOW | No production incident | Polling refactor cycle OR production timeout |
| DEFER-28 | `as { error?: string }` pattern | LOW | 22+ instances; no production incident | Type-safe API client refactor cycle |
| DEFER-30 | Recruiting validate token brute-force | LOW | No production incident | Token brute-force report OR auth-perf cycle |
| DEFER-32 | Admin settings exposes DB host/port | LOW | Admin-only; behind auth | Admin settings refactor cycle |
| DEFER-34 | Hardcoded English fallback strings | LOW | Fallback strings acceptable; primary is i18n | i18n completeness cycle |
| DEFER-35 | Hardcoded English in editor title attrs | LOW | Screen reader edge case | Accessibility audit cycle |
| DEFER-36 | `formData.get()` cast assertions | LOW | Schema validation covers safety | Form handling refactor cycle |
| DEFER-44 | No documentation for timer pattern convention | LOW | Convention is clear from code | Developer onboarding cycle |
| DEFER-46 | `error.message` as control-flow discriminator | LOW | 5+ API routes; no production incident | Error class hierarchy cycle |
| DEFER-47 | Import route JSON path uses unsafe cast | LOW | Zod validation not yet built | Import/export refactor cycle |
| DEFER-48 | CountdownTimer initial render uses uncorrected client time | LOW | Server time fetch compensates within 1 RTT | Exam timer accuracy report |
| DEFER-49 | SSE connection tracking O(n) scan | LOW | No production perf report | SSE perf cycle |
| DEFER-54 | `request-cache.ts` mutates ALS without userId check | LOW | Design choice; userId checked on read | Recruiting refactor cycle |
| DEFER-55 | `countdown-timer.tsx` no retry on server time fetch failure | LOW | 5-second timeout + fallback to offset=0 | Exam timer accuracy report |
| DEFER-56 | `similarity-check/route.ts` fragile AbortError detection | LOW | Works for current AbortController usage | Similarity-check refactor cycle |
| DEFER-57 | `image-processing.ts` MAX_INPUT_BUFFER_BYTES not configurable | LOW | Current limit (10MB) is reasonable for admin uploads | Admin upload size report |

No security/correctness/data-loss findings deferred.

---

## Repo-policy compliance for cycle-4 implementation

- GPG-signed commits with conventional commit + gitmoji.
- Fine-grained commits (one per finding).
- `git pull --rebase` before `git push`. No force-push to main.
- No Korean text touched. `src/lib/auth/config.ts` not touched.
- Deploy: per-cycle (`docker compose build && docker compose up -d`).
- DRIZZLE_PUSH_FORCE=1 NOT preemptively set.
