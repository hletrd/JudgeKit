# Architect — Cycle 2 (2026-05-29)

Architectural/design-risk review of the cycle-1 surface, net-new only.

## ARCH-C2-1 — Secret handling has no single chokepoint — Medium / Medium
`system-settings.ts` both encrypts secrets (lines 174, 186) and separately
redacts them for audit (line 222), with the two lists maintained independently
and by ad-hoc literals. There is no single declaration of "which settings keys
are secrets". This is the structural cause of SEC-C2-1 (smtpPass encrypted but
not redacted). Design fix: a single `SECRET_SETTING_KEYS` constant (sibling to
`CONFIG_KEYS`) consulted by BOTH the encrypt-on-write logic and the
redact-for-audit logic. This makes "add a secret column" a one-line change that
cannot half-land. Net-new.

## ARCH-C2-2 — Recruiting email-send logic duplicated across route layers — Low / Medium
The "render + send invitation email" responsibility lives inline in the
single-create route (route.ts:118-140) and is absent from the bulk route. Email
dispatch is domain logic, not HTTP-handler logic; it belongs in
`src/lib/assignments/recruiting-invitations.ts` (or a dedicated
`recruiting-email.ts`) as `sendRecruitingInvitationEmail(invitation, assignment,
baseUrl)`, called by whichever routes opt in. Keeping it in the route guarantees
divergence (DBG-C2-2). Net-new.

## ARCH-C2-3 — Email provider selection caches across config changes (cycle-1 F12, OPEN) — Low (DUP)
`providers/index.ts` module-level `activeProvider` can serve a stale provider
after an admin reconfigures (cycle-1 F12 / DBG-C2-1 is the throwing variant).
Already recorded. Architectural note: the provider layer has no
cache-invalidation hook tied to `invalidateSettingsCache()`; wiring those would
resolve both F9 (perf) and F12 (staleness) cleanly. Not re-counted.

## Final sweep
- Layering otherwise clean: actions → lib → db, API handlers via
  `createApiHandler` with capability + per-contest authz (correctly paired in
  both recruiting routes).
- No new cross-module cycles introduced.
