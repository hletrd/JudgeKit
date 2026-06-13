# Perspective: TA / Assistant (partial permissions) — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72.

## TA8-1 — As a TA fielding "I lost access" reports, the access-code expiry bug wastes my time (MEDIUM via CR8-1)
**File:** `access-codes.ts:191`. When students report the contest vanished during
a late window, I (as a TA without DB access) can't easily distinguish "expected
behavior" from "bug." The inconsistency between invited and access-code joiners
makes triage harder and the reports non-reproducible depending on how a student
joined. Fixing the canonical expiry removes a whole class of confusing tickets
from my queue.

## Permission-boundary check (no new gaps found)
- TA management gating on contests goes through `canManageContest`
  (invite/route.ts:29,89) and `getManageableProblemsForGroup` for problem edits
  (groups assignment PATCH:187) — boundaries intact; no privilege escalation
  introduced by cycle-7. ✅
- Anti-cheat dashboard is manager-gated; the paging fix didn't widen who can read
  events. ✅

## Carried: none TA-specific beyond the shared register.
