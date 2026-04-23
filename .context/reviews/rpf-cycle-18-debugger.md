# Debugger — RPF Cycle 18

**Date:** 2026-04-20
**Base commit:** 2b415a81

## DBG-1: `userId!` non-null assertion in practice page could mask a null dereference [LOW/MEDIUM]

**File:** `src/app/(public)/practice/page.tsx:431`
**Description:** Same as CR-2. The `userId!` assertion suppresses TypeScript's null safety. While the control flow guarantees userId is non-null at this point (the else branch is only reached when `currentProgressFilter !== "all" && userId`), if the code is refactored, this could silently produce a SQL query with `user_id = NULL`.
**Fix:** Capture `const uid = userId!;` with a comment explaining the guarantee, or restructure to use an early return pattern that narrows the type.

## DBG-2: `copy-code-button.tsx` does not show error feedback on clipboard failure [LOW/LOW]

**File:** `src/components/code/copy-code-button.tsx:20-31`
**Description:** When `navigator.clipboard.writeText()` fails, the fallback `document.execCommand("copy")` is attempted, but if that also fails, there is no user-facing error feedback. The component silently does nothing. In contrast, other clipboard components (access-code-manager, workers-client, api-keys-client) show `toast.error()` on failure.
**Concrete failure scenario:** User clicks the copy button on a code block, the clipboard write fails (e.g., in an iframe without clipboard permission), and nothing happens — no visual feedback, no error toast.
**Fix:** Add error feedback in the `document.execCommand` fallback: if `execCommand` returns false, show a toast error.

## DBG-3: Recruiting invitations panel `min` date attribute uses `new Date()` client time [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:408`
**Description:** `min={new Date().toISOString().split("T")[0]}` uses the browser's local clock for the expiry date picker's minimum date. This is client-side only (just a UI hint), and the server validates expiry server-side using DB time, so there's no data integrity issue. However, if the user's clock is significantly behind, they could set an expiry date that appears valid in the UI but is rejected by the server.
**Concrete failure scenario:** User's computer clock is 1 day behind. The date picker allows selecting "today" which is actually yesterday in server time. The server rejects the submission with a validation error — confusing UX.
**Fix:** Consider using a server-provided date for the `min` attribute, or document that this is a UX-only hint.
