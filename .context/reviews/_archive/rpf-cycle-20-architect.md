# RPF Cycle 20 — Architect

**Date:** 2026-04-22
**Base commit:** 4182e529

## Findings

### ARCH-1: Recurring `.json()` anti-pattern suggests `apiFetchJson` adoption is insufficient [MEDIUM/HIGH]

**Description:** Despite cycles 18-19 fixing 5+ locations with unguarded `.json()` calls, cycle 20 discovers 4+ more. The root cause is architectural: `apiFetchJson` exists but is optional. Developers naturally reach for the lower-level `apiFetch` + `.json()` pattern. The convention documented in `client.ts` is not enforced at the tooling level.

**Files affected:** All files using `apiFetch` + `.json()` directly instead of `apiFetchJson`.

**Fix options (ranked):**
1. Add an ESLint custom rule that flags `response.json()` not preceded by `.catch()` or used inside `apiFetchJson`
2. Deprecate `apiFetch` for client components and make `apiFetchJson` the primary API
3. Add a `@tslint` or code comment convention enforced by CI

---

### ARCH-2: `comment-section.tsx:45` — GET path uses `apiFetch` + raw `.json()` instead of `apiFetchJson` [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:45`

**Description:** The comment fetch is a simple GET + parse JSON pattern that is exactly what `apiFetchJson` was designed for. Using raw `apiFetch` + `.json()` creates a maintenance hazard.

**Fix:** Migrate to `apiFetchJson`.

---

### ARCH-3: `Number()` vs `parseFloat()` inconsistency in numeric input parsing [LOW/LOW]

**Files:**
- `src/lib/plugins/chat-widget/admin-config.tsx:294,305` — uses `Number()`
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:454` — uses `Number()` for exam duration
- `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:651` — uses `parseFloat() || 0` for points

**Description:** The codebase lacks a consistent pattern for parsing numeric HTML input values. Some locations use `Number()`, some use `parseFloat() || 0`, and some use `parseInt()`. A shared utility (e.g., `parseNumericInput(value, fallback)`) would eliminate the inconsistency.

**Fix:** Consider adding a utility function to `src/lib/validators/preprocess.ts` for numeric input parsing.

---

## Verified Safe (No Issue Found)

- `apiFetchJson` correctly handles both ok and not-ok responses in a single call
- The CSRF protection pattern (`X-Requested-With` header) is consistently applied via `apiFetch`
- Error handling convention is well-documented in `src/lib/api/client.ts`
- `formatting.ts` properly centralizes number formatting utilities
