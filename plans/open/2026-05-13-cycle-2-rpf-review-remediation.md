# Cycle 2 RPF Review Remediation Plan

> Date: 2026-05-13
> Source: Cycle 1 deferred items + focused review of cycle 1 changes
> Status: Implemented

## Summary

This cycle addresses deferred medium- and low-severity findings from cycle 1 that were
feasible to implement without major refactoring.

## Implementation Status

| ID | Status | Commit | Notes |
|----|--------|--------|-------|
| SEC-4 | ✅ Done | bac4bd78 | Added 10s Promise.race timeout around `executeTool` calls |
| SEC-6 | ✅ Done | 16cc47e0 | Extended null-byte check to sample start, middle, and end regions |
| TEST-4 | ✅ Done | 1edff085 | Added edge case tests for URL-encoded chars, protocol prefix, empty registry list |

## Remaining Deferred Items (unchanged from cycle 1)

### COR-1: Judge claim problem lookup outside transaction
**Severity:** Medium  
**Reason:** The claim token check in the reset transaction provides adequate protection
against the TOCTOU race. Moving problem lookup inside the raw SQL CTE would require
significant refactoring for limited benefit.

### PERF-1: Proxy auth cache eviction
**Severity:** Low  
**Reason:** Lazy cleanup at 90% threshold is acceptable for the current load profile.

### PERF-2: getStaleImages sequential batching
**Severity:** Low  
**Reason:** Admin-only endpoint, called infrequently. pLimit(5) is sufficient.

### ARCH-1: createApiHandler generic 500 error
**Severity:** Low  
**Reason:** Intentional security design. Errors are logged server-side.

### ARCH-2: Judge worker dual token system
**Severity:** Low  
**Reason:** Both auth paths are well-documented and tested.

---

## Changes This Cycle

- `src/app/api/v1/plugins/chat-widget/chat/route.ts` — Added `TOOL_EXECUTION_TIMEOUT_MS`
  constant and wrapped `executeTool` in `Promise.race` with a 10-second timeout.
- `src/lib/files/validation.ts` — Extended `verifyFileMagicBytes` text-type check to
  sample three regions (start, middle, end) instead of only the first 8KB.
- `tests/unit/files/magic-byte-verification.test.ts` — Updated test to expect rejection
  of null bytes after 8KB; added test for large clean text files.
- `tests/unit/judge/docker-image-validation.test.ts` — Added tests for URL-encoded
  characters, protocol-style prefix, and empty trusted registries list.
