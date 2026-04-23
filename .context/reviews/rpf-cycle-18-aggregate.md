# RPF Cycle 18 Aggregate Review

**Date:** 2026-04-20
**Base commit:** 2b415a81
**Review artifacts:** `rpf-cycle-18-code-reviewer.md`, `rpf-cycle-18-security-reviewer.md`, `rpf-cycle-18-perf-reviewer.md`, `rpf-cycle-18-architect.md`, `rpf-cycle-18-critic.md`, `rpf-cycle-18-debugger.md`, `rpf-cycle-18-test-engineer.md`, `rpf-cycle-18-designer.md`

## Deduped Findings (sorted by severity then signal)

### AGG-1: Inconsistent locale handling in number formatting — hardcoded "en-US" in `formatNumber` [MEDIUM/MEDIUM]

**Flagged by:** code-reviewer (CR-1), critic (CRI-1), architect (ARCH-2), test-engineer (TE-2)
**Files:** `src/components/submission-status-badge.tsx:45`
**Description:** `SubmissionStatusBadge.formatNumber` uses `toLocaleString("en-US")` while the rest of the codebase uses locale-aware formatting utilities from `@/lib/datetime`. There is no shared number formatting utility — number formatting is done ad-hoc with hardcoded locale or `.toFixed()`.
**Concrete failure scenario:** Adding a locale with different digit grouping (e.g., Hindi, Arabic) would produce incorrect number formatting. The hardcoded "en-US" signals incomplete i18n coverage.
**Fix:** Create a `formatNumber(value, locale)` utility (either in `@/lib/datetime` or a new `@/lib/format` module) and use it consistently across all number display code.
**Cross-agent signal:** 4 of 8 agents flagged this independently.

### AGG-2: Access code share link does not include locale prefix [LOW/MEDIUM]

**Flagged by:** critic (CRI-3), designer (DES-1), debugger (DBG-3 — related)
**Files:** `src/components/contest/access-code-manager.tsx:126`
**Description:** The share URL `const url = `${window.location.origin}/dashboard/contests/join?code=${code}`;` does not include the locale prefix (e.g., `/ko/`). All other navigation links in the app use locale-aware path builders.
**Concrete failure scenario:** A Korean instructor shares an access code link with students. Students click the link and see the page in English instead of Korean.
**Fix:** Use `buildLocalizedHref()` from `@/lib/locale-paths` or prepend `/${locale}/` to the path.
**Cross-agent signal:** 3 of 8 agents flagged this independently.

### AGG-3: Practice page progress-filter path fetches all matching problem IDs for in-JS filtering — performance risk at scale [MEDIUM/MEDIUM]

**Flagged by:** perf-reviewer (PERF-1), architect (ARCH-1 — related decomposition concern), test-engineer (TE-1)
**Files:** `src/app/(public)/practice/page.tsx:417-437`
**Description:** When a progress filter (solved/unsolved/attempted) is active, Path B fetches ALL matching problem IDs and ALL user submissions into memory, filters in JavaScript, then paginates. The code has a comment acknowledging this should be moved to SQL.
**Concrete failure scenario:** With 10,000+ public problems, this path could take several seconds and consume significant memory.
**Fix:** Move the progress filter logic into a SQL CTE or subquery. Extract the data-fetching logic into a testable module.
**Cross-agent signal:** 3 of 8 agents flagged related concerns.

### AGG-4: Hardcoded English error string in api-keys clipboard fallback [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-4), debugger (DBG-2 — related clipboard feedback)
**Files:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:201`
**Description:** `toast.error("Failed to copy — please select and copy manually")` is a hardcoded English string. The rest of the component uses `t()` for all user-facing strings.
**Concrete failure scenario:** Korean users see an English error toast when the clipboard write fails.
**Fix:** Add a `copyFailed` i18n key to `messages/en.json` and `messages/ko.json` and use `t("copyFailed")`.

### AGG-5: `userId!` non-null assertion in practice page progress filter [LOW/MEDIUM]

**Flagged by:** code-reviewer (CR-2), debugger (DBG-1)
**Files:** `src/app/(public)/practice/page.tsx:431`
**Description:** `eq(submissions.userId, userId!)` uses a non-null assertion. While the control flow guarantees userId is non-null at this point, the assertion suppresses TypeScript's null safety.
**Fix:** Capture `const uid = userId!; /* guaranteed by currentProgressFilter check */` at the start of the else block.

### AGG-6: `copy-code-button.tsx` does not show error feedback on clipboard failure [LOW/LOW]

**Flagged by:** debugger (DBG-2), code-reviewer (CR-3 — related `execCommand` deprecation)
**Files:** `src/components/code/copy-code-button.tsx:20-31`
**Description:** When both `navigator.clipboard.writeText()` and `document.execCommand("copy")` fail, there is no user-facing error feedback. Other clipboard components show `toast.error()` on failure.
**Fix:** Add error feedback in the `execCommand` fallback path.

### AGG-7: Practice page component exceeds 700 lines — needs decomposition [LOW/MEDIUM]

**Flagged by:** architect (ARCH-1), critic (CRI-2)
**Files:** `src/app/(public)/practice/page.tsx` (713 lines)
**Description:** The practice page handles search, filtering, sorting, pagination, and JSON-LD generation all in one server component. Two major branches (Path A and Path B) share significant mapping logic with duplication.
**Fix:** Extract data-fetching and filtering logic into `src/lib/practice/data.ts`.

### AGG-8: Recruiting invitations panel `min` date attribute uses `new Date()` client time [LOW/LOW]

**Flagged by:** debugger (DBG-3)
**Files:** `src/components/contest/recruiting-invitations-panel.tsx:408`
**Description:** `min={new Date().toISOString().split("T")[0]}` uses the browser's local clock for the date picker minimum. Server validates using DB time, so no data integrity issue, but UX mismatch possible.
**Fix:** Consider using a server-provided date, or document that this is a UX-only hint.

## Verified Safe / No Regression Found

- Auth flow is robust with Argon2id, timing-safe dummy hash, rate limiting, and proper token invalidation.
- No `dangerouslySetInnerHTML` without sanitization — both uses are properly sanitized.
- No `as any` type casts.
- No `@ts-ignore` or `@ts-expect-error`.
- Only 2 eslint-disable directives, both with justification.
- No silently swallowed catch blocks without legitimate reason.
- CSRF protection is consistent across all mutation routes.
- HTML sanitization uses DOMPurify with strict allowlists.
- Korean letter-spacing remediation is comprehensive — all headings and labels are properly locale-conditional.
- Mobile PublicHeader focus trap and keyboard navigation are correctly implemented.
- Previous cycle-27 fixes (recruit page clock-skew, SSE connection handling) are confirmed working.

## Agent Failures

None. All 8 review perspectives completed successfully.
