# Code Reviewer — RPF Cycle 5 (2026-06-11)

**HEAD reviewed:** 04b8c1ec (main) — cycle-4's completed tree (deployed healthy
at 9966bfdf on all three targets) + cycle-4's final docs commit.
**Baseline gates at this HEAD (executed):** tsc 0 · eslint 0/0 · lint:bash
clean · unit 2606/2606 PASS.
**Scope:** full repo sweep with emphasis on cycle-4's new surface
(`submissions.ts` flag opt-in, `anti-cheat-monitor.tsx` claim loop,
`client-events.ts`, `exam-sessions.ts`), plus subsystems not recently
re-read (similarity engine + route, anti-cheat GET, judge claim/poll/claim-SQL,
admin backup/restore, CSRF/auth handler, files, recruiting validate).

## CR5-1 — Stale-heartbeat flag is recorded for submissions that are REJECTED (MEDIUM-HIGH, High, CONFIRMED)
`src/lib/assignments/submissions.ts:343-392`: the probe + flag INSERT run
*before* the `assignmentProblems` mismatch check (`:395-409`), and the only
opted-in caller `src/app/api/v1/submissions/route.ts:264-272` can still reject
the submission *after* validation succeeds: `canAccessProblem` 403 (`:280-284`),
and the whole insert transaction (`:303-377`) — `submissionRateLimited` 429,
`tooManyPendingSubmissions` 429, `judgeQueueFull` 503, `examTimeExpired` 403.
Failure scenario: a candidate on flaky wifi double/triple-clicks submit at the
deadline → requests past the per-minute limit are rejected 429, yet each one
that reached the validator with a stale monitor inserts an escalate-tier flag —
multiple `submission_stale_heartbeat` rows with **zero** corresponding accepted
submissions. `docs/exam-integrity-model.md` and `review-model.ts:12-18` promise
"a submission was **accepted** while the heartbeat was stale". Cycle-4's AGG4-1
fixed the render/autosave callers but left the rejected-submit hole.
**Fix:** make the validator probe-only (return the staleness verdict in the
success result); the submit route records the flag *after* the successful
insert, with `submissionId` (+ submitting IP) in `details`.

## CR5-2 — Dead `??` fallback after next-intl `t()` (LOW, High, CONFIRMED)
`src/components/contest/anti-cheat-dashboard.tsx:614` and `:498`:
`t(\`eventTypes.${event.eventType}\`) ?? event.eventType` — next-intl `t()`
returns the fully-qualified key string for missing messages, never
null/undefined, so the fallback is unreachable and unknown event types render
as raw key paths (see designer DES5-1 for the user-facing impact). Use the
`t(key) !== key`-style guard already used in `formatDetailsJson` (`:104`), or
add the missing message keys (both — see DES5-1/G2).

## CR5-3 — Similarity route: timer leak + dead reason value (LOW, High, CONFIRMED)
`src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:29-35`:
`clearTimeout(timeoutId)` sits inside the `try` after the `await` — any
non-abort throw leaks an armed timer that later aborts a dead controller
(harmless but sloppy; move to `finally`). Worse:
`src/lib/assignments/code-similarity.ts:374-383` returns
`reason: "service_unavailable"` for the rows>500-without-sidecar case, so the
`"too_many_submissions"` enum member and the dashboard branch
`anti-cheat-dashboard.tsx:317-323` (and i18n key
`similaritySkippedTooManySubmissions`) are dead code. Return
`"too_many_submissions"` for that case so the operator sees the true cause.

## CR5-4 — `describeElement` can throw on SVG targets (LOW, Medium, LIKELY)
`src/components/exam/anti-cheat-monitor.tsx:289-291`:
`parent?.className?.split(" ")` — for SVG elements `className` is an
`SVGAnimatedString` (object, no `.split`) → TypeError escapes `handleCopy`/
`handlePaste`, and that copy/paste event is silently not reported. Trigger: a
copy whose target resolves to an SVG `<a>`/text node inside a classed SVG
parent. Guard with `typeof parent.className === "string"` or use
`parent.getAttribute("class")`.

## CR5-5 — Flag insert uses app-server clock; every other anti-cheat insert uses DB time (LOW, High, CONFIRMED)
`submissions.ts:372-383` relies on the schema `$defaultFn(() => new Date())`
(`schema.pg.ts:1171-1173`) for `createdAt`, while the ingest route passes DB
`now` (`anti-cheat/route.ts:155,173`) and the similarity store passes
`getDbNowUncached()` (`code-similarity.ts:414`). Mixed clock sources inside a
single evidence table mis-order the reviewer timeline under app/DB skew. Pass
the validator's already-fetched DB `now` explicitly (folds into CR5-1's fix).

## Verified-good (provenance)
- `claim-query.ts` invariants (self-reclaim compensation, lock order,
  prev-owner release) — re-derived, sound.
- `judge/poll` claim-token fence + GREATEST(active_tasks-1,0) — sound.
- Submissions POST advisory-lock rate limiting and in-tx exam expiry — sound.
- Backup/restore: capability + password re-confirmation + CSRF — sound.
- `exam-sessions.ts` idempotent start + SQL-composed extensions — sound.
- Final sweep: no TODO/FIXME debris, no stray console.log (one is sample code
  for the compiler UI), Korean tracking rule honored everywhere checked.
