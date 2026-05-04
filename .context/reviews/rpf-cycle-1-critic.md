# Critic Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** critic
**HEAD reviewed:** `4cd03c2b`
**Scope:** Multi-perspective critique of changes since `988435b5`.

---

## Prior cycle status

- **C1-CT-1 (password validation policy-code mismatch):** RESOLVED — `password.ts` now matches AGENTS.md policy.
- **C1-CT-2 (deferred MEDIUM items should be scheduled):** CARRY — still relevant.

---

## Multi-perspective critique

### Progress assessment

This cycle shows good incremental progress:
1. **Security:** CSRF validation added to recruiting validate endpoint — consistent with all other POST endpoints.
2. **Performance:** SQL-level filtering for moderation queries — leverages existing indexes.
3. **Correctness:** "open" state filter fix for pinned+locked threads — addresses a real logic bug.
4. **i18n:** Hardcoded strings replaced with translations in contest and community pages.
5. **Testing:** 33 new unit tests for code similarity, 4 component tests for ConditionalHeader, 2 new test cases for recruiting validate.

### Remaining i18n gaps

The i18n fix in commit `95cbcf6a` was a good step, but there are still hardcoded English strings:
- `CodeTimelinePanel.tsx:93` — "Loading..."
- `CodeTimelinePanel.tsx:199` — "chars"
- `loading.tsx` files — "Loading..." in aria-label and sr-only text

These are low-severity but should be addressed for full i18n consistency.

### Deferred backlog health

The deferred MEDIUM items (D1, D2, AGG-2, ARCH-CARRY-1) remain deferred. The recommendation to schedule at least 1 MEDIUM item per cycle is still valid.

---

## Findings

### C3-CT-1: [LOW] Remaining hardcoded English strings after i18n fix

- **File:** `src/components/contest/code-timeline-panel.tsx:93,199`, `src/app/(dashboard)/loading.tsx`, `src/app/(public)/loading.tsx`
- **Confidence:** HIGH
- **Description:** The i18n fix in commit `95cbcf6a` replaced hardcoded strings in contest and community pages, but a few remain in the code timeline panel and loading screens. These should be translated for full i18n consistency.
- **Fix:** Use existing `common.loading` key and add a new `contests.codeTimeline.charCount` key.

### C3-CT-2: [LOW] Deferred MEDIUM items should still be scheduled

- **Confidence:** HIGH (carry-forward from C1-CT-2)
- **Description:** The recommendation to schedule at least 1 MEDIUM deferred item per cycle remains valid.
