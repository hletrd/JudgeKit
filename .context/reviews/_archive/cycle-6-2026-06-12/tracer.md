# Tracer — RPF Cycle 6 (2026-06-12)

**HEAD reviewed:** 22e1510f. Causal traces of three suspicious flows, with competing hypotheses resolved by code evidence.

## Trace 1 — "Removed student still submitted to the contest"
**Path:** staff DELETE `/groups/[id]/members/[userId]` → tx deletes `enrollments` only → student POSTs `/api/v1/submissions` with assignmentId → `validateAssignmentSubmission` finds no enrollment (`submissions.ts:322`) → token fallback `:324-330` finds the invite-era `contest_access_tokens` row (no `expires_at` filter, and no deletion ever happens) → access granted → submission accepted.
**Hypotheses:** (a) token cleanup happens elsewhere (cascade?) — REFUTED: FK cascades only on assignment/user deletion (`schema.pg.ts:1071-1076`); zero `delete(contestAccessTokens)` call sites; (b) expiry saves us — REFUTED for `expiresAt` NULL-or-future and for the no-filter gates regardless.
**Verdict:** real flow; CONFIRMED (= SEC6-1). The same trace through `getEnrolledContestDetail` shows the removed student also still loads the contest detail page; only the contest LIST and the platform-mode gate disagree (expiry-checked) — i.e., the user sees the contest vanish from their list yet deep links and submits still work. Maximally confusing for support.

## Trace 2 — "Copy event missing from a candidate's timeline despite reviewer watching them copy"
**Path A (confirmed loss):** copy → `handleCopy` → `reportEvent` → direct `sendEvent` (`anti-cheat-monitor.tsx:209`) → tab closed before response → event in neither queue nor slot → lost (D6-1/AGG6-2).
**Path B (throttle):** second copy within 1 s of the first → `MIN_INTERVAL_MS` dedup `:199` — by design.
**Path C (server 4xx):** contest ended/origin mismatch → "permanent" → intentionally dropped (AGG3-5) — by design.
Only Path A is unintended; queue-first transmission closes it.

## Trace 3 — "Participant shows a heartbeat-coverage hole but swears the tab was open"
**Hypotheses:** (a) tab hidden ≥ scheduled tick — heartbeat skipped while hidden (`:252`) — TRUE by design (absence signal); (b) LRU set-before-insert swallowed a heartbeat after a transient insert failure (`anti-cheat/route.ts:139-158`) — POSSIBLE, 60 s hole per incident (D6-3); (c) shared-coordination path on multi-instance — uses DB-backed dedup, not implicated; (d) clock skew — refuted, all timestamps are DB-time end-to-end since cycle-3/5.
**Verdict:** (b) is the only unintended contributor; two-line fix.

## Trace 4 — Cross-check: can a REJECTED submission still produce an escalate flag anywhere?
Walked every `submission_stale_heartbeat` producer: exactly one (`submissions/route.ts:404-425`), strictly after `txResult` success. Rejection exits (`:284-289` validation, `:293-295` access, `:390-394` tx errors) all return before it. NEGATIVE — invariant holds platform-wide.

## Final sweep
Traced the `includeGaps` synthetic-boundary math against a fabricated last-heartbeat 10 min old: `ongoing:true` gap emitted with DB-now end — consistent with the UI badge. No further anomalous flows identified on the changed surface.
