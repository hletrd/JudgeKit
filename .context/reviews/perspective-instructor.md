# Persona: Instructor (authoring, grading, groups, cheating, exports) — RPF Cycle 1 (2026-06-11)

**Seat:** course instructor running two groups, weekly assignments, one
midterm (windowed exam), one class contest. **HEAD:** f977ef4c.

## Authoring & exam setup — improved
- Anti-cheat defaults ON in the general assignment form (48856f17) — the trap
  where my exam silently shipped unproctored is closed.
- `freezeLeaderboardAt` outside the contest window is now rejected with a
  field error (9a99d7ae) instead of silently freezing nothing/everything.
- Corrupt `examMode` values can no longer wedge the manage page with i18n
  errors (2388302e).
- Editing deadline/penalty/scoring now invalidates the leaderboard cache
  (43b7cda0): what I show on the projector matches the gradebook within the
  same 30 s, not a stale standings view.

## My problems are now actually mine
The biggest prior-cycle win for this seat is the RBAC scoping wave: another
instructor can no longer read my private problems (091f7fac/91399a8f), pick
them into their assignments (285f637a), duplicate them WITH hidden test cases
(82afa260), browse them in the set-builder (577cb7d5), or — worst —
PATCH/DELETE them before my exam (8b6affdd). Each verified implemented
(see security-reviewer). A co-instructor can also no longer transfer my group
to themselves (b6e38593).

## Findings from this seat

### IN1 (MEDIUM, product/fairness — same as student ST1, confidence High)
I cannot grant a time extension on a windowed exam — no per-student
`personalDeadline` mutation exists. Real term scenario: documented
accommodation letters (extra 50% time) or a power cut in the lab. Today my
options are pre-creating a SEPARATE assignment with longer
`examDurationMinutes` for those students (clumsy, leaks who has
accommodations via the duplicate assignment) or post-hoc score overrides
(doesn't return the lost time). Needs: staff endpoint + audit event +
monitor-view surfacing of extended deadlines.

### IN2 (LOW, communication, confidence High)
The new stable problem numbers on `/problems` are per-viewer (rank within
each viewer's visible set). If I say "solve #37 tonight", students with
different group memberships may see different #37s. `/practice` numbers are
viewer-independent and safe to cite. Fix alongside perf P1, or label the
column to discourage citing it.

### IN3 (LOW, monitoring UX, confidence Medium)
Anti-cheat monitoring is now correctly scoped to my own groups (1d40297a) and
the exam status board shows session timing. But when the staleness sweep
reaps a dead judge worker mid-exam (4e836c4a logs it server-side), MY view of
"why are 30 submissions stuck in queued?" is still the admin-health page I
don't have access to. A small banner on the assignment monitor ("judging
delayed — workers offline") would let me make the call (pause the exam?)
without paging the admin. Feature-ish; LOW.

## Grading & exports
- IOI partial scores now computed over the true test-case denominator —
  my gradebook, CSV/JSON export, and recruiting results all read the same
  corrected score (c3a29e8a). Verified flow: verdict.ts → leaderboard →
  export use the same submission score.
- Score overrides overlay correctly into single-user live rank (15b37782);
  ICPC override-on-live-rank remains a known carried deferral (N7-C7 — an
  ICPC override has no AC timestamp; product decision still pending; unchanged
  this cycle).

## Roster & TA management
- Group ownership transfer is owner-only now (M1). Roster visibility is
  manager-gated (3dfc2cf5 tests). My TA workflow is reviewed from the TA seat
  (perspective-assistant.md); from MY seat the boundary is: TAs I add via
  taught-group roles can grade/monitor but cannot transfer or delete the
  group. Correct.

## Verdict
Authoring/grading integrity issues from the last persona pass are closed.
The seat's remaining ask is IN1 (time extensions) — promoted as this cycle's
main product-gap finding (shared with the student seat).
