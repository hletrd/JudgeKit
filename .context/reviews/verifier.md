# Verifier review — RPF cycle 4 (2026-06-11)

**HEAD reviewed:** 7c0a4bd4 · gates re-executed at this HEAD: tsc 0 · eslint
0/0 · lint:bash clean · unit 336 files / 2597 tests PASS.
**Lens:** evidence-based correctness against stated behavior.

## Claims verified

### V4-1 — Cycle-3 completion record vs reality: ACCURATE
All six cycle-3 items (G1–G6) verified present at HEAD: `exam-close.ts` helper +
ingest consult on past-close branch only; doc rewrite
(`exam-integrity-model.md:54-56` fail-open wording); `E2E_HOME_HEADING` knob in
both specs + `deploy-docker.sh:1397-1400`; lazy staff resolution in
exam-session GET; tri-state `sendEvent`; restore-test documentation. Test
counts match the plan record (336/2597).

### V4-2 — Doc claim "a flagged submission means the submitting client had no recent browser-monitor activity": FALSE today (MEDIUM, High, CONFIRMED)
`docs/exam-integrity-model.md:56` (and `:79`) equate the flag with a
SUBMISSION event. Code evidence: the flag is inserted by
`validateAssignmentSubmission` (`submissions.ts:343-354`), which also runs on
page renders (`practice/problems/[id]/page.tsx:167`) and autosave snapshots
(`code-snapshots/route.ts:62`). A flag row therefore does NOT imply a
submission occurred. Either the code must match the doc (restrict the insert to
the submit path — the correct fix per CR4-1) or the doc must stop promising
submission semantics. The reviewer-obligation paragraph (G2's centerpiece)
currently instructs staff to act on polluted evidence.

### V4-3 — `review-model.ts` comment claims server-recorded flag = accepted submission: FALSE today (same root cause)
`src/lib/anti-cheat/review-model.ts:12-16` ("a submission was accepted while
the candidate's heartbeat was stale"). Same divergence as V4-2; fix together.

### V4-4 — `getEffectiveExamCloseAt` contract comment vs all call sites: ACCURATE
Helper doc (`exam-close.ts:13-21`) promises extension-only semantics and "all
other modes: the assignment close". Verified against both consumers: ingest
(route.ts:111-122, windowed-only lookup, null-guard direction matches) and
validator (`submissions.ts:265-277`). The "null = no close (unreachable)"
comments are true on both branches (`deadline`/`effectiveCloseAt` non-null
guards precede).

### V4-5 — "Anti-cheat not enabled → silently accept" (route.ts:52-55): matches client expectations
Client never POSTs unless `enabled` (`AntiCheatMonitor` returns null and
registers nothing), so the 200 `{logged:false}` path is defensive only.
Verified no caller branches on `logged`.

### V4-6 — `MAX_PENDING_EVENTS` cap claim ("well above realistic upper bound"): PLAUSIBLE, with a caveat
Cap is applied on LOAD (`anti-cheat-storage.ts:53`), so a queue grown past 200
silently truncates the OLDEST..? No — `.slice(0, 200)` keeps the FIRST 200
(oldest); newest events are dropped on load while the queue is saturated.
With MAX_RETRIES=3 the queue drains or drops quickly; acceptable, but worth
remembering if MAX_RETRIES grows.

## Unverifiable in this environment
Live-deploy behaviors (post-deploy smoke heading override on oj.auraedu.me;
auraedu tablet-rankings cold-start transient from the cycle-3 deploy record)
require the deploy step; will be exercised by this cycle's per-cycle deploy.

Verdict: cycle-3 work is faithfully recorded; the one materially false
documented claim (V4-2/V4-3) shares a root cause with CR4-1 and must land with
its fix.
