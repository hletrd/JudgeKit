# Code Reviewer — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f (main, == origin/main, clean tree)
**Baseline gates at this HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash clean · unit 338 files / 2632 tests PASS.
**Inventory:** full `src/` (609 TS/TSX files) walked by subsystem; deep reads on the cycle-5 change surface (submissions validator/route, anti-cheat monitor/storage/route/presentation, timeline/dashboard, code-similarity, exam-sessions, contests, claim-query, staleness sweep), token lifecycle call sites (6), group member removal, judge claim SQL, i18n catalogs.

## Findings

### CR6-1 — Contest access-token validity checked inconsistently across the six gates that consume it (MEDIUM, High, CONFIRMED)
- Expiry-checked (`expires_at IS NULL OR expires_at > NOW()`): `src/lib/platform-mode-context.ts:93,123,148`; `src/lib/assignments/contests.ts:182-185` (`getContestsForUser`); `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:84` (POST access check).
- NOT expiry-checked: `src/lib/assignments/submissions.ts:324-330` (`validateAssignmentSubmission` — the SUBMIT gate), `src/lib/assignments/public-contests.ts:224-231` (`getContestUserStatus`) and `:291-297` (`getEnrolledContestDetail`).
- Tokens are created with `expiresAt: assignment.deadline` (`invite/route.ts:104-115`, `recruiting-invitations.ts:680-687`), so for an assignment with a `lateDeadline` the submit API accepts an un-enrolled token-holder whom the platform-mode gate and the contest list already deny. Divergent boundaries on the same row are a defect regardless of which semantic the owner wants.
- Fix: one shared expiry-checked predicate consumed by all read sides; set `expiresAt` to the effective close (`lateDeadline ?? deadline`) at creation so invited users keep the late window. See SEC6-1 for the revocation half.

### CR6-2 — `service_unavailable` similarity reason is unreachable but still declared, branched on, and translated (LOW, High, CONFIRMED)
`src/lib/assignments/code-similarity.ts:242` declares the member; nothing returns it since AGG5-5 (the >MAX guard now returns `too_many_submissions`, and a sidecar failure with ≤MAX rows always reaches the TS fallback). Dead branch at `anti-cheat-dashboard.tsx:299` and dead keys `similarityServiceUnavailable` in `messages/en.json:2313` + `ko.json`. The stale message also misleads operators ("the Rust similarity service is unavailable for this large contest") about a state that cannot occur. Remove member + branch + keys + test rows.

### CR6-3 — Offset-mode submissions listing lacks the id tiebreak that cursor mode has (LOW-MEDIUM, High, CONFIRMED)
`src/app/api/v1/submissions/route.ts:167` orders by `desc(submittedAt)` only, while cursor mode (`:123`) orders by `(submittedAt desc, id desc)` and the cursor filter is tuple-correct. `submittedAt` is the request-level `dbNow`, so deadline bursts produce equal timestamps across users; offset pages over ties are then nondeterministic between requests (rows repeat/vanish across pages). Add `desc(submissions.id)`.

### CR6-4 — `code_similarity` event details omit the language bucket (LOW, High, CONFIRMED)
Pairs are computed per `(problemId, language)` (`code-similarity.ts:267-275`), and the dashboard pair table renders language, but the persisted evidence row (`code-similarity.ts:428-432`) stores only `pairedWith/problemId/similarity`. Two flags for the same user-pair+problem in different languages are indistinguishable in the stored trail. Add `language` to the details payload.

### CR6-5 — Misleading authorization comment on the anti-cheat GET (LOW, High, CONFIRMED)
`anti-cheat/route.ts:192-195` says "Write semantics (e.g., the POST heartbeat) keep canManageContest above" — the POST is the STUDENT-facing ingest gated by enrollment/token, not by `canManageContest`. A maintainer auditing authz from comments would mis-model the boundary. Reword to point at the actual write surfaces (score overrides, leaderboard freeze, similarity POST).

## Verified-good (no action)
- `performFlush` claim loop + in-flight slot ordering (`anti-cheat-monitor.tsx:108-151`) is correct: slot write precedes queue claim; `finally` clears; orphan recovery at flush start. The remaining loss path is `reportEvent`'s direct send — owned by debugger/D6-3 (aggregate AGG6-2).
- `getAssignmentStatusRows` SQL aggregation, override application, and per-user latest derivation are consistent with the scoring source of truth.
- `startExamSession` insert/conflict/refetch shape and `extendExamSession` SQL-composed extension are race-safe.
- Judge claim CTE chain (`claim-query.ts`) — re-derived the self-reclaim compensation and lock-order notes; the invariants hold as documented.

## Final sweep
No other dead i18n branches in the contests namespace; no stray `?? t(...)` fallback patterns survived cycle-5's CR5-2 fix; no new `tracking-*` on Korean text (locale-conditional usages at `public-header.tsx:306`, problem-set headers are correctly gated).
