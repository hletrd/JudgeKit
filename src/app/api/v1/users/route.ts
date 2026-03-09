import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getApiUser, unauthorized, forbidden, isAdmin, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { nanoid } from "nanoid";
import { hash } from "bcryptjs";
import { generateSecurePassword } from "@/lib/auth/generated-password";
import { safeUserSelect } from "@/lib/db/selects";
import {
  canManageRole,
  isUserRole,
} from "@/lib/security/constants";
import { getPasswordValidationError } from "@/lib/security/password";
import { userCreateSchema } from "@/lib/validators/profile";

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isAdmin(user.role)) return forbidden();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;
    const role = searchParams.get("role");

    if (role && !isUserRole(role)) {
      return NextResponse.json({ error: "invalidRole" }, { status: 400 });
    }

    const whereClause = role ? eq(users.role, role) : undefined;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);

    const results = await db
      .select(safeUserSelect)
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ data: results, page, limit, total: Number(totalRow?.count ?? 0) });
  } catch (error) {
    console.error("GET /api/v1/users error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isAdmin(user.role)) return forbidden();

    const parsed = userCreateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "createUserFailed" },
        { status: 400 }
      );
    }

    const { username, email, name, className, password, role } = parsed.data;
    const normalizedEmail = email ?? null;
    const normalizedClassName = className ?? null;
    const requestedRole = role.trim() || "student";

    if (!isUserRole(requestedRole)) {
      return NextResponse.json({ error: "invalidRole" }, { status: 400 });
    }

    if (!canManageRole(user.role, requestedRole)) {
      return NextResponse.json(
        { error: "onlySuperAdminCanChangeSuperAdminRole" },
        { status: 403 }
      );
    }

    if (password) {
      const passwordValidationError = getPasswordValidationError(password);

      if (passwordValidationError) {
        return NextResponse.json({ error: passwordValidationError }, { status: 400 });
      }
    }

    const existing = await db.query.users.findFirst({ where: eq(users.username, username), columns: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "usernameInUse" }, { status: 409 });
    }

    if (normalizedEmail) {
      const existingEmail = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail), columns: { id: true } });
      if (existingEmail) {
        return NextResponse.json({ error: "emailInUse" }, { status: 409 });
      }
    }

    const generatedPassword = generateSecurePassword();
    const passwordToHash = password ?? generatedPassword;
    const passwordHash = await hash(passwordToHash, 12);
    const id = nanoid();

    await db.insert(users).values({
      id,
      username,
      email: normalizedEmail,
      name,
      className: normalizedClassName,
      passwordHash,
      role: requestedRole,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await db
      .select(safeUserSelect)
      .from(users)
      .where(eq(users.id, id))
      .then((r) => r[0]);

    if (created) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "user.created_api",
        resourceType: "user",
        resourceId: created.id,
        resourceLabel: created.username,
        summary: `Created user @${created.username} via API`,
        details: {
          role: created.role,
          usedGeneratedPassword: !password,
        },
        request,
      });
    }

    return NextResponse.json(
      { data: created, passwordGenerated: password === undefined },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/v1/users error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}
