# Cycle 10 RPF Review Remediation Plan

**Date:** 2026-05-16
**Cycle:** 3/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate-cycle-10-2026-05-16.md`
**Per-agent reviews:**
`.context/reviews/{code-reviewer,security-reviewer,perf-reviewer,test-engineer,architect,critic,verifier,debugger}-cycle-10-2026-05-16.md`

---

## Summary

Cycle 10 starts from a green baseline (lint, build, unit gates all
passed at the end of cycle 9, `23dd9e80`). No HIGH or MEDIUM
findings emerged. The actionable work is a small UX/i18n hygiene
pass on the cycle-8 `ParticipantTimelineBar` component plus a
defensive clamp and a light render-shape test:

1. **i18n the bar** (CR10-1, TE10-2): replace hardcoded `0m`,
   `Score:`, and `h /m /s` literals with translations bag fields.
2. **Trim dead translation keys** (CR10-2 / ARCH10-1): drop
   unused fields from `TimelineTranslations` and the parent's
   bag-building call site, drop the corresponding
   `messages/{ko,en}.json` keys if they have no other consumer.
3. **Guard `Link href="#"`** (CR10-3): branch to a non-interactive
   marker when `submissionId` is missing.
4. **Extract participation-view predicate** (ARCH10-2): replace
   the duplicated `userAccess === "enrolled" || === "managing"`
   with a small helper.
5. **Clamp negative durations** (DBG10-2): floor `formatDuration`
   at 0 so pre-start events don't render `"0m -5s"`.
6. **Add render-shape test** (TE10-1): minimal vitest that
   instantiates `ParticipantTimelineBar` with a fixture timeline
   and asserts marker counts + event-key uniqueness.
7. Run all gates and deploy.

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | Add `axisStart`, `durationLong`/`durationShort` (returning a string for a duration), `scoreLabel` to `TimelineTranslations`; wire them in the parent (`participant-timeline-view.tsx`) from `next-intl`; add the same keys to `messages/{ko,en}.json` under `contests.participantAudit.timelineBar`. | LOW (CR10-1) | [x] |
| 2 | Trim unused fields from `TimelineTranslations` (`pointsValue`, `bestScore`, `timeToFirstSubmission`, `timeToSolve`, `wrongBeforeAc`, `relativeTime`); update the parent's bag-building accordingly; remove the now-orphaned `messages/*.json` keys if no other component consumes them. | LOW (CR10-2 / ARCH10-1) | [x] |
| 3 | In `participant-timeline-bar.tsx`, replace the `<Link href={ev.submissionId ? … : "#"}>` branch with: when `submissionId` present render `<Link>`; otherwise render `<div role="img" aria-label={…}>` with the same marker styling. | LOW (CR10-3) | [x] |
| 4 | Extract `function canShowParticipationView(userAccess: UserContestAccess): boolean { return userAccess === "enrolled" \|\| userAccess === "managing"; }` next to the existing access-resolver in `(public)/contests/[id]/page.tsx` (or in `lib/contests/`). Use at both call sites. | LOW (ARCH10-2) | [x] |
| 5 | In `participant-timeline-bar.tsx`, clamp `formatDuration` with `Math.max(0, totalSeconds)` at the top of the function. | LOW (DBG10-2) | [x] |
| 6 | Add `tests/unit/contest/participant-timeline-bar.test.tsx` (vitest + RTL) with a fixture: 1 problem, 3 events ({submission, snapshot, first_ac}); assert 3 markers render, no duplicate `key`, AC chip is shown for `first_ac`, snapshot marker uses rect variant. After CR10-1 lands, also assert no English literal (`/Score:/`, `/0m/`) appears in the Korean-locale output. | LOW (TE10-1, TE10-2) | [x] |
| 7 | Archive cycle-9 plan to `plans/done/`. | LOW (housekeeping) | [x] |
| 8 | Run all gates: `npm run lint`, `npm run build`, `npm run test:unit`. | — | [x] |
| 9 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [ ] |
| 10 | Run per-cycle `DEPLOY_CMD`. | — | [ ] |

---

## Quality gates

- [x] `npm run lint` — PASS
- [x] `npm run build` — PASS
- [x] `npm run test:unit` — PASS (2422/2422 unit; +5 new component tests in
      `tests/component/participant-timeline-bar.test.tsx` for 220/220 component)

---

## Deferred ledger (cycle 10)

Per `plans/open/README.md` and the orchestrator's deferred-fix
rules, every still-open finding is either implemented above or
recorded here with severity preserved and a stated exit criterion.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| CR10-4 / ARCH8b-4 | LOW (cosmetic) | HIGH | `(public)/contests/[id]/page.tsx`, helper call sites | Pure rename of `getEnrolledContestDetail` → `getContestDetailForViewer`. Touches the function definition, its call sites, and (transitively) any test snapshots that name the function. Risk/reward unfavourable for a single RPF cycle; ARCH10-2 already extracts the predicate that captures the new semantics. | Rename can be tackled in a dedicated refactor commit alongside other deferred cosmetic renames (e.g. CR8b-3 / `decryptPluginSecret`) so the renames batch + the touched-files set is reviewed once. |
| PERF10-1 | INFORMATIONAL | HIGH | `participant-timeline-bar.tsx:90-129` | `flatEvents`/`earliest`/`latest` are recomputed in a *server component*; with SSR there is exactly one render per request so `useMemo` would be a no-op (and `useMemo` is illegal in a server component anyway). | Re-evaluate if the component is ever converted to a client component. |
| PERF10-2 | INFORMATIONAL | HIGH | `participant-timeline-bar.tsx:144-152, 254, 364` | `formatDuration` is called ~N+M times per render; cheap string ops, not measurable in profiling. | Re-evaluate only if a profile shows it on the critical path. |
| DBG10-1 | INFORMATIONAL | MEDIUM | `participant-timeline-bar.tsx:131-137` | Synthetic 1-hour window fallback is *unreachable* in practice because the `!hasEvents` early-return at line 156 handles the no-events case before the bar would render. Adding a `// invariant:` comment would be churn for no behavioural change. | Re-evaluate if the early-return is ever removed/relaxed. |
| DBG10-3 | LOW | LOW | `participant-timeline-bar.tsx:208` | Event-key collision requires same problem + same type + same millisecond. Submissions and snapshots are inserted with `now()` and the auto-save interval is seconds; operationally impossible. | Re-evaluate if the snapshot interval is ever lowered below 100ms. |
| CR9-1 | LOW | MEDIUM | `settings-tabs.tsx:18-40` | Carry-forward from cycle 9; latent race only on parent RSC re-render, functional setter mitigates same-value writes. | Per cycle-9 plan: refactor `applyHash(initialHash)` out of the deps-tracked effect without re-introducing `react-hooks/set-state-in-effect`. |
| CRIT9-1 | LOW (governance) | HIGH | `docs/policy/` (missing) | Doc-only registry of operator decisions; not code; orchestrator ledger already preserves decisions. | Operator-decisions registry doc added under `docs/` (or `.context/`) per cycle-8 entries. |
| All cycle-8/9 carry-forward defers | LOW | varies | various | No status change beyond CR10-4 (joining ARCH8b-4 above). | Per original entries in `_aggregate-cycle-8-2026-05-16.md` /
`_aggregate-cycle-9-2026-05-16.md`. |

No security/correctness/data-loss item is deferred without operator
policy backing or an explicit, narrowly-scoped technical reason.

---

## Progress

- [x] Per-agent reviews written — DONE in PROMPT 1
- [x] Aggregate written — DONE in PROMPT 1
- [x] Plan written
- [x] Cycle-9 plan archived to `plans/done/`
- [ ] Lint passes
- [ ] Unit tests pass (target: 2422+/2422+)
- [ ] Build passes
- [ ] Committed and pushed
- [ ] Deployed to oj.auraedu.me (per-cycle)
