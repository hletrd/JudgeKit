/**
 * Named-parameter → PostgreSQL positional-parameter translation.
 *
 * Kept in its own pool-free module (no `./index` import) so pure SQL-building
 * code and tests can use it without pulling in the global connection pool —
 * importing the pool eagerly throws when DATABASE_URL is unset, which would
 * break gated integration tests that should skip cleanly.
 */

/**
 * Convert named parameters (@name) to PostgreSQL positional ($1, $2...).
 *
 * Skips @-patterns inside single-quoted and double-quoted string literals
 * to avoid incorrectly treating email addresses and other literal text as
 * parameters (e.g., 'user@example.com' must not extract "example").
 */
export function namedToPositional(
  sql: string,
  params?: Record<string, unknown>
): { text: string; values: unknown[] } {
  if (!params) return { text: sql, values: [] };

  const values: unknown[] = [];
  const paramNames: string[] = [];

  // Match either a string literal (single or double quoted, with escaped quotes)
  // or a parameter placeholder. Only placeholders outside literals are replaced.
  const text = sql.replace(
    /('(?:[^']|'')*')|("(?:[^"]|"")*")|@([a-zA-Z_]\w*)/g,
    (match, _singleQuote, _doubleQuote, name) => {
      // If name is undefined, the match was a string literal — pass through unchanged
      if (name === undefined) {
        return match;
      }

      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        throw new Error(`Missing SQL parameter: ${name}`);
      }

      let idx = paramNames.indexOf(name);
      if (idx === -1) {
        paramNames.push(name);
        values.push(params[name]);
        idx = paramNames.length - 1;
      }
      return `$${idx + 1}`;
    }
  );
  return { text, values };
}
