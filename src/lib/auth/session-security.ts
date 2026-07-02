import type { JWT } from "next-auth/jwt";
import { getConfiguredSettings } from "@/lib/system-settings-config";

export function getSessionMaxAgeSeconds() {
  return getConfiguredSettings().sessionMaxAgeSeconds;
}

type TokenTimeCarrier = {
  authenticatedAt?: unknown;
  iat?: unknown;
};

export function getTokenAuthenticatedAtSeconds(token: TokenTimeCarrier | null | undefined) {
  if (typeof token?.authenticatedAt === "number" && Number.isFinite(token.authenticatedAt)) {
    return Math.trunc(token.authenticatedAt);
  }

  if (typeof token?.iat === "number" && Number.isFinite(token.iat)) {
    return Math.trunc(token.iat);
  }

  return null;
}

export function isTokenInvalidated(
  authenticatedAtSeconds: number | null,
  tokenInvalidatedAt: Date | string | number | null | undefined
) {
  if (authenticatedAtSeconds === null || authenticatedAtSeconds === undefined || !tokenInvalidatedAt) {
    return false;
  }

  // Compare at millisecond precision so a token issued one millisecond before
  // revocation is rejected. The token stores authentication time in whole
  // seconds, so convert back to milliseconds for the comparison.
  const invalidatedAtMs =
    tokenInvalidatedAt instanceof Date
      ? tokenInvalidatedAt.getTime()
      : new Date(tokenInvalidatedAt).getTime();
  return authenticatedAtSeconds * 1000 <= invalidatedAtMs;
}

/**
 * Token field names that carry auth-relevant user data: core identity/security
 * fields plus metadata (authenticatedAt, uaHash). User preferences are no
 * longer stored in the token — they are read on demand via getUserPreferences().
 */
const AUTH_TOKEN_FIELDS = [
  "sub",
  "id",
  "role",
  "username",
  "email",
  "name",
  "className",
  "mustChangePassword",
  "authenticatedAt",
  "uaHash",
] as const;

export function clearAuthToken(token: JWT) {
  // Set authenticatedAt to 0 instead of deleting it so that
  // getTokenAuthenticatedAtSeconds returns 0 (not falling back
  // to token.iat). This ensures isTokenInvalidated always
  // returns true for a cleared token, closing a revocation
  // bypass window where iat > tokenInvalidatedAt.
  token.authenticatedAt = 0;

  for (const field of AUTH_TOKEN_FIELDS) {
    if (field !== "authenticatedAt") {
      delete token[field as keyof JWT];
    }
  }

  return token;
}
