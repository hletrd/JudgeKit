# Tracer Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** tracer
**Base commit:** d32f2517

## TR-1: `participant-anti-cheat-timeline.tsx` polling offset drift — causal trace [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:90-114`
**Confidence:** MEDIUM

**Trace:**
1. User opens anti-cheat timeline for a student (50 events)
2. `fetchEvents()` loads first 50, `offset` = 50
3. User clicks "Load More", `loadMore()` fetches offset=50, gets events 51-80, `offset` = 80
4. `events` state now has 80 events
5. 30 seconds later, `useVisibilityPolling` triggers `fetchEvents()`
6. Server now has 90 events (10 new ones added since step 2)
7. `freshFirstPage` = events 1-50 from server (which now includes the 10 new events, shifting old events 41-50 to positions 51-60)
8. Code: `setEvents([freshFirstPage, ...prev.slice(PAGE_SIZE)])` = `[events1-50_new, ...events51-80_old]`
9. But `events51-80_old` now correspond to server positions 61-90 (shifted by 10)
10. Events at server positions 51-60 are missing from display (lost in the gap between freshFirstPage and the stale second page)

**Hypothesis confirmed:** Events are lost at the page boundary during polling when new events are added server-side.

**Fix:** On poll refresh, reset to just the first page and invalidate the `loadMore` offset.

---

## TR-2: `forceNavigate` call sites should be audited for unnecessary hard navigation [LOW/LOW]

**File:** `src/lib/navigation/client.ts:3-5`
**Confidence:** LOW

**Trace of call sites:**
- `src/app/(dashboard)/dashboard/contests/layout.tsx:37` — `window.location.href = href` (used for data-full-navigate attribute, which is explicitly opt-in)
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:23` — uses `window.location.href` for post-join redirect (justified: needs to bypass RSC streaming bug)

Both call sites are justified. No issue found.

---

## TR-3: `quick-create-contest-form.tsx` success path silent failure — causal trace [LOW/MEDIUM]

**File:** `src/components/contest/quick-create-contest-form.tsx:79-84`
**Confidence:** MEDIUM

**Trace:**
1. User fills out quick-create form and clicks "Create Assessment"
2. API returns `200 OK` with body: `{ data: { assignmentId: "abc123" } }`
3. `res.json()` succeeds, `json.data.assignmentId` = "abc123"
4. User is redirected to `/dashboard/contests/abc123` — correct

**Alternative trace (malformed success response):**
1. API returns `200 OK` with body: `{ data: {} }` (missing assignmentId)
2. `res.json()` succeeds, `json.data.assignmentId` = undefined
3. `if (json.data?.assignmentId)` is falsy — no redirect
4. User sees "createSuccess" toast but stays on the create form page
5. No error indication — user is confused about whether creation succeeded

**Fix:** If `assignmentId` is missing on success, show a toast and redirect to the contests list.
