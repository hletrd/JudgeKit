# security-reviewer — RPF Cycle 10 (2026-06-13)

**Framing:** Authorized defensive hardening assessment of the owner's own JudgeKit platform.
**HEAD:** 03125b44 (clean tree).

## Method
Reviewed the auth/authz helper surface (`src/lib/auth/permissions.ts`, `role-helpers.ts`, `recruiting-token.ts`, `trusted-host.ts`), the recruiting/exam/contest route gates, the export redaction maps, the LIKE-search escaping on recruiting search, and the integrity-evidence ordering surfaces (anti-cheat events, code snapshots).

## Findings
**No new actionable security findings.**

Verified-good (defensive controls intact):
- Recruiting-invitation search uses parameterized `ILIKE ... ESCAPE '\\'` with `escapeLikePattern` (`recruiting-invitations.ts:259-263`) — no LIKE/SQL injection.
- Export engine redacts via `mergeRedactionMaps` UNION (not overwrite) and `EXPORT_ALWAYS_REDACT_COLUMNS` always applied even in full-fidelity mode (`export.ts:103-105`) — secrets never leak through the sanitized path.
- Hidden-test-case / cross-user-submission confidentiality: `accepted-solutions` route excludes assignment-tied submissions (`assignmentId IS NULL`, line 44) so contest code never leaks to peers when a problem flips public post-contest, and honors the per-user `shareAcceptedSolutions` flag.
- Integrity evidence (code-snapshot timeline) now paginates deterministically (cycle-9 AGG9-1 fix) — a defensible misconduct finding can no longer drop/dup evidence rows at a page seam.
- Korean letter-spacing rule, `config.ts` preservation, and seccomp deny-list posture unchanged and compliant.

## Carried (exit criteria did NOT fire this cycle)
- AGG8-2 heartbeat-gap scan order (LOW): bounded NON-paged scan, block unedited. Carry.
- P6-1 similarity normalize-loop (LOW/RISK): bounded by 500-row + 10k-literal caps, Rust sidecar is default engine, fallback unedited. Carry.

No High/Medium security/correctness finding is open or deferred this cycle.
