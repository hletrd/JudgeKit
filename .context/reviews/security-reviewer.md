# Security Reviewer — RPF Cycle 9 (2026-06-13)
*(Authorized defensive hardening assessment of the owner's own platform.)*

**HEAD:** da6179f3. Baseline green.

## SEC9-1 — anti-cheat evidence completeness: snapshot-timeline paging can drop/dup rows (MEDIUM, High)
**File:** `code-snapshots/[userId]/route.ts:54`. The code-snapshot timeline is an
academic-integrity / recruiting-integrity evidence surface (it shows a
candidate's keystroke-level code evolution to detect paste-ins / unauthorized
assistance). Because the listing paginates `asc(created_at)` + offset with no
unique tiebreak, an instructor reviewing a misconduct case can be shown an
**incomplete or duplicated** snapshot sequence at every page boundary when
snapshots share a millisecond (common under rapid autosave). A defensible
misconduct finding requires the evidence listing to be deterministic and
complete. **Hardening:** add `asc(codeSnapshots.id)` so the page seam is stable.
This complements (does not reopen) the deferred AGG8-2 heartbeat-gap-scan order.

## Authorization / confidentiality pass — no NEW gap
- The token-lifecycle invariant (a contest access token expires at the effective
  close `lateDeadline ?? deadline`) is now enforced at every creation/mutation
  site (cycle-8 AGG8-1 closed the access-code redeem path at
  `access-codes.ts:199`). No over-grant past close; the access-code defect was
  restrictive, now consistent. Verified all 4 insert/upsert sites + the
  schedule-edit sync route through `contestAccessTokenExpiry()`.
- `accepted-solutions/route.ts` correctly excludes assignment-tied submissions
  (`assignmentId IS NULL`, line 44) and nulls the userId for anonymous shares
  (line 88) — hidden-test / peer-code confidentiality intact. The missing
  id-tiebreak there (CR9-3) is a correctness nicety, not a leak.
- Hidden test cases, other users' submissions, scoreboard integrity, sandbox
  isolation: re-scanned, no NEW weakness vs the cycle-8 assessment.

## Not deferrable
SEC9-1 is correctness on an integrity-evidence surface — repo rules contain no
exception permitting deferral of correctness/security findings.
