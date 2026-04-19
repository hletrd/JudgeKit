/**
 * Escape SQL LIKE/ILIKE wildcard characters in a search string.
 * Must be used together with `ESCAPE '\\'` clause in the SQL template.
 *
 * Order matters: backslash must be escaped first, otherwise a literal
 * backslash in the input would double-escape the subsequently added
 * backslashes before % and _.
 */
export function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
