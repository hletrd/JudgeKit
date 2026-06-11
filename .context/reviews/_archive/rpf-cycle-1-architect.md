# Architect Review — RPF Cycle 3 (2026-05-04)

**Reviewer:** architect
**HEAD reviewed:** `4cd03c2b`
**Scope:** Architectural review of changes since `988435b5`.

---

## Prior cycle status

- **C1-AR-1 (rateLimits table overloaded for SSE):** CARRY — still deferred (ARCH-CARRY-2).
- **C1-AR-2 (import.ts `any` types):** CARRY — still deferred.

---

## Findings

### C3-AR-1: [LOW] ConditionalHeader introduces client-side rendering for header decision

- **File:** `src/components/layout/conditional-header.tsx`
- **Confidence:** LOW
- **Description:** The `ConditionalHeader` component uses `usePathname()` to decide between the minimal admin header and the full `PublicHeader`. This is architecturally clean — it keeps the admin vs non-admin decision in one place. However, it means the header rendering decision happens on the client side via `usePathname()`, which is a client hook. During SSR, `usePathname()` returns the correct pathname, so there should be no hydration mismatch. The concern is minimal.
- **Fix:** No action needed. The design is correct for Next.js app router.

---

## No-issue confirmations

- Layering remains clean: `lib/` -> `db/`, `auth/`, `security/`, `compiler/`, `judge/`. No reverse coupling.
- Route group hierarchy `(auth)`, `(public)`, `(dashboard)` remains clean.
- The `ConditionalHeader` component is properly placed in `src/components/layout/` alongside other layout components.
- The i18n additions in `messages/en.json` and `messages/ko.json` for contest metadata keywords are properly structured.
