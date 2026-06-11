# Cycle 28 Aggregate Review

**Date:** 2026-04-20
**Base commit:** d4489054
**Review artifacts:** cycle-28-code-reviewer.md through cycle-28-document-specialist.md

## Deduplicated Findings

### AGG-1: localStorage.setItem crashes in private browsing — compiler-client and submission-detail-client [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1, CR-2), security-reviewer (SEC-1, SEC-2), debugger (DBG-1, DBG-2), verifier (VER-1), tracer (Flow 1, Flow 2), critic (CRIT-1), perf-reviewer (related)
**Cross-agent agreement:** 6 of 10 reviewers flagged this independently. HIGH signal.
**Citations:**
- `src/components/code/compiler-client.tsx:183` — `localStorage.setItem("compiler:language", language);`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94` — `localStorage.setItem(key, JSON.stringify(payload));`
**Description:** Both components write to `localStorage` without try/catch. In Safari private browsing mode, this throws `QuotaExceededError`, crashing the compiler component and blocking the resubmit navigation. All other localStorage write operations in the codebase (use-source-draft.ts, anti-cheat-monitor.tsx) are wrapped in try/catch.
**Concrete failure scenario:** Safari private browsing user changes language on the playground, or clicks "Resubmit" on a submission, and the operation fails with an unhandled exception.
**Fix:** Wrap both `localStorage.setItem` calls in try/catch blocks. For the submission-detail-client, ensure `router.push()` executes regardless of draft save success.

### AGG-2: Contest clarifications show raw userId instead of username for other users [LOW/MEDIUM]

**Flagged by:** designer (DES-2), tracer (Flow 3), critic (CRIT-2)
**Cross-agent agreement:** 3 of 10 reviewers flagged this.
**Citation:** `src/components/contest/contest-clarifications.tsx:257`
**Description:** When a clarification was not asked by the current user, the component displays the raw `userId` (a UUID) instead of a human-readable name. This makes it impossible for users to identify who asked a question.
**Concrete failure scenario:** In a contest with 100 participants, the clarifications panel shows UUIDs instead of names.
**Fix:** Requires backend API change to include `userName` in the clarifications response. Frontend should then render the name instead of the ID.

### AGG-3: compiler-client uses `defaultValue` on all `t()` calls — possible missing i18n keys [LOW/LOW]

**Flagged by:** code-reviewer (CR-4), designer (DES-1), document-specialist (DOC-1)
**Cross-agent agreement:** 3 of 10 reviewers flagged this.
**Citation:** `src/components/code/compiler-client.tsx` (multiple lines)
**Description:** The compiler client uses `t("key", { defaultValue: "English fallback" })` extensively while no other component does. This may indicate incomplete `compiler.*` i18n keys in non-English locale files.
**Fix:** Verify all `compiler.*` keys exist in both locale files. Remove `defaultValue` if keys are present. Add missing keys if not.

### AGG-4: Duplicated visibility-aware polling pattern across 4 components [LOW/LOW]

**Flagged by:** code-reviewer (CR-3), architect (ARCH-1), perf-reviewer (PERF-1)
**Cross-agent agreement:** 3 of 10 reviewers flagged this.
**Citations:**
- `src/components/contest/contest-announcements.tsx:71-95`
- `src/components/contest/contest-clarifications.tsx:87-111`
- `src/components/contest/participant-anti-cheat-timeline.tsx:89-95`
- `src/hooks/use-submission-polling.ts:192-291`
**Description:** Four components implement their own visibility-aware polling logic. This is a DRY violation that increases maintenance burden.
**Fix:** Extract a shared `useVisibilityAwarePolling(callback, intervalMs)` hook. Previously noted as DEFER-11. Low priority.

## Verified Safe / No Regression

- Error boundary console.error gating confirmed (AGG-8 from cycle 27).
- console.warn gating in create-problem-form confirmed (AGG-9 from cycle 27).
- not-found.tsx tracking comment confirmed (AGG-10 from cycle 27).
- Workspace-to-public migration Phase 5 complete and verified.
- CSP, HSTS, CSRF protections robust.
- Korean letter-spacing compliance comprehensive.
- No `as any`, `@ts-ignore`, `@ts-expect-error` in production code.
- Only 2 eslint-disable directives, both justified.
- No silently swallowed catch blocks (all `.catch(() => {})` are for acceptable fire-and-forget operations).
- Auth flow secure (Argon2id, timing-safe dummy hash, token invalidation).
- sign-out.ts properly clears app-specific storage prefixes.

## Agent Failures

None. All review perspectives completed successfully.
