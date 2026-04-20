# Perf Reviewer

**Date:** 2026-04-20
**Base commit:** 52d81f9d
**Angle:** Performance, responsiveness, resource usage

## Inventory
- Reviewed the live public routes and shared pagination primitive
- Reviewed the public entry-point header wiring for duplicated work / drift

## F1: Shared pagination failure converts what should be paginated content into full-page error rendering
- **File:** `src/components/pagination-controls.tsx:1-60`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Status:** confirmed issue
- **Description:** The invalid client/server boundary does not just break correctness; it prevents paginated routes from rendering at all, turning low-cost page navigation into a failed full-page load.
- **Concrete failure scenario:** `/practice` and `/rankings` do no useful work for the user because the UI never reaches the point where pagination or data browsing is possible.
- **Suggested fix:** Repair the boundary first; route-level perf work is meaningless until the pages render.

## Final sweep
- No separate high-signal performance hotspot outweighed the public-route outage in this cycle's reviewed surface.
