# RPF Cycle 14 - Critic

**Date:** 2026-04-20
**Base commit:** c39ded3b

## Findings

### CRI-1: Client-computed expiresAt timestamps are persisted to database - most significant issue this cycle [MEDIUM/HIGH]

**Files:**
- `src/app/api/v1/admin/api-keys/route.ts:81`
- `src/components/contest/recruiting-invitations-panel.tsx:141`

**Description:** The most impactful finding this cycle is that while the codebase invested significant effort fixing client-side *display* of expiry status (using server-computed `isExpired` booleans), the same clock-skew problem exists at the *creation* level: clients compute the absolute `expiresAt` timestamp using browser time, and the server stores it verbatim. This means the "fixed" `isExpired` badge will correctly reflect the stored timestamp, but the stored timestamp itself may be wrong.

The irony is that the display-layer fix (AGG-1 from rpf-13) makes this harder to notice: the badge will say "Expired" consistently with the (incorrectly skewed) stored timestamp, so operators won't see an obvious mismatch. The bug is silent.

**Fix:** Accept duration from client, compute `expiresAt` server-side using DB time.

**Confidence:** High

### CRI-2: `withUpdatedAt()` default is the last remaining `new Date()` trap door [MEDIUM/MEDIUM]

**File:** `src/lib/db/helpers.ts:20`

**Description:** After all the work to remove `new Date()` defaults from `getContestStatus`, `selectActiveTimedAssignments`, and `createBackupIntegrityManifest`, `withUpdatedAt()` remains as the last significant `new Date()` fallback in server-side code. It's used in 9+ update operations across the codebase, making it the broadest remaining surface area for clock-skew inconsistency.

**Fix:** Make `now` required.

**Confidence:** High

### CRI-3: Previous cycle fixes are well-implemented but the pattern should be systematic [LOW/MEDIUM]

**Description:** The fixes from rpf-13 (AGG-1 through AGG-5) were implemented correctly, but each was addressed individually rather than establishing a systematic pattern. For example, the API key client component was fixed to use server-computed `isExpired` for display, but the same component still computes `expiresAt` client-side for creation. A systematic audit of "all places where client code sends absolute timestamps to the server" would catch both the display and creation cases at once.

**Fix:** Add a lint rule or code review checklist: "Never accept absolute timestamps from client code; accept durations and compute server-side."

**Confidence:** Medium
