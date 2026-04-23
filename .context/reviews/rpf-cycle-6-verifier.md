# Verifier — RPF Cycle 6

## Scope
Evidence-based correctness verification of prior-cycle fixes and current code.

## Verification Results

### VERIFIED-1: Cycle 5 AGG-1 — PublicHeader dropdown role filtering
- **Status:** CONFIRMED FIXED
- **Evidence:** `src/lib/navigation/public-nav.ts:79-86` — `getDropdownItems(capabilities)` filters `DROPDOWN_ITEM_DEFINITIONS` by capability. Items without a capability are always shown. Items with a capability (e.g., `problem_sets.create`, `system.settings`) are only shown if the user has that capability. This replaces the old `adminOnly`/`instructorOnly` flag system.

### VERIFIED-2: Cycle 5 AGG-2 — Group assignment export row limit
- **Status:** CONFIRMED FIXED
- **Evidence:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:14,55-56` — `MAX_EXPORT_ROWS = 10_000` with truncation and a trailing comment in the CSV.

### VERIFIED-3: Cycle 5 AGG-3 — Group assignment export rate limiting
- **Status:** CONFIRMED FIXED
- **Evidence:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:16` — Now uses `createApiHandler({ rateLimit: "export" })`.

### VERIFIED-4: Cycle 5 AGG-8 — Group assignment export `bestTotalScore` renders "null"
- **Status:** CONFIRMED FIXED
- **Evidence:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:70` — `const score = row.bestTotalScore ?? "";` produces empty string instead of "null".

### VERIFIED-5: Cycle 28 AGG-1 — localStorage crashes in private browsing
- **Status:** CONFIRMED FIXED
- **Evidence:**
  - `src/components/code/compiler-client.tsx:188` — `try { localStorage.setItem(...) } catch { }`
  - `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94` — `try { localStorage.setItem(...) } catch { }`

### VERIFIED-6: Cycle 28 AGG-3 — Redundant defaultValue in compiler-client.tsx
- **Status:** NOT VERIFIED (file not in recent diff, likely not addressed yet)
- **Note:** This was listed as TODO in the cycle 28 plan. Need to check compiler-client.tsx.

## New Findings

### V-1: `recruiting-invitations-panel.tsx` — `handleCreate` missing catch block (confirms CR-2)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Verified by code trace:** `try` at line 153, `finally` at line 210, no `catch` between them. `apiFetch` at line 170 can throw TypeError on network failure. The throw would bypass all toast notifications.

### V-2: `anti-cheat-dashboard.tsx` — Polling resets loaded events (confirms PERF-1, DBG-1)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Verified by code trace:** `fetchEvents` line 125 calls `setEvents(json.data.events)` replacing all events. Line 127 `setOffset(json.data.events.length)` resets offset. This is called every 30 seconds by `useVisibilityPolling`.
