# Aggregate Review — RPF Cycle 11 (2026-05-16)

**Cycle:** 4/100 of this RPF loop (orchestrator-numbered)
**HEAD reviewed:** `8e10ebdd` (cycle-10 deploy confirmation commit)
**Reviewer angles covered:** code-reviewer, security-reviewer,
perf-reviewer, test-engineer, architect, critic, verifier, debugger
(single-agent comprehensive sweep — Agent fan-out unavailable in
this environment, same as cycles 30+).

---

## Total NEW findings

**0 HIGH, 0 MEDIUM, 8 LOW, 1 INFORMATIONAL.**

Working tree was clean and gates were green at start of cycle. The
cycle-10 batch landed cleanly except for a partial completion of
plan task #2 (the TS bag was trimmed but six `messages/*.json` leaves
were not deleted — see CR11-1 / CRIT11-1).

---

## NEW findings — deduplicated

| ID | Severity | Confidence | File | Summary | Status |
|---|---|---|---|---|---|
| CR11-1 / CRIT11-1 / V11-1 | LOW | HIGH | `messages/{ko,en}.json` `contests.participantAudit.problemSummary.*` | Six orphaned leaves (`bestScore`, `timeToFirstSubmission`, `timeToSolve`, `wrongBeforeAc`, `relativeTime`, `snapshots`) survive the cycle-10 trim | PLAN |
| CR11-2 | LOW | HIGH | `participant-timeline-bar.tsx:215-223` | Snapshot marker `aria-label` omits event-type word; only submission/first_ac markers include `${ev.status ?? ev.type}` | PLAN |
| CR11-3 / DBG11-2 | LOW | MEDIUM | `participant-timeline-bar.tsx:348-352` | Per-problem mini-bar `eventKey` falls back to `submission-undefined` if `submissionId` is missing; cycle-10 hardened only the top bar | PLAN |
| CR11-4 | LOW (cosmetic) | MEDIUM | `students/[userId]/page.tsx:110-120` | Local `statusColors` palette duplicates shared badge palette; not yet drift-confirmed | DEFERRED (cosmetic; extract when a third copy appears) |
| ARCH11-1 | LOW | MEDIUM | `(public)/contests/[id]/page.tsx:46-54` | `canShowParticipationView` co-located with the page, not in `lib/contests/` | PLAN (move) |
| ARCH11-2 / CRIT11-2 | LOW | HIGH | `participant-timeline-view.tsx:229-242`, `students/[userId]/page.tsx:95-108` | `TimelineTranslations` bag built independently at two call sites; export `buildParticipantTimelineTranslations(t)` | PLAN |
| TE11-1 | LOW | HIGH | `tests/component/participant-timeline-bar.test.tsx` (gap) | No test asserts `formatDuration` negative-clamp (DBG10-2 regression-protection gap) | PLAN |
| TE11-2 | LOW | MEDIUM | `(public)/contests/[id]/page.tsx:46-54` (no companion test) | `canShowParticipationView` lacks a 4-row truth-table test | PLAN (paired with ARCH11-1 move) |
| TE11-3 | LOW | LOW | i18n bag (after CR11-1 lands) | No regression test guarding deletion of the dead `problemSummary` leaves | DEFERRED (overkill for 6 strings) |
| PERF11-1 | INFO | HIGH | `participant-timeline-view.tsx:229-242`, `students/[userId]/page.tsx:95-108` | Translation-bag construction allocates 9 closures per render; SSR single-render, no-op | DEFERRED (informational) |
| DBG11-1 | LOW | MEDIUM | `participant-timeline-bar.tsx:285-287` | Score row renders `Score: 0` for `wrong_answer + score=0`; cosmetic | DEFERRED (UX decision) |
| DBG11-3 | INFO | HIGH | `participant-timeline-bar.tsx:131-136` | `new Date(date)` re-wrap when value is already a `Date` — no bug, minor allocation | DEFERRED (informational) |
| CRIT11-3 | LOW | LOW | `participant-timeline-bar.tsx` (393 lines) | File is approaching the "split into subcomponents" threshold; not actionable yet | DEFERRED (awareness flag) |

---

## Reclassifications from prior cycles

(none this cycle.)

---

## Verifier confirmations (V11-1, V11-2)

All cycle-10 fixes intact at HEAD `8e10ebdd` EXCEPT plan task #2's
JSON-side trim (see CR11-1). Earlier-cycle invariants (cycle 8 / 9)
all still hold:

- `getHighlightJsLanguage` adapter (cycle-9).
- `isValidEncryptedPluginSecret` wired into
  `preparePluginConfigForStorage` (cycle-9).
- `@policy plaintext` JSDoc markers (cycle-9).
- `useMemo` on `problems`/`problemLabels` in
  `code-timeline-panel` (cycle-9).
- Staff `submissions.view_all` bypass in
  `isAiAssistantEnabledForContext` (cycle-8).
- `canViewAssignmentSubmissions` reorder (cycle-8).
- `::numeric` cast on `s.score` in contest-analytics + leaderboard
  (cycle-8).

---

## Carry-forward DEFERRED items still open

Per `plans/open/README.md` and the orchestrator's deferred-fix rules:

- **C-1 (Nginx XFF spoofable)** — infrastructure-side, unchanged.
- **SEC8b-1 (plaintext plugin secrets)** — operator policy, unchanged.
- **PERF8b-1/2/3/4** — unchanged.
- **ARCH8b-1/2** — unchanged.
- **TE8b-3/4/5** — unchanged.
- **CR8b-3** — `decryptPluginSecret` name-vs-behaviour drift, still
  on the ledger.
- **CR9-1** — settings-tabs hash sync race; carry-forward.
- **CRIT9-1** — operator-decisions registry doc, deferred.
- **CR10-4 / ARCH8b-4** — `getEnrolledContestDetail` rename, deferred.
- **PERF10-1 / PERF10-2 / DBG10-1 / DBG10-3** — informational /
  unreachable, unchanged.

No security/correctness/data-loss item is deferred without operator
policy backing or an explicit, narrowly-scoped technical reason.

---

## Cross-agent agreement

- CR11-1 / CRIT11-1 / V11-1 (orphaned JSON keys) — flagged by
  code-reviewer, critic, and verifier (3/8) — highest-signal NEW item
  this cycle.
- ARCH11-2 / CRIT11-2 (duplicated bag-builder) — flagged by
  architect + critic (2/8).
- CR11-3 / DBG11-2 (mini-bar key collision) — flagged by
  code-reviewer + debugger (2/8).

---

## Agent failures

Subagent fan-out unavailable in this environment (no `Agent` tool
with `subagent_type` is registered). Performed as a single-agent
comprehensive review covering each role's angle in dedicated review
files — consistent with cycles 30+.

---

## Verdict

Cycle 11 (orchestrator cycle 4/100) starts from a healthy baseline.
The actionable plan is small: finish the cycle-10 JSON trim
(CR11-1), tighten the snapshot marker's aria-label (CR11-2), harden
the per-problem mini-bar's `eventKey` fallback (CR11-3), move
`canShowParticipationView` into `lib/contests/` and add its
truth-table test (ARCH11-1, TE11-2), export a shared
`buildParticipantTimelineTranslations(t)` helper (ARCH11-2 /
CRIT11-2), and add a negative-clamp regression test for
`formatDuration` (TE11-1). Five LOW and three INFO items deferred
with explicit rationale.
