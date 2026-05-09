# Critic — Cycle 25

Reviewer: critic
Date: 2026-05-09
Scope: Multi-perspective critique of the whole codebase
Base commit: 75d82a17

## Summary

Three design-level observations. The codebase maintains strong consistency. One carry-forward from C19 remains.

---

## Findings

### CT-25-1: Transaction wrapper inconsistency in judge/poll persists

- **File**: `src/app/api/v1/judge/poll/route.ts:77,136`
- **Severity**: Low
- **Confidence**: High

**Description**: The same inconsistency flagged in C19-2 (mixing `execTransaction` and `db.transaction`) is still present after 6 cycles. This suggests either the finding was deferred without a plan, or the plan was not executed. Cross-file consistency matters for maintainability.

**Fix**: Change line 136 to use `execTransaction`.

### CT-25-2: `any` type usage in TABLE_MAP undermines import safety

- **File**: `src/lib/db/import.ts:19`
- **Severity**: Medium
- **Confidence**: High

**Description**: The import engine is a critical data-migration path. Using `any` for table references means TypeScript cannot catch table name mismatches or incorrect column references. Given that imports REPLACE all database data, type safety here is especially important.

**Fix**: Replace `Record<string, any>` with a derived type from `TABLE_ORDER`.

### CT-25-3: Registry prefix validation lacks boundary enforcement

- **File**: `src/lib/judge/docker-image-validation.ts:1-3`
- **Severity**: Medium
- **Confidence**: Medium

**Description**: From a threat-modeling perspective, `startsWith` on registry prefixes is a classic prefix-matching bug. An attacker controlling the registry configuration (or via social engineering of an operator) could exploit this to pull from an untrusted registry that happens to start with a trusted prefix.

**Fix**: Add boundary check as described in SEC-25-1.

---

## Verified Consistency

- Auth middleware is consistently applied across all API routes
- Error handling patterns are uniform (apiError codes, logger usage)
- Drizzle ORM used consistently — no raw SQL with user input
- Docker operations all use `isAllowedJudgeDockerImage` validation
- Client-side API calls all go through `apiFetch` wrapper

---

## Final Sweep

No contradictions between modules, no inconsistent error handling strategies, no mismatched frontend/backend contracts found.
