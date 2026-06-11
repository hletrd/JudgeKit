# Code-Reviewer — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16
**HEAD reviewed:** uncommitted user-injected patches on top of `1d95c630`
**Reviewer angle:** code quality, logic, SOLID, maintainability

---

## Review-relevant inventory

This cycle's surface is dominated by ~30 modified files for the user-injected
fixes listed in the run context (chat widget bypass, contest manage view,
TLE budget, plaintext plugin secrets, locale switcher, code timeline syntax
highlighting, button heights, search label nowrap, problem rendering
markdown vs HTML detection, lecture mode wiring, etc.).

## Findings

### CR8b-1 — `SettingsTabs` violated `react-hooks/set-state-in-effect`
**Severity:** MEDIUM (blocks lint gate) **Confidence:** HIGH
**File:** `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx:18-21`

The user-injected change called `setActiveTab(hash)` synchronously inside
`useEffect`, which the project's `react-hooks/set-state-in-effect` rule
flags as an error. Cycle-8 fix: defer the initial sync via
`queueMicrotask` so the setState happens after the effect body returns,
and gate the hashchange listener so it only updates when the value
actually changes.

**Status:** FIXED this cycle.

---

### CR8b-2 — Plugin-secrets test suite asserted the old encryption-mandatory policy
**Severity:** MEDIUM (blocks unit gate) **Confidence:** HIGH
**Files:** `tests/unit/plugins.secrets.test.ts`, `tests/unit/data-retention.test.ts`,
`tests/unit/api/plugins.route.test.ts`

The user-injected change to `decryptPluginSecret` and
`preparePluginConfigForStorage` shifts the policy to plaintext-by-default
and verbatim-storage. The existing tests still asserted "encrypts
secret fields before storage", "throws in production when value is not
encrypted", and "decryptPluginConfigForUse handles production plaintext
by clearing the value", which directly contradicts the new policy.
Similarly, `data-retention.test.ts` asserted `chatMessages: 30` against
the new `365 * 5` default, and the chat route test asserted
`isAiAssistantEnabledForContext` was called without `userRole`.

**Fix:** Updated all three test files to match the new policy with
explanatory comments citing the cycle-8 policy change.

**Status:** FIXED this cycle.

---

### CR8b-3 — `decryptPluginConfigForUse` API contract is now soft
**Severity:** LOW **Confidence:** HIGH
**File:** `src/lib/plugins/secrets.ts:53-72`

`decryptPluginSecret` now defaults to `allowPlaintextFallback: true`
unconditionally. The strict mode (`{ allowPlaintextFallback: false }`)
remains, but no production caller currently invokes it. The function
name still implies "decrypt", which is misleading when the input is
plaintext. Defer: function rename / API tightening should ride alongside
a future plaintext→encrypted migration if the policy reverses.

**Recommendation:** Add a JSDoc note above the function explaining the
plaintext-by-default policy and pointing at the operator-policy doc once
written. Comment-only change, plannable but not blocking.

---

### CR8b-4 — Capabilities array recomputed per-request in submission detail
**Severity:** LOW **Confidence:** HIGH
**File:** `src/app/(public)/submissions/[id]/page.tsx:103`

`[...await resolveCapabilities(session.user.role ?? "user")]` is invoked
on every page render. `resolveCapabilities` is already cached at the
module level so the cost is negligible, but the spread copy into a new
array is unnecessary if the consumer only iterates / uses
`includes`. Defer: cosmetic.

---

### CR8b-5 — `chatMessages: 365 * 5` default has no overall lifecycle doc
**Severity:** LOW **Confidence:** MEDIUM
**File:** `src/lib/data-retention.ts:3`

Bumping chat-message retention from 30 days to 1825 days (5 years) is a
material policy change. The constant has no comment explaining why this
is the correct retention window, and no admin-facing notice that chat
logs are now retained for 5 years instead of 30 days. Defer: needs
a privacy-policy update to match. Plannable for next cycle alongside
the privacy-notice deferred work.

---

### CR8b-6 — `LANGUAGE_TO_HLJS` table in `code-timeline-panel.tsx` is duplicated
**Severity:** LOW **Confidence:** MEDIUM
**File:** `src/components/contest/code-timeline-panel.tsx:24-53`

The new highlight.js language map is hand-rolled. There's almost
certainly an equivalent map elsewhere in the codebase (e.g.
`getCodeSurfaceLanguage`). Defer: refactor opportunity, not blocking.

---

## Verification

- Lint: PASS after CR8b-1 fix.
- Unit tests: 2410/2410 PASS after CR8b-2 fix.
- Rust tests: 64/64 PASS (was 55; +9 new tests for the TLE budget
  classifier).
- Build: PASS.
