# Cycle 11 RPF Review Remediation Plan

**Date:** 2026-05-16
**Cycle:** 4/100 of this RPF loop (orchestrator-numbered)
**Aggregate:** `.context/reviews/_aggregate-cycle-11-2026-05-16.md`
**Per-agent reviews:**
`.context/reviews/{code-reviewer,security-reviewer,perf-reviewer,test-engineer,architect,critic,verifier,debugger}-cycle-11-2026-05-16.md`

---

## Summary

Cycle 11 starts from a green baseline (lint clean, 2422/2422 unit
tests pass at `8e10ebdd`). No HIGH or MEDIUM findings emerged. The
actionable work is:

1. **Finish the cycle-10 trim** (CR11-1 / CRIT11-1): delete the six
   orphaned `contests.participantAudit.problemSummary.*` leaves from
   both locale JSONs.
2. **Snapshot marker a11y label** (CR11-2): include a localized
   event-type word in the snapshot marker's `aria-label`.
3. **Per-problem mini-bar key fallback** (CR11-3 / DBG11-2): harden
   `eventKey` so missing `submissionId` does not collapse to
   `submission-undefined`.
4. **Move `canShowParticipationView` into `lib/contests/`**
   (ARCH11-1, TE11-2): co-locate with the access model and add a
   4-row truth-table test.
5. **Shared `buildParticipantTimelineTranslations(t)` helper**
   (ARCH11-2 / CRIT11-2): eliminate the duplicated bag construction
   at both call sites.
6. **Negative-clamp regression test for `formatDuration`** (TE11-1):
   protect the cycle-10 DBG10-2 fix.
7. Archive cycle-10 plan to `plans/done/`.
8. Run all gates.
9. Deploy.

---

## Implementation tasks

| # | Task | Severity | Status |
|---|---|---|---|
| 1 | Delete `bestScore`, `timeToFirstSubmission`, `timeToSolve`, `wrongBeforeAc`, `relativeTime`, `snapshots` from `contests.participantAudit.problemSummary` in both `messages/ko.json` and `messages/en.json`. | LOW (CR11-1 / CRIT11-1) | [x] |
| 2 | In `participant-timeline-bar.tsx`, change the snapshot branch's `aria-label` to include a localized "snapshot" word. Add `snapshotMarkerLabel: (problemTitle: string, formattedDate: string) => string` to `TimelineTranslations` and wire it from both call sites; add `messages/{ko,en}.json` keys under `contests.participantAudit.timelineBar.snapshotMarkerLabel`. | LOW (CR11-2) | [x] |
| 3 | In `participant-timeline-bar.tsx`, pass the per-event index from the surrounding `.map((ev, idx) => …)` into the mini-bar; fall back to `${ev.type}-${ev.at.getTime()}-${idx}` when `submissionId` is missing. | LOW (CR11-3 / DBG11-2) | [x] |
| 4 | Create `src/lib/contests/access-view.ts` exporting `canShowParticipationView(userAccess)` (re-using the `ContestUserAccess` type, or its alias from `public-contests.ts`). Re-import from `(public)/contests/[id]/page.tsx`. Add `tests/unit/contests/access-view.test.ts` with a truth-table covering `null`, `"enrolled"`, `"managing"`. | LOW (ARCH11-1, TE11-2) | [x] |
| 5 | Add `buildParticipantTimelineTranslations(t)` to `participant-timeline-bar.tsx` (or a sibling `participant-timeline-translations.ts`). It returns the full `TimelineTranslations` bag. Replace the inline bag at both call sites (`participant-timeline-view.tsx`, `students/[userId]/page.tsx`) with a single call. | LOW (ARCH11-2 / CRIT11-2) | [x] |
| 6 | Add a vitest case in `tests/component/participant-timeline-bar.test.tsx`: fixture event `at: new Date(start.getTime() - 5000)`, render in `ko`, assert the rendered HTML contains the start-window label and does not contain a negative-second substring (`/-\d+초/` should not match). | LOW (TE11-1) | [x] |
| 7 | Archive `plans/open/2026-05-16-cycle-10-rpf-review-remediation.md` to `plans/done/`. | LOW (housekeeping) | [x] |
| 8 | Run all gates: `npm run lint`, `npm run build`, `npm run test:unit`. | — | [x] |
| 9 | Commit + push fine-grained per-topic, GPG-signed, conventional + gitmoji. | — | [x] |
| 10 | Run per-cycle `DEPLOY_CMD`. | — | [x] |

---

## Quality gates

- [x] `npm run lint` — PASS
- [x] `npm run build` — PASS
- [x] `npm run test:unit` — PASS (2425/2425 unit incl. the new access-view test; 223/223 component incl. clamp regression test)

---

## Deferred ledger (cycle 11)

Per `plans/open/README.md` and the orchestrator's deferred-fix
rules, every still-open finding is either implemented above or
recorded here with severity preserved and a stated exit criterion.

| ID | Severity | Confidence | File | Reason for deferral | Exit criterion |
|---|---|---|---|---|---|
| CR11-4 | LOW (cosmetic) | MEDIUM | `students/[userId]/page.tsx:110-120` | Local `statusColors` palette duplicates the badge palette but a shared helper has not yet been confirmed across multiple files. Extracting now would create a third copy if `submission-status-badge.tsx` keeps its own. | Extract when a third independent copy of the palette appears, or when `submission-status-badge.tsx` is refactored to consume a single source of truth. |
| TE11-3 | LOW | LOW | i18n bag (after CR11-1 lands) | A regression test enumerating exact i18n keys for six strings is over-engineered. | Add only if the next cycle re-introduces orphaned keys. |
| PERF11-1 | INFORMATIONAL | HIGH | `participant-timeline-view.tsx:229-242`, `students/[userId]/page.tsx:95-108` | Server-component renders are single-shot; closure allocation is not measurable. ARCH11-2 partially mitigates by sharing the bag-builder. | Re-evaluate if either page becomes a client component. |
| DBG11-1 | LOW | MEDIUM | `participant-timeline-bar.tsx:285-287` | "Score: 0" for `wrong_answer + score=0` is a UX question, not a bug. Operator decision required on whether zero-score rows should be suppressed for non-AC verdicts. | Operator chooses suppress-vs-show; document under operator-decisions registry (CRIT9-1). |
| DBG11-3 | INFORMATIONAL | HIGH | `participant-timeline-bar.tsx:131-136` | `new Date(date)` re-wrap is a no-op allocation; not a defect. | Drop on next refactor that touches the timestamp normalisation path. |
| CRIT11-3 | LOW | LOW | `participant-timeline-bar.tsx` (393 LOC) | File is approaching split-threshold but no feature this cycle would benefit from a split. | Re-evaluate at 500 LOC, or when a feature requires touching > 3 sections. |
| CR10-4 / ARCH8b-4 | LOW (cosmetic) | HIGH | `(public)/contests/[id]/page.tsx`, helper call sites | Pure rename of `getEnrolledContestDetail` → `getContestDetailForViewer` — same as cycle-10 deferral. | Bundle with other deferred renames (CR8b-3) in a dedicated refactor commit. |
| CR9-1 | LOW | MEDIUM | `settings-tabs.tsx:18-40` | Hash-sync race carry-forward. | Refactor `applyHash(initialHash)` out of the deps-tracked effect without re-introducing `react-hooks/set-state-in-effect`. |
| CRIT9-1 | LOW (governance) | HIGH | `docs/policy/` (missing) | Operator-decisions registry doc; orchestrator ledger already preserves decisions. | Add under `docs/` or `.context/` per cycle-8 entries. |
| All cycle-8/9/10 carry-forward defers | LOW | varies | various | No status change. | Per original entries in earlier aggregates. |

No security/correctness/data-loss item is deferred without operator
policy backing or an explicit, narrowly-scoped technical reason.

---

## Progress

- [x] Per-agent reviews written
- [x] Aggregate written
- [x] Plan written
- [x] Cycle-10 plan archived to `plans/done/`
- [x] Lint passes
- [x] Unit tests pass (2425 unit + 223 component)
- [x] Build passes
- [x] Committed and pushed (6 fine-grained commits)
- [x] Deployed to oj.auraedu.me (per-cycle) — HTTPS HTTP 200 verified
