import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureAuthCookie } from "@/lib/auth/secure-cookie";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getValidatedAuthSecret } from "@/lib/security/env";
import type { UserRole } from "@/types";
import { eq } from "drizzle-orm";

const apiUserSelect = {
  id: users.id,
  role: users.role,
  username: users.username,
  email: users.email,
  name: users.name,
  className: users.className,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
};

export function getTokenUserId(token: { id?: unknown; sub?: unknown } | null | undefined) {
  if (typeof token?.id === "string" && token.id.length > 0) {
    return token.id;
  }

  if (typeof token?.sub === "string" && token.sub.length > 0) {
    return token.sub;
  }

  return null;
}

export async function getActiveAuthUserById(userId: string | null | undefined) {
  if (!userId) {
    return null;
  }

  const user = await db
    .select(apiUserSelect)
    .from(users)
    .where(eq(users.id, userId))
    .then((rows) => rows[0] ?? null);

  if (!user?.isActive) {
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
  const token = await getToken({
    req: request,
    secret: getValidatedAuthSecret(),
    secureCookie: shouldUseSecureAuthCookie(request),
  });

  return getActiveAuthUserById(getTokenUserId(token));
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function notFound(resource: string) {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

export function isAdmin(role: string) {
  return role === "super_admin" || role === "admin";
}

export function isInstructor(role: string) {
  return isAdmin(role) || role === "instructor";
}
