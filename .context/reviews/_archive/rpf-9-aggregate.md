# RPF Cycle 9 Aggregate Review

**Date:** 2026-04-20
**Base commit:** c30662f0
**Review artifacts:** `rpf-9-code-reviewer.md`, `rpf-9-security-reviewer.md`, `rpf-9-perf-reviewer.md`, `rpf-9-architect.md`, `rpf-9-critic.md`, `rpf-9-debugger.md`, `rpf-9-verifier.md`, `rpf-9-test-engineer.md`, `rpf-9-tracer.md`, `rpf-9-designer.md`, `rpf-9-document-specialist.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: `globals.css` applies `letter-spacing` unconditionally — violates Korean letter-spacing rule in CLAUDE.md [HIGH/HIGH]

**Flagged by:** code-reviewer (CR-1), security-reviewer (implicit), architect (ARCH-1), critic (CRI-1), debugger (DBG-1), verifier (V-1), test-engineer (TE-1), tracer (TR-2), designer (DES-1), document-specialist (DOC-1)
**Files:** `src/app/globals.css:129`, `src/app/globals.css:213`
**Description:** The `html` element has `letter-spacing: -0.01em` applied globally (line 129). The `.problem-description :is(h1, h2, h3, h4)` has `letter-spacing: -0.02em` (line 213). Both apply to ALL text including Korean. CLAUDE.md explicitly states: "Keep Korean text at the browser/font default letter spacing. Do not apply custom letter-spacing (or tracking-* Tailwind utilities) to Korean content." The Tailwind components correctly use locale-conditional patterns, but these CSS rules bypass that logic.
**Concrete failure scenario:** Korean problem description headings and all page text gets compressed letter-spacing, reducing readability. This directly violates the project's product rule.
**Fix:** Use `:not(:lang(ko))` selectors or `:lang()` conditional CSS to limit letter-spacing to non-Korean content. Add CSS comments referencing the CLAUDE.md rule.
**Cross-agent signal:** 10 of 11 agents flagged this — maximum signal.

### AGG-2: `api-key-auth.ts` uses `new Date()` for `lastUsedAt` while same function uses `getDbNowUncached()` for expiry [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-2), security-reviewer (SEC-1), critic (CRI-2), debugger (DBG-2), verifier (V-2), test-engineer (TE-2), tracer (TR-1), perf-reviewer (PERF-1)
**Files:** `src/lib/api/api-key-auth.ts:103`
**Description:** Line 88 uses `const now = await getDbNowUncached()` for expiry check. Line 103 writes `lastUsedAt: new Date()`. The `now` variable is already in scope and could be reused. This creates inconsistent timestamps in the same auth flow.
**Concrete failure scenario:** An audit query comparing `lastUsedAt` with `expiresAt` shows the key was used "after" it expired if the app server clock is ahead of the DB clock.
**Fix:** Replace `lastUsedAt: new Date()` with `lastUsedAt: now`.
**Cross-agent signal:** 8 of 11 agents flagged this — very high signal.

### AGG-3: Server actions use `new Date()` for `updatedAt`/`createdAt` — missed by DB-time migration [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-3), security-reviewer (SEC-3), architect (ARCH-2), critic (CRI-3), test-engineer (TE-3)
**Files:** `src/lib/actions/plugins.ts:47,117`, `src/lib/actions/language-configs.ts:61,116,204,263,313`, `src/lib/actions/system-settings.ts:118`, `src/lib/actions/user-management.ts:432,433`
**Description:** The cycle 7-8 DB-time migration covered API routes but not server actions. Server actions write to the same tables using `new Date()` while API routes use `getDbNowUncached()`.
**Fix:** Import and use `getDbNowUncached()` in server actions.
**Cross-agent signal:** 5 of 11 agents flagged this.

### AGG-4: Recruiting token flow uses `new Date()` for enrollment/redemption timestamps [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-4), security-reviewer (SEC-2)
**Files:** `src/lib/assignments/recruiting-invitations.ts:389,477,484,494,496`
**Description:** The `redeemRecruitingToken` function writes enrollment and redemption timestamps using `new Date()` while the atomic SQL claim uses `NOW()`. Already tracked as deferred item D13 from cycle 10.
**Fix:** Use `getDbNowUncached()` at the start of the function.

### AGG-5: Announcement and clarification routes use `new Date()` for `updatedAt`/`answeredAt` [LOW/LOW]

**Flagged by:** code-reviewer (CR-5)
**Files:** `src/app/api/v1/contests/[assignmentId]/announcements/[announcementId]/route.ts:54`, `src/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route.ts:55,56`
**Description:** Contest moderation timestamps use app server time. Low impact — no security or access-control relevance.
**Fix:** Use `getDbNowUncached()` for consistency.

### AGG-6: `recruiting-invitations-panel.tsx` date formatting ignores next-intl locale [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-6), designer (DES-2)
**Files:** `src/components/contest/recruiting-invitations-panel.tsx:252`
**Description:** `toLocaleDateString(undefined, {...})` uses browser's default locale instead of next-intl locale.
**Fix:** Use next-intl date formatter or pass locale to `toLocaleDateString()`.

### AGG-7: Rejudge route uses `new Date()` for contest-finished check [LOW/LOW]

**Flagged by:** code-reviewer (CR-7)
**Files:** `src/app/api/v1/submissions/[id]/rejudge/route.ts:79`
**Description:** Uses app server time for audit warning. No access-control impact.
**Fix:** Use `getDbNowUncached()` for consistency.

## Verified Safe / No Regression Found

- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- No `dangerouslySetInnerHTML` without sanitization.
- No `as any` type casts, `@ts-ignore`, or unsanitized SQL.
- Only 2 eslint-disable directives, both with justification comments.
- No silently swallowed catch blocks in server-side code.
- Korean letter-spacing remediation at the Tailwind/component level is complete and consistent.
- All previous DB-time migration fixes from cycles 7-8 are confirmed working.
- SSE connection tracking uses efficient data structures.
- Rate limiting uses PostgreSQL SELECT FOR UPDATE for TOCTOU prevention.
- CSRF protection is in place for server actions.
- HTML sanitization uses DOMPurify with strict allowlists.

## Agent Failures

None. All 11 review perspectives completed successfully.
