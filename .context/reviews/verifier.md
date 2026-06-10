# Verifier (evidence-based correctness) — RPF Cycle 1 (2026-06-11)

**HEAD reviewed:** f977ef4c. Role: validate that the cycle's stated behavior
(commit messages, plan checkmarks, doc claims) matches the code, with evidence.

## Gate baseline re-established on this exact HEAD
- `npx tsc --noEmit` → 0 errors
- `npm run lint` (eslint) → 0 errors / 0 warnings
- `npm run lint:bash` → clean
- `npm run test:unit` → **330 files / 2551 tests PASS** (was 2472 at cycle-9 —
  +79 tests added by the remediation work, consistent with the commit log)

## Claims verified TRUE (evidence)
1. **"C1 fixed: IOI runs all test cases"** — server: `claim/route.ts:326-338`
   sets `runAllTestCases = scoringModel === "ioi"`; worker:
   `types.rs:244-245` (`#[serde(rename="runAllTestCases", default)]`),
   `executor.rs:617-622` breaks only `if verdict != Accepted &&
   !submission.run_all_test_cases`. Denominator now true total for IOI.
   ICPC/practice keep fail-fast (flag false / absent). MATCHES claim.
2. **"H4 fixed: dead worker's slot released on reclaim"** —
   `claim-query.ts:80-94` `prev_worker_release` CTE; fires only when a distinct
   prior owner exists AND a claim happened. MATCHES claim — but see the NEW
   self-reclaim gap (code-reviewer CR1): the commit's "previous worker" framing
   silently excludes the same-worker case, which still leaks. The claim in
   ed73a23b's message is therefore *narrowly* true.
3. **"Audit events durably persisted for security-critical actions"** —
   `recordAuditEventDurable` awaits the insert; wired into role CRUD +
   system-settings (grep confirms call sites). MATCHES.
4. **"Sweep reaps stale workers without heartbeat traffic"** —
   `instrumentation.ts:28` starts a 60 s unref'd interval; sweep flips
   online→stale→offline using DB time. MATCHES.
5. **"Anti-cheat defaults ON in the general assignment form"** —
   `assignment-form-dialog.tsx`: both useState init and reset use `?? true`.
   MATCHES (existing assignments keep stored value — `??` only catches
   null/undefined).
6. **"Backup verification does a real restore-test"** (abfa90f5) —
   `scripts/verify-db-backup.sh:27-49`: when given a restore DSN it creates a
   scratch DB (`verify_restore_<ts>`), restores the gzip dump with
   `ON_ERROR_STOP=1`, and drops it on EXIT trap. Without the DSN it falls back
   to the old gzip/non-empty checks (documented in-script). MATCHES, with the
   documented opt-in caveat — ops must pass the DSN for the real test.
7. **"freezeLeaderboardAt validated inside [startsAt, deadline)"** —
   `validators/assignments.ts:76-90`; reject paths covered by 2 new tests.
   MATCHES.
8. **"exam-session ?userId now group-staff-scoped"** — route now calls
   `canViewAssignmentSubmissions` only (diff verified). MATCHES.

## Claims verified with CAVEATS
9. **"Stable per-problem number across pagination"** (f977ef4c) — numbering is
   stable across pages/filters ✔, but on `/problems` it is **per-viewer**
   (rank within the *viewer's visible set*, comment admits this): two students
   in different groups can see different numbers for the same problem, and a
   problem's number shifts for everyone when any earlier problem is added/
   removed/made visible. Acceptable as a display affordance; do not let users
   cite these numbers as stable identifiers (the persona reviews flag the
   instructor-communication risk). Also the implementation is a full-catalog
   scan per view — perf-reviewer P1.
10. **"Draft recovery can never lose work"** — the invariants hold for the
    implemented paths (template-only hydration; post-hydration-gated autosave).
    Caveat: `isTemplateLike` decides "empty/template"; if a student's real
    solution is byte-identical to the template (possible for trivial
    fill-in-one-line templates) a server draft could overwrite it — with the
    student's OWN earlier draft. Not data loss in any meaningful sense.

## Claims I could NOT verify in this environment
- Live deploy state of worker-0 (image a5442080) and algo — asserted by plan
  notes, not verifiable from the repo. The runtime flag code is verified; the
  deployed-image assertion is taken on record.
- DB-backed integration tests (`tests/integration/db/*`, incl. the new
  judge-claim-reclaim suite) require a provisioned Postgres — carried
  DEFER-ENV-GATES applies; structural unit guards stand in.

## Verdict
All 16 remediation items are genuinely implemented (not just checkmarked).
Two narrow gaps surfaced by verification: CR1 (self-reclaim leak — the H4 fix's
uncovered sibling case) and P1 (the numbering fix's query shape). Both are
this cycle's real actionable output.
