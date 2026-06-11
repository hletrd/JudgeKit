# Aggregate Review — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop (orchestrator-numbered)
**HEAD reviewed:** `23dd9e80` (cycle-9 deploy confirmation commit)
**Reviewer angles covered:** code-reviewer, security-reviewer,
perf-reviewer, test-engineer, architect, critic, verifier, debugger
(single-agent comprehensive sweep — Agent fan-out unavailable in
this environment, same as cycles 30+).

---

## Total NEW findings

**0 HIGH, 0 MEDIUM, 8 LOW, 3 INFORMATIONAL.**

Working tree was clean and gates were green at start of cycle. The
cycle-9 batch landed cleanly. NEW findings are all small UX/i18n
hygiene items on the cycle-8 `ParticipantTimelineBar` feature plus
two architectural housekeeping items.

---

## NEW findings — deduplicated

| ID | Severity | Confidence | File | Summary | Status |
|---|---|---|---|---|---|
| CR10-1 | LOW | HIGH | `participant-timeline-bar.tsx:144-152, 189, 271` | Hardcoded English literals (`0m`, `Score:`, `h /m /s`) leak into the Korean-locale audit page | PLAN |
| CR10-2 / ARCH10-1 | LOW | HIGH | `participant-timeline-bar.tsx:49-64` | Six unused fields in `TimelineTranslations` bag | PLAN (trim) |
| CR10-3 | LOW | HIGH | `participant-timeline-bar.tsx:222-243` | `<Link href={ev.submissionId ? … : "#"}>` — defensive `"#"` is misleading | PLAN |
| CR10-4 / ARCH8b-4 | LOW (cosmetic) | HIGH | `(public)/contests/[id]/page.tsx:120-131`, helper site | `getEnrolledContestDetail` is misnamed after cycle-8 widening | DEFERRED (rename touches multiple files; deferred per repo convention for cosmetic renames) |
| ARCH10-2 | LOW | HIGH | `(public)/contests/[id]/page.tsx:121-131` | Duplicate `userAccess === "enrolled" \|\| "managing"` predicate | PLAN (extract helper) |
| DBG10-2 | LOW | HIGH | `participant-timeline-bar.tsx:144-152` | `formatDuration(-5)` renders `"0m -5s"` for pre-start events | PLAN (clamp) |
| TE10-1 | LOW | HIGH | `participant-timeline-bar.tsx` (no companion test) | No render-shape test for the bar | PLAN (add light test) |
| TE10-2 | LOW | HIGH | `participant-timeline-bar.tsx:189, 271` | After CR10-1 lands, lock with a "no English literal in Korean output" assertion | PLAN (paired with CR10-1) |
| PERF10-1 | INFORMATIONAL | HIGH | `participant-timeline-bar.tsx:90-129` | `flatEvents`/`earliest`/`latest` rebuilt per render — server-component, so no-op today | DEFERRED (informational; SSR single-render) |
| PERF10-2 | INFORMATIONAL | HIGH | `participant-timeline-bar.tsx:144-152, 254, 364` | `formatDuration` repeated work — cheap | DEFERRED (informational) |
| DBG10-1 | INFORMATIONAL | MEDIUM | `participant-timeline-bar.tsx:131-137` | Synthetic 1h window fallback when both deadlines missing — gated by `!hasEvents` early-return | DEFERRED (informational, currently safe; add comment) |
| DBG10-3 | LOW | LOW | `participant-timeline-bar.tsx:208` | Theoretical event-key collision on same-ms same-type same-problem | DEFERRED (collision implausible per debugger note) |

---

## Reclassifications from prior cycles

(none this cycle — cycle-9 already reclassified SEC8b-5 and
ARCH8b-3 to VERIFIED-SAFE.)

---

## Verifier confirmations (V10-1, V10-2, V10-3)

All cycle-8 and cycle-9 fixes still in place at HEAD `23dd9e80`:

- `getHighlightJsLanguage` adapter (cycle-9).
- `LANGUAGE_TO_HLJS` removed from `code-timeline-panel.tsx`
  (cycle-9).
- `isValidEncryptedPluginSecret` rewired into
  `preparePluginConfigForStorage` (cycle-9).
- `@policy plaintext` JSDoc markers on both plaintext-path
  functions (cycle-9).
- `useMemo` on `problems`/`problemLabels` in `code-timeline-panel`
  (cycle-9).
- Cycle-8 plan present in `plans/done/` (cycle-9 housekeeping).
- Staff `submissions.view_all` bypass in
  `isAiAssistantEnabledForContext` (cycle-8).
- `canViewAssignmentSubmissions` reorder (cycle-8).
- `::numeric` cast on `s.score` in contest-analytics + leaderboard
  (cycle-8). Audited all remaining `ROUND(<col>, N)` sites — no
  additional Postgres-18 risk.

---

## Carry-forward DEFERRED items still open

Per `plans/open/README.md` and the orchestrator's deferred-fix
rules, the following remain valid:

- **C-1 (Nginx XFF spoofable)** — infrastructure-side, unchanged.
- **SEC8b-1 (plaintext plugin secrets)** — operator policy. Repo
  rule: cycle-8 plan explicitly records operator decision
  (`plans/done/2026-05-16-cycle-8-rpf-review-remediation.md`).
- **PERF8b-1 (TLE +2s budget)** — operator-accepted tradeoff.
- **PERF8b-2/3/4** — cosmetic + iOS-runtime-check items, unchanged.
- **ARCH8b-1/2/4** — small cleanups (CR10-4 picks up part of
  ARCH8b-4 via the rename deferral).
- **TE8b-3/4/5** — coverage gaps, unchanged.
- **CR8b-3** — `decryptPluginSecret` name-vs-behaviour drift,
  addressed by cycle-9 JSDoc, still on the ledger.
- **CR8b-6** — superseded by cycle-9 fix (consolidated map).
- **CR9-1** — settings-tabs hash sync race; deferred with
  explicit exit criterion in cycle-9 plan.
- **CRIT9-1** — operator-decisions registry doc, deferred (doc-
  only, out of scope for small RPF cycles).

No security/correctness/data-loss item is deferred without operator
policy backing or an explicit, narrowly-scoped technical reason.

---

## Cross-agent agreement

- CR10-1 (i18n leak) flagged by code-reviewer, critic,
  test-engineer (3/8) — highest-signal NEW item this cycle.
- CR10-2 / ARCH10-1 (dead translation keys) flagged by
  code-reviewer + architect (2/8).
- CR10-4 / ARCH8b-4 (`getEnrolledContestDetail` rename) re-flagged
  by code-reviewer + architect (carry-forward).

---

## Agent failures

Subagent fan-out unavailable in this environment (no `Agent` tool
with `subagent_type` is registered). Performed as a single-agent
comprehensive review covering each role's angle in dedicated review
files — consistent with cycles 30–50.

---

## Verdict

Cycle 10 (orchestrator cycle 3/100) starts from a healthy baseline.
The actionable plan is small: i18n the participant-timeline-bar
display strings (CR10-1 + TE10-2), trim dead translation bag fields
(CR10-2/ARCH10-1), guard the `"#"` Link fallback (CR10-3), extract
the `userAccess` predicate helper (ARCH10-2), clamp
`formatDuration` against negatives (DBG10-2), and add a light
render-shape test for the bar (TE10-1). Three INFORMATIONAL items
and two LOW items are deferred with explicit rationale.
