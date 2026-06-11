# Browser audit input — cycle 2 (algo.xylolabs.com)

Audit performed with `agent-browser` on 2026-04-19 against `https://algo.xylolabs.com`, staying on-host.

## Confirmed findings

### BA-1 — Sign-in flow fails after submit
- URL entered: `https://algo.xylolabs.com/login`
- Interaction: filled `Username or Email`, filled `Password`, clicked button with accessible name `Sign in`
- Result URL: `https://algo.xylolabs.com/api/auth/error`
- Body text: `{"error":"UntrustedHost"}`
- User impact: valid credentials cannot complete sign-in on the live site.

### BA-2 — Playground leaks raw i18n key
- URL: `https://algo.xylolabs.com/playground`
- Selector: `label[for="stdin-case-name"]`
- Extracted text: `compiler.testCaseLabel`
- User impact: untranslated/internal key is exposed in a primary public workflow.

### BA-3 — Practice catalog hard-fails
- URL: `https://algo.xylolabs.com/practice`
- Selector: `h1`
- Extracted text: `This page couldn’t load`
- Supporting text: `A server error occurred. Reload to try again.`
- User impact: public practice discovery is unavailable.

### BA-4 — Rankings page hard-fails
- URL: `https://algo.xylolabs.com/rankings`
- Selector: `h1`
- Extracted text: `This page couldn’t load`
- Supporting text: `A server error occurred. Reload to try again.`
- User impact: public rankings are unavailable.

### BA-5 — Languages page never resolves past loading state
- URL: `https://algo.xylolabs.com/languages`
- Observation window: waited 3 seconds after load
- Accessibility snapshot still showed only `status "Loading"` / `Loading...`
- User impact: public language catalog appears hung and never renders content.
