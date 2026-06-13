# Verifier — RPF Cycle 7 (2026-06-13)

**HEAD reviewed:** 0472b007. Lens executed directly by the cycle agent (fallback per cycles 1–6).
**Method:** verify stated behavior against code; confirm cycle-6 completion claims; check doc/code agreement.

## V7-1 — Cycle-6 commit claim "enforced uniformly" is only true at create-time (MEDIUM, High, CONFIRMED)
Commit 22339ef2 states token expiry is "enforced uniformly." Verified the
ENFORCEMENT (validity check) is uniform across all 6 gates ✓. But the
DERIVATION of expiry is only applied at the two creation sites; the
schedule-edit path (`management.ts:291-309`) does not re-derive it. So the
end-to-end claim "a token always expires at the effective close" is FALSE
after any deadline edit. Evidence: zero `update(...).set({ expiresAt ...})`
call sites in repo (grepped). Re-opens as SEC7-1. The claim should be made
true (sync on edit), not weakened.

## V7-2 — `docs/api.md` anti-cheat eventType list overstates the POST contract (LOW, High, CONFIRMED)
`docs/api.md:813` documents the POST body eventType enum as
`tab_switch|copy|paste|blur|contextmenu|ip_change|code_similarity|heartbeat`.
The actual POST schema is `z.enum(CLIENT_EVENT_TYPES)` =
`tab_switch|copy|paste|blur|contextmenu|heartbeat` (client-events.ts:18-25) —
`ip_change` and `code_similarity` are SERVER-originated and are REJECTED from
a contestant POST (that rejection is a security feature, cycle-4 AGG4-2). The
doc tells an integrator they may POST event classes the server forbids.
**Fix:** correct the documented enum to the 6 client types, and note that
`ip_change` / `code_similarity` / `submission_stale_heartbeat` are
server-inserted and not acceptable in the POST body.

## V7-3 — anti-cheat GET listing order is undocumented (LOW, Medium, CONFIRMED — pairs with CR7-1)
Unlike the submissions section (cycle-6 added the `(submittedAt, id)` order
contract to `docs/api.md`), the anti-cheat GET section (`docs/api.md:824-840`)
documents no ordering. After CR7-1 fixes the order, state it
(`(createdAt desc, id desc)`) so paging consumers can rely on it.

## Verified-correct claims (no finding)
- Member-removal revokes tokens with an audit count — verified the tx calls `revokeContestAccessTokensForGroup` and records `revokedTokens` (groups/[id]/members/[userId]/route.ts:69).
- `getEffectiveExamCloseAt` honored by both submit validator and ingest — verified the past-close branch in anti-cheat/route.ts:109-120 and submissions.ts:305-317 use the same helper.
- Queue-first reportEvent: verified the enqueue-then-flush ordering and that the direct-send path is gone (anti-cheat-monitor.tsx:224-227).
- `NODE_ENCRYPTION_KEY` startup assertion present (production-config.ts) — verified.

## Final sweep
The two doc/code mismatches (V7-2 eventType, V7-3 missing order) and the
invariant-not-maintained claim (V7-1) are the verifier-specific findings; all
overlap and reinforce the code-reviewer/security findings.
