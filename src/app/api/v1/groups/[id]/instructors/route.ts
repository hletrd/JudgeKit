import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { groupInstructors, users } from "@/lib/db/schema";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";

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

    const existing = await db
      .select({ id: groupInstructors.id })
      .from(groupInstructors)
      .where(and(eq(groupInstructors.groupId, id), eq(groupInstructors.userId, body.userId)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(groupInstructors)
        .set({ role: body.role })
        .where(eq(groupInstructors.id, existing[0].id));
      return apiSuccess({ updated: true, role: body.role });
    }

    await db.insert(groupInstructors).values({
      groupId: id,
      userId: body.userId,
      role: body.role,
    });

    return apiSuccess({ added: true, role: body.role }, { status: 201 });
  },
});

export const DELETE = createApiHandler({
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
