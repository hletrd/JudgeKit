# Security Reviewer — RPF Cycle 11 (2026-05-16)

**HEAD reviewed:** `8e10ebdd`. **Angle:** OWASP, secrets, auth/authz,
unsafe patterns.

## Scope

- Cycle-10 diff (`participant-timeline-bar.tsx`, `participant-timeline-view.tsx`,
  `(public)/contests/[id]/page.tsx`,
  `(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx`,
  `messages/{ko,en}.json`, new component test).
- Carry-forward security-side ledger from cycle-10
  (`_aggregate-cycle-10-2026-05-16.md` → C-1 Nginx XFF, SEC8b-1 plaintext
  plugin secrets).

## NEW findings

**0 HIGH, 0 MEDIUM, 0 LOW.**

The cycle-10 diff is non-security: i18n-bag wiring, a numeric clamp,
an a11y fallback (`role="img"`), a predicate-helper extraction, and a
component test. No new authn/authz, no new sinks for unescaped HTML,
no new outbound network calls, no new secret handling, no new file
I/O, no new SQL. The `<div role="img">` fallback does not introduce
script injection because all interpolated values (`ev.problemTitle`,
`ev.status`, formatted datetime) flow through React's normal text
node escaping (no unsafe raw-HTML insertion API is involved).

## Verifier check on cycle-10 security-adjacent fixes

- Plaintext-plugin-secret rejection (`isValidEncryptedPluginSecret` in
  `preparePluginConfigForStorage`) still wired (cycle-9, re-verified
  cycle-10) — confirmed at HEAD.
- `@policy plaintext` JSDoc markers intact (cycle-9).
- Staff `submissions.view_all` bypass in
  `isAiAssistantEnabledForContext` (cycle-8) intact.

## Carry-forward DEFERRED items (security)

- **C-1 (Nginx XFF spoofable)** — infrastructure-side; repo-policy
  exit criterion is "fix at the reverse-proxy config under
  ~/git/nas-ops".
- **SEC8b-1 (plaintext plugin secrets)** — operator policy; the
  cycle-8 plan in `plans/done/` records the operator decision.

## Verdict

No NEW security findings this cycle.
