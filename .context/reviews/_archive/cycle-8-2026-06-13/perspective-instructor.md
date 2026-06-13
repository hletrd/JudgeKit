# Perspective: Instructor (authoring/grading) — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Seat: instructor running an exam with a late-submission window.

## IN8-1 — My late window doesn't apply uniformly to access-code joiners (MEDIUM via CR8-1)
**File:** `access-codes.ts:191`.
When I configure a late deadline, I expect it to apply to *everyone* in the
contest. It doesn't: students who join via the access code get tokens that expire
at the regular deadline, so their token-keyed access (contest catalog /
platform-mode visibility) ends early, while invited students get the full late
window. Two students, same contest, different access lifetimes — that's a
grading-fairness and support-burden problem (I'll get "the contest vanished"
tickets from exactly the access-code cohort). I'd want the platform to enforce my
late window identically for both join paths. Fix is the canonical-expiry one-liner.

## What works well for me
- Schedule edits now re-sync token expiry in-transaction (extend/shorten both
  handled) — so editing the deadline correctly re-grants/revokes token access.
- Roster removal revokes contest tokens (removed students lose access cleanly).
- Anti-cheat dashboard no longer drops evidence rows on poll/load-more — I can
  trust what I'm reviewing.
- Similarity evidence carries the language; flagged pairs sort by similarity.

## Carried (owner-gated): TA3-1-followup/DES4-4 (extension audit events in the
participant timeline), IN2-2 (per-student duration overrides/accommodations).
