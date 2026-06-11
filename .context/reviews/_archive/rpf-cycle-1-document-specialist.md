# Document Specialist Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** document-specialist
**HEAD reviewed:** `4cd03c2b`
**Scope:** Doc/code mismatch scan of changes since `988435b5`.

---

## Prior cycle status

- **C1-DOC-1 (password validation docs vs code mismatch):** RESOLVED — `password.ts` now only checks minimum length, matching AGENTS.md policy.
- **C1-DOC-2 (dead PasswordValidationError types):** RESOLVED — the type now only includes `"passwordTooShort"`.

---

## Doc/code mismatch scan

### Password policy (re-verification)

**AGENTS.md states:** "Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules."

**`src/lib/security/password.ts` implements:**
1. Minimum length check (8 chars) -- matches policy

**Verdict:** Code now matches the documented policy. C1-DOC-1 and C1-DOC-2 fully resolved.

---

## Findings

### C3-DOC-1: [INFO] No new doc/code mismatches found

All recent changes are consistent with their documentation:
- CSRF validation on recruiting validate endpoint follows the same pattern as documented in `csrf.ts` JSDoc.
- SQL-level moderation filtering is consistent with the `dt_scope_idx` index documentation.
- `performance.now()` migration is documented with inline comments referencing C12b-3.

### C3-DOC-2: [LOW] i18n keys for contest metadata keywords not documented in CONTRIBUTING.md

- **File:** `messages/en.json` (new keys under `contests.keywords`)
- **Confidence:** LOW
- **Description:** The new i18n keys `contests.keywords.programmingContest`, `contests.keywords.icpcScoring`, `contests.keywords.ioiScoring` are used in `generateMetadata` for SEO. There's no documentation about the i18n key naming convention for SEO metadata. This is a minor documentation gap.
- **Fix:** Consider adding a note in CONTRIBUTING.md about i18n key conventions for SEO metadata. Deferred — low priority.
