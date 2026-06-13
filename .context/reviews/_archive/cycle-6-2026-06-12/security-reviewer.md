# Security Reviewer — RPF Cycle 6 (2026-06-12)

Authorized, defensive hardening assessment of the owner's own platform (owner-operated JudgeKit; review requested by the operator before recruiting/exam/contest use).

**HEAD reviewed:** 22e1510f. **Scope:** auth/authz boundaries, anti-cheat evidence integrity, token lifecycle, ingest gates, IP attribution, judge pipeline authz. OWASP A01/A04/A07 lenses on the changed and adjacent surfaces.

## Findings

### SEC6-1 — Contest access-token lifecycle: no revocation on roster removal + expiry not enforced on the submit/detail gates (MEDIUM, High, CONFIRMED)
Two halves of one boundary defect:
1. **Revocation gap.** `DELETE /api/v1/groups/[id]/members/[userId]` (`src/app/api/v1/groups/[id]/members/[userId]/route.ts`) deletes only the `enrollments` row. No code path anywhere deletes `contest_access_tokens` (verified: zero `delete(contestAccessTokens)` call sites). Every token creator (invite route, recruiting redemption) also enrolls, so the token is a *second*, invisible grant: staff who remove a member have NOT revoked their contest access — `validateAssignmentSubmission` (`submissions.ts:321-339`) and `getEnrolledContestDetail` (`public-contests.ts:291-297`) re-grant via the leftover token.
2. **Expiry inconsistency.** The submit gate and both public-contest detail gates accept tokens with no `expires_at` filter, while `platform-mode-context.ts` (×3), `getContestsForUser`, and the anti-cheat ingest all require unexpired tokens (citations in code-reviewer CR6-1). The strictest interpretation is already implemented in three places; the most security-relevant gate (submission acceptance) implements the weakest.
**Hardening:** single shared expiry-checked token predicate; member-removal transaction also deletes that user's tokens for the group's assignments and audits the count; token creation sets `expiresAt = lateDeadline ?? deadline` so the legitimate late window survives the alignment. Red-first tests on the expired-token submit path.

### SEC6-2 — Heartbeat dedup LRU marks the 60 s window BEFORE the insert commits (LOW, Medium, RISK)
`anti-cheat/route.ts:139-158`: `lastHeartbeatTime.set(key, nowMs)` precedes `db.insert(...)`. A transient insert failure suppresses that participant's heartbeat row for up to 60 s on that instance while the client believes delivery succeeded (200 only on success — actually the route would 500 — but the LRU entry persists). Interplay: the stale-heartbeat probe window is 90 s and matches any CLIENT event type, so a lone DB hiccup cannot by itself fabricate an escalate flag, but it shrinks the margin for an honest candidate to one event. Hardening: drop the LRU key when the insert throws (try/catch + `lastHeartbeatTime.delete(heartbeatKey)` + rethrow).

### SEC6-3 — Evidence quality: `code_similarity` rows lack the language dimension (LOW, High, CONFIRMED)
Stored collusion evidence (`code-similarity.ts:428-432`) cannot distinguish per-language flags for the same pair (CR6-4). For a dispute, the evidence row should be self-describing. Include `language`.

## Boundaries verified sound at this HEAD (no action)
- **Stale-heartbeat flag integrity** (the platform's primary curl-bypass signal): probe is read-only in the validator; flag recorded only after the accepted insert, with submissionId + IP + DB time (`submissions/route.ts:396-425`). Matches `docs/exam-integrity-model.md`.
- **Ingest origin pinning** (`anti-cheat/route.ts:54-78`): production requires a present, matching Origin — stricter than the global CSRF helper; correct posture for the scripted-bypass threat.
- **IP attribution** (`security/ip.ts`): XFF hop validation refuses to trust client-controllable entries when the chain is short; X-Real-IP only as XFF-absent fallback; IPv4-mapped normalization consistent with the allowlist matcher. The ipOverlap collusion report builds on attributable IPs only.
- **Proctoring scope:** `canMonitorContest` (`contests.ts:235-249`) grants TAs and `anti_cheat.view_events` holders read-only access scoped to assigned groups; write surfaces keep `canManageContest`. Probed the GET with the TA path — scoping holds.
- **Judge claim fencing:** claim token + `FOR UPDATE SKIP LOCKED` + stale reclaim with worker-counter reconciliation (`claim-query.ts`) — zombie-worker double-finalize remains fenced; background staleness sweep reaps a dead single-worker fleet independent of heartbeat traffic.
- **Client event vocabulary:** zod `z.enum(CLIENT_EVENT_TYPES)` still rejects server-originated classes (`ip_change`, `code_similarity`, `submission_stale_heartbeat`) from contestant POSTs.

## Final sweep
No secrets in the diff surface; no new raw-SQL interpolation (named-parameter helpers only); no `dangerouslySetInnerHTML` additions; rate limits present on all touched routes (`submissions:create`, `anti-cheat:log/view`, `similarity-check`, `members:remove`).
