# Code Reviewer — RPF Cycle 9 (2026-05-16)

**HEAD:** `9854e072` (cycle-8 completion commit)
**Scope:** comprehensive sweep with focus on areas touched by cycles 5-8
(plugins/secrets, data-retention, platform-mode AI gate, settings-tabs,
proxy locale, code-timeline-panel, chat-widget loader). No new
uncommitted changes since `9854e072`; gates green at start of cycle.

## Findings

### CR9-1 — Latent: settings-tabs effect can clobber user-driven tab change

**Severity:** LOW · **Confidence:** MEDIUM
**File:** `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx:18-40`

The `useEffect([tabs])` dependency means that any parent re-render which
passes a new `tabs` array reference re-runs the effect, which schedules
`queueMicrotask(() => applyHash(initialHash))` — re-syncing the active
tab to the URL hash. If a user has clicked a tab (URL hash updated via
`history.replaceState`) but the tabs array reference changes (e.g.
parent server-component re-renders), the microtask still uses the
*captured* `initialHash` variable (the hash at effect-run time), which
should normally match. But if `replaceState` ran after the effect
captured `initialHash` (race), the captured value is stale and clobbers
the user click.

The functional setter `setActiveTab((current) => (current === hash ? current : hash))`
guards against same-value writes but does not prevent
URL-hash-overrides-user-click.

**Failure scenario:** parent re-renders (RSC refresh) within the same
session, between user clicking a tab and the next effect run.
**Fix:** capture `initialHash` once with a `ref`/`useState(() => location.hash.slice(1))`
and only apply on first mount, or move the initial-sync logic out of
the deps-tracked effect into a `useLayoutEffect` with an empty dep
array.

### CR9-2 — Confirmed: `LANGUAGE_TO_HLJS` duplicates `getCodeSurfaceLanguage`

**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/code-timeline-panel.tsx:24-55`
vs. `src/lib/code/language-map.ts`

Carry-forward CR8b-6. Two parallel language-id-to-syntax-highlighter
maps drift over time. `getCodeSurfaceLanguage` is the canonical map
used by `code-surface.tsx`; the new `LANGUAGE_TO_HLJS` repeats the
same mappings (with subtle differences: `node` is mapped here but not
in `language-map.ts`; `LANGUAGE_TO_HLJS` returns `undefined` for
unknown languages to trigger `hljs.highlightAuto`, while
`getCodeSurfaceLanguage` returns `"plaintext"`).

**Fix:** delete `LANGUAGE_TO_HLJS` in `code-timeline-panel.tsx` and use
`getCodeSurfaceLanguage(language)` — mapping its `"plaintext"` return
value to `undefined` for hljs so the auto-detection path is preserved.
This brings new judge languages added to `CODE_SURFACE_LANGUAGE_MAP`
for free in the timeline panel too.

### CR9-3 — Doc: `decryptPluginSecret` name now misleading

**Severity:** LOW · **Confidence:** HIGH
**File:** `src/lib/plugins/secrets.ts:52-72`

Carry-forward CR8b-3. Since the cycle-8 plaintext-by-default policy
change, `decryptPluginSecret` returns its input verbatim for plaintext
values, only decrypts legacy `enc:v1:` rows. The name now reads
misleadingly. The function does have a comment explaining the policy,
but the export name is still `decryptPluginSecret`. Either rename to
`readPluginSecret` (with `decryptPluginSecret` kept as a deprecated
alias for one cycle) or add a JSDoc `@deprecated`-style banner that
calls out the dual-mode behavior so callers don't assume cryptographic
guarantees.

### CR9-4 — Latent: housekeeping miss — cycle-8 plan still in `plans/open/`

**Severity:** LOW (process) · **Confidence:** HIGH
**File:** `plans/open/2026-05-16-cycle-8-rpf-review-remediation.md`

All tasks in the cycle-8 plan are `[x]`; the deferred ledger is
recorded. Per `plans/open/README.md` convention ("once every task in
such a plan is `[x]`… the plan must be moved to `plans/done/` in the
next cycle's housekeeping pass"), this file should move to
`plans/done/`. This cycle's housekeeping should handle it.

## Verified-safe / no new finding

- `src/proxy.ts:120-160` locale resolution: cookie-respects-auth flow
  looks correct; `hasSessionCookie` checks both raw and __Secure-prefixed
  names. No bypass for unauthenticated users on
  deterministic-public-locale paths.
- `src/lib/data-retention.ts:1-24`: retention defaults flow through
  `parseRetentionOverride` correctly; `/privacy` page derives values
  from `DATA_RETENTION_DAYS` so a future change to defaults flows
  automatically. SEC8b-5 (privacy copy must reflect 5y retention) is
  effectively already resolved.
- `src/lib/platform-mode-context.ts:272-295` AI gate: staff-bypass uses
  `submissions.view_all` capability; capability resolution is cached
  via `resolveCapabilities`. Dynamic import is not strictly necessary
  here (`capabilities/cache.ts` does not import this file), but the
  cost is one promise resolution per call to a cached module — leaving
  as-is matches the PERF8b-2 deferral note.

## Verdict

Mostly green. Two small fixable items this cycle (CR9-2 dedup,
CR9-3 doc clarification) and the cycle-8 plan archive. CR9-1 deserves
a `[d]` deferral note since it is a latent edge case and the current
fix (queueMicrotask) already broke the gate-blocking lint rule it was
intended to fix.
