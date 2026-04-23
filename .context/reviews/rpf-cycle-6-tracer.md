# Tracer — RPF Cycle 6

## Scope
Causal tracing of suspicious flows and competing hypotheses.

## Flow 1: Anti-cheat dashboard polling replaces loaded data

### Hypothesis A: Polling is designed to refresh the first page only
- **Evidence against:** The `loadMore` function exists (line 138) and is surfaced to the user. The design clearly intends for users to load more than 100 events. If only the first page were intended, `loadMore` wouldn't exist.
- **Verdict:** REJECTED

### Hypothesis B: Polling was implemented before `loadMore` and the interaction wasn't considered
- **Evidence for:** `fetchEvents` was added in the initial commit for the dashboard. `loadMore` was added later. The polling behavior (replacing events) makes sense if there's no pagination. Adding `loadMore` broke the polling assumption.
- **Verdict:** LIKELY. The polling logic needs to be updated to account for loaded-beyond-first-page state.

### Causal chain:
1. `useVisibilityPolling` fires every 30s → calls `fetchEvents`
2. `fetchEvents` calls `setEvents(json.data.events)` with only first page
3. `fetchEvents` calls `setOffset(json.data.events.length)` resetting offset
4. User's loaded data is replaced; offset is incorrect for next `loadMore`

## Flow 2: `handleCreate` missing catch block

### Hypothesis A: The catch was accidentally omitted during the error handling refactoring
- **Evidence for:** `handleRevoke` and `handleDelete` were updated to include try/catch in cycle 5 (commit 8dc3054b). `handleCreate` was not touched in that commit. The function predates the error handling pass.
- **Verdict:** CONFIRMED. `handleCreate` was missed during the systematic error-handling pass.

## Flow 3: Email field required in Create dialog

### Hypothesis A: Email was intentionally made required
- **Evidence against:** The API sends `candidateEmail: createEmail.trim() || undefined`, making it optional. The form type is `email` (not `text`), which allows empty values. The i18n placeholder says "candidateEmailPlaceholder" (optional connotation).
- **Verdict:** The `!createEmail.trim()` check is a bug. It should be removed.
