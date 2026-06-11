# Security Review — RPF Cycle 38

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** 4dd3d951

## Inventory of Files Reviewed

- All API routes under `src/app/api/v1/` — auth, CSRF, input validation
- `src/lib/security/` — password-hash, rate-limit, sanitize-html, timing, env
- `src/lib/assignments/recruiting-invitations.ts` — invitation token handling
- `src/app/api/v1/admin/api-keys/` — API key CRUD
- `src/lib/db/import.ts` — database import
- `src/lib/db/export.ts`, `export-with-files.ts` — data export
- `src/components/seo/json-ld.tsx` — safeJsonForScript
- `src/lib/plugins/chat-widget/` — chat widget security

## Findings

### SEC-1: Bulk invitation email duplicate check is case-insensitive at the client level but case-sensitive at the DB level — duplicate bypass [MEDIUM/HIGH]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:41-49`

**Description:** Same root cause as CR-1. The bulk route normalizes emails to lowercase for the client-side dedup check (line 20-23) but then queries the DB using `inArray(recruitingInvitations.candidateEmail, orderedEmails)` which does a case-sensitive match. An attacker could create multiple invitations for the same person by varying email casing across bulk and single-create routes.

**Concrete failure scenario:** An attacker sends a bulk create request with `candidateEmail: "victim@university.edu"`. A prior invitation exists with `candidateEmail: "Victim@University.Edu"`. The case-sensitive `inArray` query returns no match, and a second invitation is created. The victim receives two separate account-creation emails with different tokens, potentially creating confusion about which account to use.

**Fix:** Use `lower()` comparison in the bulk route, consistent with the single-create route.

**Confidence:** High

---

### SEC-2: Anti-cheat `describeElement` function leaks user text content in DOM event reporting [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:204-212`

**Description:** The `describeElement` function includes up to 80 characters of user text content in the `details` field of anti-cheat events (line 206: `const text = (el.textContent ?? "").trim().slice(0, 80)`). This text is then sent to the server via the anti-cheat API. While anti-cheat monitoring is expected to capture some user behavior, sending actual text content from the DOM is a privacy concern — especially if the text area contains sensitive or personal information unrelated to the exam.

This was partially flagged as "Prior SEC-3: Anti-cheat copies user text content (deferred)" in previous aggregates, but the current code still sends up to 80 characters of text content from headings, paragraphs, and other elements.

**Concrete failure scenario:** A student is taking an exam and has personal notes visible in another tab. The anti-cheat monitor captures text from a paragraph element that happens to contain the student's personal information. This data is stored in the anti-cheat events table, accessible to instructors and admins.

**Fix:** Remove the text content capture from `describeElement`, or limit it to structural information only:
```typescript
// Instead of capturing text content, just report the element type and location
if (["P", "SPAN", ...].includes(tag)) {
  const parent = el.closest("[class]") as HTMLElement | null;
  const parentClass = parent?.className?.split(" ")[0] ?? "";
  if (parentClass) return `${tag.toLowerCase()} in .${parentClass}`;
  return tag.toLowerCase();
}
```

**Confidence:** Medium (already deferred in prior cycles, but noting for completeness)

---

### SEC-3: API key raw key exposed in client-side state after creation — no time limit on visibility [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:96, 288-329`

**Description:** When an API key is created, the raw key is stored in React state (`createdKey`) and displayed in a dialog. The dialog remains visible until the user clicks "Done" — there is no automatic timeout or auto-dismissal. If the admin walks away from their desk, the raw API key remains visible indefinitely. This is a common UX pattern but is less secure than auto-hiding after a set period.

The server-side GET route (line 41 in `[id]/route.ts`) correctly rejects raw key views with a 410 Gone response, so the key cannot be retrieved after the dialog is closed. The risk is limited to the time the dialog is open.

**Concrete failure scenario:** An admin creates an API key and is called away from their desk. The raw key remains visible on screen. A passerby photographs the screen, gaining permanent API access.

**Fix:** Add an auto-dismiss timer (e.g., 5 minutes) that clears `createdKey` from state:
```typescript
useEffect(() => {
  if (!createdKey) return;
  const timer = setTimeout(() => {
    setCreatedKey(null);
    setCreatedKeyCopied(false);
  }, 5 * 60 * 1000);
  return () => clearTimeout(timer);
}, [createdKey]);
```

**Confidence:** Low (defense-in-depth, not a vulnerability)

---

## Previously Deferred Items (Still Present)

- Docker build error leaks paths (deferred)
- Anti-cheat copies user text content (deferred — same as SEC-2)
