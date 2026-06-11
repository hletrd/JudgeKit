# Cycle 4 RPF review remediation (2026-06-11)

**Date:** 2026-06-11
**Cycle:** 4/100 of this RPF loop (orchestrator-numbered)
**HEAD at review:** 7c0a4bd4 (main) — cycle-3's completed tree, deployed
healthy on all three targets at 566e54dc.
**Aggregate:** `.context/reviews/_aggregate.md` (cycle-4; 11 specialist + 6
persona lenses; cycle-3 lens files archived to
`.context/reviews/_archive/cycle-3-2026-06-11/`).
**Baseline gates on review HEAD:** tsc 0 · eslint 0/0 · lint:bash clean ·
unit 336 files / 2597 tests PASS.
**Highest-severity item:** AGG4-1 (MEDIUM-HIGH, 15-lens agreement).

Status legend: ✅ done+pushed · 🔧 in progress · ⬜ todo · 🟡 needs decision

---

## Implement this cycle

### G1 ⬜ AGG4-7 + AGG4-2 — Extract CLIENT_EVENT_TYPES to lib; freshness probe must ignore server-inserted event types (MEDIUM, High, CONFIRMED)
- New `src/lib/anti-cheat/client-events.ts` exporting the canonical
  `CLIENT_EVENT_TYPES` tuple (tab_switch/copy/paste/blur/contextmenu/
  heartbeat); `anti-cheat/route.ts` imports it (route may depend on lib,
  never the reverse — A4-2); route keeps its zod schema behavior identical.
- `validateAssignmentSubmission` freshness probe
  (`src/lib/assignments/submissions.ts:320-330`): add
  `inArray(antiCheatEvents.eventType, CLIENT_EVENT_TYPES)` so
  `submission_stale_heartbeat` (self-suppression, SEC4-2/D4-2) and
  `code_similarity` rows no longer count as browser liveness.
- Update the source-pin test
  `tests/unit/api/anti-cheat-public-event-types.test.ts` to pin the lib
  module + assert the route imports it (TE4-4; structural pin update is the
  root-cause-respecting change, recorded here per gate rules).
- Red-first test (TE4-1 case 3): only a recent server-inserted row present →
  probe is stale → flag (on the submit path).

### G2 ⬜ AGG4-1 + AGG4-6 — Stale-heartbeat flag must be recorded ONLY by the submit path (MEDIUM-HIGH, High, CONFIRMED; 15-lens agreement)
- `validateAssignmentSubmission` gains
  `options?: { recordStaleHeartbeatFlag?: boolean }` (default FALSE — the
  side effect becomes explicit opt-in so future callers cannot silently
  inherit it; A4-1). Freshness probe + flag insert run only when opted in.
- `src/app/api/v1/submissions/route.ts:264` passes
  `{ recordStaleHeartbeatFlag: true }`. Page render
  (`practice/problems/[id]/page.tsx:167`) and autosave
  (`code-snapshots/route.ts:62`) keep default (validate-only, no writes).
- Red-first tests (TE4-1): (1) submit path + stale → flag inserted once with
  expected values; (2) submit path + fresh client event → no insert;
  (3) default options + stale → validation OK, NO insert; (4) flag-insert
  rejection → submission still validates (fail-open pin).
- Docs in the same series (AGG4-6): `docs/exam-integrity-model.md` gains the
  sentence that ONLY the submit path records the flag (autosaves/page loads
  never do); fix the `review-model.ts:12-15` comment wording. Lands AFTER the
  code change so the doc describes the fixed system (V4-2/V4-3 become true).

### G3 ⬜ AGG4-3 — Serialize the client pending-events queue (LOW-MEDIUM, Medium, LIKELY)
`src/components/exam/anti-cheat-monitor.tsx`: replace the load-all/send-all/
save-remaining flush (`:90-105`) with a per-event claim loop (synchronously
load → save queue-minus-claimed → send → on "retry" re-load+re-append with
retries+1) plus an `isFlushingRef` guard so overlapping flush triggers
(mount/refocus/online) cannot double-send; `reportEvent`'s append remains a
synchronous load-push-save and is now never clobbered (claims happen in sync
blocks). Component test (TE4-3): event appended mid-flush is not lost and
nothing is sent twice; existing tri-state tests stay green.

### G4 ⬜ AGG4-4 — Honest error for the exam-session re-fetch race (LOW, High, CONFIRMED)
`src/lib/assignments/exam-sessions.ts:108-110`: throw
`examSessionUnavailable` instead of `assignmentClosed`; check the
start-exam route/action error mapping so the new key falls through to the
retryable generic failure (NOT a false "closed" verdict at exam start —
ST4-3). Unit test pins the distinct error.

---

## Deferred register (cycle-4) — findings NOT implemented this cycle
Severity preserved; no security/correctness/data-loss finding is deferred
(AGG4-1/2/3/4/6/7 are all scheduled above).

| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| AGG4-5 | Anti-cheat GET monitoring-read cost: unconditional `count(*)` per poll (`anti-cheat/route.ts:283-286`) + per-user heartbeat-gap scan of up to 5000 rows with no time-window param (`:296-325`) | LOW/Medium (RISK) | Read-path only, fully indexed, no observed incident at current scale; a window parameter touches the dashboard UI contract and deserves its own design pass | First live contest ≥100 seats showing dashboard latency; or the next cycle that edits the anti-cheat GET |

### Carried from cycle-3 (exit criteria re-checked this cycle; none fired)
| ID | Finding (file+line) | Sev/Conf | Reason for deferral | Exit criterion |
|---|---|---|---|---|
| AGG3-7 | `deploy-docker.sh` `run_remote_build`: retry `tee`s into the same `$out_file`, overwriting the first failure log (forensics only) | LOW/Medium | Unchanged: deploy script not edited this cycle | Next cycle that edits `run_remote_build` adds `${out_file}.retry`; or an incident where the first log was needed |
| DES3-1 | `exam-deadline-sync.tsx:107` — expired→active transition announced politely, not assertively | LOW(cosmetic)/Medium | a11y polish needing UX judgement; role=status note is compliant | Bundle with the next exam-page a11y pass |
| TA3-1-followup | Render `exam_session.extend` audit events in the participant timeline (now also bundle DES4-4: contest-list status label says "closed" for extended participants) | LOW(product)/High | New feature surface, not a defect fix | Owner schedules timeline enrichment; bundle with TA2 |
| JA-clarity | No pre-test language-availability preview for candidates | LOW/Medium | Product decision carried, unchanged | Owner decision on candidate-facing test-info page |

### CARRY register (re-materialized verbatim per the RPF plan convention; origin cycle-1/2/3 plans)
| ID | Item | Status |
|---|---|---|
| C3-AGG-5 | deploy-docker.sh SSH-helpers extraction — trigger TRIPPED (re-measured 1433 lines this cycle). Any cycle touching SSH/remote-exec plumbing must extract first | unchanged |
| IN2-2 | Pre-start accommodations / per-student duration overrides (product decision; workaround: extend after start) | owner decision pending |
| DEFER-ENV-GATES | E2E for login-gated/user-facing features (incl. G5-E2E deadline-sync, DES-ENV browser a11y audit) — no provisioned test server/browser from this env | provisioned staging server |
| D1, D3, D4, CR2/P2, P3, T4, IN3/JA2, TA1, TA2, TR2, TH1, ST2, PS2, ARCH-CARRY-1/2, DOC-C5-2, C7-DS-1, N7-C7, C7-AGG-9, AGG2-8a | As recorded at origin (cycle-1 register, severities preserved there) | unchanged preconditions |

Deferred work remains bound by repo policy when picked up (GPG-signed
conventional+gitmoji commits, no `--no-verify`, no force-push, tests per
AGENTS.md).

## Plan archival done in this planning pass
- `plans/open/2026-06-11-cycle-3-rpf-review-remediation.md` → `plans/done/`
  (G1–G6 all ✅ done+pushed; deploy exit criterion met and recorded in its
  completion section; its deferred rows re-materialized into the registers
  above).
- Standing plans (`2026-04-14-master-review-backlog.md`, `2026-04-17-*`,
  `2026-05-*` lanes) remain open — not cycle-scoped.

## Recommended sequence
1. G1 (extraction + probe filter; red-first) → G2 (flag opt-in + docs; the
   cycle's principal fix — depends on G1's lib module for its tests).
2. G3 (client queue serialization) → G4 (error key).
Gates after each item; fine-grained signed commits; pull --rebase + push per
iteration; then DEPLOY_CMD (per-cycle mode, detached + polled in-turn).

---

## Completion record
(to be filled as items land)
