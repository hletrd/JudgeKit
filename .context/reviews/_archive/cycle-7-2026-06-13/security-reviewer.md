# Security Reviewer — RPF Cycle 7 (2026-06-12)

**Scope framing:** authorized, defensive hardening assessment of the owner's own platform (owner-operated JudgeKit; review requested by the operator before recruiting tests, student exams, and contests).
**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Inventory:** auth/session surface (`src/lib/auth/**`, `src/lib/security/**`), every contest/exam access gate, token lifecycle (post cycle-6 G1), judge worker auth, admin routes, ingest surfaces, CSV exports, raw-SQL call sites (all 20 files re-checked for parameterization).

## SEC7-1 — Token-expiry invariant does not survive schedule edits (LOW-MEDIUM hygiene, High, CONFIRMED)
Cycle-6 G1 established the invariant "a contest access token expires at the
assignment's EFFECTIVE close (`lateDeadline ?? deadline`)" and enforced expiry
uniformly at all six gates. But the invariant only holds at token-CREATION
time: `updateAssignmentWithProblems` (`src/lib/assignments/management.ts:291-309`)
rewrites `deadline`/`lateDeadline` without touching `contest_access_tokens`
(zero update call sites exist for `expiresAt`). Consequences:
- **Contest extended** → existing tokens still expire at the OLD close. The raw-SQL gates (`platform-mode-context.ts:96/126/151`, catalog `contests.ts:185`, ingest `anti-cheat/route.ts:85`) and Drizzle gates all deny the token during the extension window. Blast radius is limited TODAY because both creation sites also insert `enrollments` rows (verified: invite route:121-130, recruiting redemption:675-680) and every gate accepts enrollment OR token — but the system is one roster edit away from the gap becoming user-facing, and pre-cycle-6 rows stamped `deadline` (not effective close) persist in prod.
- **Contest shortened** → tokens OUTLIVE the new close; the access-token surface re-grants ingest/catalog visibility past the close the instructor set (schedule gates still bound submissions, so submit integrity holds).
**Fix:** inside the same transaction that updates the assignment, sync the
assignment's token expiries to the new effective close (`expiresAt = lateDeadline ?? deadline ?? NULL`).
Single rule, owned next to `contestAccessTokenExpiry` in
`src/lib/assignments/contest-access-tokens.ts`. This also retro-repairs
pre-cycle-6 rows on the next schedule edit. Pair with the invite-route
`onConflictDoUpdate` refresh (CR7-3) so every lifecycle point converges on
the one invariant. Red-first tests: schedule-edit sync (extend + shorten +
remove-deadline → NULL), invite refresh of a stale expiry.

## SEC7-2 — Evidence-listing nondeterminism is an audit-integrity concern (LOW-MEDIUM, High, CONFIRMED — shared with CR7-1)
`anti-cheat` GET (route.ts:292), audit-log and login-log exports
(`admin/audit-logs/route.ts:219,269`, `admin/login-logs/route.ts:93,129`)
paginate/cap on a non-unique timestamp. For security artifacts specifically,
nondeterministic pagination means two exports of "the same" incident window
can differ at cap/page boundaries — bad for dispute evidence and incident
forensics. Fix as CR7-1 (id tiebreak).

## Defenses verified intact at this HEAD (no action)
- **Ingest hardening:** anti-cheat POST requires a matching `Origin` pinned to the canonical host in production (route.ts:63-79); event vocabulary is `z.enum(CLIENT_EVENT_TYPES)` — server-originated classes (`ip_change`, `code_similarity`, `submission_stale_heartbeat`) are unforgeable by participants (client-events.ts:18-25).
- **Submit liveness correlation:** stale-heartbeat probe is read-only at validation and recorded only after a successful insert (submissions.ts:374-402) — no fabricated evidence for rejected attempts.
- **Token validity:** single SQL/Drizzle rule (`CONTEST_ACCESS_TOKEN_VALIDITY_SQL` + `findValidContestAccessToken`), DB-clock everywhere; revocation inside the member-removal transaction with audit detail.
- **Judge worker auth:** per-worker secret hash + timing-safe compare + IP allowlist (heartbeat/route.ts:46-62); claim fencing via fresh claim tokens.
- **Raw SQL:** all 20 raw-SQL files use named parameters; the one interpolated fragment (`CONTEST_ACCESS_TOKEN_VALIDITY_SQL`) is a compile-time constant with no user input.
- **CSV injection:** `escapeCsvField` neutralizes formula-leading characters and quotes per RFC 4180; consumed by all 5 export routes.
- **Secrets:** `NODE_ENCRYPTION_KEY` now in the startup gate (a5e66736); no plaintext secrets in repo (re-grepped).
- **Korean-tracking repo rule:** all `tracking-*` utilities are locale-gated (`locale !== "ko"`) — compliant.

## Final sweep
Checked for: IDOR on submission detail (`canAccessSubmission` + sanitizer — intact), hidden test-case exposure (`isVisible` filtering in sanitize path — intact), self-vote/score manipulation (guarded), rate-limit coverage on ingest/snapshot/vote/invite-search (present). No new high-severity weaknesses found at this HEAD.
