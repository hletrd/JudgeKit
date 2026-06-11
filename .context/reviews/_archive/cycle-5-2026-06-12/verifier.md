# Verifier — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Evidence-based check of stated behavior (docs, comments,
prior-cycle completion claims) against the code as it actually executes.

## V5-1 — Doc claim "every such submission is flagged … a submission was accepted while heartbeat stale" — FALSE as stated (MEDIUM, High, CONFIRMED)
`docs/exam-integrity-model.md` (heartbeat-correlation section): "A flagged
submission means 'the submitting client had no recent browser-monitor
activity'" and "every such submission is flagged". Counter-evidence: flags
are also written for attempts that are then rejected (mismatch 400 at
`submissions.ts:395-409` after the insert at `:372`; route-level 403/429/503
after validation). So a flag does NOT imply a submission exists. The doc and
code must be reconciled — the cycle consensus (CR5-1) is to change the CODE
to match the doc (flag after accept), then add one clarifying sentence.

## V5-2 — `review-model.ts:12-18` comment "Server-recorded by the submit path ONLY … a submission was accepted while …" — HALF TRUE (MEDIUM, High, CONFIRMED)
"Submit path only" — TRUE (verified all three `validateAssignmentSubmission`
call sites; only the submit route opts in). "A submission was accepted" —
FALSE today (V5-1). Update wording with the fix.

## V5-3 — Cycle-4 completion claims — VERIFIED TRUE
- G1/G2 (b1bbae03): probe filters to `CLIENT_EVENT_TYPES` via `inArray`
  (`submissions.ts:355`) ✓; lib module is the single source ✓; render/autosave
  pass no options ✓.
- G3 (78083a14): claim loop + single-flight present as described ✓ (new
  residual risk recorded separately as SEC5-2 — not a falsification of the
  claim, which addressed lost-update, not unload-loss).
- G4 (7ff8c186): `examSessionUnavailable` thrown (`exam-sessions.ts:116`);
  no route case for it → generic retryable 500 ✓.
- "Deployed healthy at 9966bfdf, three targets" — consistent with the plan's
  completion record; re-verified targets return HTTP 200 during this cycle's
  deploy step (PROMPT 3).

## V5-4 — "Instructor still sees this flag in the anti-cheat dashboard" (fail-open rationale, `submissions.ts:364-371` comment + doc) — MISLEADING IN PRACTICE (MEDIUM, High, CONFIRMED)
The dashboard does render the row, but with NO translated label (no
`eventTypes.submission_stale_heartbeat` key in `messages/en.json` /
`messages/ko.json`) and no type color (`EVENT_TYPE_COLORS` lacks the entry in
both `anti-cheat-dashboard.tsx:81-89` and
`participant-anti-cheat-timeline.tsx:35-43`). The badge text shows the raw
i18n key path (next-intl missing-message fallback; the `?? event.eventType`
guard at `:614` is dead — `t()` never returns nullish). The "reviewer
obligation" the doc imposes is therefore not practically dischargeable from
the UI today. Confirmed by key-set inspection of both message catalogs.

## V5-5 — `MAX_PENDING_EVENTS` doc claim — TRUE
"200 is well above the realistic upper bound" (`anti-cheat-storage.ts:20-26`):
heartbeats enqueue only on send failure; sustained 30 s-interval failures fill
~120/hour; cap is adequate and the cap-loss behavior is documented. ✓

## V5-6 — Baseline gates at this HEAD — VERIFIED
tsc 0 errors · eslint 0 errors/0 warnings · `bash -n` both deploy scripts
clean · vitest unit 2606/2606 PASS (41.7 s). Logs under /tmp/c5-*.log.
