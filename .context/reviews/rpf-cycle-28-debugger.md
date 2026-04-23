# RPF Cycle 28 — Debugger Review

**Date:** 2026-04-23
**HEAD:** ca62a45d
**Scope:** Full repository latent bug surface, failure modes, and regression risks

---

## Summary

This audit identified **28 findings** across the codebase: 8 High confidence, 12 Medium, 8 Low. The most critical categories are (1) unguarded `response.json()` calls that throw `SyntaxError` on non-JSON error bodies, (2) stale closure bugs in moderation controls and exam timers, (3) timezone inconsistencies in contest timestamps and countdown timers, (4) missing null checks after concurrent DB mutations, and (5) concurrency hazards in SSE connection tracking. The recent i18n fix commits are clean and don't introduce regressions, but they expose a deeper pattern of `useCallback` dependency gaps in the discussion components.

---

## Findings

### BUG-01: Stale closure — `isLocked`/`isPinned` read from props, not state

**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:86-92`
**Confidence:** High

```tsx
<Button onClick={() => void updateModeration({ pinned: !isPinned })} disabled={isSubmitting}>
  {isPinned ? unpinLabel : pinLabel}
</Button>
<Button onClick={() => void updateModeration({ locked: !isLocked })} disabled={isSubmitting}>
  {isLocked ? unlockLabel : lockLabel}
</Button>
```

**Latent bug:** `isLocked` and `isPinned` are props, not state. After a successful `updateModeration({ pinned: !isPinned })` call, the component calls `router.refresh()` which triggers a server re-render — but there's a window where the user can click again before the server data propagates. The second click would send `!isPinned` again using the *stale* prop value, effectively undoing the first operation. The `disabled={isSubmitting}` guard doesn't fully prevent this because `isSubmitting` resets in `finally` before the re-render completes.

**Failure scenario:** Moderator clicks "Pin", API succeeds, `isSubmitting` resets to `false`, but props haven't updated yet. Moderator clicks again — sends `{ pinned: true }` (stale `!isPinned` where `isPinned` was `false`), which is a no-op, but if they click "Pin" a third time after `isPinned` props update to `true`, it sends `{ pinned: false }`, unpinning the thread they just pinned.

**Fix:** Track `isLocked`/`isPinned` as local state initialized from props, and optimistically update them in the success path before `router.refresh()` completes. Alternatively, keep `isSubmitting` true until the refresh settles by not resetting it in `finally`.

---

### BUG-02: Unguarded `response.json()` on success path — `submission-detail-client.tsx`

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:138`
**Confidence:** High

```tsx
const payload = await response.json() as { data?: { queuePosition?: number | null; gradingTestCase?: string | null } };
```

**Latent bug:** This `response.json()` call is inside the success path (`if (!response.ok) { return; }` is at line 134), but if the reverse proxy returns a non-JSON body (e.g., 502 HTML from nginx between the `response.ok` check and the `.json()` call due to a race), the `SyntaxError` is caught by the surrounding try/catch and silently swallowed with `// Best-effort only`. This means queue position polling silently dies and never recovers until the user manually refreshes.

**Failure scenario:** App server is under load; nginx occasionally returns 502 between the time the client receives headers and reads the body. The queue position display stops updating, and the student sees stale queue position for an in-progress submission.

**Fix:** Wrap the `.json()` call in a `.catch()` and return early on parse failure, or add retry logic:
```tsx
const payload = await response.json().catch(() => null) as ...;
if (!payload) return;
```

---

### BUG-03: Unguarded `response.json()` in rate-limiter sidecar client

**File:** `src/lib/security/rate-limiter-client.ts:79`
**Confidence:** Medium

```tsx
const data = (await response.json()) as T;
```

**Latent bug:** Although `response.ok` is checked on line 74, the sidecar might return a 200 with a non-JSON body (e.g., during a deployment where the sidecar process is restarting). The `.json()` call would throw, incrementing the circuit breaker failure counter. After 3 such failures, the circuit breaker opens for 30 seconds, bypassing the sidecar entirely. This is a reasonable fallback, but it means transient non-JSON responses cause a 30-second window where rate limiting falls through to the DB path, potentially increasing DB load.

**Failure scenario:** Sidecar returns `200 OK` with an HTML body during a blue-green deployment. Three consecutive parse failures open the circuit breaker, forcing all rate limit checks to the DB for 30 seconds. Under high traffic, this could cause DB connection pool exhaustion.

**Fix:** Add `.catch()` on the `.json()` call and treat parse failure the same as a null response:
```tsx
const data = await response.json().catch(() => null) as T | null;
if (data !== null && data !== undefined) {
  consecutiveFailures = 0;
}
return data;
```

---

### BUG-04: Unguarded `response.json()` in compiler/execute.ts

**File:** `src/lib/compiler/execute.ts:533`
**Confidence:** Medium

```tsx
const data = await response.json() as CompilerRunResult;
```

**Latent bug:** After checking `response.ok`, this `.json()` call has no `.catch()`. If the Rust runner sidecar returns a 200 with an empty body or malformed JSON, the `SyntaxError` is caught by the outer try/catch and the function returns `null`, falling back to local execution. This is a graceful degradation, but the fallback to local Docker execution on the app server violates the project's deployment architecture (judge/worker images must only be built on worker-0, per CLAUDE.md). If local execution is attempted on algo.xylolabs.com, it could fail or cause resource issues.

**Failure scenario:** Rust runner returns a truncated JSON body due to a network glitch. The function falls back to local Docker execution on the app server, which shouldn't have Docker installed per the deployment architecture.

**Fix:** Add `.catch()` with logging:
```tsx
const data = await response.json().catch((err) => {
  logger.warn({ err, url: COMPILER_RUNNER_URL }, "[compiler] Rust runner returned non-JSON body, falling back");
  return null;
}) as CompilerRunResult | null;
if (!data) return null;
```

---

### BUG-05: Unguarded `response.json()` in `hcaptcha.ts`

**File:** `src/lib/security/hcaptcha.ts:76`
**Confidence:** Medium

```tsx
const payload = await response.json() as {
  success?: boolean;
  "error-codes"?: string[];
};
```

**Latent bug:** After checking `response.ok` on line 69, the `.json()` call has no `.catch()`. If the hCaptcha API returns a 200 with an unexpected content type, the `SyntaxError` propagates up and the entire verification function throws, which would cause a 500 error on the signup/login endpoint.

**Failure scenario:** hCaptcha's CDN returns a 200 with an HTML error page (CDN degradation). The signup form crashes with a 500 error, blocking all new user registration.

**Fix:** Add `.catch()` returning a safe default:
```tsx
const payload = await response.json().catch(() => ({
  success: false,
  "error-codes": ["json-parse-failed"],
})) as { success?: boolean; "error-codes"?: string[] };
```

---

### BUG-06: Unguarded `response.json()` in `docker/client.ts` — `callWorkerJson`

**File:** `src/lib/docker/client.ts:55`
**Confidence:** Medium

```tsx
return response.json() as Promise<T>;
```

**Latent bug:** After `response.ok` check on line 51, the `.json()` call has no `.catch()`. The function already has `readError()` that uses `.json().catch()` for error responses, but the success path is unprotected. If the worker API returns a 200 with a non-JSON body, the `SyntaxError` propagates to the caller.

**Failure scenario:** Worker-0's Docker API endpoint returns a 200 with an empty body after a race condition. The admin dashboard's Docker image list crashes.

**Fix:** Add `.catch()` in `callWorkerJson`:
```tsx
const data = await response.json().catch(() => { throw new Error("Worker returned non-JSON response"); }) as T;
return data;
```

---

### BUG-07: `useVisibilityPolling` jitter `setTimeout` not cleared on unmount

**File:** `src/hooks/use-visibility-polling.ts:47-49`
**Confidence:** Medium

```tsx
const jitter = Math.floor(Math.random() * 500);
setTimeout(() => {
  void tick();
}, jitter);
```

**Latent bug:** The jitter `setTimeout` on line 47-49 is not tracked and not cleared in the cleanup function (lines 61-64). If the component unmounts within the 0-500ms jitter window, the `tick()` callback fires after unmount, potentially calling `setState` on an unmounted component. In React 18+ with concurrent rendering, this can cause a console warning and, in rare cases, a state update on a disconnected fiber.

**Failure scenario:** User navigates away from a contest page within 500ms of a visibility change. The polling tick fires after navigation, calling the callback (which includes `apiFetch`) on an unmounted component. This is a minor leak — the fetch completes but its results are discarded.

**Fix:** Track the jitter timeout and clear it on cleanup:
```tsx
let jitterTimeoutId: ReturnType<typeof setTimeout> | null = null;

// In syncVisibility:
jitterTimeoutId = setTimeout(() => { void tick(); }, jitter);

// In cleanup:
return () => {
  document.removeEventListener("visibilitychange", syncVisibility);
  clearPollingInterval();
  if (jitterTimeoutId !== null) clearTimeout(jitterTimeoutId);
};
```

---

### BUG-08: SSE connection tracking — O(n) eviction in hot path

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:44-55`
**Confidence:** High

```tsx
while (connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS) {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, info] of connectionInfoMap) {
    if (info.createdAt < oldestTime) {
      oldestTime = info.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) removeConnection(oldestKey);
  else break;
}
```

**Latent bug:** The eviction loop is O(n) per insertion when the map is at capacity (MAX_TRACKED_CONNECTIONS = 1000). Under high concurrency (many SSE connections being created simultaneously), this becomes O(n^2) total. The eviction iterates the entire map to find the oldest entry, then removes it and re-checks. If multiple connections are being added concurrently, each one could trigger a full iteration.

**Failure scenario:** During a large contest with 500+ concurrent submissions, 1000 connections are in the map. Each new connection triggers a 1000-element linear scan. If 50 connections arrive in the same event loop tick, that's 50,000 map iterations, blocking the event loop.

**Fix:** Use a sorted data structure (e.g., a min-heap keyed by `createdAt`) or a `Map` with insertion-ordered cleanup. Since `addConnection` is called once per SSE request (not per poll tick), the actual impact is moderate, but a min-heap would make this O(log n).

---

### BUG-09: SSE `onPollResult` callback — async IIFE re-auth race

**File:** `src/app/api/v1/submissions/[id]/events/route.ts:377-418`
**Confidence:** Medium

```tsx
const onPollResult: PollCallback = (status: string) => {
  if (closed) return;
  const now = Date.now();
  if (now - lastAuthCheck >= AUTH_RECHECK_INTERVAL_MS) {
    lastAuthCheck = now;
    void (async () => {
      if (closed) return;
      // ... re-auth check, then process status
    })().catch(...);
    return; // Don't process the event synchronously
  }
  // ... synchronous status processing
};
```

**Latent bug:** When `now - lastAuthCheck >= AUTH_RECHECK_INTERVAL_MS`, the callback returns early (line 418: `return;`) without processing the status event synchronously. The async IIFE handles it later. But if the shared poll tick fires again *before* the IIFE completes (within 1-2 seconds), a second `onPollResult` call will see `now - lastAuthCheck < AUTH_RECHECK_INTERVAL_MS` (because `lastAuthCheck` was just updated), so it *will* process the status synchronously. This means two status events could be processed in quick succession: one from the second call's synchronous path, and one from the first call's async IIFE. If the status changed to terminal between these two, `sendTerminalResult` could be called twice.

**Failure scenario:** A submission transitions to "accepted" during the re-auth check window. The async IIFE calls `sendTerminalResult()`, and the next poll tick (1-2 seconds later) also sees the terminal status and calls `sendTerminalResult()` again. The second call tries to enqueue data on an already-closed stream, which is caught by the `try/catch` in `sendTerminalResult`, so it's not catastrophic — but it's a wasted DB query and a redundant close attempt.

**Fix:** Add a `terminalResultSent` flag to prevent double delivery:
```tsx
let terminalResultSent = false;
// In sendTerminalResult:
if (terminalResultSent) return;
terminalResultSent = true;
```

---

### BUG-10: Anti-cheat `reportEvent` — `lastEventRef` never resets between mounts

**File:** `src/components/exam/anti-cheat-monitor.tsx:66`
**Confidence:** Low

```tsx
const lastEventRef = useRef<Record<string, number>>({});
```

**Latent bug:** `lastEventRef` is initialized as an empty object on mount and persists for the component's lifetime. This is fine for a single mount. However, if the component remounts (e.g., due to React Strict Mode double-mount in development, or a key change in a parent), the ref is re-initialized to `{}`, so events that were recently throttled could fire again within the `MIN_INTERVAL_MS` window. This is a minor issue — it could cause duplicate events on the server side.

**Failure scenario:** React Strict Mode in development double-mounts the component. Two "heartbeat" events are sent within 1 second of each other. The server receives duplicate heartbeat events, which is harmless but wastes bandwidth.

**Fix:** This is low severity and only affects development mode (Strict Mode). No fix needed in production.

---

### BUG-11: Anti-cheat retry timer not cleared when component unmounts during `flushPendingEvents`

**File:** `src/components/exam/anti-cheat-monitor.tsx:122-128`
**Confidence:** Medium

```tsx
if (!retryTimerRef.current) {
  retryTimerRef.current = setTimeout(() => {
    retryTimerRef.current = null;
    void flushPendingEvents();
  }, RETRY_BASE_DELAY_MS * 2);
}
```

**Latent bug:** The retry timer is created in `reportEvent` (line 124) but is only cleaned up in the event listener cleanup function (lines 243-245). If `reportEvent` is called after the event listeners are set up but before the cleanup function runs, the timer could fire after unmount. However, the cleanup function at line 243-245 does clear `retryTimerRef.current`, so this is properly handled.

**Update:** On closer inspection, the cleanup at line 243-245 is inside the second `useEffect` (event listeners). The retry timer ref is also accessible there. But if the first `useEffect` (heartbeat) is the one that unmounts, the retry timer wouldn't be cleared. Since both effects share the same `retryTimerRef`, and the second effect's cleanup *does* clear it, this is only an issue if the second effect's cleanup runs before the timer fires but the component is already unmounted. In practice, React runs cleanup effects in reverse order, so this is safe.

**Revised confidence:** Low. The timer is cleared in the effect cleanup.

---

### BUG-12: `comment-section.tsx` — silent error swallowing on non-OK fetch

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:42-52`
**Confidence:** High

```tsx
const fetchComments = useCallback(async () => {
  try {
    const response = await apiFetch(`/api/v1/submissions/${submissionId}/comments`);
    if (response.ok) {
      const payload = (await response.json()) as { data?: CommentView[] };
      if (payload.data) {
        setComments(payload.data);
      }
    }
    // No else branch — non-OK responses are silently ignored
  } catch {
    toast.error(tComments("loadError"));
  }
}, [submissionId, tComments]);
```

**Latent bug:** When `response.ok` is `false`, the code falls through silently with no user feedback and no logging. The network error path (catch block) shows a toast, but the HTTP error path (non-OK response) does nothing. This violates the project's own convention documented in `src/lib/api/client.ts`: "Never silently swallow errors — always surface them to the user."

**Failure scenario:** A 403 response (user session expired while viewing comments) is silently ignored. The comment section shows stale/empty data, and the user doesn't know their session expired. They type a comment, submit, and get an error on the POST — but the GET failure was hidden.

**Fix:** Add an `else` branch with error feedback:
```tsx
if (response.ok) {
  // ... existing code
} else {
  toast.error(tComments("loadError"));
}
```

---

### BUG-13: `group-members-manager.tsx` — accessing `.error` on untyped catch payload

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:219-222`
**Confidence:** Medium

```tsx
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(payload.error || "memberRemoveFailed");
}
```

**Latent bug:** `payload` is typed as `{}` from the `.catch(() => ({}))` fallback, but `payload.error` is accessed without a type assertion. TypeScript allows this because `payload` is `any` after `.catch()`. More importantly, this uses the "parse first, check OK after" pattern which is the anti-pattern documented in `api/client.ts`. The `response.json()` is called before `response.ok` is checked. If the server returns a non-JSON error body (e.g., 502 HTML from nginx), `.json()` would throw — but the `.catch(() => ({}))` handles this. However, `response.json().catch(() => ({}))` always consumes the response body, even on success, meaning the success path doesn't need another `.json()` call.

**Failure scenario:** A 502 from nginx returns HTML. The `.catch(() => ({}))` handles it, `payload` is `{}`, `payload.error` is `undefined`, the error message falls back to `"memberRemoveFailed"`. This works, but it consumes the response body unnecessarily on success.

**Fix:** Use the recommended success-first pattern:
```tsx
if (!response.ok) {
  const errorBody = await response.json().catch(() => ({}));
  throw new Error((errorBody as { error?: string }).error || "memberRemoveFailed");
}
const payload = await response.json();
```

---

### BUG-14: `normalizePage` uses `Number()` instead of `parseInt`

**File:** `src/lib/pagination.ts:6`
**Confidence:** Low

```tsx
export function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}
```

**Latent bug:** `Number("1e3")` returns `1000`, `Number("0x10")` returns `16`, `Number("  5  ")` returns `5`. While `Number.isFinite()` catches `NaN` and `Infinity`, it doesn't catch scientific notation or hex parsing. `Number("1e3")` is `1000`, which is a valid page number that passes all guards. This allows users to craft URLs like `?page=1e3` that resolve to page 1000, potentially causing large offset queries.

**Failure scenario:** An attacker sends `?page=1e7` (10,000,000). `Number("1e7")` = `10000000`, which is finite and > 0, so `Math.floor(10000000)` = `10000000`. The database query uses `OFFSET 499999950` (if pageSize=50), which is extremely slow on large tables and could cause a DoS.

**Fix:** Use `parseInt` with radix 10:
```tsx
const parsed = parseInt(value ?? "1", 10);
if (Number.isNaN(parsed) || parsed < 1) {
  return 1;
}
```
Also add an upper bound: `return Math.min(Math.floor(parsed), 10000);`

---

### BUG-15: `useSubmissionPolling` — SSE `onerror` doesn't reset `isPolling` on failed SSE

**File:** `src/hooks/use-submission-polling.ts:158-164`
**Confidence:** Low

```tsx
es.onerror = () => {
  if (!sseActive) return;
  es.close();
  sseActive = false;
  startFetchPolling();
};
```

**Latent bug:** When SSE fails and falls back to fetch polling, `startFetchPolling()` is called which calls `initFetchPolling()`, which calls `setIsPolling(true)` (line 280). But `isPolling` was already set to `true` at line 129. This is fine — the state doesn't change. However, if the SSE connection fails *and* the fallback fetch also fails immediately, the error path in `initFetchPolling` (line 263) sets `setError(true)` and schedules a retry. The `isPolling` stays `true` throughout. If the component unmounts during this cascade, the cleanup function (line 284-290) aborts the fetch controller, which is correct. So this is not a bug per se, but the dual-tracking of polling state (both `isPolling` and the active submission check) adds complexity.

**Revised confidence:** Low. The fallback works correctly; this is a complexity concern, not a bug.

---

### BUG-16: Contest clarifications/announcements — `response.json()` not guarded against non-JSON on success path

**File:** `src/components/contest/contest-clarifications.tsx:79`
**File:** `src/components/contest/contest-announcements.tsx:56`
**Confidence:** High

```tsx
// contest-clarifications.tsx:79
const payload = await response.json() as { data?: ContestClarification[] };

// contest-announcements.tsx:56
const payload = await response.json() as { data?: ContestAnnouncement[] };
```

**Latent bug:** After checking `response.ok`, the `.json()` call has no `.catch()`. If the API returns a 200 with a non-JSON body (e.g., a corrupted response from a reverse proxy), the `SyntaxError` propagates to the surrounding try/catch, which shows a toast error on the initial load or silently fails on polling refresh. The clarifications/announcements list becomes empty and never recovers until the user refreshes.

**Failure scenario:** During a contest, the nginx reverse proxy occasionally returns a corrupted 200 response. The clarifications panel fails to load and shows the error toast. Subsequent polling refreshes also fail silently (as designed for polling). Students can't see contest clarifications for the rest of the contest unless they manually refresh the page.

**Fix:** Add `.catch()` on the `.json()` call with a safe default:
```tsx
const payload = await response.json().catch(() => ({ data: [] })) as { data?: ContestClarification[] };
```

---

### BUG-17: Exam countdown timer — initial render uses client clock, not server time

**File:** `src/components/exam/countdown-timer.tsx:54-57`
**Confidence:** High

```tsx
const [remaining, setRemaining] = useState(() => deadline - Date.now());
const [expired, setExpired] = useState(() => deadline - Date.now() <= 0);
```

**Latent bug:** The initial state is computed using `Date.now()` (client clock), but `offsetRef.current` is initialized to `0` and only updated after the async fetch to `/api/v1/time` completes. If there is clock skew between the client and the server (e.g., the client clock is 2 minutes ahead), the timer initially shows 2 minutes less than the true remaining time. Once the server time response arrives and `offsetRef` is updated, the next `recalculate()` call corrects it, but there is a visible "jump" in the countdown.

More critically, if the client clock is *ahead* of the server and the deadline is very close, the initial state computes `expired = true` and the UI immediately shows "00:00:00" with the destructive badge variant. Although `onExpired` is only called from the effect's `recalculate` (not from `useState` initializer), the visual display of "00:00:00" in red causes unnecessary panic for the student.

**Failure scenario:** A student's laptop clock is 2 minutes ahead of the server. The exam deadline is 1 minute from now (server time). On mount, `deadline - Date.now()` is negative, so `expired` initializes to `true` and the badge shows "00:00:00" in red. Two seconds later, the server time response arrives, the offset is applied, and the timer corrects to "00:01:58". The student has already seen "00:00:00" and may believe the exam has ended.

**Fix:** Defer the initial expired state until the server time offset is resolved, or show a neutral/loading state until the offset is available:
```tsx
const [serverTimeResolved, setServerTimeResolved] = useState(false);
// In the server time fetch:
setServerTimeResolved(true);
// In recalculate, only trigger expired after server time is resolved:
if (diff <= 0 && serverTimeResolvedRef.current) {
  handleExpired();
}
```

---

### BUG-18: `formatContestTimestamp` uses browser local timezone instead of configured timezone

**File:** `src/lib/formatting.ts:100-111`
**Confidence:** High

```tsx
export function formatContestTimestamp(
  value: string | number | Date | null | undefined,
  locale: string | string[] = DEFAULT_LOCALE
): string | null {
  // ...
  return new Intl.DateTimeFormat(
    typeof locale === "string" ? locale : DEFAULT_LOCALE,
    { dateStyle: "medium", timeStyle: "short" }
  ).format(date);
}
```

**Latent bug:** The rest of the codebase uses `formatDateTimeInTimeZone` from `datetime.ts` which explicitly passes `timeZone: DEFAULT_TIME_ZONE` ("Asia/Seoul") to `Intl.DateTimeFormat`. But `formatContestTimestamp` uses bare `Intl.DateTimeFormat` without a `timeZone` option, meaning it formats in the *browser's local timezone*. This is used in contest announcements and clarifications. For a contest platform targeted at Korean users where all server times are in Asia/Seoul, showing timestamps in the user's browser timezone is inconsistent and potentially confusing.

**Failure scenario:** A student in UTC-5 views a contest announcement timestamp. The announcement says "Posted at 3:00 PM" but the contest deadline displayed elsewhere shows "6:00 PM KST". The student cannot tell whether the announcement was posted 3 hours before the deadline or at the same time, because the two displays use different timezone bases.

**Fix:** Add a `timeZone` parameter with the same default used everywhere else:
```tsx
export function formatContestTimestamp(
  value: string | number | Date | null | undefined,
  locale: string | string[] = DEFAULT_LOCALE,
  timeZone: string = DEFAULT_TIME_ZONE
): string | null {
  // ...
  return new Intl.DateTimeFormat(
    typeof locale === "string" ? locale : DEFAULT_LOCALE,
    { dateStyle: "medium", timeStyle: "short", timeZone }
  ).format(date);
}
```

---

### BUG-19: Anti-cheat timeline — `ts * 1000` assumes seconds, silently breaks for millisecond timestamps

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:165`
**File:** `src/components/contest/anti-cheat-dashboard.tsx:280`
**Confidence:** Medium

```tsx
const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
```

**Latent bug:** This code assumes that if `createdAt` is a number, it is a Unix timestamp in seconds and multiplies by 1000. However, if the value is already in milliseconds (JavaScript's `Date.now()` returns ms), the `* 1000` multiplication would produce a date far in the future (e.g., year 54,000). The `isNaN(d.getTime())` guard would not catch this because the resulting Date is technically valid — just wildly wrong. The `AntiCheatEvent` type declares `createdAt: string`, but the `formatEventTime` function accepts `string | number`, so if any code path passes a millisecond number, the result is silently incorrect.

**Failure scenario:** A future API change returns `createdAt` as a millisecond number (e.g., `Date.now()`). The `typeof ts === "number"` branch triggers, multiplies by 1000, and produces a date ~1000x in the future. The anti-cheat timeline shows event times as "year 50000" with no error.

**Fix:** Use a heuristic to detect seconds vs milliseconds:
```tsx
function formatEventTime(ts: string | number): string {
  let d: Date;
  if (typeof ts === "number") {
    d = new Date(ts < 1e12 ? ts * 1000 : ts);
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return "-";
  return formatDateTimeInTimeZone(d, locale, timeZone);
}
```

---

### BUG-20: Anti-cheat pagination offset desync on polling refresh

**File:** `src/components/contest/anti-cheat-dashboard.tsx:136-143`
**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:107-113`
**Confidence:** Medium

```tsx
setOffset((prev) => {
  if (prev <= PAGE_SIZE) {
    return firstPage.length;
  }
  return prev;
});
```

**Latent bug:** The `offset` state tracks how many items have been loaded via "load more". When the polling refresh fetches the first page, it updates `offset` only if `prev <= PAGE_SIZE`. If the total number of events has changed between polling cycles (e.g., new events were created), `firstPage.length` might differ from `PAGE_SIZE`. The events array becomes `[...new_first_page_items, ...prev.slice(PAGE_SIZE)]`, but `prev.slice(PAGE_SIZE)` starts from the old page boundary. Items at the page boundary overlap between the new first page and the old appended data, producing duplicate entries.

**Failure scenario:** An exam has 120 anti-cheat events. The dashboard loads 100 (offset=100). The user clicks "load more" and gets 20 more (offset=120). During the next 30-second polling cycle, 5 new events appear. The first page now has 105 items. The array becomes `[...105 items, ...old items starting from index 100]`. Items at indices 100-104 from the old data are now shown again at positions 105-109 alongside their new positions, producing 5 duplicate entries visible to the admin.

**Fix:** When `prev > PAGE_SIZE` after a poll refresh, either re-fetch all loaded pages or reset the appended data:
```tsx
setOffset((prev) => {
  if (prev <= PAGE_SIZE) {
    return firstPage.length;
  }
  // Data beyond first page may be stale — reset and let user re-load
  return firstPage.length;
});
// Also reset events to first page only when offset shrinks
```

---

### BUG-21: Stale closure in active-timed-assignment sidebar timer

**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:62-89`
**Confidence:** Medium

```tsx
useEffect(() => {
  const hasActiveAssignment = assignments.some(
    (assignment) => new Date(assignment.deadline).getTime() > Date.now()
  );
  if (!hasActiveAssignment) return undefined;
  const interval = window.setInterval(() => {
    const now = Date.now();
    setNowMs(now);
    const allExpired = assignments.every(
      (assignment) => new Date(assignment.deadline).getTime() <= now
    );
    if (allExpired) {
      window.clearInterval(interval);
    }
  }, 1000);
  return () => { window.clearInterval(interval); };
}, [assignments]);
```

**Latent bug:** The interval callback captures the `assignments` value from the closure at the time the effect ran. If the `assignments` prop changes (e.g., a contest deadline is extended by an admin), the old interval closure still sees the old (shorter) deadline and will call `clearInterval` when the old deadline passes, even though the new assignments still have time remaining. The new effect for the updated assignments starts a new interval, but there is a momentary gap where `nowMs` stops updating.

**Failure scenario:** Admin extends a contest deadline by 10 minutes. The server component re-renders with the new assignments. The old interval's `allExpired` check still uses the old deadline. When the old deadline time passes, `allExpired` returns true and the old interval clears itself. The new interval from the re-run is already active, but if the re-render coincides with the 1-second tick boundary, the user may see the timer briefly show "00:00:00" before the new interval corrects it.

**Fix:** Use a ref to hold the current assignments so the interval callback always reads the latest value:
```tsx
const assignmentsRef = useRef(assignments);
useEffect(() => { assignmentsRef.current = assignments; }, [assignments]);

useEffect(() => {
  const interval = window.setInterval(() => {
    const now = Date.now();
    setNowMs(now);
    const allExpired = assignmentsRef.current.every(
      (a) => new Date(a.deadline).getTime() <= now
    );
    if (allExpired) window.clearInterval(interval);
  }, 1000);
  return () => window.clearInterval(interval);
}, []);
```

---

### BUG-22: `response.json()` called before `response.ok` check — `group-members-manager.tsx` remove path

**File:** `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:219-222`
**Confidence:** High

```tsx
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(payload.error || "memberRemoveFailed");
}
```

**Latent bug:** `.json()` is called on line 219 before `response.ok` is checked on line 221. This is the documented anti-pattern in `api/client.ts`. The `.catch()` prevents a crash, but the server's actual error message is silently discarded when the response body is non-JSON. Compare with the correct pattern used in the same file at lines 124 and 181, where `.json().catch()` is called ONLY inside the `if (!response.ok)` block.

**Failure scenario:** A DELETE request to `/api/v1/groups/${groupId}/members/${userId}` hits a reverse proxy that returns 502 with HTML. The `.catch()` resolves to `{}`, `payload.error` is `undefined`, and the user sees a generic "memberRemoveFailed" instead of the actual server error.

**Fix:** Move the `.json()` call inside the `if (!response.ok)` block:
```tsx
if (!response.ok) {
  const errorBody = await response.json().catch(() => ({}));
  throw new Error((errorBody as { error?: string }).error || "memberRemoveFailed");
}
```

---

### BUG-23: `response.json()` called before `response.ok` check — bulk rejudge

**File:** `src/app/(dashboard)/dashboard/admin/submissions/admin-submissions-bulk-rejudge.tsx:33`
**Confidence:** High

Same anti-pattern as BUG-22. `.json()` called before `response.ok` check. The `.catch()` prevents a crash but silently discards the server's error message.

**Fix:** Move `.json()` inside the `if (!response.ok)` block.

---

### BUG-24: `response.json()` called before `response.ok` check — assignment delete & problem delete

**File:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-delete-button.tsx:39`
**File:** `src/app/(dashboard)/dashboard/problems/[id]/problem-delete-button.tsx:44`
**Confidence:** High

Same anti-pattern. Both use `const payload = (await response.json().catch(() => ({}))) as XxxDeleteResponse;` before checking `response.ok`.

**Fix:** Move `.json()` inside the `if (!response.ok)` block in both files.

---

### BUG-25: Discussion components discard server error messages — `console.error` instead of user-facing feedback

**File:** `src/components/discussions/discussion-post-form.tsx:46-48`
**File:** `src/components/discussions/discussion-thread-form.tsx:52-54`
**File:** `src/components/discussions/discussion-post-delete-button.tsx:28-30`
**File:** `src/components/discussions/discussion-thread-moderation-controls.tsx:50-52,70-71`
**Confidence:** Medium

```tsx
const errorBody = await response.json().catch(() => ({}));
console.error("Discussion post creation failed:", (errorBody as { error?: string }).error);
throw new Error(errorLabel);
```

**Latent bug:** The server returns specific error codes (e.g., `rateLimited`, `contentPolicyViolation`, `threadLocked`) but these are logged to `console.error` and never shown to the user. The user sees a generic `errorLabel` string instead. This contrasts with the pattern used in `discussion-vote-buttons.tsx:46` which uses `toast.error(errorBody.error ?? voteFailedLabel)`. The server's actual error message is available but discarded.

**Failure scenario:** A user tries to post a reply to a locked thread. The API returns `{ error: "threadLocked" }`. The user sees the generic `errorLabel` string instead of "This thread is locked." The user retries repeatedly, not understanding why their posts keep failing.

**Fix:** Use the server's error message when available:
```tsx
const errorBody = await response.json().catch(() => ({}));
const serverError = (errorBody as { error?: string }).error;
throw new Error(serverError ?? errorLabel);
```

---

### BUG-26: Unchecked `rows[0]` after concurrent deletion in admin API routes

**File:** `src/app/api/v1/admin/tags/[id]/route.ts:41`
**File:** `src/app/api/v1/admin/roles/[id]/route.ts:121`
**File:** `src/app/api/v1/admin/roles/route.ts:142`
**Confidence:** High

```typescript
const updated = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.id, params.id))
    .then((rows) => rows[0]);

recordAuditEvent({
    resourceLabel: updated.name,   // <-- crashes if updated is undefined
    summary: `Updated tag "${updated.name}"`,
});
```

**Latent bug:** The code checks that the row exists before updating (earlier in the handler), but between the UPDATE and the re-SELECT, another request could DELETE the row. `rows[0]` returns `undefined` for an empty result set. The subsequent `updated.name` throws `TypeError: Cannot read properties of undefined (reading 'name')`.

**Failure scenario:** Admin A updates tag X. Simultaneously, Admin B deletes tag X. The UPDATE succeeds (row existed at that moment), but the re-SELECT returns empty. The route handler crashes with an unhandled TypeError instead of returning a proper error response.

**Fix:** Add null check after the re-SELECT:
```typescript
.then((rows) => rows[0] ?? null);
if (!updated) return notFound("tag");
```

---

### BUG-27: `.then()` without `.catch()` on CodeMirror dynamic imports

**File:** `src/components/code/code-surface.tsx:390, 407, 430`
**Confidence:** Medium

```typescript
getLanguageExtension(initialEditorConfig.language).then((ext) => {
    if (!cancelled && editorViewRef.current) {
        editorViewRef.current.dispatch({
            effects: languageCompartmentRef.current.reconfigure(ext),
        });
    }
});
// No .catch() — unhandled rejection if chunk fails to load
```

**Latent bug:** `getLanguageExtension()` uses dynamic `import()` to load CodeMirror language packages. If the chunk fails to load (network error, CDN issue, code-splitting failure after deploy), the promise rejects with no `.catch()` handler, producing an `UnhandledPromiseRejection` in the browser console. The editor silently loses syntax highlighting with no user feedback.

**Failure scenario:** A new deployment invalidates existing chunk hashes. The user's browser tries to load the Python language extension chunk but gets a 404. The promise rejects, producing an unhandled rejection warning and leaving the editor without syntax highlighting.

**Fix:** Add `.catch()` to all three locations:
```typescript
getLanguageExtension(initialEditorConfig.language).then((ext) => {
    // ...
}).catch(() => {
    // Language extension failed to load — editor remains functional without syntax highlighting
});
```

---

### BUG-28: Non-null assertion `role!.id` crashes if role is null in edit mode

**File:** `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:76`
**File:** `src/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form.tsx:200`
**Confidence:** Medium

```typescript
const url = mode === "create"
    ? "/api/v1/admin/roles"
    : `/api/v1/admin/roles/${role!.id}`;  // <-- crashes if role is null
```

**Latent bug:** When `mode` is not `"create"`, `role` is expected to be non-null. However, there is no runtime guard enforcing this. If a state update race condition sets `mode` to `"edit"` before `role` is populated, or if `role` is reset to null while the dialog is still open in edit mode, this throws `TypeError: Cannot read properties of null (reading 'id')`.

**Failure scenario:** The role editor dialog is open in edit mode. An external event (e.g., the role is deleted by another admin, triggering a `router.refresh()`) causes `role` to become null while `mode` remains `"edit"`. The user clicks save and the form submission crashes.

**Fix:** Replace non-null assertion with a guard:
```typescript
const url = mode === "create"
    ? "/api/v1/admin/roles"
    : role ? `/api/v1/admin/roles/${role.id}` : "/api/v1/admin/roles";
```

---

## Regression Risk from Recent Commits

### `6262ef8e` — fix(discussions): add missing errorLabel to useCallback dependency array

This fix added `errorLabel` to the `useCallback` dependency array in `discussion-post-delete-button.tsx`. The fix is correct — `errorLabel` was used inside the callback but wasn't in the deps, meaning error messages could show stale i18n values after a locale change. No regression risk.

### `ee77686c` — fix(discussions): use i18n keys for error messages instead of raw API errors

This replaced raw API error strings with i18n keys. The fix is correct and consistent with the project's i18n conventions. No regression risk.

### `3f17b86d` — fix(i18n): replace hardcoded "voteFailed" string with i18n key

Same pattern as above. Clean fix. No regression risk.

### `10b597cf` — fix(i18n): replace hardcoded English string in discussion delete button

Clean fix. No regression risk.

### `57177f15` — fix(assignments): use parseFloat instead of Number for latePenalty input

This is a good fix — `Number("")` returns `0` while `parseFloat("")` returns `NaN`. Using `parseFloat` correctly rejects empty strings as invalid penalty values. No regression risk.

**Overall regression assessment:** The recent commits are well-targeted fixes with no regression risk. The underlying patterns they fix (missing useCallback deps, hardcoded strings) likely exist elsewhere in the codebase but are not newly introduced regressions.

---

## Pattern Summary

| Pattern | Instances Found | Severity Trend |
|---|---|---|
| Unguarded `response.json()` on success path | 5 (BUG-02, 03, 04, 05, 06, 16) | High — recurring anti-pattern |
| `response.json()` before `response.ok` check | 4 (BUG-22, 23, 24, 13) | High — documented anti-pattern violation |
| Missing null check after DB mutation + re-SELECT | 3 (BUG-26) | High — concurrent delete causes TypeError |
| Stale closure / missing useCallback deps | 2 (BUG-01, 21) | Medium — affects moderation & exam timers |
| Silent error swallowing / discarded server messages | 3 (BUG-12, 25) | Medium — violates documented convention |
| Timezone inconsistencies | 3 (BUG-18, 19, 17) | High — affects exam experience |
| Non-null assertion without guard | 2 (BUG-28) | Medium — crashes on unexpected null |
| Unhandled promise rejection (.then without .catch) | 3 (BUG-27) | Medium — dynamic import failures |
| Type coercion in pagination | 1 (BUG-14) | Low — exploitable but limited impact |
| Concurrency / race in SSE | 2 (BUG-08, 09) | Medium — under high load |
| Timer cleanup gaps | 1 (BUG-07) | Low — short window |
| Pagination offset desync | 1 (BUG-20) | Medium — duplicate entries |

---

## Recommendations

1. **Priority 1:** Add `.catch()` guards to all `response.json()` calls on success paths (BUG-02, 04, 05, 06, 16). This is the highest-frequency bug pattern in the codebase and matches the documented anti-pattern in `api/client.ts`.
2. **Priority 1:** Move `response.json()` calls inside `if (!response.ok)` blocks (BUG-22, 23, 24, 13). This is the documented anti-pattern that was partially fixed in prior cycles but has remaining instances.
3. **Priority 1:** Fix BUG-26 (unchecked `rows[0]` after concurrent deletion in admin routes) — add null checks after re-SELECT in tags/roles routes.
4. **Priority 1:** Fix BUG-17 (countdown timer uses client clock on initial render) — this directly affects exam integrity and student experience.
5. **Priority 2:** Fix BUG-18 (`formatContestTimestamp` timezone inconsistency) — all contest timestamps should use the same timezone.
6. **Priority 2:** Fix BUG-12 (silent error swallowing in comment-section) and BUG-25 (discussion components discarding server error messages) — both violate the project's error handling convention.
7. **Priority 2:** Fix BUG-01 (stale props in moderation controls) — add local state tracking for optimistic updates.
8. **Priority 2:** Fix BUG-28 (non-null assertions on `role!.id` / `problemSet!.id`) — replace with null guards.
9. **Priority 3:** Add `.catch()` to CodeMirror dynamic imports (BUG-27) — prevents unhandled rejection on chunk load failure.
10. **Priority 3:** Add upper bound to `normalizePage` (BUG-14) — defense in depth against DoS via large offset queries.
11. **Priority 3:** Track jitter timeout in `useVisibilityPolling` (BUG-07) — prevents minor resource leak.
12. **Priority 3:** Fix BUG-19 (anti-cheat `ts * 1000` seconds vs ms assumption) — add heuristic for millisecond timestamps.
13. **Priority 3:** Fix BUG-20 (anti-cheat pagination offset desync) — reset offset on polling refresh when user has loaded beyond first page.
