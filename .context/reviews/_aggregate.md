# Cycle 1 Aggregate Review — current HEAD revalidated

Date: 2026-04-19
Repo: `/Users/hletrd/flash-shared/judgekit`

## Reviewer inventory

Available reviewer agents in this environment and requested for this cycle:
- code-reviewer
- security-reviewer
- critic
- verifier
- test-engineer
- architect
- debugger
- designer

Unavailable / not registered reviewer roles requested by the orchestrator prompt:
- perf-reviewer
- tracer
- document-specialist

Execution note: the collab tool had a hard max of 6 concurrent agents, so the review fan-out ran in two batches (5 agents, then 3 agents) after retries. All available registered reviewer roles above were attempted. The per-agent markdown files under `.context/reviews/` were preserved for provenance, but several older files were stale and contradicted current HEAD. This aggregate revalidates findings against the live repository and the mandatory browser audit input before scheduling any work.

## Mandatory external browser audit input

Direct `agent-browser` audit against `https://algo.xylolabs.com` (restricted to `algo.xylolabs.com`) confirmed:
- `/practice` renders an error state with `h1 "This page couldn’t load"` and body text `A server error occurred. Reload to try again. ... ERROR 199745080`.
- `/rankings` also renders an error-state `h1 "This page couldn’t load"`.
- `/community` rendered only `h2 "Community board"` in the quick audit, with no page-level `h1` exposed.
- `/login` and `/signup` rendered form controls but no semantic heading nodes in the accessibility snapshot.
- `/workspace` redirects unauthenticated users to `/login?callbackUrl=%2Fworkspace`.

The raw browser evidence used for this review is stored in `.context/reviews/browser-audit-input-cycle-1.md`.

## Revalidated findings

### HIGH-1 — Auth pages do not expose semantic page headings
- **Severity**: High
- **Confidence**: High
- **Signal**: Direct browser audit + current source verification
- **Browser evidence**:
  - `https://algo.xylolabs.com/login`: accessibility snapshot exposed text and form controls, but no heading role.
  - `https://algo.xylolabs.com/signup`: accessibility snapshot exposed text and form controls, but no heading role.
- **Repo evidence**:
  - `src/app/(auth)/login/page.tsx`
  - `src/app/(auth)/signup/page.tsx`
  - Both pages render `CardTitle` / `CardDescription`, but `src/components/ui/card.tsx` implements `CardTitle` and `CardDescription` as plain `<div>` elements rather than heading elements.
- **Problem**: Screen-reader and keyboard users lose the primary document heading on the login and signup routes, which hurts navigation, page understanding, and automated accessibility tooling.
- **Concrete failure scenario**: A screen-reader user opening `/login` cannot jump to a page heading because the route has none; the browser audit already shows this on the deployed host.
- **Suggested fix**: Render explicit `<h1>` elements for the auth route titles while keeping the visual styling.

### HIGH-2 — Community board lacks a page-level `h1`
- **Severity**: High
- **Confidence**: High
- **Signal**: Direct browser audit + current source verification
- **Browser evidence**:
  - `https://algo.xylolabs.com/community`: headings probe returned only `h2 = "Community board"`.
- **Repo evidence**:
  - `src/app/(public)/community/page.tsx`
  - `src/components/discussions/discussion-thread-list.tsx`
  - The page delegates its visible title to `DiscussionThreadList`, which always renders `<h2>`.
- **Problem**: The community landing page has no top-level heading, so the page outline starts at level 2.
- **Concrete failure scenario**: Accessibility tree consumers treat the page as missing its primary heading, and browser audit already confirms the issue on the deployed host.
- **Suggested fix**: Allow `DiscussionThreadList` to render a configurable heading level or add an explicit page-level `h1` in the community route.

### MEDIUM-1 — Public header still contains hard-coded English ARIA labels
- **Severity**: Medium
- **Confidence**: High
- **Signal**: Current source verification
- **Files**:
  - `src/components/layout/public-header.tsx`
- **Code regions**:
  - `aria-label="Main navigation"`
  - `aria-label="Toggle navigation menu"`
  - `aria-label="Mobile navigation"`
  - `aria-label="Mobile menu"`
- **Problem**: The public shell otherwise uses localized strings, but these accessibility labels are hard-coded English. Korean users get untranslated screen-reader/navigation labels even when the UI is localized.
- **Concrete failure scenario**: A Korean screen-reader user navigating the mobile menu hears English control labels while the rest of the page is Korean.
- **Suggested fix**: Move the labels into `messages/en.json` / `messages/ko.json` and read them through `useTranslations("common")`.

### MEDIUM-2 — `FilterSelect` violates the repo’s Base UI `SelectValue` contract
- **Severity**: Medium
- **Confidence**: High
- **Signal**: Current source verification against AGENTS.md rules
- **Files**:
  - `src/components/filter-select.tsx`
  - `AGENTS.md` (“SelectValue MUST display the selected label via static children”)
- **Code region**:
  - `<SelectValue placeholder={placeholder}><span className="truncate">{options.find((opt) => opt.value === value)?.label || value}</span></SelectValue>`
- **Problem**: The shared filter select uses a nested `<span>` plus inline lookup instead of the simple state-based child expression mandated by repo policy. This is exactly the class of pattern the repo warns can break label rendering and Turbopack parsing.
- **Concrete failure scenario**: Future changes to Base UI/Turbopack regress the selected label rendering, showing raw IDs/values or causing brittle parsing in the shared filter select used across public and dashboard forms.
- **Suggested fix**: Precompute a label map / selected label from the state variable and pass a simple text child to `SelectValue`.

### MEDIUM-3 — Production `algo.xylolabs.com` currently fails on `/practice` and `/rankings`, but repo-side root cause is not yet confirmed on current HEAD
- **Severity**: Medium
- **Confidence**: Medium
- **Signal**: Direct browser audit; repo-side cause still needs reproduction
- **Browser evidence**:
  - `https://algo.xylolabs.com/practice` shows `This page couldn’t load` + `A server error occurred. Reload to try again. ERROR 199745080`.
  - `https://algo.xylolabs.com/rankings` shows `This page couldn’t load`.
- **Relevant repo files**:
  - `src/app/(public)/practice/page.tsx`
  - `src/app/(public)/rankings/page.tsx`
- **Problem**: Two public routes are broken in the deployed environment.
- **Why not immediately attributed to code**: Current HEAD static review did not reveal a single confirmed source-level bug that explains both failures; the problem may be deployment drift, production-only data/state, or schema/config mismatch.
- **Suggested next step**: Reproduce the failure against a local/current-head environment with production-like data or compare deployed commit/schema/runtime to current HEAD before landing a code fix.

## Outdated / invalidated prior-review items (not to implement)

The preserved per-agent files contained several findings that are no longer true on current HEAD and must not be planned as fresh work:
- Password complexity/context findings are outdated: `src/lib/security/password.ts` already enforces the repo-approved minimum-length policy, common-password blocking, username matching, and email-local-part checks, with tests in `tests/unit/security/password.test.ts`.
- JSON-LD script injection finding is outdated: `src/components/seo/json-ld.tsx` already uses `safeJsonForScript()` to escape `</script` sequences.
- Shell-command prefix-bypass finding is outdated: `src/lib/compiler/execute.ts` now uses `isValidCommandPrefix()` with strict suffix validation instead of naive `startsWith()` acceptance.

## AGENT FAILURES / GAPS
- `perf-reviewer`, `tracer`, and `document-specialist` were requested by the prompt but are not registered in this environment.
- The available reviewer roles could not all run in one simultaneous batch because the collab runtime enforces a maximum of 6 concurrent agents.
- Some preserved per-agent review files predated current HEAD and required manual revalidation; this aggregate is the source of truth for cycle 1 planning.

## Recommended implementation scope for this cycle
1. Fix the missing semantic headings on login, signup, and community pages.
2. Localize the remaining hard-coded ARIA labels in the public header.
3. Bring `FilterSelect` into compliance with the repo’s `SelectValue` contract and lock it with tests.
4. Record the live `/practice` and `/rankings` production failures as deferred investigation until current-head reproduction is available.
