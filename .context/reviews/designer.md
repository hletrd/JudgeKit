# Designer (UI/UX) — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. No login-gated live-browser run available (no provisioned
staging session/credentials this cycle — DEFER-ENV-GATES). Static review of the
contest/anti-cheat UI surface touched by cycle-7.

## DES8-1 — UX symptom of CR8-1: candidate sees inconsistent contest availability (MEDIUM via CR8-1)
The access-code expiry bug (access-codes.ts:191) surfaces to the candidate as a
*disappearing contest*: a participant who joined by access code finds the contest
gone from their platform-mode catalog at `deadline`, even though the instructor
opened a late window and invite-joiners still see it. From the seat, this reads
as "the system lost my access" — an anxiety/trust hit during a timed assessment.
The fix (canonical expiry) makes both join paths show identical availability.

## Confirmations (cycle-6/7 a11y + paging fixes verified in markup)
- Anti-cheat filter chips are real `<button>`s with `aria-pressed`
  (anti-cheat-dashboard.tsx:474-494). ✅
- Detail disclosure uses `aria-expanded`/`aria-controls` with a stable id
  (`anti-cheat-dashboard-detail-${event.id}`). ✅
- IP-overlap panel is a labelled `role="region"`; load-more preserves the
  loaded tail (no evidence vanishing mid-review). ✅

## Carried a11y deferrals (no browser this cycle)
DES3-1 (expired→active assertive announcement, exam-deadline-sync.tsx:107),
DES4-4 (extension audit events in participant timeline). Carried.
