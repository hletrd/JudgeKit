# Code Review — Cycle 6

**Reviewer:** code-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** main / 75d82a17
**Scope:** Full TypeScript/TSX source review focused on logic bugs, React correctness, and maintainability.

---

## Findings

### C6-CR-1 — PublicFooter duplicate React keys when CMS footer content contains /privacy or /languages

- **File:** `src/components/layout/public-footer.tsx`
- **Lines:** 36, 49
- **Severity:** MEDIUM
- **Confidence:** HIGH

The component concatenates CMS-provided footer links with two hardcoded links (Languages and Privacy):

```tsx
const allLinks = [...links, languagesLink, privacyLink];
```

Both `languagesLink.url` ("/languages") and `privacyLink.url` ("/privacy") can collide with URLs already present in `links` from the CMS `footerContent`. The rendered map uses `key={link.url}`:

```tsx
{allLinks.map((link) => (
  <Link key={link.url} ...>
```

When a collision occurs, React emits a duplicate-key warning and component identity becomes unstable (children may be duplicated or omitted). The existing component test at `tests/component/public-footer.test.tsx:35` explicitly supplies `{ label: "Privacy", url: "/privacy" }` in the footer content, which triggers the warning in every test run:

```
Encountered two children with the same key, `/privacy`. Keys should be unique...
```

**Fix:** Deduplicate `allLinks` by URL before rendering, or skip injecting hardcoded links when the CMS content already contains them. Alternatively, synthesize unique keys with an index fallback.

**Concrete failure scenario:** An admin configures footer content with a Privacy link. Every page render logs a React warning and React may skip re-rendering the duplicate link on updates.

---

### C6-CR-2 — Chat widget messages use index-based React key

- **File:** `src/lib/plugins/chat-widget/chat-widget.tsx`
- **Line:** 334
- **Severity:** LOW
- **Confidence:** MEDIUM

```tsx
{messages.map((msg, i) => (
  <div key={i} ...>
```

While the current implementation only appends messages, this pattern is fragile against future edits (message deletion, reordering, or streaming retries) and violates React best practices. If two messages are ever swapped or one is removed, React will mis-identify DOM nodes.

**Fix:** Use `msg.id` or `msg.timestamp + msg.role` as the key if a stable identifier exists; otherwise generate a client-side ID when messages are pushed into the array.

---

## Final sweep

- No other duplicate-key issues found in non-skeleton rendering paths.
- No stale closures or missing useEffect cleanup found in high-traffic components.
- Raw SQL routes (`judge/claim`, audit logs, etc.) use parameterized queries; no injection vectors.
- File storage path resolution (`resolveStoredPath`) correctly rejects path traversal.
- API routes using `createApiHandler` properly await params; manual routes also await where needed.
