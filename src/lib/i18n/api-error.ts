/**
 * Translate a server API error key through a next-intl namespace translator
 * without ever rendering a raw i18n key to the user.
 *
 * The common `toast.error(t(getApiError(payload) || "somethingFailed"))`
 * pattern breaks when the server returns an error key the page's namespace
 * does not define (e.g. the shared rate limiter's "rateLimited", or
 * "forbidden" from the auth layer): next-intl renders the literal missing-key
 * text such as "groups.rateLimited". This helper falls back to the page's
 * operation-specific failure message instead.
 *
 * The translator is typed structurally because call sites already invoke
 * `t()` with dynamic strings — next-intl's `t.has()` is the supported way to
 * probe dynamic keys.
 */
type NamespaceTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

export function translateApiErrorKey(
  t: NamespaceTranslator,
  errorKey: string | undefined,
  fallbackKey: string,
): string {
  if (errorKey && t.has(errorKey)) {
    return t(errorKey);
  }
  return t(fallbackKey);
}
