# Architect — Cycle 26

**Date:** 2026-05-09
**Cycle:** 26 of 100
**Base commit:** 5594a074
**Current HEAD:** 5594a074 (clean working tree)

---

## Findings

### AR-26-1: Transaction wrapper inconsistency in judge/poll (carry-forward)

- **File**: `src/app/api/v1/judge/poll/route.ts:77,136`
- **Severity**: Low
- **Confidence**: High
- **Description**: Using `execTransaction` in one path and `db.transaction` in another breaks the abstraction layer. If `execTransaction` later adds retries, metrics, or logging, the direct `db.transaction` path would miss these behaviors.
- **Fix**: Standardize on `execTransaction` throughout.

### AR-26-2: Auto-review lacks output guardrails (NEW)

- **File**: `src/lib/judge/auto-review.ts`
- **Severity**: Medium
- **Confidence**: Medium
- **Description:** The auto-review pipeline has no output validation layer. LLM-generated content goes directly from the provider to the database to the user-facing UI without content moderation. In an educational platform, this creates a risk of inappropriate content reaching students.
- **Architectural recommendation:** Add a content moderation layer (even a simple regex/word-list filter) between LLM output and DB storage. Also consider adding a `reviewStatus` field to submissions to track review lifecycle.

---

## Verified Architecture

- **API Layer**: `createApiHandler` provides consistent middleware (auth, CSRF, rate limit, validation). No route bypasses this.
- **Database Layer**: All DB access through Drizzle ORM. Schema centralized in `schema.pg.ts`.
- **Auth Layer**: Session management abstracted behind `getApiUser`, `createApiHandler`, proxy middleware.
- **File Layer**: Storage operations abstracted behind `src/lib/files/storage.ts`.
- **Judge Layer**: Execution delegated to Rust sidecar or local Docker with clear boundaries.
- **Client Layer**: API calls go through `apiFetch`/`apiFetchJson` wrapper.
- **Abort Utilities**: `src/lib/abort.ts` module provides shared timeout primitives.

## Coupling Check

- No direct DB imports in components
- No circular dependencies in key modules
- Rust/TS interop is clean with typed interfaces
- Docker client abstraction isolates Docker CLI calls

---

## Final Sweep

No new architectural risks identified.
