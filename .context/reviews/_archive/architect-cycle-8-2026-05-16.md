# Architect — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16

---

## Findings

### ARCH8b-1 — Capability-driven AI gate is now duplicated across two layers
**Severity:** LOW **Confidence:** HIGH
**Files:** `src/lib/platform-mode-context.ts:272-291`,
`src/app/api/v1/plugins/chat-widget/chat/route.ts:277-282`,
`src/components/plugins/chat-widget-loader.tsx:5-15`

The "instructor/admin bypass" rule for the AI assistant lives in
`isAiAssistantEnabledForContext` itself (capability check +
short-circuit). Two callers now also pass `userRole`: the chat API
route and the floating-button loader. The loader still respects
`isPluginEnabled("chat-widget")` separately — fine. The architectural
risk is that any future caller that forgets to pass `userRole` will
silently treat staff as students. Defer: consider deprecating the
`userRole`-less form, or tracking it via a typed `caller` argument.

---

### ARCH8b-2 — Plaintext plugin secrets re-introduce a write-time risk
**Severity:** LOW **Confidence:** HIGH
**File:** `src/lib/plugins/secrets.ts:166-176`

Operator-directed change. The previous architecture forced encryption at
the storage boundary (`preparePluginConfigForStorage`). The new
architecture removes that boundary and stores incoming values verbatim,
with a comment but no compile-time barrier. Future contributors may
re-add `encryptPluginSecret(...)` thinking it's an oversight. Defer:
add a clearer JSDoc / `// @policy: plaintext` marker.

---

### ARCH8b-3 — `LectureModeProvider` now wraps every public-route render
**Severity:** LOW **Confidence:** HIGH
**File:** `src/app/(public)/layout.tsx:24-50`

The lecture-mode provider is unconditionally mounted (with conditional
toggle visibility). Server-side cost is negligible. Worth checking that
`LectureModeProvider` is a pure client component so SSR doesn't pay any
provider cost. Defer: read the provider source next cycle to confirm.

---

### ARCH8b-4 — Contest "managing" view path now reuses enrolled-detail loader
**Severity:** LOW **Confidence:** HIGH
**File:** `src/app/(public)/contests/[id]/page.tsx:120-135`

`getEnrolledContestDetail` is now invoked when `userAccess === "managing"`
in addition to `"enrolled"`. The function name no longer matches the
broader caller set. Defer: cosmetic rename to `getParticipationContestDetail`
or similar.

---

## Verification

No layering violations introduced. The capability boundary is intact.
