import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiPaginated } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { execTransaction } from "@/lib/db";
import { forbidden } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/security/password-hash";
import { generateSecurePassword } from "@/lib/auth/generated-password";
import { safeUserSelect } from "@/lib/db/selects";
import { isUserRole } from "@/lib/security/constants";
import { isValidRole, resolveCapabilities } from "@/lib/capabilities/cache";
import { userCreateSchema } from "@/lib/validators/profile";
import { getDbNowUncached } from "@/lib/db-time";
import { parsePagination } from "@/lib/api/pagination";
import {
  validateAndHashPassword,
  validateRoleChangeAsync,
} from "@/lib/users/core";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.view")) return forbidden();

    const searchParams = req.nextUrl.searchParams;
    const { page, limit, offset } = parsePagination(searchParams);
    const role = searchParams.get("role");

    if (role && !isUserRole(role) && !(await isValidRole(role))) {
      return apiError("invalidRole", 400);
    }

    const whereClause = role ? eq(users.role, role) : undefined;

    const results = await db
      .select({
        ...safeUserSelect,
        _total: sql<number>`count(*) over()`,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const total = results.length > 0 ? Number(results[0]._total) : 0;
    const cleanResults = results.map(({ _total, ...rest }) => rest);

    return apiPaginated(cleanResults, page, limit, total);
  },
});

export const POST = createApiHandler({
  rateLimit: "users:create",
  schema: userCreateSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("users.create")) return forbidden();

    const { username, email, name, className, password, role } = body;
    const normalizedEmail = email?.trim().toLowerCase() || null;
    const normalizedClassName = className ?? null;
    const requestedRole = role.trim() || "student";

    const roleError = await validateRoleChangeAsync(user.role, requestedRole);
    if (roleError === "invalidRole") {
      return apiError("invalidRole", 400);
    }
    if (roleError) {
      return apiError(roleError, 403);
    }

    let passwordHash: string;

    if (password) {
      const passwordResult = await validateAndHashPassword(password);
      if (passwordResult.error) {
        return apiError(passwordResult.error, 400);
      }
      passwordHash = passwordResult.hash;
    } else {
      passwordHash = await hashPassword(generateSecurePassword());
    }
    const id = nanoid();
    const now = await getDbNowUncached();

    // Atomic uniqueness check + insert in a single transaction to prevent TOCTOU races
    type SafeUserRow = { id: string; username: string; email: string | null; name: string | null; className: string | null; role: string; isActive: boolean | null; createdAt: Date; updatedAt: Date };
    let created: SafeUserRow | undefined;
    try {
      const result = await execTransaction(async (tx) => {
        // Check username uniqueness inside transaction
        const [existingUsername] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.username}) = lower(${username})`)
          .limit(1);
        if (existingUsername) {
          throw new Error("usernameInUse");
        }

        // Check email uniqueness inside transaction
        if (normalizedEmail) {
          const [existingEmail] = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.email}) = lower(${normalizedEmail})`)
            .limit(1);
          if (existingEmail) {
            throw new Error("emailInUse");
          }
        }

        return tx.insert(users).values({
          id,
          username,
          email: normalizedEmail,
          name,
          className: normalizedClassName,
          passwordHash,
          role: requestedRole,
          isActive: true,
          mustChangePassword: true,
          createdAt: now,
          updatedAt: now,
        }).returning(safeUserSelect);
      });
      created = result[0];
    } catch (err: unknown) {
      const pgErr = err as { code?: string; constraint?: string };
      if (err instanceof Error && err.message === "usernameInUse") {
        return apiError("usernameInUse", 409);
      }
      if (err instanceof Error && err.message === "emailInUse") {
        return apiError("emailInUse", 409);
      }
      if (pgErr.code === "23505") {
        if (pgErr.constraint?.includes("username")) {
          return apiError("usernameInUse", 409);
        }
        if (pgErr.constraint?.includes("email")) {
          return apiError("emailInUse", 409);
        }
      }
      throw err;
    }

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
        request: req,
      });
    }

    const response = apiSuccess({
      user: created,
      passwordGenerated: password === undefined,
    }, { status: 201 });
    response.headers.set("Cache-Control", "no-store, no-cache");
    return response;
  },
});
