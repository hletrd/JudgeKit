# RPF Loop Cycle 1 — Document Specialist (2026-05-03)

**HEAD reviewed:** `37a4a8c3` (main)
**Reviewer:** document-specialist

## Summary
Doc/code consistency review focused on commits since cycle 3 aggregate.

## NEW findings

### DOC-1: [LOW] AGENTS.md or SECURITY.md should mention the new pre-restore snapshot artifact

- **File:** `src/lib/db/pre-restore-snapshot.ts` (new module) and `SECURITY.md` / `AGENTS.md`
- **Description:** The new pre-restore snapshot writes full-fidelity DB dumps to `${DATA_DIR}/pre-restore-snapshots/`. This is a sensitive artefact (contains password hashes, encrypted column values pre-decryption) and operators should know to (a) include the snapshot dir in backup rotation, (b) ensure volume permissions are 0700/0600, (c) prune manually if the 5-snapshot retention isn't right for their RPO.
- **Confidence:** MEDIUM
- **Fix:** Add a short subsection to `SECURITY.md` (or wherever backup/restore is documented) describing the snapshot location, retention, sensitivity, and permissions.

### DOC-2: [LOW] Encryption module JSDoc references "C7-AGG-7" without a reader-friendly index

- **File:** `src/lib/security/encryption.ts:8-21`
- **Description:** The JSDoc says "Plaintext-fallback risk profile (C7-AGG-7, deferred)". Future reviewers will Google for "C7-AGG-7" and find nothing in the repo (no index file maps cycle-aggregate IDs to decisions). Risk: the deferred warning gets dropped because nobody can re-find it.
- **Confidence:** LOW
- **Fix:** Either remove the AGG-id reference or add an index file at `.context/reviews/_findings-index.md` that lists every "C{N}-AGG-{X}" with status (open / deferred / resolved) and a one-line summary. (NB: the same applies to other commit messages and source comments referencing aggregate IDs.)

### DOC-3: [LOW] `judge/auth.ts:75-77` warn-log message uses `%s` printf placeholder without positional arg

- **File:** `src/lib/judge/auth.ts:92-95`
- **See:** code-reviewer CR-6 / debugger DBG-3. Same finding from a docs-of-code angle: the log message is misleading.
- **Confidence:** HIGH

### DOC-4: [LOW] Pre-existing comment on pre-restore-snapshot's `RETAIN_LAST_N=5` doesn't document the policy choice

- **File:** `src/lib/db/pre-restore-snapshot.ts:7`
- **Description:** `const RETAIN_LAST_N = 5;` has no comment explaining why 5 (vs. 3, vs. configurable). Operators may want to tune this.
- **Confidence:** LOW
- **Fix:** Add a JSDoc comment explaining the rationale (e.g., "5 chosen to retain ~1 week of weekly restores or ~5 emergency rollbacks before any operator review.") and mention that increasing it requires more disk.

## Final-sweep checklist

- [x] Cross-checked claims in commit messages against source — `909fcbf5` (judge token), `9e88d910` (docker token), `12417fa9` (IPv6 CIDR), `220d9182` (KaTeX) all verified.
- [x] No new doc/code mismatches at HEAD beyond the LOWs above.
