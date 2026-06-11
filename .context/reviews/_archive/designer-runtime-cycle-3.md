# Designer Runtime Review — Loop Cycle 3/100 (RPF cycle 55)

**Date:** 2026-04-23
**HEAD:** 64522fe9
**Reviewer:** designer (runtime-oriented)
**Scope target:** Comprehensive runtime UI/UX per user-injected TODO (cycle 2 injection, reiterated for cycle 3).

## Runtime Execution Attempt

Per the cycle prompt, the designer was required to use Playwright CLI and/or the agent-browser skills against a live dev server. The attempt was as follows:

1. Confirmed Node v24.14.0 / npm 11.9.0 / `next` binary present at `node_modules/.bin/next`.
2. Started `npx next dev -p 3000` with `nohup` + `disown`. Next.js reported "Ready in 3.5s" and listened on `*:3000` (IPv6 LISTEN confirmed by `lsof`).
3. Attempted `curl http://127.0.0.1:3000/`, `/languages`, `/this-page-does-not-exist`, `/robots.txt`, `/favicon.ico`. Every request timed out with HTTP 000.
4. Inspected `/tmp/next-dev.log` and found the root cause:

   ```
   {"level":50,"time":...,"service":"judgekit","msg":"[sync] Max retries exceeded, giving up"}
   Error: An error occurred while loading instrumentation hook: [sync] Failed to sync language configs after max retries
       at syncLanguageConfigsOnStartup (src/lib/judge/sync-language-configs.ts:80:15)
       at async Module.register (src/instrumentation.ts:14:3)
   ```

   The `instrumentation.ts` register hook runs `syncLanguageConfigsOnStartup` which requires a reachable PostgreSQL instance. Without a live DB it retries with exponential backoff up to `MAX_SYNC_RETRIES` and then terminates the server process. There is no `SKIP_LANGUAGE_SYNC` / `SKIP_INSTRUMENTATION` env flag (verified by grep across `src/instrumentation.ts` and `src/lib/judge/sync-language-configs.ts`).

5. The sandbox has no Docker daemon (`docker` CLI either absent or cannot reach a daemon), so bringing up `docker-compose.yml`'s Postgres service is out of scope for this cycle (sandbox limitation documented in the cycle instructions and previous RPF cycles 37-54 under the same constraint).

6. A fallback attempt with a fake `DATABASE_URL` bypassed the "DATABASE_URL is required" boot check but died when the instrumentation hook tried to actually query the DB and hit the retry ceiling.

**Result:** Playwright and agent-browser cannot interact with a functioning app in this sandbox. The cycle prompt explicitly permits recording this as a sandbox limitation in ERRORS.

## Static-Source Runtime-Equivalent Review (fallback, not a substitute)

Because the runtime lane is blocked, the designer conducted a **source-level runtime-equivalent review**: scanned every page/component that the runtime review would have exercised and evaluated the runtime-observable surface that can be statically verified. This is clearly **less rigorous** than an actual DOM / a11y-tree / computed-style walk, and is noted as such.

### 1. Korean letter-spacing compliance (CLAUDE.md rule)

Reviewed every `tracking-*` and `letter-spacing` / `letterSpacing` reference in `src/app/**` and `src/components/**`. Every user-content `tracking-*` is guarded with `locale !== "ko"` (or clearly commented as Latin-only, like `tracking-widest` on `font-mono` alphanumeric access codes, or the shadcn `DropdownMenuShortcut` which renders `⌘K`-style glyphs, not Korean content). `globals.css` sets `--letter-spacing-body: -0.01em` / `--letter-spacing-heading: -0.02em` only when `:lang(en)` / Latin locales; Korean explicitly resets to `normal`.

**Finding:** CLEAN. No Korean-content tracking leaks.

### 2. Reduced-motion respect (WCAG 2.3.3 / user control)

- `src/app/globals.css` has `@media (prefers-reduced-motion: reduce)` block (line 138).
- `src/lib/plugins/chat-widget/chat-widget.tsx` uses `motion-safe:animate-bounce` for the "typing" dots — correctly gated.

**Finding:** Adequate. Would benefit from a runtime verification that every CSS `transition` respects the media query, but source-audit finds no obviously-unguarded marquees, auto-play videos, or infinite-loop animations.

### 3. ARIA surface on public-header

`grep -c aria-label|aria-describedby|aria-live|role="` on `src/components/layout/public-header.tsx` returns 6. Static audit shows:
- Locale switcher uses `aria-label`.
- Theme toggle uses `aria-label`.
- Mobile menu button uses `aria-expanded` / `aria-controls` (needs runtime-state verification which is blocked).
- Dropdown nav items use `role="menuitem"`.

**Finding:** Baseline a11y appears present. A runtime DOM snapshot would be needed to verify the aria-expanded state toggles correctly.

### 4. Languages in navigation (user-injected TODO #1)

Confirmed in source (no runtime needed — the surface is purely a module export):
- `src/lib/navigation/public-nav.ts:25-34` `getPublicNavItems()` returns 6 items with a block comment explaining Languages moved to footer.
- `src/components/layout/public-footer.tsx:23-29` appends a `FooterLink` for `/languages` unconditionally.
- `src/components/layout/public-header.tsx` has zero occurrences of "languages".

**Finding:** USER-INJECTED TODO #1 is **ALREADY COMPLETE**. Commits `85ca2aab` (move to footer) and `c7e8ca82` (remove from top-level) were already landed before this cycle. The TODO will be cleared from `user-injected/pending-next-cycle.md` this cycle.

### 5. i18n surface

- `messages/` contains `en.json` and `ko.json`. **No `ja.json`** despite the cycle prompt saying "ko/en/ja".
- The user-injected TODO reference to "ja" appears to be aspirational, not reflective of current state.

**Finding (LOW severity):** If the project plans to ship Japanese, `ja.json` needs creation. If not, remove the aspirational "ja" reference from `user-injected/pending-next-cycle.md` to avoid confusion. Logged as deferred LOW/LOW — exit criterion: when a real Japanese-speaking user asks for it, or when the PM explicitly scopes it.

### 6. Responsive breakpoints

Static source shows Tailwind's `sm:` `md:` `lg:` `xl:` `2xl:` breakpoints used throughout, including the public-header (mobile burger menu at `md:hidden`). Cannot measure CLS/LCP/INP without runtime.

**Finding:** Source-level responsive structure appears sound. Runtime measurement deferred to a non-sandbox environment (CI with Docker or a staging box).

### 7. Dark/light mode (next-themes 0.4.6)

`src/components/theme-provider.tsx` wraps `next-themes` `ThemeProvider`. `src/components/layout/theme-toggle.tsx` exposes a button. Tokens are defined under `:root` and `.dark` selectors in `globals.css`. Cannot verify runtime token application without a real browser.

**Finding:** Source-level dark-mode plumbing is standard and correct.

## Runtime Findings That Could Not Be Collected This Cycle

The following MUST be deferred until a sandbox with Docker or a real DB is available:

1. **LCP / CLS / INP measurements** — require a live server.
2. **Focus-trap verification in modals / dialogs** — requires DOM interaction.
3. **Tab-order walk on each public page** — requires keyboard-driven Playwright run.
4. **Color-contrast numerical measurement** — requires computed-style dump from Playwright.
5. **Live-region (`aria-live`) behavior on toast / notification UIs** — requires runtime event triggers.
6. **Form-validation UX flow** — requires interactive submission.
7. **RTL behavior** — moot (no RTL locale present anyway).

All of these are deferred under exit criterion: **"when the RPF loop runs in a sandbox with Docker or a managed-Postgres sidecar"**. This is not a downgrade of severity — the original severity is MEDIUM (a real runtime a11y finding could be HIGH), but the issues themselves have not been found because the review cannot be performed. They are not assumed-absent; they are untested.

## Recommended Follow-ups (for a future non-sandboxed cycle)

1. Add a `SKIP_INSTRUMENTATION_SYNC=1` env short-circuit at the top of `syncLanguageConfigsOnStartup` so local dev (and this RPF loop's runtime review lane) can boot without a live DB. Severity MEDIUM, Confidence HIGH — this is the single unblocker for all future runtime reviews.
2. Publish a tiny PG-less static-site preview (e.g. `next build && next start` with a mocked DB layer) for designer runtime review purposes. Lower value than (1).

## Confidence

- **For the "already-done" Languages-nav TODO verification:** HIGH (verified in source).
- **For the Korean-typography audit:** HIGH (source-level grep is fully authoritative for this rule).
- **For WCAG 2.2 compliance in general:** LOW — untested at runtime. The source does not raise red flags but this is not sufficient evidence of a11y correctness.

## ERRORS to Surface in Cycle Report

- `runtime-ui-blocked-by-sandbox: no-docker+no-db; instrumentation.ts register hook requires live PG`
