import type { JWT } from "next-auth/jwt";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { AUTH_PREFERENCE_FIELDS } from "@/lib/auth/types";

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
  tokenInvalidatedAt: Date | null | undefined
) {
  if (authenticatedAtSeconds === null || authenticatedAtSeconds === undefined || !tokenInvalidatedAt) {
    return false;
  }

  const invalidatedAtSeconds = Math.floor(tokenInvalidatedAt.getTime() / 1000);
  return authenticatedAtSeconds < invalidatedAtSeconds;
}

/**
 * Token field names that carry auth-relevant user data.
 * Derived from AUTH_PREFERENCE_FIELDS (imported from config.ts) plus
 * token-specific fields (sub, id, role, etc.) and metadata fields
 * (authenticatedAt, uaHash). When a new preference field is added to
 * AUTH_PREFERENCE_FIELDS, it is automatically included here.
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
  ...AUTH_PREFERENCE_FIELDS,
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
