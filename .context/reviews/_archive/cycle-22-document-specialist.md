# Document Specialist — Cycle 22

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### DOC-1: Cycle-21 plan M4 status is PENDING but the fix is already in code [LOW/HIGH]

**File:** `plans/open/2026-04-20-rpf-cycle-21-review-remediation.md:124`
**Description:** M4 ("Replace `confirmAction` unsafe type casting with discriminated union") shows status "PENDING" but commit c89d7432 explicitly includes "M4" in its message ("fix(admin): harden language config table with apiFetch, error handling, accessibility (H1/H2/M1/M4)"). The code change is present in `language-config-table.tsx`.
**Fix:** Update M4 status to DONE.
**Confidence:** HIGH

### DOC-2: `formatNumber` deprecation re-export in `datetime.ts` is still present [LOW/MEDIUM]

**File:** `src/lib/datetime.ts:57-61`
**Description:** The `@deprecated` JSDoc tag was added but the re-export remains. The deprecation notice says "will be removed in a future release" but no timeline is specified. Several files may still import from `datetime.ts`.
**Fix:** Either set a concrete removal version/timeline or complete the migration now.
**Confidence:** MEDIUM

## Verified Safe

- CLAUDE.md rules are correctly followed (Korean letter-spacing, deployment config, GPG-signed commits).
- All JSDoc comments for formatting utilities are accurate and up-to-date.
- Navigation module documentation is consistent between `public-nav.ts` and `public-header.tsx`.
