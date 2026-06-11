# Browser audit input — cycle 1

Host restriction: all observations were gathered on `https://algo.xylolabs.com` with `agent-browser` restricted to `algo.xylolabs.com`.

## Public page observations

### https://algo.xylolabs.com/
- Title: `Write code. Submit. Get judged in Xylolabs Algo.`
- Accessibility snapshot shows header links for Practice, Playground, Contests, Rankings, Submissions, Community, Workspace, Sign in, Sign up.
- Main heading is present: `h1` = `Write code. Submit. Get judged in Xylolabs Algo.`

### https://algo.xylolabs.com/practice
- `agent-browser snapshot -c` output:
  - `heading "This page couldn’t load" [level=1]`
  - `button "Reload"`
- `document.querySelector('main')?.innerText` returned:
  - `This page couldn’t load\n\nA server error occurred. Reload to try again.\n\nReload\n\nERROR 199745080`
- This is a confirmed public-facing failure.

### https://algo.xylolabs.com/rankings
- Title: `Rankings - Xylolabs Algo`
- Headings probe returned `h1 = "This page couldn’t load"`.
- This is also a confirmed public-facing failure.

### https://algo.xylolabs.com/playground
- Title: `Public playground - Xylolabs Algo`
- Headings probe returned `h1 = "Public playground"`.

### https://algo.xylolabs.com/contests
- Title: `Public contest catalog - Xylolabs Algo`
- Headings probe returned `h1 = "Public contest catalog"`.

### https://algo.xylolabs.com/community
- Title: `Community board - Xylolabs Algo`
- Headings probe returned only `h2 = "Community board"`; no `h1` was observed in the quick audit.
- Treat as a possible accessibility/semantic issue pending repo-code confirmation.

### https://algo.xylolabs.com/languages
- Title: `Judge Environments & Compilation Options - Xylolabs Algo`
- Headings probe returned `h1 = "Judge Environments & Compilation Options"`.

### https://algo.xylolabs.com/login
- Accessibility snapshot shows:
  - textbox `Username or Email`
  - password control with `Show password` button
  - submit button `Sign in`
- Extracted body text:
  - `Xylolabs Algo`
  - `Sign in to your account`
  - `Username or Email`
  - `Password`
  - `Need an account? Create account`
- No safe non-production credentials for `algo.xylolabs.com` were used in this cycle.

### https://algo.xylolabs.com/signup
- Accessibility snapshot shows fields for Username, Name, Email, Password, Confirm password.
- Extracted body text includes `Create a public user account` and `New public accounts are created as user accounts.`

### https://algo.xylolabs.com/workspace
- Unauthenticated navigation redirected to `https://algo.xylolabs.com/login?callbackUrl=%2Fworkspace`.

## Review usage rules
- Treat this file as mandatory external review input for cycle 1.
- If you cite these findings, include the exact URL and quoted evidence above.
- If you investigate a repo-side root cause for a browser finding, cross-reference the corresponding app route/component files.
