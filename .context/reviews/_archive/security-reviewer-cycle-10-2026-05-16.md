# Security Reviewer — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop
**HEAD reviewed:** `23dd9e80`
**Frameworks:** OWASP Top 10 (2021), CWE, repo SECURITY.md.

## Scope

- AuthZ paths touched in cycle 8/9 (chat-widget AI gate, contest
  view, submissions detail).
- Plugin secret reader/writer changes.
- SSR/CSR markup pipelines for highlight.js output.
- Recent SQL refactors (numeric casts).

## NEW Findings

(None this cycle.)

## Re-verified VERIFIED-SAFE items

### SEC10-VS-1 — Plaintext plugin secret reader is policy-bounded
`src/lib/plugins/secrets.ts:52-108` carries the `@policy plaintext`
JSDoc marker (cycle-9 CR9-3 fix). Reader still accepts legacy
`enc:v1:` ciphertext via dual-mode decrypt (HKDF then legacy key).
Writer (`preparePluginConfigForStorage`, lines 167-214) refuses
malformed `enc:v1:` writes (cycle-9 SEC9-1 rewire). No
authentication bypass; storage policy is operator-directed and
documented (SEC8b-1 deferred per repo rules).

### SEC10-VS-2 — Code timeline HTML pipeline is sandwich-defended
`src/components/contest/code-timeline-panel.tsx:34-55` runs
`highlight.js` (which HTML-escapes inputs before producing markup)
then passes the result through the DOMPurify-backed `sanitizeHtml`
before the React injection point. Two independent escape stages;
attacker-controlled source would need a hljs-AND-DOMPurify dual
bypass. Defense-in-depth confirmed.

### SEC10-VS-3 — Staff AI-gate bypass scoped to
`submissions.view_all`
`src/lib/platform-mode-context.ts:272-295` checks
`caps.has("submissions.view_all")` (instructor/admin/super_admin only
per `capabilities/policy.ts`). Per-problem `allowAiAssistant` is
checked separately in `chat/route.ts:289-302`. Students cannot
trigger the bypass even with crafted role strings: capabilities are
resolved server-side from the DB-backed role table.

### SEC10-VS-4 — `canViewAssignmentSubmissions` reorder is safe
`src/lib/assignments/submissions.ts:348-359` (cycle-8 reorder):
moving `submissions.view_all` check before the `!assignmentId`
early return widens staff access without weakening student rules.
Verified by walking each early-return arm: students with no
`submissions.view_all` cap still fall through to the original
assignment-enrollment check.

### SEC10-VS-5 — Locale cookie bypass on SEO routes
`src/proxy.ts` (cycle-8 SEC8b-3 fix): authenticated users bypass the
deterministic-public-locale gate so the locale switcher works on
`/practice`, `/contests`, etc. Unauthenticated requests still get
canonical default-locale URLs for crawlers. No session-fixation
vector — bypass keyed on session cookie presence, not value contents.

## Deferred items still applicable

- **C-1 (Nginx XFF spoofable)** — infrastructure, unchanged.
- **SEC8b-1 (plaintext plugin secrets)** — operator policy.
- **SEC8b-5 (chat retention 5y privacy-notice)** — reclassified to
  VERIFIED-SAFE in cycle-9 aggregate.

## Verdict

Zero NEW security findings this cycle. All cycle-8 deferred security
items still bounded by their original exit criteria.
