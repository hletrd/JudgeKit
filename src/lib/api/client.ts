/**
 * Wrapper around fetch() that adds the required X-Requested-With header
 * for CSRF protection on all requests.
 */

/**
 * Error Handling Convention
 * ========================
 *
 * All client-side API consumers should follow these patterns:
 *
 * | Error type                          | Handling pattern                                          |
 * |-------------------------------------|-----------------------------------------------------------|
 * | Network / server errors (5xx)       | Toast notification — transient, non-blocking               |
 * | Validation errors (4xx with fields) | Inline form errors — persistent, adjacent to field          |
 * | Auth errors (401, 403)              | Typically surfaced via toast notifications; session middleware handles login redirects |
 * | Not found (404)                     | Call notFound() in server components; inline in client       |
 *
 * General rules:
 * - Never silently swallow errors — always surface them to the user
 * - Avoid duplicate feedback (e.g., both toast AND inline for the same error)
 * - Use i18n keys for all user-facing error messages
 * - Log errors in development only (process.env.NODE_ENV === "development")
 *
 * **CRITICAL: Always check `response.ok` before calling `response.json()`.**
 * Calling `.json()` on a non-JSON body (e.g., 502 HTML from a reverse proxy)
 * throws a SyntaxError that bypasses error-handling logic. Use the established
 * pattern: check `response.ok` first, then use `.json().catch(() => ({}))`
 * when parsing error responses, or `.json()` for success responses inside
 * an `if (response.ok)` block.
 *
 * Example (success-first — recommended):
 * ```ts
 * const response = await apiFetch("/api/v1/resource");
 * if (!response.ok) {
 *   const errorBody = await response.json().catch(() => ({}));
 *   console.error("Request failed:", (errorBody as { error?: string }).error);
 *   toast.error(errorLabel);  // Use i18n key, not raw API error
 *   return;
 * }
 * const payload = await response.json();
 * ```
 *
 * **Anti-pattern (error-first) — DO NOT USE:**
 * ```ts
 * // BAD: .json() is called before response.ok is checked.
 * // If the server returns non-JSON (e.g., 502 HTML), .json() throws SyntaxError.
 * const body = await response.json();  // <-- throws on non-JSON error bodies
 * if (!response.ok) {
 *   throw new Error(body.error);  // <-- never reached
 * }
 * ```
 * Always check `response.ok` BEFORE calling `.json()`.
 *
 * **Response body single-read rule:**
 * The Response body can only be consumed once. Calling `.json()` twice on the
 * same Response throws "body already consumed". Always parse once and branch:
 * ```ts
 * const data = await response.json().catch(() => ({}));
 * if (!response.ok) { throw new Error(...) }
 * // use data for success
 * ```
 *
 * **Using `apiFetchJson` for safe parsing:**
 * For the common pattern of fetching + checking ok + safely parsing JSON,
 * use the `apiFetchJson` helper which combines all three steps:
 * ```ts
 * // Returns { ok: true, data } or { ok: false, data: fallback }
 * const { ok, data } = await apiFetchJson("/api/v1/resource", undefined, {});
 * if (!ok) { toast.error(errorLabel); return; }
 * // use data (typed) for success
 * ```
 */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (!headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return fetch(input, { ...init, headers });
}

/**
 * Fetch a URL with CSRF headers, check `res.ok`, and safely parse the JSON
 * response body in one call. This eliminates the common footguns of:
 * 1. Forgetting to check `res.ok` before `.json()`
 * 2. Forgetting `.catch()` on `.json()` calls
 * 3. Calling `.json()` twice on the same response (body already consumed)
 *
 * Both success and error response JSON parsing is wrapped in `.catch()`,
 * ensuring non-JSON bodies never throw SyntaxError regardless of the HTTP
 * status code. The `fallback` value is returned whenever `.json()` fails,
 * whether the response was 2xx or 4xx/5xx.
 *
 * @param input - URL or RequestInfo to fetch
 * @param init - Optional fetch options. Supports `signal` for AbortController-based cancellation.
 * @param fallback - Value returned when `.json()` throws (e.g., non-JSON body).
 *                    Also returned as `data` when `res.ok` is false.
 * @returns `{ ok: true, data: T }` on success, `{ ok: false, data: T }` on error.
 *          In both cases `data` is the parsed JSON or the fallback value.
 *
 * @example
 * ```ts
 * const { ok, data } = await apiFetchJson<{ sessions: Session[] }>(
 *   "/api/v1/admin/chat-logs",
 *   undefined,
 *   { sessions: [], total: 0 }
 * );
 * if (!ok) { toast.error(t("fetchError")); return; }
 * setSessions(data.sessions);
 * ```
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: T
): Promise<{ ok: true; data: T } | { ok: false; data: T }> {
  const res = await apiFetch(input, init);
  const data = await res.json().catch(() => fallback) as T;
  if (res.ok) {
    return { ok: true, data };
  }
  return { ok: false, data };
}
