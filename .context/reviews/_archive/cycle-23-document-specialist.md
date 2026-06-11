# Cycle 23 Document Specialist Review

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### DOC-1: `apiFetch` JSDoc convention contradicts `contest-quick-stats.tsx` implementation [LOW/MEDIUM]

**Files:** `src/lib/api/client.ts:21`, `src/components/contest/contest-quick-stats.tsx:76-78`
**Description:** The `apiFetch` module's JSDoc comment explicitly states: "Never silently swallow errors -- always surface them to the user." The `contest-quick-stats.tsx` component violates this convention with `catch { // ignore }`. This creates a documentation-code mismatch where the stated convention is not enforced in practice.
**Fix:** Either fix the code to match the documentation (add toast error) or update the documentation to allow exceptions for supplementary data. The former is preferred.
**Confidence:** MEDIUM

### DOC-2: Workspace-to-public migration plan Phase 4 remaining items are vague [INFO/MEDIUM]

**Files:** `plans/open/2026-04-19-workspace-to-public-migration.md:251-254`
**Description:** Same as CRI-3. The Phase 4 remaining work item "Remove redundant page components under `(dashboard)` where public counterparts exist" does not enumerate specific components. After the redirects for rankings, languages, and compiler, it is unclear what remains.
**Fix:** Audit remaining dashboard routes against public routes and enumerate remaining removals, or mark Phase 4 as complete.
**Confidence:** MEDIUM

## Verified Safe

- `apiFetch` JSDoc documentation is accurate for all other observed implementations.
- CLAUDE.md rules (Korean letter-spacing, GPG signing, deployment architecture) are consistently followed.
