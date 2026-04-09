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
  tokenInvalidatedAt: Date | null | undefined
) {
  if (!authenticatedAtSeconds || !tokenInvalidatedAt) {
    return false;
  }

  const invalidatedAtSeconds = Math.floor(tokenInvalidatedAt.getTime() / 1000);
  return authenticatedAtSeconds < invalidatedAtSeconds;
}

export function clearAuthToken(token: JWT) {
  delete token.sub;
  delete token.id;
  delete token.role;
  delete token.username;
  delete token.email;
  delete token.name;
  delete token.className;
  delete token.mustChangePassword;
  delete token.authenticatedAt;

  return token;
}
