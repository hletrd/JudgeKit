# RPF Cycle 2 — Critic

**Date:** 2026-04-22
**Base commit:** 14218f45

## Findings

### CRI-1: `recruiting-invitations-panel.tsx` timezone bug is the highest-priority new finding this cycle [MEDIUM/HIGH]

**Cross-reference:** CR-1, DBG-1, V-1, TR-2, TE-1
**Description:** The `min` attribute on the custom expiry date input uses UTC time instead of local time. This affects Korean users (the primary audience per CLAUDE.md) between midnight and 9 AM local time, preventing them from selecting the current date as the minimum. Five of eight review perspectives flagged this issue, making it the highest-signal finding of cycle 2. It directly impacts a user-facing feature in a Korean-locale application.

### CRI-2: `workers-client.tsx` silent error swallowing in AliasCell save [LOW/MEDIUM]

**Cross-reference:** DBG-2, TE-2
**Description:** The worker alias save function does not show any feedback on failure. While this is an admin-only feature, silent data loss is still problematic — the admin might not realize the alias wasn't saved. Two perspectives flagged this.

### CRI-3: Inconsistent component patterns — native `<select>` vs. Radix `Select` [LOW/LOW]

**Cross-reference:** DES-2
**Description:** The clarifications component uses a native `<select>` while all other components in the same feature area use the project's Radix-based `Select` component. This is a minor consistency issue but contributes to UI fragmentation over time.

## Verified Safe

- Cycle 1 remediation was thorough — all 11 findings were addressed
- The codebase is well-structured with consistent use of `createApiHandler` for new API routes
- Auth and security patterns are solid
