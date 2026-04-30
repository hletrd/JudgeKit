# RPF Cycle 3 — Document Specialist (doc/code mismatches)

**Date:** 2026-04-29
**HEAD reviewed:** 66146861
**Scope:** Documentation alignment with code, authoritative sources, repo policy quotes.

## Cycle change surface

`deploy-docker.sh` only.

## Doc-code alignment for the cycle-2 changes

### `deploy-docker.sh` header docstring vs implementation

The script header (lines 1-21) documents:
- Usage flags (`--skip-build`, `--skip-languages`, `--languages=...`).
- Env vars (`SSH_PASSWORD`, `SSH_KEY`, `REMOTE_HOST`, `REMOTE_USER`, `DOMAIN`).

It does NOT document:
- `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER` env vars (used at lines 81-82).
- `BACKUP_RETAIN_DAYS`, `SKIP_PREDEPLOY_BACKUP`, `SKIP_PG_VOLUME_CHECK`, `AUTO_MIGRATE_ORPHANED_PGDATA`, `DRIZZLE_PUSH_FORCE`, `DISABLE_MINIFY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` env vars (used throughout).

**C3-DOC-1 [LOW] `deploy-docker.sh` header docstring is incomplete vs the env-var surface the script actually reads.**
- File/lines: `deploy-docker.sh:1-21`.
- Severity: LOW.
- Confidence: HIGH.
- Failure scenario: New operator reads the header, doesn't realize `SKIP_PREDEPLOY_BACKUP=1` exists; deploy aborts on first backup failure with no clear escape hatch (the message at line 510 mentions the flag, but only after the failure).
- Suggested fix: Extend the header comment block to list every env var the script reads, in the format `VAR — purpose (default value)`. ≈15 lines added. Mirror the `--help` output where reasonable.
- Status: LOW, deferrable to a docs-touch cycle.

### `--help` output vs implementation

`--help` (line 92-110) documents `--skip-build`, `--skip-languages`, `--languages=...`, `--no-worker`, `--with-worker`, `--skip-worker-build`, `--build-worker`. Matches the for-loop arg parser at lines 83-114. CONFIRMED ALIGNED.

### Cycle-2 commit messages vs HEAD state

- `21125372` claims: ControlMaster + ControlPersist=60 + retry loop + cleanup trap. CONFIRMED ALIGNED at HEAD `66146861` (`deploy-docker.sh:140-178`).
- `66146861` claims: hardcode `/tmp` for `mktemp -d`. CONFIRMED ALIGNED (`deploy-docker.sh:151`).

### `AGENTS.md` vs cycle-2 chmod fix

`AGENTS.md` does not have a section on .env.production permissions. The cycle-2 fix (chmod 0600) was driven by a security review, not a documented policy. Adding a one-line note to AGENTS.md "Deploy hardening" subsection (if one is created) would close the loop on documenting *why* chmod 0600 is required. C2-AGG-3 partially covers this for drizzle-force; the chmod-0600 rationale could be documented similarly.

**C3-DOC-2 [LOW] AGENTS.md has no "Deploy hardening" subsection covering chmod-0600 + ControlMaster + secret backfill rationale.**
- File: `AGENTS.md`.
- Severity: LOW.
- Confidence: HIGH.
- Failure scenario: Future operator reverts the chmod-0600 line "to simplify the script", not knowing the security review rationale.
- Suggested fix: Add a "Deploy hardening" subsection to AGENTS.md citing each fix and its rationale (5-10 lines).
- Status: LOW, deferrable to docs-touch cycle.

### Cycle-2 plan doc accuracy

The cycle-2 plan (`plans/open/2026-04-29-rpf-cycle-2-review-remediation.md`) at line 30-44 marks Task B as "Deferred this cycle (entry-state). Exit criterion MET this cycle. Roll forward to cycle 3 as IN-PROGRESS." But the implementation actually landed in cycle-2 commits `21125372` and `66146861`, AFTER the plan was authored. The plan never got updated to reflect this.

**C3-DOC-3 [LOW] `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md` Task B status is stale; the work landed in commits `21125372` + `66146861`.**
- File/lines: `plans/open/2026-04-29-rpf-cycle-2-review-remediation.md:30-44`.
- Severity: LOW.
- Confidence: HIGH.
- Cross-reference: C3-CT-1, C3-CT-3.
- Suggested fix: Cycle-3 plan adds a closure note to the cycle-2 plan: "Task B (sshpass deploy-blocker) was implemented in cycle-2 commits 21125372 + 66146861, BEFORE cycle 2 closed but AFTER this plan was authored. The remaining sub-finding (SSH/sudo password decoupling) is now C3-CR-2 / C3-AGG-2B, deferred to cycle 4+."
- Status: Will be addressed in cycle-3 plan (PROMPT 2 work).

## Carry-forward doc findings

- **C2-AGG-3** (drizzle policy doc): RESOLVED at HEAD by AGENTS.md:349-362 (predates cycle 1). Cycle-2 plan thought it was deferred; reality is the doc already exists.

## Authoritative-doc check (no new findings)

- README.md / CONTRIBUTING.md (if any) — verified no contradictions with AGENTS.md or CLAUDE.md.
- `docs/languages.md` vs `src/lib/judge/languages.ts` — same as cycle-2 baseline; no new drift detected.

## Summary

- 3 new LOW findings (C3-DOC-1, C3-DOC-2, C3-DOC-3) — all about deploy-script + plan docs.
- All deferrable to docs-touch cycle.
- C2-AGG-3 confirmed RESOLVED at HEAD (predating cycle 1).

**Total new findings this cycle:** 3 LOW.
