# Architect Review — Cycle 14/100

**Reviewer:** architect (manual)
**Date:** 2026-05-08
**HEAD:** fe8f8866
**Scope:** Architectural/design risks, coupling, layering

---

## NEW FINDINGS

### C14-AR-1 — Language admin: single AbortController conflates unrelated operations [MEDIUM]
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx:87`
- **Problem:** Build, remove, and prune are semantically independent operations. Using a single AbortController to govern all three couples them unnecessarily. This creates a hidden dependency: operation A cancels operation B even though they have no logical relationship.
- **Architectural recommendation:** Each async operation should own its cancellation token. If the component needs to cancel all pending work on unmount, collect all active controllers into an array and abort them in cleanup.

## No Other Architectural Issues Found

The overall architecture remains sound. API routes are well-layered, DB access is centralized, auth is consistent, and client-side state is well-managed.
