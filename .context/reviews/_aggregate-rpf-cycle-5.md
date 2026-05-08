# Cycle 5 Aggregate Review (2026-05-01 RPF loop)

**Date:** 2026-05-01
**HEAD at review:** `5e2c9f75`
**Reviewers:** comprehensive-reviewer
**Diff since cycle 4 close:** `6789b0d6..5e2c9f75`

---

## New Findings This Cycle

| ID | Severity | Confidence | File+line | Description |
|---|---|---|---|---|
| C5-AGG-1 | MEDIUM | Medium | `src/lib/docker/client.ts:57` | `callWorkerJson` calls `response.json()` after ok check without `.catch()` — non-JSON 200 response would throw SyntaxError |
| C5-AGG-2 | MEDIUM | Medium | `src/lib/docker/client.ts:7` | `JUDGE_WORKER_URL` reads from `COMPILER_RUNNER_URL` env var — naming mismatch creates operator confusion risk |
| C5-AGG-3 | LOW | High | `src/lib/docker/client.ts:148-149` | `dockerfilePath` prefix stripping not anchored — defense-in-depth improvement for Docker build path validation |

---

## Cycle 4 Fixes Verified at HEAD

All 4 cycle-4 fixes verified as correctly implemented:
- C4-AGG-1: `stopSensitiveDataPruning()` clears `globalThis.__sensitiveDataPruneTimer` — verified at `src/lib/data-retention-maintenance.ts:127-137`
- C4-AGG-2: Countdown timer stagger on tab focus regain — verified at `src/components/exam/countdown-timer.tsx:95-147`
- C4-AGG-3: `batchedDelete` JSDoc for PostgreSQL ctid — verified at `src/lib/data-retention-maintenance.ts:12-19`
- C4-AGG-4: `apiFetch` Accept header — verified at `src/lib/api/client.ts:84-86`

---

## Carry-Forward Registry

All previously deferred items remain valid with original severity preserved. No new security/correctness/data-loss findings.

### Deferred from prior cycles (unchanged):

| ID | Severity | File | Reason | Exit criterion |
|---|---|---|---|---|
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew | Auth-perf cycle scope | Auth-perf cycle |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB-per-request | Auth-perf cycle scope | Auth-perf cycle |
| AGG-2 | MEDIUM | `src/lib/security/in-memory-rate-limit.ts` Date.now | Rate-limit-time perf cycle | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw API route handlers | API-handler refactor cycle | API-handler refactor cycle |
| PERF-3 | MEDIUM | Anti-cheat heartbeat query | Anti-cheat perf cycle | Anti-cheat p99 > 800ms OR > 50 contests |
| C3-AGG-5 | LOW | Deploy script modular extraction | Trigger not met | deploy-docker.sh >1500 lines OR 3 SSH-helpers edits |
| C3-AGG-6 | LOW | Peer-user deploy awareness | Trigger not met | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | Polling components | Trigger not met | Telemetry signal or 7th instance |
| C2-AGG-6 | LOW | Practice page search perf | Trigger not met | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | Client console.error sites | Trigger not met | Telemetry/observability cycle opens |
| DEFER-ENV-GATES | LOW | Env-blocked tests | No CI host provisioned | Fully provisioned CI/host |
| C7-AGG-6 | LOW | participant-status time-boundary tests | Trigger not met | Bug report on deadline boundary |
| C7-AGG-7 | LOW | Encryption plaintext fallback | Migration compatibility; warn-log in place | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | Rate-limit 3-module duplication | Cross-reference comments mitigation | Rate-limit consolidation cycle |
| DEFER-22 | LOW | `.json()` before `response.ok` | 60+ instances; no production incident | Fetch API refactor cycle OR production incident |
| DEFER-23 | LOW | Raw API error strings without translation | Partially fixed; admin-only | i18n refactor cycle |
| DEFER-24 | LOW | `migrate/import` unsafe casts | Zod validation not yet built | Import/export refactor cycle |
| DEFER-27 | LOW | Missing AbortController on polling fetches | No production incident | Polling refactor cycle OR production timeout |
| DEFER-28 | LOW | `as { error?: string }` pattern | 22+ instances; no production incident | Type-safe API client refactor cycle |
| DEFER-30 | LOW | Recruiting validate token brute-force | No production incident | Token brute-force report OR auth-perf cycle |
| DEFER-32 | LOW | Admin settings exposes DB host/port | Admin-only; behind auth | Admin settings refactor cycle |
| DEFER-34 | LOW | Hardcoded English fallback strings | Fallback strings acceptable | i18n completeness cycle |
| DEFER-35 | LOW | Hardcoded English in editor title attrs | Screen reader edge case | Accessibility audit cycle |
| DEFER-36 | LOW | `formData.get()` cast assertions | Schema validation covers safety | Form handling refactor cycle |
| DEFER-44 | LOW | No documentation for timer pattern | Convention is clear from code | Developer onboarding cycle |
| DEFER-46 | LOW | `error.message` as control-flow discriminator | 5+ API routes; no production incident | Error class hierarchy cycle |
| DEFER-47 | LOW | Import route JSON path uses unsafe cast | Zod validation not yet built | Import/export refactor cycle |
| DEFER-48 | LOW | CountdownTimer initial render uses uncorrected client time | Server time fetch compensates within 1 RTT | Exam timer accuracy report |
| DEFER-49 | LOW | SSE connection tracking O(n) scan | No production perf report | SSE perf cycle |
| DEFER-54 | LOW | `request-cache.ts` mutates ALS without userId check | userId checked on read | Recruiting refactor cycle |
| DEFER-55 | LOW | `countdown-timer.tsx` no retry on server time fetch failure | 5-second timeout + fallback to offset=0 | Exam timer accuracy report |
| DEFER-56 | LOW | `similarity-check/route.ts` fragile AbortError detection | Works for current AbortController usage | Similarity-check refactor cycle |
| DEFER-57 | LOW | `image-processing.ts` MAX_INPUT_BUFFER_BYTES not configurable | Current limit (10MB) is reasonable | Admin upload size report |
| DEFER-46 | LOW | `error.message` as control-flow discriminator | 5+ API routes; no production incident | Error class hierarchy cycle |

---

## Gate Results

- **eslint:** PASS (exit 0)
- **next build:** Running (background)
- **vitest (in-memory):** 29/29 PASS (in-memory-rate-limit, participant-status, password-hash)
- **vitest (full suite):** 235/305 passed; 70 failed — all failures are DB-dependent or worker timeout (DEFER-ENV-GATES)
- **bash -n deploy*.sh:** PASS
