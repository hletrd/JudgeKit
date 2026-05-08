# Designer Review — Cycle 3/100

**Reviewer:** designer (browser-based UI/UX review)
**Date:** 2026-05-08
**Target:** https://algo.xylolabs.com (production)
**Credentials:** admin / mcl1234~
**Scope:** Full site browse — all public pages, admin panels, profile/settings, interactive elements, i18n, theme

---

## CRITICAL

None found this cycle. (Cycle 2 critical issues D1-D3 are FIXED.)

---

## HIGH

None found this cycle. (Cycle 2 high issues D2-D3 are FIXED.)

---

## MEDIUM

### D1: Dashboard permanently shows "Degraded" system health
- **URL:** `/dashboard`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Evidence:** System health snapshot shows "Degraded" overall despite Database "OK", Audit pipeline "OK", and Submission queue "0 / 200". The degradation is caused by 42 stale workers in the judge_workers table.
- **Root cause:** `src/lib/ops/admin-health.ts:88-91` marks status as "degraded" if ANY stale workers exist. Historical worker records accumulate in the database with no cleanup.
- **Impact:** Operators learn to ignore the "Degraded" indicator, reducing its signal value for real problems.
- **Fix:** Add stale worker cleanup or adjust the degraded threshold to consider ratio rather than absolute count.

### D2: Uptime shows process uptime, misleading operators
- **URL:** `/dashboard`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Evidence:** Uptime shows values like "284s" (4.7 minutes) on a production server that has been running for days.
- **Root cause:** `getUptimeSeconds()` uses `process.uptime()` (Node.js process uptime) not system uptime. After process restart (e.g., PM2 reload, deploy), this resets.
- **Impact:** Operators may think the server is unstable or crashing frequently.
- **Fix:** Label it "Process uptime" in the UI, or query system uptime via OS APIs.

### D3: Date format inconsistency between UI table and CSV export
- **URL:** `/dashboard/admin/audit-logs`
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Evidence:** Filtering by date range in the UI and downloading CSV for the same range produces different row counts.
- **Root cause:** Server page advances `dateTo` to next-day midnight; API route uses end-of-same-day 23:59:59.999.
- **Fix:** Make both implementations consistent.

---

## LOW

### D4: Contest layout contains Next.js RSC streaming workaround
- **URL:** `/contests/*`
- **Severity:** LOW
- **Confidence:** HIGH
- **Evidence:** Contest pages use `data-full-navigate` attribute to force full page navigation, bypassing client-side RSC streaming.
- **Impact:** Slower navigation between contest pages. Known upstream bug.
- **Fix:** Monitor upstream Next.js issue and remove workaround when fixed.

### D5: Worker fleet shows 42 stale / 40 offline workers
- **URL:** `/dashboard/admin/workers`
- **Severity:** LOW
- **Confidence:** HIGH
- **Evidence:** 82 total registered workers, only 1 online.
- **Impact:** Clutters the UI, makes it hard to identify actual active workers.
- **Fix:** Implement automatic cleanup of workers that have been offline/stale for > N days.

---

## CYCLE 2 FIXED ISSUES (VERIFIED)

- D1 (Locale 404): FIXED — Korean locale switch works correctly
- D2 (Empty Settings): FIXED — System Settings renders with all tabs
- D3 (Empty Audit Logs): FIXED — Audit Logs renders with filters and table
- D5 (Date format): FIXED — Dates render in locale-appropriate format
- D7 (Uptime 0s): FIXED — Uptime now shows actual process uptime value
- D8 (Untranslated keys): FIXED — Filter buttons show proper labels
- D9 (Duplicate heading): FIXED — API Keys page shows correct heading
- D10 (Nested buttons): FIXED — Role Management buttons are accessible

---

## FINDINGS COUNT: 5 (new this cycle)
