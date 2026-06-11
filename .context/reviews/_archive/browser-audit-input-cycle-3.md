# Browser audit input — cycle 3

Audit surface: https://algo.xylolabs.com (public pages + auth flows only; no safe non-production algo-host credentials were found in repo-local files).
Method: `agent-browser` CLI on 2026-04-19, staying on the `algo.xylolabs.com` host.

## Visited pages
- `/`
- `/practice`
- `/playground`
- `/contests`
- `/rankings`
- `/submissions`
- `/community`
- `/languages`
- `/login`
- `/signup`

## Confirmed browser findings

1. **Public practice catalog is currently broken with a server error**
   - URL: `https://algo.xylolabs.com/practice`
   - Evidence: accessibility snapshot exposes heading `This page couldn’t load`; `agent-browser eval` confirmed `{ "h1": "This page couldn’t load", "text": true, "reloadButton": true }` for the page body text `A server error occurred. Reload to try again.`
   - Impact: one of the primary public entry points is unusable.

2. **Playground leaks an untranslated i18n key into the UI**
   - URL: `https://algo.xylolabs.com/playground`
   - Evidence: accessibility snapshot shows `compiler.testCaseLabel` under the stdin/test-case area; `agent-browser eval` found a visible `DIV.space-y-1.5` whose exact text content is `compiler.testCaseLabel`.
   - Impact: user-facing UI exposes implementation keys instead of localized copy.

3. **Community filter tabs render invalid nested interactive controls**
   - URL: `https://algo.xylolabs.com/community`
   - Evidence: snapshot exposes both links and buttons for `Newest` / `Popular`; DOM query confirmed an anchor with `href="/community"` whose direct child is `BUTTON` with text `Newest`.
   - Impact: invalid semantics can break keyboard/screen-reader behavior and create duplicate focus/activation targets.

4. **Unauthenticated submissions page also renders invalid nested interactive controls**
   - URL: `https://algo.xylolabs.com/submissions`
   - Evidence: snapshot shows a link `Sign in` wrapping a button `Sign in`; DOM query confirmed an anchor with `href="/login"` whose direct child is `BUTTON` with text `Sign in`.
   - Impact: duplicated click targets and invalid semantics on a primary auth CTA.

5. **Login/signup pages use generic document titles**
   - URLs: `https://algo.xylolabs.com/login`, `https://algo.xylolabs.com/signup`
   - Evidence: `agent-browser get title` returns `Xylolabs Algo` for both pages instead of route-specific titles.
   - Impact: weak browser history/accessibility/SEO affordance; users cannot distinguish auth pages via title alone.

## Notes
- Local `npm run dev` was not a feasible browser-review target in this cycle because the app aborted at startup with `DATABASE_URL is required` while loading the instrumentation hook.
- The deployed site was therefore used as the executable UI surface for browser-backed review evidence.
