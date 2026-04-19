/**
 * Parse a query parameter value as a positive integer with a fallback default.
 *
 * Returns `defaultValue` for:
 * - `null` / `undefined` / empty strings
 * - Non-numeric strings (e.g., "abc" → NaN → fallback)
 * - Negative numbers
 * - Zero
 * - Non-integer numbers (e.g., "3.5" → 3, but see `strict` option)
 *
 * This replaces the `Number(searchParams.get(...))` pattern which produces
 * `NaN` for non-numeric input, causing `Math.max(1, NaN) === NaN` and
 * propagating NaN into SQL offset/limit calculations.
 *
 * @param value - The raw query parameter value
 * @param defaultValue - The fallback when the value is invalid (must be >= 1)
 * @param strict - When true, reject non-integer strings like "3.5".
 *                  When false (default), parseInt truncates "3.5" to 3.
 */
export function parsePositiveInt(
  value: string | null | undefined,
  defaultValue: number,
  options?: { strict?: boolean }
): number {
  if (typeof value !== "string" || value.trim() === "") {
    return defaultValue;
  }

  const trimmed = value.trim();

  if (options?.strict && !/^\d+$/.test(trimmed)) {
    return defaultValue;
  }

  const parsed = parseInt(trimmed, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse a query parameter value as a non-negative integer (>= 0) with a fallback default.
 *
 * Like `parsePositiveInt` but accepts 0 as a valid value. Useful for `offset`
 * parameters where 0 is the natural starting value.
 *
 * @param value - The raw query parameter value
 * @param defaultValue - The fallback when the value is invalid (must be >= 0)
 */
export function parseNonNegativeInt(
  value: string | null | undefined,
  defaultValue: number,
): number {
  if (typeof value !== "string" || value.trim() === "") {
    return defaultValue;
  }

  const trimmed = value.trim();
  const parsed = parseInt(trimmed, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }

  return parsed;
}
