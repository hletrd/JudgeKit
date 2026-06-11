# RPF Cycle 10 Aggregate Review

**Date:** 2026-04-20
**Base commit:** fae77858
**Review artifacts:** `rpf-10-code-reviewer.md`, `rpf-10-security-reviewer.md`, `rpf-10-perf-reviewer.md`, `rpf-10-architect.md`, `rpf-10-critic.md`, `rpf-10-debugger.md`, `rpf-10-verifier.md`, `rpf-10-test-engineer.md`, `rpf-10-tracer.md`, `rpf-10-designer.md`, `rpf-10-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Access code `redeemAccessCode` uses `new Date()` for `enrolledAt`/`redeemedAt` while deadline check uses DB `NOW()` — same clock-skew pattern as 20+ routes already fixed [MEDIUM/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (SEC-1), critic (CRI-1), debugger (DBG-1), verifier (V-1), tracer (TR-1), test-engineer (TE-1), architect (ARCH-2)
**Files:** `src/lib/assignments/access-codes.ts:170,189`
**Description:** The `redeemAccessCode` function correctly uses `SELECT NOW()` for deadline enforcement (line 130-134), but writes `enrolledAt: new Date()` (line 170) and `redeemedAt: new Date()` (line 189) using app server time. The `now` variable from line 134 is already in scope and should be reused. This is the exact same clock-skew pattern that was fixed in cycles 7-9 for all other routes. Additionally, `setAccessCode` and `revokeAccessCode` call `withUpdatedAt()` without passing DB time (lines 33, 69).
**Concrete failure scenario:** App server clock is 5 seconds behind DB clock. User redeems access code at DB time T. Deadline check passes (DB says T < deadline). But `redeemedAt` is recorded as T-5s. Audit trail is inconsistent.
**Fix:** (1) Replace `enrolledAt: new Date()` with `enrolledAt: now` and `redeemedAt: new Date()` with `redeemedAt: now`. (2) For `setAccessCode` and `revokeAccessCode`, fetch DB time and pass to `withUpdatedAt()`.
**Cross-agent signal:** 8 of 11 agents flagged this — very high signal.

### AGG-2: `withUpdatedAt()` helper defaults to `new Date()` — systemic clock-skew risk for future code [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2), security-reviewer (SEC-2), architect (ARCH-1), critic (CRI-3)
**Files:** `src/lib/db/helpers.ts:20`
**Description:** The `withUpdatedAt()` helper defaults to `new Date()` when no `now` argument is provided. The docstring warns about this, but docstrings are not enforcement. Every new call site that forgets to pass `now` silently reintroduces clock-skew. Current call sites in `access-codes.ts:33,69` are affected.
**Concrete failure scenario:** A developer adds a new update call using `withUpdatedAt({ name: "Alice" })` without reading the docstring, introducing clock-skew in a new code path.
**Fix:** Make `now` a required parameter in `withUpdatedAt()`, or have it internally call `getDbNowUncached()`. The former makes the decision explicit at each call site; the latter requires making the function async.
**Cross-agent signal:** 4 of 11 agents flagged this.

### AGG-3: Library modules `problem-management.ts` and `assignments/management.ts` use `new Date()` for timestamps [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3, CR-4), security-reviewer (implicit), architect (ARCH-2), critic (CRI-2)
**Files:** `src/lib/problem-management.ts:150,242,287`, `src/lib/assignments/management.ts:188,227`
**Description:** These library modules use `new Date()` for `createdAt`, `updatedAt`, and tag creation timestamps. The cycles 7-9 DB-time migration covered API routes and server actions but missed these library modules that are called by those routes.
**Fix:** Import and use `getDbNowUncached()` for timestamps inside transactions.
**Cross-agent signal:** 4 of 11 agents flagged this.

### AGG-4: Client-side date formatting ignores next-intl locale in anti-cheat, code timeline, and API key components [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-6), designer (DES-1, DES-2)
**Files:** `src/components/contest/participant-anti-cheat-timeline.tsx:149`, `src/components/contest/anti-cheat-dashboard.tsx:256`, `src/components/contest/code-timeline-panel.tsx:75`, `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:280`, `src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx:110,154`
**Description:** Several client components format dates using `toLocaleString()` or `toLocaleDateString(undefined, ...)` without passing the user's locale. The app supports Korean and English via next-intl.
**Concrete failure scenario:** Korean users on non-Korean browser settings see dates in English format instead of Korean format.
**Fix:** Use `useLocale()` from next-intl and pass locale to `toLocaleString(locale, ...)` calls.
**Cross-agent signal:** 2 of 11 agents flagged this.

### AGG-5: `recruiting-invitations.ts` `updateRecruitingInvitation` and `resetRecruitingInvitationAccountPassword` use `new Date()` for `updatedAt` [LOW/MEDIUM]

**Flagged by:** security-reviewer (SEC-3), debugger (DBG-2)
**Files:** `src/lib/assignments/recruiting-invitations.ts:194,244,252`
**Description:** Invitation update and password reset functions write `updatedAt: new Date()` using app server time.
**Fix:** Use `getDbNowUncached()`.
**Cross-agent signal:** 2 of 11 agents flagged this.

### AGG-6: `code-similarity.ts` uses `new Date()` for anti-cheat event timestamps [LOW/LOW]

**Flagged by:** code-reviewer (CR-5)
**Files:** `src/lib/assignments/code-similarity.ts:397`
**Description:** Anti-cheat event timestamps use `new Date()`. These are audit/display only timestamps.
**Fix:** Use `getDbNowUncached()`.
**Cross-agent signal:** 1 of 11 agents.

### AGG-7: No test coverage for access code DB-time consistency [LOW/MEDIUM]

**Flagged by:** test-engineer (TE-1), verifier (V-1 implicit)
**Files:** `tests/` (no test for `access-codes.ts`)
**Description:** No unit test verifies that `redeemAccessCode` uses DB-sourced time for `enrolledAt` and `redeemedAt`.
**Fix:** Add a test that mocks DB time and verifies the write timestamps.
**Cross-agent signal:** 2 of 11 agents.

## Verified Safe / No Regression Found

- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any` type casts, `@ts-ignore`, or unsanitized SQL.
- Only 2 eslint-disable directives, both with justification comments.
- No silently swallowed catch blocks.
- CSRF protection is in place for server actions.
- Rate limiting uses PostgreSQL SELECT FOR UPDATE for TOCTOU prevention.
- Recruiting token flow uses atomic SQL transactions for claim validation.
- Korean letter-spacing is properly handled via CSS custom properties with `:lang(ko)` override (confirmed rpf-9 fix).
- Recruit page uses `getDbNow()` for temporal comparisons (confirmed cycle 27 fix).
- SSE events route captures `viewerId` before closure (confirmed cycle 27 fix).
- Community threads route uses `getDbNowUncached()` (confirmed cycle 8 fix).
- All prior cycle fixes are intact and working.

## Agent Failures

None. All 11 review perspectives completed successfully.
