# Comprehensive Code Review — Cycle 35

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer
**Scope:** Full codebase (src/, tests/, config)

---

## Findings

### NEW-1: [MEDIUM] `parseFloat() || null` treats 0 as falsy — cannot set float error tolerance to zero

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:424-425`
**Confidence:** HIGH

```ts
floatAbsoluteError: comparisonMode === "float" ? parseFloat(floatAbsoluteError) || null : null,
floatRelativeError: comparisonMode === "float" ? parseFloat(floatRelativeError) || null : null,
```

`parseFloat("0")` returns `0`, and `0 || null` evaluates to `null`. This means users cannot set a float absolute/relative error tolerance of `0` (meaning "exact match in float comparison mode"). The server-side Zod schema in `src/app/api/v1/problems/[id]/route.ts:27-28` allows `z.number().min(0).max(1).nullable()`, so `0` is a valid value that gets silently dropped on the client side.

**Concrete failure scenario:** An instructor creates a problem with `comparisonMode: "float"` and enters `0` as the absolute error tolerance (meaning they want exact matches only). The `parseFloat("0") || null` evaluates to `null`, so the field is sent as `null` instead of `0`. The problem is created without a float error tolerance, and all submissions with any floating-point output would be marked wrong since there's no tolerance defined.

**Fix:** Replace `parseFloat(x) || null` with `const parsed = parseFloat(x); return Number.isFinite(parsed) ? parsed : null;`. Note: the `difficulty` field on line 426 already handles this correctly with `Number.isFinite(parseFloat(difficulty))`.

---

### NEW-2: [LOW] Tags PATCH route does not set `updatedAt` — inconsistent with all other update routes

**File:** `src/app/api/v1/admin/tags/[id]/route.ts:27-35`
**Confidence:** HIGH

```ts
const updateValues: Record<string, unknown> = {};
if (body.name !== undefined) updateValues.name = body.name;
if (body.color !== undefined) updateValues.color = body.color;

if (Object.keys(updateValues).length === 0) {
  return apiSuccess(existing[0]);
}

await db.update(tags).set(updateValues).where(eq(tags.id, params.id));
```

Every other PATCH/update route in the codebase consistently includes `updatedAt: await getDbNowUncached()` in its update values (languages, api-keys, plugins, settings, system-settings, language-configs, recruiting-invitations, community posts, announcements, clarifications). The tags table schema has only `createdAt` (no `updatedAt` column), so there is no `updatedAt` column to set. However, this means tag modifications have no audit trail timestamp beyond the creation time.

**Concrete failure scenario:** An admin edits a tag's name or color. There is no way to determine when the edit occurred because the `tags` table lacks an `updatedAt` column. If a tag is renamed in a confusing way, there is no timestamp to correlate with admin action logs.

**Fix:** Add an `updatedAt` column to the `tags` table schema, and include it in the PATCH route's update values following the same pattern as other routes. This requires a database migration.

---

### NEW-3: [LOW] `SUBMISSION_GLOBAL_QUEUE_LIMIT` deprecated constant still uses `parseInt(...) ||` pattern

**File:** `src/lib/security/constants.ts:27-30`
**Confidence:** MEDIUM

```ts
/** @deprecated Use getSubmissionGlobalQueueLimit() */
export const SUBMISSION_GLOBAL_QUEUE_LIMIT = parseInt(
  process.env.SUBMISSION_GLOBAL_QUEUE_LIMIT || "100",
  10
);
```

The `|| "100"` fallback means `SUBMISSION_GLOBAL_QUEUE_LIMIT=0` (to disable the queue limit) silently defaults to `100`. While this constant is marked `@deprecated` and active code uses `getSubmissionGlobalQueueLimit()` which correctly delegates to `getConfiguredSettings()`, the deprecated constant is still exported and could be accidentally used in future code. The `parseInt || fallback` pattern here has the same class of bug as the `TRUSTED_PROXY_HOPS` issue fixed in cycle 34 (commit f1bcca05).

**Concrete failure scenario:** A developer sees the exported constant and uses it instead of the function, then sets `SUBMISSION_GLOBAL_QUEUE_LIMIT=0` in the environment expecting to disable the queue limit. The queue limit remains at 100.

**Fix:** Either remove the deprecated constant entirely, or fix it to use `?? "100"` and `Number.isNaN` like the `TRUSTED_PROXY_HOPS` fix.

---

### NEW-4: [LOW] `group-instructors-manager.tsx` logs raw API response data in development

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-instructors-manager.tsx:74`
**Confidence:** LOW

```ts
if (process.env.NODE_ENV === "development") {
  console.error(data);
}
```

This gates the `console.error` behind a development check, but logs the raw API response `data` object which could contain internal error details, user IDs, or other sensitive information. Other components in the same file and elsewhere log only the error message string, not the entire response. The `database-backup-restore.tsx:154` also has the same pattern.

**Fix:** Replace `console.error(data)` with `console.error("Instructor add failed:", (data as { error?: string }).error)` to extract only the error message string, consistent with other components.

---

### NEW-5: [LOW] `parseFloat() || 0` in assignment form treats valid `0` late penalty as falsy

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:410`
**Confidence:** LOW

```ts
onChange={(event) => setLatePenalty(parseFloat(event.target.value) || 0)}
```

If a user types `0` as a late penalty, `parseFloat("0") || 0` still returns `0` (since both sides are `0`). This is actually fine for `0` specifically because the fallback is also `0`. However, if the user is mid-typing and the field temporarily contains something like `0.` or `0.0`, `parseFloat("0.")` returns `0`, and `0 || 0` is still `0`, so this is not a practical bug. The same pattern on line 654 for problem points also has the same behavior but `0` points would be an invalid value anyway (schema requires min 1).

**Resolution after analysis:** FALSE POSITIVE — for the late penalty field, `0` is a valid value and `parseFloat("0") || 0` correctly returns `0`. For the points field, `0` points is invalid per schema (min 1), so `|| 0` is also acceptable since the Zod validator would reject it.

---

## Swept Areas (No New Issues Found)

1. **Export redaction** — `hcaptchaSecret` is now properly in both `SANITIZED_COLUMNS` and `ALWAYS_REDACT` (cycle 19 AGG-1 fixed).
2. **Leaderboard clock skew** — `computeLeaderboard` now uses `getDbNowMs()` (previously fixed).
3. **TRUSTED_PROXY_HOPS parsing** — Now correctly uses `??` and `Number.isNaN` (cycle 34 Task B fixed).
4. **Assignments POST `request.json()`** — Now wrapped in try/catch (cycle 34 Task A fixed).
5. **Contests error boundary** — Now exists (cycle 34 Task C fixed).
6. **Languages list route dockerfile** — Now uses explicit column select (cycle 34 Task D fixed).
7. **`dangerouslySetInnerHTML`** — Only 2 uses, both properly sanitized via `safeJsonForScript()` and `sanitizeHtml()`.
8. **No `eval()` or `new Function()`** — Clean.
9. **No `innerHTML`/`outerHTML`** — Clean.
10. **No `unhandledRejection` handlers** — Not present, but this is typical for Next.js apps.
11. **`localStorage`/`sessionStorage`** — All uses are properly wrapped in try/catch for quota/private-browsing.
12. **Password logging** — No passwords are logged anywhere.
13. **`createApiHandler`** — Properly wraps most routes. The few non-wrapped routes (backup, restore, migrate) have their own try/catch.
14. **Docker image validation** — Properly validates image names with `hasValidJudgeImageName` and trusted registries.
15. **Proxy auth cache** — Eviction properly gated at 90% capacity (cycle 18b AGG-6 fix verified).
16. **Rate limiting** — In-memory rate limiter uses `Date.now()` which is appropriate for in-process state (no DB clock skew risk).
17. **System settings config** — Properly uses async initialization with lock (`_initPromise`), stale-while-revalidate, and fallback to defaults.

---

## Positive Observations

- The codebase consistently uses `getDbNowUncached()` for `updatedAt` timestamps in mutation routes.
- The `createApiHandler` pattern provides consistent auth, CSRF, rate limiting, and Zod validation.
- The proxy auth cache has well-documented security tradeoffs in comments.
- The in-memory rate limiter has proper eviction logic with capacity limits.
- The `use-source-draft` hook properly uses `Number.isFinite()` for the `difficulty` field (correct pattern that `floatAbsoluteError`/`floatRelativeError` should follow).
