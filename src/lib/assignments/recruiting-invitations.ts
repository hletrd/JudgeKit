import { randomBytes, createHash } from "crypto";
import { nanoid } from "nanoid";
import { hashPassword, verifyPassword } from "@/lib/security/password-hash";
import { getPasswordValidationError } from "@/lib/security/password";
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
import type { TransactionClient } from "@/lib/db";
import { escapeLikePattern } from "@/lib/db/like";

type RecruitingInvitationExecutor =
  Pick<TransactionClient, "insert" | "select" | "update" | "delete">
  | typeof db;

const ACCOUNT_PASSWORD_RESET_REQUIRED_KEY = "accountPasswordResetRequired";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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
}, executor: RecruitingInvitationExecutor = db) {
  const token = generateRecruitingToken();
  const [invitation] = await executor
    .insert(recruitingInvitations)
    .values({
      assignmentId: params.assignmentId,
      // Do not persist the plaintext token; only the hash goes to the DB.
      // The caller still sees the token below via the returned object.
      token: null,
      tokenHash: hashToken(token),
      candidateName: params.candidateName,
      candidateEmail: params.candidateEmail ?? null,
      metadata: params.metadata ?? {},
      expiresAt: params.expiresAt ?? null,
      createdBy: params.createdBy,
    })
    .returning();
  return { ...invitation, token };
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
}, executor: RecruitingInvitationExecutor = db) {
  const prepared = params.invitations.map((inv) => {
    const token = generateRecruitingToken();
    return {
      token,
      insertValues: {
        assignmentId: params.assignmentId,
        // plaintext stays in memory for the returned response only
        token: null as string | null,
        tokenHash: hashToken(token),
        candidateName: inv.candidateName,
        candidateEmail: inv.candidateEmail ?? null,
        metadata: inv.metadata ?? {},
        expiresAt: inv.expiresAt ?? null,
        createdBy: params.createdBy,
      },
    };
  });
  const created = await executor
    .insert(recruitingInvitations)
    .values(prepared.map((p) => p.insertValues))
    .returning();
  // Re-attach each plaintext token to its returned row via tokenHash lookup.
  const hashToPlaintext = new Map(
    prepared.map((p) => [p.insertValues.tokenHash, p.token] as const)
  );
  return created.map((row) => ({ ...row, token: hashToPlaintext.get(row.tokenHash ?? "") ?? null }));
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
    const pattern = `%${escapeLikePattern(filters.search)}%`;
    conditions.push(
      sql`(${recruitingInvitations.candidateName} ILIKE ${pattern} ESCAPE '\\' OR ${recruitingInvitations.candidateEmail} ILIKE ${pattern} ESCAPE '\\')`
    );
  }

  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
  const offset = Math.max(filters?.offset ?? 0, 0);

  return db
    .select({
      id: recruitingInvitations.id,
      assignmentId: recruitingInvitations.assignmentId,
      candidateName: recruitingInvitations.candidateName,
      candidateEmail: recruitingInvitations.candidateEmail,
      status: recruitingInvitations.status,
      metadata: recruitingInvitations.metadata,
      userId: recruitingInvitations.userId,
      expiresAt: recruitingInvitations.expiresAt,
      redeemedAt: recruitingInvitations.redeemedAt,
      ipAddress: recruitingInvitations.ipAddress,
      createdBy: recruitingInvitations.createdBy,
      createdAt: recruitingInvitations.createdAt,
      updatedAt: recruitingInvitations.updatedAt,
    })
    .from(recruitingInvitations)
    .where(and(...conditions))
    .orderBy(recruitingInvitations.createdAt)
    .limit(limit)
    .offset(offset);
}

export async function getRecruitingInvitation(id: string) {
  const [invitation] = await db
    .select({
      id: recruitingInvitations.id,
      assignmentId: recruitingInvitations.assignmentId,
      candidateName: recruitingInvitations.candidateName,
      candidateEmail: recruitingInvitations.candidateEmail,
      status: recruitingInvitations.status,
      metadata: recruitingInvitations.metadata,
      userId: recruitingInvitations.userId,
      expiresAt: recruitingInvitations.expiresAt,
      redeemedAt: recruitingInvitations.redeemedAt,
      ipAddress: recruitingInvitations.ipAddress,
      createdBy: recruitingInvitations.createdBy,
      createdAt: recruitingInvitations.createdAt,
      updatedAt: recruitingInvitations.updatedAt,
    })
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.id, id))
    .limit(1);
  return invitation ?? null;
}

export async function getRecruitingInvitationByToken(token: string) {
  const [invitation] = await db
    .select()
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.tokenHash, hashToken(token)))
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




export async function resetRecruitingInvitationAccountPassword(id: string) {
  const invitation = await getRecruitingInvitation(id);
  if (!invitation || invitation.status !== "redeemed" || !invitation.userId) {
    throw new Error("accountPasswordResetRequiresRedeemed");
  }

  const invalidatedPasswordHash = await hashPassword(randomBytes(32).toString("hex"));
  const nextMetadata = {
    ...(invitation.metadata ?? {}),
    [ACCOUNT_PASSWORD_RESET_REQUIRED_KEY]: "true",
  };

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: invalidatedPasswordHash,
        mustChangePassword: false,
        tokenInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, invitation.userId!));

    await tx
      .update(recruitingInvitations)
      .set({
        metadata: nextMetadata,
        updatedAt: new Date(),
      })
      .where(eq(recruitingInvitations.id, invitation.id));
  });
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
  ipAddress?: string,
  accountPassword?: string
): Promise<RedeemResult> {
  // Transaction: read invitation + validate + create user + enroll + claim (atomic)
  try {
    return await db.transaction(async (tx) => {
      // Read invitation inside transaction for consistent snapshot
      const [invitation] = await tx
        .select()
        .from(recruitingInvitations)
        .where(eq(recruitingInvitations.tokenHash, hashToken(token)))
        .limit(1);

      if (!invitation) return { ok: false as const, error: "invalidToken" };

      // Already redeemed — verify password for re-entry
      if (invitation.status === "redeemed" && invitation.userId) {
        if (!accountPassword) return { ok: false as const, error: "accountPasswordRequired" };
        const passwordResetRequired =
          invitation.metadata?.[ACCOUNT_PASSWORD_RESET_REQUIRED_KEY] === "true";

        const [existingUser] = await tx
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            passwordHash: users.passwordHash,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.id, invitation.userId))
          .limit(1);

        if (!existingUser || !existingUser.passwordHash || !existingUser.isActive) {
          return { ok: false as const, error: "invalidToken" };
        }

        if (passwordResetRequired) {
          const passwordValidationError = getPasswordValidationError(accountPassword, {
            username: existingUser.username,
            email: existingUser.email ?? null,
          });
          if (passwordValidationError) {
            return { ok: false as const, error: passwordValidationError };
          }

          const nextPasswordHash = await hashPassword(accountPassword);
          await tx
            .update(users)
            .set({
              passwordHash: nextPasswordHash,
              mustChangePassword: false,
              tokenInvalidatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingUser.id));

          await tx
            .update(recruitingInvitations)
            .set({
              metadata: {
                ...(invitation.metadata ?? {}),
                [ACCOUNT_PASSWORD_RESET_REQUIRED_KEY]: "false",
              },
              updatedAt: new Date(),
            })
            .where(eq(recruitingInvitations.id, invitation.id));
        } else {
          const { valid } = await verifyPassword(accountPassword, existingUser.passwordHash);
          if (!valid) {
            return { ok: false as const, error: "accountPasswordIncorrect" };
          }
        }

        // Verify assignment still exists and isn't closed
        const [assignment] = await tx
          .select({
            id: assignments.id,
            groupId: assignments.groupId,
            deadline: assignments.deadline,
          })
          .from(assignments)
          .where(eq(assignments.id, invitation.assignmentId))
          .limit(1);

        if (!assignment) return { ok: false as const, error: "assignmentNotFound" };
        if (assignment.deadline && assignment.deadline < new Date()) {
          return { ok: false as const, error: "contestClosed" };
        }

        return {
          ok: true as const,
          userId: existingUser.id,
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

      if (!accountPassword) return { ok: false as const, error: "accountPasswordRequired" };

      // Create user + enroll + access token + atomically claim invitation
      const uid = nanoid();
      const username = `recruit_${nanoid(8)}`;
      const passwordValidationError = getPasswordValidationError(accountPassword, {
        username,
        email: invitation.candidateEmail ?? null,
      });
      if (passwordValidationError) {
        return { ok: false as const, error: passwordValidationError };
      }
      const accountPasswordHash = await hashPassword(accountPassword);
      await tx.insert(users).values({
        id: uid,
        username,
        name: invitation.candidateName,
        email: invitation.candidateEmail ?? null,
        passwordHash: accountPasswordHash,
        role: "student",
        isActive: true,
        mustChangePassword: false,
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
