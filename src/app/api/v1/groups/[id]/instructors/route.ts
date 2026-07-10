import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { groupInstructors, users } from "@/lib/db/schema";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { getRoleLevel } from "@/lib/capabilities/cache";

const addInstructorSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["co_instructor", "ta"]),
});

const removeInstructorSchema = z.object({
  userId: z.string().min(1),
});

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id } = params;

    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });
    if (!group) return notFound("Group");

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    if (!canManage) return forbidden();

    const instructors = await db
      .select({
        id: groupInstructors.id,
        userId: groupInstructors.userId,
        role: groupInstructors.role,
        assignedAt: groupInstructors.assignedAt,
        username: users.username,
        name: users.name,
      })
      .from(groupInstructors)
      .innerJoin(users, eq(groupInstructors.userId, users.id))
      .where(eq(groupInstructors.groupId, id));

    return apiSuccess(instructors);
  },
});

export const POST = createApiHandler({
  rateLimit: "group-instructors:add",
  schema: addInstructorSchema,
  handler: async (_req: NextRequest, { user, body, params }) => {
    const { id } = params;

    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });
    if (!group) return notFound("Group");

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    if (!canManage) return forbidden();

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, body.userId),
      columns: { id: true, isActive: true, role: true },
    });
    if (!targetUser || !targetUser.isActive) {
      return apiError("userNotFound", 404);
    }

    // A student-level target (getRoleLevel <= 0) must never be elevated to an
    // instructional role — mirrors the ownership-transfer gate on PATCH
    // /api/v1/groups/[id]. Without this, a manager could add a student as a
    // co_instructor/ta, granting them group-resource access.
    if ((await getRoleLevel(targetUser.role)) <= 0) {
      return apiError("instructorRoleInvalid", 409);
    }

    // Atomic upsert on the (groupId, userId) unique index. The previous
    // SELECT-then-(UPDATE|INSERT) raced: two concurrent adds both passed the
    // pre-check and the loser 500'd on the unique violation, and a concurrent
    // DELETE made the UPDATE affect 0 rows while still reporting success.
    // `xmax = 0` distinguishes a fresh insert from a conflict-update so the
    // 201-vs-200 response contract is preserved.
    const [row] = await db
      .insert(groupInstructors)
      .values({
        groupId: id,
        userId: body.userId,
        role: body.role,
      })
      .onConflictDoUpdate({
        target: [groupInstructors.groupId, groupInstructors.userId],
        set: { role: body.role },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });

    if (row?.inserted) {
      return apiSuccess({ added: true, role: body.role }, { status: 201 });
    }
    return apiSuccess({ updated: true, role: body.role });
  },
});

export const DELETE = createApiHandler({
  rateLimit: "group-instructors:remove",
  schema: removeInstructorSchema,
  handler: async (_req: NextRequest, { user, body, params }) => {
    const { id } = params;

    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });
    if (!group) return notFound("Group");

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    if (!canManage) return forbidden();

    await db
      .delete(groupInstructors)
      .where(and(eq(groupInstructors.groupId, id), eq(groupInstructors.userId, body.userId)));

    return apiSuccess({ removed: true });
  },
});
