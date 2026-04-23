# Tracer — Cycle 20

**Date:** 2026-04-20
**Base commit:** e1c66ae2

## Findings

### TR-1: Clipboard write failure in recruiting invitations create — silent data loss path [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:183`

**Trace:**
1. User clicks "Create" → `handleCreateInvitation()` called
2. API request succeeds, returns `token`
3. Link constructed from `token`
4. `createdLink` state set (link displayed in UI)
5. `navigator.clipboard.writeText(link)` attempted
6. **If clipboard write fails:** `catch { /* ignore */ }` — no user feedback
7. User sees link in UI, assumes it was auto-copied
8. User closes the panel
9. Link is now only visible if the user re-opens the create result — but they believe it was copied

**Competing hypotheses:**
- H1: User intentionally ignores the error → they can still see and manually copy the link (low harm)
- H2: User closes the panel immediately, believing the link was copied → **link effectively lost** until they find the invitation in the list

**Verdict:** H2 is more likely for users who rely on auto-copy behavior. Fix: add error toast.

### TR-2: `formatDifficultyValue` inconsistency between dashboard and public pages [MEDIUM/MEDIUM]

**Trace:**
1. Instructor views difficulty on `/dashboard/problems/123` → sees "1234.5" (no grouping)
2. Student views same problem on `/practice/problems/123` → sees "1,234.5" (with grouping)
3. Instructor compares the two views → confusion about which value is correct

**Fix:** Centralize formatting.

## Verified Safe

- Navigation flow is correct: PublicHeader dropdown → dashboard pages
- AppSidebar items properly filtered by capability
- Sign-out flow handles errors correctly (try/catch with `isSigningOut` reset)
