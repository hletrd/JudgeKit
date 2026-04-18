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
  // 1. Try session cookie (standard web auth)
  const token = await getToken({
    req: request,
    secret: getValidatedAuthSecret(),
    secureCookie: shouldUseSecureAuthCookie(),
  });

  const sessionUser = await getActiveAuthUserById(getTokenUserId(token), getTokenAuthenticatedAtSeconds(token));
  if (sessionUser) return sessionUser;

  // 2. Fallback: try API key (Bearer token)
  return authenticateApiKey(request.headers.get("authorization"));
}

export function csrfForbidden(request: NextRequest): NextResponse | null {
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
 * Custom-role-aware admin checks should use `isAdminAsync()` or direct
 * capability resolution instead.
 */
export function isAdmin(role: string) {
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

/**
 * Check if a role has instructor-level access.
 * Supports both built-in roles (sync via ROLE_LEVEL) and custom roles.
 */
export function isInstructor(role: string) {
  return (ROLE_LEVEL[role as UserRole] ?? -1) >= ROLE_LEVEL.instructor;
}

/**
 * Async version that supports custom roles via capability check.
 */
export async function isInstructorAsync(role: string): Promise<boolean> {
  if (isInstructor(role)) return true;
  const caps = await resolveCapabilities(role);
  return caps.has("problems.create") || caps.has("submissions.view_all");
}

/**
 * Check if a user has a specific capability based on their role.
 */
export async function userHasCapability(role: string, capability: string): Promise<boolean> {
  const caps = await resolveCapabilities(role);
  return caps.has(capability);
}
