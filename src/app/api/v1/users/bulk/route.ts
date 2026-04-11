import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { execTransaction } from "@/lib/db";
import { sql } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { forbidden, isInstructor, createApiHandler } from "@/lib/api/handler";
import { recordAuditEvent } from "@/lib/audit/events";
import { nanoid } from "nanoid";
import { bulkUserCreateSchema } from "@/lib/validators/bulk-users";
import { validateAndHashPassword, validateRoleChange } from "@/lib/users/core";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import pLimit from "p-limit";

export const POST = createApiHandler({
  rateLimit: "users:bulk-create",
  handler: async (req: NextRequest, { user }) => {
    const caps = await resolveCapabilities(user.role);
    const canBulkCreate = caps.has("users.create") || user.role === "instructor";
    if (!canBulkCreate) return forbidden();

    const body = await req.json();
    const parsed = bulkUserCreateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidInput", 400);
    }

    const { users: userList } = parsed.data;

    // Validate role escalation for each user
    for (const entry of userList) {
      if (entry.role && entry.role !== "student") {
        const roleError = validateRoleChange(user.role, entry.role);
        if (roleError) {
          return apiError(roleError, 403);
        }
      }
    }

    // Intentional built-in carve-out: instructors retain legacy student-only
    // bulk-create access even without users.create. Custom roles should rely
    // on the users.create capability instead of inheriting this exception.
    if (isInstructor(user.role) && !caps.has("users.create")) {
      for (const entry of userList) {
        if (entry.role && entry.role !== "student") {
          return apiError("unauthorized", 403);
        }
      }
    }

    // Check for duplicate usernames within the request itself
    const requestUsernames = userList.map((u) => u.username.toLowerCase());
    const uniqueRequestUsernames = new Set(requestUsernames);
    if (uniqueRequestUsernames.size !== requestUsernames.length) {
      return apiError("duplicateUsernamesInRequest", 400);
    }

    // Check for duplicate emails within the request itself
    const requestEmails = userList
      .map((u) => u.email?.trim().toLowerCase())
      .filter((e): e is string => !!e);
    const uniqueRequestEmails = new Set(requestEmails);
    if (uniqueRequestEmails.size !== requestEmails.length) {
      return apiError("duplicateEmailsInRequest", 400);
    }

    type CreatedEntry = { username: string; name: string };
    type FailedEntry = { username: string; reason: string };
    type PreparedSuccessEntry = {
      id: string;
      username: string;
      name: string;
      email: string | null;
      className: string | null;
      passwordHash: string;
      role: "student" | "instructor";
    };
    type PreparedFailureEntry = {
      username: string;
      failedReason: string;
    };

    const created: CreatedEntry[] = [];
    const failed: FailedEntry[] = [];

    // Prepare all password hashes in parallel
    const hashLimit = pLimit(4);
    const preparedEntries: Array<PreparedSuccessEntry | PreparedFailureEntry> = await Promise.all(
      userList.map((item) =>
        hashLimit(async () => {
          const passwordResult = await validateAndHashPassword(item.password, {
            username: item.username,
            email: item.email?.trim() || null,
          });
          if ("error" in passwordResult) {
            return {
              username: item.username.toLowerCase(),
              failedReason: passwordResult.error ?? "createUserFailed",
            };
          }

          const id = nanoid();
          const normalizedEmail = item.email && item.email.trim() !== "" ? item.email.trim().toLowerCase() : null;
          const normalizedClassName =
            item.className && item.className.trim() !== "" ? item.className.trim() : null;

          return {
            id,
            username: item.username.toLowerCase(),
            name: item.name,
            email: normalizedEmail,
            className: normalizedClassName,
            passwordHash: passwordResult.hash,
            role: item.role ?? ("student" as const),
          };
        })
      )
    );

    const validEntries = preparedEntries.filter(
      (entry): entry is PreparedSuccessEntry => !("failedReason" in entry)
    );
    for (const entry of preparedEntries) {
      if ("failedReason" in entry) {
        failed.push({ username: entry.username, reason: entry.failedReason });
      }
    }

    // Insert users individually with savepoints so one failure doesn't abort the whole batch.
    // PostgreSQL aborts a transaction on error unless a savepoint is used.
    await execTransaction(async (tx) => {
      for (const entry of validEntries) {
        try {
          await tx.execute(sql`SAVEPOINT user_insert`);
          await tx.insert(users).values({
            id: entry.id,
            username: entry.username,
            email: entry.email,
            name: entry.name,
            className: entry.className,
            passwordHash: entry.passwordHash,
            role: entry.role,
            isActive: true,
            mustChangePassword: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await tx.execute(sql`RELEASE SAVEPOINT user_insert`);
          created.push({
            username: entry.username,
            name: entry.name,
          });
        } catch (err: unknown) {
          await tx.execute(sql`ROLLBACK TO SAVEPOINT user_insert`);
          // PostgreSQL unique constraint violation
          const pgErr = err as { code?: string; constraint?: string };
          if (pgErr.code === "23505") {
            if (pgErr.constraint?.includes("username")) {
              failed.push({ username: entry.username, reason: "usernameInUse" });
            } else if (pgErr.constraint?.includes("email")) {
              failed.push({ username: entry.username, reason: "emailInUse" });
            } else {
              failed.push({ username: entry.username, reason: "createUserFailed" });
            }
          } else {
            throw err;
          }
        }
      }
    });

    // Record audit event for the bulk operation
    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "user.bulk_created_api",
      resourceType: "user",
      resourceLabel: `bulk:${created.length}`,
      summary: `Bulk created ${created.length} user(s) via API (${failed.length} failed)`,
      details: {
        createdCount: created.length,
        failedCount: failed.length,
        failedUsernames: failed.map((f) => f.username),
      },
      request: req,
    });

    const response = NextResponse.json(
      {
        created,
        failed,
        createdCount: created.length,
        failedCount: failed.length,
      },
      { status: 201 }
    );
    response.headers.set("Cache-Control", "no-store, no-cache");
    response.headers.set("Pragma", "no-cache");
    return response;
  },
});
