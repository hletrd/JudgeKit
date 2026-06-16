# Designer / UI-UX Review — cycle 4 (2026-06-17) — BROWSER-DRIVEN

Primary focus this run: responsive rendering of the `function` problem-type
authoring + student UI at mobile / tablet / desktop, verified live with a real
browser. Driver: Playwright (Chromium headless via the local standalone-server
e2e harness) + ad-hoc `agent-browser` 0.22.2 for interactive diagnosis.

## METHOD
The browser pass ran the full `tests/e2e/function-judging-responsive.spec.ts`
against a freshly-seeded Postgres + the Next 16 standalone production server
(`scripts/playwright-local-webserver.sh`) at mobile 375 / tablet 768 / desktop
1280, plus manual `agent-browser` drives of the login + forced-change flow to
isolate a harness blocker. All 16 assertions green after the harness fix.

## RESULT — NO NEW RESPONSIVE RENDERING DEFECT
All 16 responsive assertions pass at all three viewports:
- Authoring `/problems/[id]/edit`: the three function sections (signature
  builder, test-case editor, reference solution) render; `documentWidth <=
  viewport+1` at 375/768/1280; `#fn-name`, every param/return type `select`, all
  7 language labels, and the stub `<pre>` + CodeEditor stay within the viewport.
- Create `/problems/create` (switch problemType -> function at 375): function
  sections render with no horizontal overflow.
- Student `/practice/problems/[id]`: no horizontal overflow at any width; the
  DSG-1 (cycle 2) regression guard passes — the overflowing problem tab bar
  starts at `flex-start`, the active tab is `notClippedLeft` and `fullyVisible`
  while the list still scrolls.
No overflow, clipping, overlap, tiny-tap-target, bad-wrap, or editor/preview
bleed surfaced. Earned convergence on the UI focus continues into cycle 4.

## NEW THIS CYCLE (test-infra, app-adjacent) — DSG4-1 (Medium) Local e2e auth was fully broken; the responsive gate could not run
The function-judging responsive gate (and any local full-profile e2e run) could
NOT authenticate at all before this cycle. Root cause, isolated live:
1. `scripts/seed.ts:225` seeds the admin with `mustChangePassword: true`, so the
   first login is force-redirected to `/change-password`.
2. The local harness serves the Next 16 **standalone** build, which runs in
   `NODE_ENV=production`. The change-password form
   (`src/app/change-password/change-password-form.tsx:51`) commits the change
   server-side (it sets `tokenInvalidatedAt`, invalidating the session) and then
   immediately calls `signIn("credentials", …)` to re-auth. Under the Playwright
   runner's tight timing that automatic re-sign-in races the just-invalidated
   session token and leaves the browser stuck on `/change-password` even though
   the password change already committed (verified: `must_change_password`
   flips to `false` in the DB, yet the page never reaches `/dashboard`).
3. The previous spec helper also tried to set the NEW password equal to the
   current one; a same-as-current change makes the race worse and, under
   Playwright, could drop the change entirely.
Net effect: every `loginAsAdmin` timed out → all 16 responsive tests failed in
`beforeAll`. The e2e gate's function-judging coverage was dead.
FIX THIS RUN:
- `scripts/playwright-local-webserver.sh`: after `npm run seed`, clear
  `must_change_password` for the seeded admin in the DISPOSABLE local DB (one
  `UPDATE … users`). Production seed semantics untouched (the forced-change flow
  is a real first-login security feature; only the throwaway e2e DB is relaxed).
- `tests/e2e/function-judging-responsive.spec.ts`: make `loginAsAdmin` resilient
  — if a forced change still appears (e.g. against a remote server), set a
  DISTINCT strong policy-compliant new password (a same-as-current change is
  unreliable) and track it for the rest of the run.
Confidence: High (reproduced live; all 16 tests green after the fix). Severity
Medium — no production impact (local tooling only), but it silently disabled the
very gate this run exists to enforce.

## OBSERVATION (not a new scheduled finding) — change-password local-prod re-auth race
The same-password re-sign-in race in (2) is only reachable under the standalone
production server with a forced first-login change AND a near-instant client
re-auth — i.e. an automated runner, not a human. Against `next dev` (prior
cycles) the path differs because `NODE_ENV !== production`. No human-facing
defect was reproduced (a real user takes >100 ms to fill the form, and the
distinct-password path redirects cleanly). Left as an observation; revisit only
if it recurs for real users.

## KOREAN TYPOGRAPHY
No custom `letter-spacing` / `tracking-*` added to any Korean text this cycle
(binding repo rule honored). No CSS / component styling touched.
