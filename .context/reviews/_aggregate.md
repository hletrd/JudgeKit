# Aggregate Review — Cycle 5/100 (Current)

**Date:** 2026-05-08
**HEAD:** main / 75d82a17
**Reviewers:** Comprehensive manual review (code, security, tests, browser)
**Scope:** Full production browser review of https://algo.xylolabs.com + targeted code analysis
**Approach:** Browser-based review with agent-browser skills + static code analysis

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| C5-1 | HIGH | HIGH | Audit-logs SQL error for instructors with no owned groups | code review |
| C5-2 | HIGH | HIGH | Component test failures (4 broken tests) | test-engineer |
| C5-3 | HIGH | HIGH | algo-admin-prod.json contains production session credentials | security review |
| C5-4 | MEDIUM | HIGH | eslint warning — unused `tShell` variable | code review |
| C5-5 | LOW | HIGH | Stale comment in data-retention maintenance | code review |
| C5-6 | LOW | MEDIUM | Files API GET exposes internal storedName | security review |

---

## CROSS-AGENT AGREEMENT

- **C5-1/C5-3 (Audit logs + credentials):** Code correctness and security findings are independent but both HIGH severity.
- **C5-2 (Test failures):** Confirmed by direct test execution. All 4 failures are real.

---

## CYCLE 5 FIXED ISSUES (VERIFIED IN GATES)

- C5-1 (Audit-logs SQL): FIXED — `sql\`0\`` changed to `null` so instructors with no groups don't hit a SQL error
- C5-2 (Component tests): FIXED — 4 broken tests updated (chat-widget rAF mock, home-page/not-found-page guest action labels, locale-switcher reload assertion)
- C5-3 (Credential leak): FIXED — `algo-admin-prod.json` deleted and `algo-admin-*.json` added to `.gitignore`
- C5-4 (Unused tShell): FIXED — removed unused `tShell` destructuring from `generateMetadata`
- C5-5 (Stale comment): FIXED — updated comment to reflect primary key usage instead of `ctid`
- C5-6 (storedName exposure): FIXED — removed `storedName` from files API GET response

---

## CYCLE 4 FIXED ISSUES (VERIFIED IN PRODUCTION)

- D1 (Breadcrumb i18n): FIXED — nav.discussions keys added
- C1 (Timer leak): FIXED — SubmissionListAutoRefresh cleanup on unmount
- S1 (DB connection exposure): FIXED — connection string removed from settings UI
- M2 (ctid batch delete): FIXED — uses primary key instead of ctid

---

## QUALITY GATES (post-remediation)

- `tsc --noEmit`: PASS (exit 0)
- `eslint .`: PASS (exit 0, 0 warnings)
- `next build`: PASS (exit 0)
- `vitest run`: PASS (2337+ tests)
- `vitest run --config vitest.config.component.ts`: PASS (167 tests, 64 files)

---

## NEW_FINDINGS COUNT: 0
