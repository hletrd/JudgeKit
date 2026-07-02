import type { UserRole } from "@/types";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { getTokenAuthenticatedAtSeconds, isTokenInvalidated } from "@/lib/auth/session-security";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authUserSelect } from "@/lib/db/selects";
import { getValidatedAuthSecret } from "@/lib/security/env";
import { validateCsrf } from "@/lib/security/csrf";
import { ROLE_LEVEL } from "@/lib/security/constants";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { authenticateApiKey } from "@/lib/api/api-key-auth";
import { eq } from "drizzle-orm";

export function getTokenUserId(token: { id?: unknown; sub?: unknown } | null | undefined) {
  if (typeof token?.id === "string" && token.id.length > 0) {
    return token.id;
  }

  if (typeof token?.sub === "string" && token.sub.length > 0) {
    return token.sub;
  }

  return null;
}

export async function getActiveAuthUserById(
  userId: string | null | undefined,
  authenticatedAtSeconds?: number | null
) {
  if (!userId) {
    return null;
  }

  const user = await db
    .select(authUserSelect)
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0] ?? null);

  if (!user?.isActive) {
    return null;
  }

  if (isTokenInvalidated(authenticatedAtSeconds ?? null, user.tokenInvalidatedAt)) {
    return null;
  }

  return {
    id: user.id,
    role: user.role as UserRole,
    username: user.username,
    email: user.email,
    name: user.name,
    className: user.className,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export async function getApiUser(request: NextRequest) {
  // 1. Fast path: if Authorization header has an API key prefix, skip JWT lookup.
  // API-key-only clients (CI/CD, integrations) should not trigger an unnecessary
  // JWT token extraction + DB query on every request.
  const authHeader = request.headers.get("authorization");
  let apiKeyResult: Awaited<ReturnType<typeof authenticateApiKey>> | undefined;
  if (authHeader?.startsWith("Bearer jk_")) {
    apiKeyResult = await authenticateApiKey(authHeader);
    if (apiKeyResult) return apiKeyResult;
  }

  // 2. Try session cookie (standard web auth)
  const token = await getToken({
    req: request,
    secret: getValidatedAuthSecret(),
    secureCookie: shouldUseSecureAuthCookie(),
  });

  const sessionUser = await getActiveAuthUserById(getTokenUserId(token), getTokenAuthenticatedAtSeconds(token));
  if (sessionUser) return sessionUser;

  // 3. Fallback: try API key without prefix match (handles non-standard Bearer tokens).
  // If we already attempted API key auth above and it failed, reuse that result
  // instead of re-evaluating the same invalid bearer key.
  if (apiKeyResult !== undefined) {
    return apiKeyResult;
  }
  return authenticateApiKey(authHeader);
}

export async function csrfForbidden(request: NextRequest): Promise<NextResponse | null> {
  return validateCsrf(request);
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export function notFound(resource: string) {
  return NextResponse.json({ error: "notFound", resource }, { status: 404 });
}

/**
 * Check whether a role is one of the built-in admin-level roles.
 * @internal Only for use as a fast-path inside isAdminAsync().
 * Custom-role-aware admin checks should use `isAdminAsync()`
 * or direct capability resolution instead.
 */
function isAdmin(role: string) {
  return (ROLE_LEVEL[role as UserRole] ?? -1) >= ROLE_LEVEL.admin;
}

/**
 * Async version that supports custom roles via capability check.
 */
export async function isAdminAsync(role: string): Promise<boolean> {
  if (isAdmin(role)) return true;
  const caps = await resolveCapabilities(role);
  return caps.has("users.view") && caps.has("system.settings");
}

