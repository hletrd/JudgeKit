# RPF Cycle 3 — Aggregate Review (2026-05-04)

**Date:** 2026-05-04
**HEAD reviewed:** `4cd03c2b` (main)
**Reviewer:** Comprehensive multi-perspective (code-quality, security, perf, architect, debugger, test-engineer, tracer, verifier, critic, document-specialist, designer consolidated)

---

## Prior cycle resolutions

The following findings from cycle 1 (new round) have been resolved:

| ID | Description | Status |
|---|---|---|
| C1-CR-1 / C1-SR-1 / C1-CT-1 / C1-VE-1 / C1-TR-1 / C1-DOC-1 | password.ts policy-code mismatch | RESOLVED |
| C1-DB-2 / C1-DOC-2 | PasswordValidationError dead types | RESOLVED |

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 4 LOW.

### AGG3-1: [LOW] Hardcoded "Loading..." in CodeTimelinePanel

- **File:** `src/components/contest/code-timeline-panel.tsx:93`
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer (C3-CR-1), critic (C3-CT-1)
- **Description:** The loading state uses a hardcoded English string instead of the i18n translation key `common.loading`. The component already uses `useTranslations("common")` as `tCommon`.
- **Fix:** Replace with `{tCommon("loading")}`.

### AGG3-2: [LOW] Hardcoded "chars" in CodeTimelinePanel

- **File:** `src/components/contest/code-timeline-panel.tsx:199`
- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer (C3-CR-2), designer (C3-DS-2), critic (C3-CT-1)
- **Description:** The character count label `{current.charCount} chars` is hardcoded in English.
- **Fix:** Add i18n key `contests.codeTimeline.charCount` and use `t("charCount", { count: current.charCount })`.

### AGG3-3: [LOW] Hardcoded "Loading..." in loading.tsx files

- **File:** `src/app/(dashboard)/loading.tsx:3,5` and `src/app/(public)/loading.tsx:3,5`
- **Confidence:** MEDIUM
- **Cross-agent agreement:** code-reviewer (C3-CR-3), designer (C3-DS-1), critic (C3-CT-1)
- **Description:** Server components use hardcoded English "Loading..." for `aria-label` and sr-only text. The `common.loading` key exists in i18n files.
- **Fix:** Convert to async server components using `getTranslations("common")`.

### AGG3-4: [LOW] CodeTimelinePanel has no dedicated test

- **File:** `src/components/contest/code-timeline-panel.tsx`
- **Confidence:** MEDIUM
- **Cross-agent agreement:** test-engineer (C3-TE-1)
- **Description:** The CodeTimelinePanel component has no dedicated test. It has fetch logic, state management, and conditional rendering that would benefit from component tests.
- **Fix:** Add component test under `tests/component/`.

---

## Carry-forward DEFERRED items

All previously deferred items from the cycle 1 aggregate remain valid. No path drift detected at HEAD `4cd03c2b`.

| ID | Severity | Status | Exit criterion |
|---|---|---|---|
| AGG1-2 | MEDIUM | DEFERRED | Per-invitation-token rate limiting design decision |
| AGG1-4 | MEDIUM | CARRY | Rate-limit consolidation cycle |
| AGG1-7 | LOW | DEFERRED | Runtime re-read of legal hold (now function-based) |
| AGG1-8 | LOW | CARRY | Runtime assertion added; fragility concern remains |
| AGG1-15 | LOW | DEFERRED | DB time caching optimization |
| AGG1-17 | LOW | DEFERRED | CSP unsafe-inline known tradeoff |
| C3-AGG-5 through C1-AGG-22 | LOW | DEFERRED | Various exit criteria |
| SEC2-2, SEC2-3 | LOW | DEFERRED | Various |
| DSGN3-1, DSGN3-2 | LOW | DEFERRED | UX cycle |
| D1, D2 | MEDIUM | DEFERRED | Auth-perf cycle |
| ARCH-CARRY-1 | MEDIUM | DEFERRED | API-handler refactor |
| ARCH-CARRY-2 | LOW | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | DEFERRED | Anti-cheat perf |
| C1-CR-2 | LOW | CARRY | import.ts `any` types |
| C1-CR-3 / C1-DB-1 | LOW | CARRY | latestSubmittedAt mixed-type comparison |
| C1-CR-4 | LOW | CARRY | console.error sites |
| C1-SR-2 | LOW | CARRY | chmod 0o770 |
| C1-PR-1 | LOW | CARRY | Polling intervals not visibility-paused |
| C1-PR-2 | LOW | CARRY | Sequential DB queries |
| C1-TE-2 | LOW | CARRY | getAssignmentStatusRows integration test |
| C1-TE-3 | LOW | CARRY | Playwright browser dependency |
| C1-AR-1 | LOW | CARRY | rateLimits table overloaded for SSE |
| C1-AR-2 | LOW | CARRY | import.ts `any` types |

No HIGH findings deferred. No security/correctness/data-loss findings deferred unjustifiably.

---

## Cross-agent agreement summary

- All HIGH-confidence findings from previous cycles have been resolved or documented.
- The password.ts policy-code mismatch (the most significant finding from cycle 1) is fully resolved.
- Only 4 LOW-severity items remain as actionable this cycle (AGG3-1 through AGG3-4).
- All agents agree that the recent changes (CSRF validation, SQL-level filtering, i18n fixes, performance.now() migration) are well-implemented.

---

## Agent failures

None — all 11 review agents completed successfully.

---

## Suggested PROMPT 3 priority order

1. **AGG3-1 (hardcoded "Loading..." in CodeTimelinePanel)** — simple i18n fix
2. **AGG3-2 (hardcoded "chars" in CodeTimelinePanel)** — add i18n key and use it
3. **AGG3-3 (hardcoded "Loading..." in loading.tsx)** — convert to async server components
4. **AGG3-4 (CodeTimelinePanel test)** — add component test