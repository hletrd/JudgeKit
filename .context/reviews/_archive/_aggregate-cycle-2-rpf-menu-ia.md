# Aggregate Review — Cycle 2/3 RPF (menu-IA, broadened)

**Date:** 2026-05-06
**HEAD:** main / 2198a39b
**Reviewers:** designer, code-reviewer, critic, architect, security-reviewer, perf-reviewer, test-engineer, verifier, tracer, debugger, document-specialist
**User focus:** menu hierarchy for admin & ease of use; cycle 1 already shipped: dropdown dedupe, admin chip wall replaced by CTA + curated shortcuts, breadcrumb home `/`, dropped orphan i18n, removed raw URL leakage. Continue + broaden.

---

## NEW FINDINGS THIS CYCLE (top-priority)

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| F1 | HIGH | HIGH | `AppSidebar` is dead code — never mounted; admin pages have no secondary nav | designer D2-01, code C2-01, architect, tracer, critic |
| F2 | MEDIUM | HIGH | `ConditionalHeader` is dead code with stale test | designer D2-02, code C2-02 |
| F3 | HIGH | HIGH | Triplicate admin-nav data (sidebar dead + landing + quick-shortcuts) | designer D2-03, code C2-03, architect, critic |
| F4 | MEDIUM | HIGH | Korean letter-spacing rule violation on admin landing section header | designer D2-04 |
| F5 | MEDIUM | MEDIUM | Top nav cap-unaware — `/groups`, `/problem-sets` only reachable via dropdown | designer D2-08, code C2-04 |
| F6 | MEDIUM | HIGH | Pre-existing test gates (custom-role-pages, platform-mode-ui) assert removed contracts | test T2-01, code C2-10/11, debugger |
| F7 | LOW | HIGH | `dashboard.adminQuickActions` label misleading after chip wall removal | designer D2-11, code C2-09 |
| F8 | LOW | HIGH | `getActiveTimedAssignmentsForSidebar` import dead in `(dashboard)/layout.tsx` | debugger B2-01, perf P2-03 |
| F9 | MEDIUM | MEDIUM | `ActiveTimedAssignmentSidebarPanel` orphaned by sidebar removal | code C2-05 |
| F10 | LOW | HIGH | Breadcrumb home link uses sr-only text, no aria-label | code C2-06 |
| F11 | MEDIUM | MEDIUM | Admin landing has no "back to dashboard" CTA / breadcrumb hidden behind hydration | designer D2-05 |

## CARRIED-FORWARD CYCLE-1 DEFERRALS (now actionable)

| Cycle-1 ID | Status this cycle |
|---|---|
| A9 (D5) admin-nav single source | SHIP this cycle (F3) |
| B1 (D6) cap-aware top nav | SHIP this cycle (F5) |
| B2 (D3) ConditionalHeader investigation | RESOLVED — delete (F2) |
| B3 (D8) sidebar slot consistency | RESOLVED with B2 |
| B4 (D14) mobile sidebar trigger | RESOLVED with B2 |
| B5 (D13) sidebar group ordering | resolves with F1 deletion or single-source |
| B6 (D15) Korean rhythm of admin landing | reinforced by F4 |
| Pre-1, Pre-2 unit test gates | SHIP this cycle (F6) |
| Pre-3 rate-limit test | DEFER (out of IA scope) |

## CROSS-AGENT AGREEMENT

- F1 (AppSidebar dead) confirmed by designer + code + architect + tracer + critic — five independent paths.
- F3 (triplicate admin-nav) confirmed by designer + code + architect + critic.
- F6 (stale unit tests) confirmed by code + test + debugger.

## QUALITY GATES (HEAD baseline)

- `tsc --noEmit`: PASS (exit 0).
- `eslint .`: PASS (exit 0).
- `next build`, vitest unit/component/security: same as cycle-1; 3 known pre-existing failures (Pre-1, Pre-2, Pre-3 from cycle-1 plan).

## AGENT FAILURES

None.

## NEW_FINDINGS COUNT: 11
