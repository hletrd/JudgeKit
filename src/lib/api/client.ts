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
 * throws a SyntaxError that bypasses error-handling logic. Use the `apiJson`
 * helper below, or manually check `response.ok` first and use
 * `.json().catch(() => ({}))` when parsing error responses.
 */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (!headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  return fetch(input, { ...init, headers });
}

/**
 * Type-safe helper that checks `response.ok` before parsing JSON.
 *
 * Use this instead of the raw `await response.json()` pattern to avoid
 * SyntaxError when the server returns a non-JSON error body (e.g., 502
 * from a reverse proxy).
 *
 * @example
 * ```ts
 * const result = await apiJson<{ data: User[] }>(response);
 * if (result.ok) {
 *   setUsers(result.data.data);
 * } else {
 *   toast.error(result.error);
 * }
 * ```
 */
export async function apiJson<T>(
  response: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (response.ok) {
    try {
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch {
      return { ok: false, error: "responseParseFailed" };
    }
  }

  // Error response — try to extract an error message from the body.
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    return { ok: false, error: body.error ?? body.code ?? `http${response.status}` };
  } catch {
    return { ok: false, error: `http${response.status}` };
  }
}
