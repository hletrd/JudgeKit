# Critic Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Multi-perspective critique of the change surface

---

## C4-CRIT-1 (HIGH, HIGH confidence) — `_sys.` namespace bypass on PATCH is the most critical finding this cycle

This overlaps with C4-CR-1 and C4-SEC-1. The pattern of adding a security control (namespace prefix) but missing a write path is a classic defense-in-depth failure. The severity is HIGH because it directly undermines the brute-force lockout added in cycles 2-3. An attacker with `recruiting.manage_invitations` can trivially bypass the per-invitation lockout by resetting the counter via the PATCH endpoint. The `recruiting.manage_invitations` capability is typically held by instructors and recruiters — not all of whom should be trusted to manipulate internal security counters.

**Fix:** As C4-CR-1/C4-SEC-1 — add `findInternalKeyViolation()` to `updateRecruitingInvitation`.

---

## C4-CRIT-2 (MEDIUM, MEDIUM confidence) — `mailto:` nofollow gaps persist despite repeated fixes

Cycle 2 fixed the recruiter email, cycle 3 fixed the privacy page email. Now the recruit start page email is also missing `rel="nofollow"`. This suggests a pattern: each `mailto:` link is fixed individually rather than systematically. There may be other `mailto:` links in the codebase that have not been found.

**Fix:** In addition to fixing line 231, search the entire `src/` tree for `<a` + `mailto:` patterns and ensure every one has `rel="nofollow"`. Consider a codemod or ESLint rule to enforce this going forward.

---

## C4-CRIT-3 (LOW, LOW confidence) — Recruiting token fingerprint uses a different hash pattern than the canonical `hashToken`

The `recruiting-token.ts:33` uses `createHash("sha256").update(token).digest("hex").slice(0, 8)` while the canonical `hashToken` returns the full hex digest. The fingerprint is intentionally truncated for logging, but the duplication of the hash algorithm is a maintenance risk (same as C4-CR-2). If `hashToken` is ever changed to use a different algorithm or encoding, the fingerprint will diverge silently from the stored `tokenHash`, breaking audit-log correlation.
