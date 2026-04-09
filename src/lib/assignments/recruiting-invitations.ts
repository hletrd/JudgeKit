import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  assignments,
  recruitingInvitations,
  contestAccessTokens,
  enrollments,
  users,
} from "@/lib/db/schema";
import { and, eq, sql, count } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export function generateRecruitingToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createRecruitingInvitation(params: {
  assignmentId: string;
  candidateName: string;
  candidateEmail?: string;
  metadata?: Record<string, string>;
  expiresAt?: Date | null;
  createdBy: string;
}) {
  const token = generateRecruitingToken();
  const [invitation] = await db
    .insert(recruitingInvitations)
    .values({
      assignmentId: params.assignmentId,
      token,
      candidateName: params.candidateName,
      candidateEmail: params.candidateEmail ?? null,
      metadata: params.metadata ?? {},
      expiresAt: params.expiresAt ?? null,
      createdBy: params.createdBy,
    })
    .returning();
  return invitation;
}

export async function bulkCreateRecruitingInvitations(params: {
  assignmentId: string;
  invitations: {
    candidateName: string;
    candidateEmail?: string;
    metadata?: Record<string, string>;
    expiresAt?: Date | null;
  }[];
  createdBy: string;
}) {
  const values = params.invitations.map((inv) => ({
    assignmentId: params.assignmentId,
    token: generateRecruitingToken(),
    candidateName: inv.candidateName,
    candidateEmail: inv.candidateEmail ?? null,
    metadata: inv.metadata ?? {},
    expiresAt: inv.expiresAt ?? null,
    createdBy: params.createdBy,
  }));
  const created = await db
    .insert(recruitingInvitations)
    .values(values)
    .returning();
  return created;
}

export async function getRecruitingInvitations(
  assignmentId: string,
  filters?: { status?: string; search?: string; limit?: number; offset?: number }
) {
  const conditions: SQL[] = [eq(recruitingInvitations.assignmentId, assignmentId)];

  if (filters?.status) {
    conditions.push(eq(recruitingInvitations.status, filters.status));
  }
  if (filters?.search) {
    const escaped = filters.search.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;
    conditions.push(
      sql`(${recruitingInvitations.candidateName} ILIKE ${pattern} OR ${recruitingInvitations.candidateEmail} ILIKE ${pattern})`
    );
  }

  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
  const offset = Math.max(filters?.offset ?? 0, 0);

  return db
    .select()
    .from(recruitingInvitations)
    .where(and(...conditions))
    .orderBy(recruitingInvitations.createdAt)
    .limit(limit)
    .offset(offset);
}

export async function getRecruitingInvitation(id: string) {
  const [invitation] = await db
    .select()
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.id, id))
    .limit(1);
  return invitation ?? null;
}

export async function getRecruitingInvitationByToken(token: string) {
  const [invitation] = await db
    .select()
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.token, token))
    .limit(1);
  return invitation ?? null;
}

export async function updateRecruitingInvitation(
  id: string,
  data: {
    expiresAt?: Date | null;
    metadata?: Record<string, string>;
    status?: "revoked";
  }
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.expiresAt !== undefined) updates.expiresAt = data.expiresAt;
  if (data.metadata !== undefined) updates.metadata = data.metadata;
  if (data.status !== undefined) {
    // Only allow revoking pending invitations — already-redeemed cannot be revoked
    const result = await db
      .update(recruitingInvitations)
      .set({ ...updates, status: data.status })
      .where(
        and(
          eq(recruitingInvitations.id, id),
          eq(recruitingInvitations.status, "pending")
        )
      );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("invitationCannotBeRevoked");
    }
    return;
  }
  await db
    .update(recruitingInvitations)
    .set(updates)
    .where(eq(recruitingInvitations.id, id));
}

export async function deleteRecruitingInvitation(id: string) {
  await db
    .delete(recruitingInvitations)
    .where(eq(recruitingInvitations.id, id));
}

export async function getInvitationStats(assignmentId: string) {
  const now = new Date();
  const rows = await db
    .select({
      status: recruitingInvitations.status,
      count: count(),
    })
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.assignmentId, assignmentId))
    .groupBy(recruitingInvitations.status);

  const stats = { total: 0, pending: 0, redeemed: 0, revoked: 0, expired: 0 };
  for (const row of rows) {
    const c = Number(row.count);
    stats.total += c;
    if (row.status === "pending") stats.pending += c;
    else if (row.status === "redeemed") stats.redeemed += c;
    else if (row.status === "revoked") stats.revoked += c;
  }

  // Count expired (pending but past expiresAt)
  const [expiredRow] = await db
    .select({ count: count() })
    .from(recruitingInvitations)
    .where(
      and(
        eq(recruitingInvitations.assignmentId, assignmentId),
        eq(recruitingInvitations.status, "pending"),
        sql`${recruitingInvitations.expiresAt} IS NOT NULL AND ${recruitingInvitations.expiresAt} < ${now}`
      )
    );
  stats.expired = Number(expiredRow?.count ?? 0);
  stats.pending -= stats.expired;

  return stats;
}

type RedeemResult =
  | { ok: true; userId: string; assignmentId: string; groupId: string; alreadyRedeemed: boolean }
  | { ok: false; error: string };

export async function redeemRecruitingToken(
  token: string,
  ipAddress?: string
): Promise<RedeemResult> {
  // Transaction: read invitation + validate + create user + enroll + claim (atomic)
  try {
    return await db.transaction(async (tx) => {
      // Read invitation inside transaction for consistent snapshot
      const [invitation] = await tx
        .select()
        .from(recruitingInvitations)
        .where(eq(recruitingInvitations.token, token))
        .limit(1);

      if (!invitation) return { ok: false as const, error: "invalidToken" };

      // Already redeemed — allow re-entry
      if (invitation.status === "redeemed" && invitation.userId) {
        const [assignment] = await tx
          .select({ id: assignments.id, groupId: assignments.groupId })
          .from(assignments)
          .where(eq(assignments.id, invitation.assignmentId))
          .limit(1);
        if (!assignment) return { ok: false as const, error: "assignmentNotFound" };
        return {
          ok: true as const,
          userId: invitation.userId,
          assignmentId: assignment.id,
          groupId: assignment.groupId,
          alreadyRedeemed: true,
        };
      }

      if (invitation.status === "revoked") return { ok: false as const, error: "tokenRevoked" };
      if (invitation.status !== "pending") return { ok: false as const, error: "invalidToken" };

      // Check expiry
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        return { ok: false as const, error: "tokenExpired" };
      }

      // Check assignment
      const [assignment] = await tx
        .select({
          id: assignments.id,
          groupId: assignments.groupId,
          examMode: assignments.examMode,
          deadline: assignments.deadline,
        })
        .from(assignments)
        .where(eq(assignments.id, invitation.assignmentId))
        .limit(1);

      if (!assignment) return { ok: false as const, error: "assignmentNotFound" };
      if (assignment.examMode === "none") return { ok: false as const, error: "notAContest" };
      if (assignment.deadline && assignment.deadline < new Date()) {
        return { ok: false as const, error: "contestClosed" };
      }

      // Create user + enroll + access token + atomically claim invitation
      const uid = nanoid();
      const username = `recruit_${nanoid(8)}`;
      await tx.insert(users).values({
        id: uid,
        username,
        name: invitation.candidateName,
        email: null,
        passwordHash: null,
        role: "student",
        isActive: true,
        mustChangePassword: true,
      });

      await tx.insert(enrollments).values({
        id: nanoid(),
        userId: uid,
        groupId: assignment.groupId,
        enrolledAt: new Date(),
      });

      await tx.insert(contestAccessTokens).values({
        id: nanoid(),
        assignmentId: assignment.id,
        userId: uid,
        redeemedAt: new Date(),
        ipAddress: ipAddress ?? null,
      });

      // Atomically claim — rolls back entire tx if already redeemed or expired
      const [updated] = await tx
        .update(recruitingInvitations)
        .set({
          status: "redeemed",
          userId: uid,
          redeemedAt: new Date(),
          ipAddress: ipAddress ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(recruitingInvitations.id, invitation.id),
            eq(recruitingInvitations.status, "pending"),
            sql`(${recruitingInvitations.expiresAt} IS NULL OR ${recruitingInvitations.expiresAt} > NOW())`
          )
        )
        .returning({ id: recruitingInvitations.id });

      if (!updated) {
        throw new Error("alreadyRedeemed");
      }

      return {
        ok: true as const,
        userId: uid,
        assignmentId: assignment.id,
        groupId: assignment.groupId,
        alreadyRedeemed: false,
      };
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "alreadyRedeemed") {
      return { ok: false, error: "alreadyRedeemed" };
    }
    throw err;
  }
}
