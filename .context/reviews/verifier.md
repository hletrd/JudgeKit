# Verifier Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** verifier
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

All cycle 13 verifier findings are fixed:
- V-1 (workers-client.tsx icon-only buttons): Fixed — all six buttons now have `aria-label`
- V-2 (chat-logs-client.tsx missing res.ok check): Fixed — `res.ok` check and `.catch()` added
- V-3 (recruiter-candidates-panel.tsx unguarded res.json()): Fixed — now uses `.catch(() => [])`
- V-4 (group-instructors-manager.tsx remove button): Fixed — `aria-label` added

## Findings

### V-1: Multiple components still have unguarded `res.json()` — verified 11+ instances remain [MEDIUM/HIGH]

**Files:** (verified by code inspection)
- `src/components/contest/anti-cheat-dashboard.tsx:124,161,238` — no `.catch()`
- `src/components/contest/analytics-charts.tsx:542` — no `.catch()`
- `src/components/contest/leaderboard-table.tsx:231` — no `.catch()`
- `src/components/contest/participant-anti-cheat-timeline.tsx:96,131` — no `.catch()`
- `src/components/contest/recruiting-invitations-panel.tsx:202,218` — no `.catch()`
- `src/components/code/compiler-client.tsx:287` — no `.catch()`
- `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:141,177` — no `.catch()`
- `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19` — no `.catch()`
- `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49` — no `.catch()`
- `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:220,336,427` — no `.catch()`
- `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:105` — no `.catch()`

**Description:** Verified by reading each file. Despite three cycles of partial fixes, 11+ components still have unguarded `res.json()` calls. Each cycle fixes 5-6 files but new instances keep appearing because the pattern is not codified.

**Fix:** Create a centralized `apiFetchJson` helper and refactor all instances.

**Confidence:** HIGH

---

### V-2: `create-problem-form.tsx:332,336` — double `res.json()` consumes response body [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336`

**Description:** Verified by reading the code. On line 332, `await res.json().catch(() => ({}))` is called for the error check. On line 336, `await res.json()` is called again for the success path. The first call consumes the response body. If the error path doesn't throw, the second call would fail with "body already consumed". Currently safe because the error path always throws, but fragile.

Same pattern at lines 423,427.

**Fix:** Parse response once: `const data = await res.json().catch(() => ({}))` and branch on `res.ok`.

**Confidence:** HIGH

---

### V-3: `problem-export-button.tsx` — no null-safety on `data.data.problem.title` [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-export-button.tsx:19-24`

**Description:** Verified: line 24 accesses `data.data.problem.title` without checking if `data.data` or `data.data.problem` exist. If the API returns an unexpected shape, this throws TypeError.

**Fix:** Add null-safe access or guard.

**Confidence:** MEDIUM

---

## Final Sweep

The cycle 13 fixes are properly verified. The main remaining issue is the persistent unguarded `res.json()` pattern across 11+ components. The double `res.json()` in create-problem-form.tsx is a verified latent bug.
