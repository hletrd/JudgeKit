import { randomBytes, createHash } from "crypto";
import { nanoid } from "nanoid";
import { hashPassword, verifyAndRehashPassword } from "@/lib/security/password-hash";
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
import { getDbNowUncached } from "@/lib/db-time";
import { escapeLikePattern } from "@/lib/db/like";

type RecruitingInvitationExecutor =
  Pick<TransactionClient, "insert" | "select" | "update" | "delete">
  | typeof db;

const ACCOUNT_PASSWORD_RESET_REQUIRED_KEY = "accountPasswordResetRequired";

/**
 * Shared SQL expression: a pending invitation is expired when its
 * expiresAt is before NOW(). Computed server-side using DB time so
 * the client doesn't need to compare raw timestamps against the
 * browser clock.
 */
const isExpiredExpr = sql<boolean>`CASE WHEN ${recruitingInvitations.status} = 'pending' AND ${recruitingInvitations.expiresAt} IS NOT NULL AND ${recruitingInvitations.expiresAt} < NOW() THEN true ELSE false END`;

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
      // Only the hash is persisted to the DB; the plaintext token is
      // returned to the caller via the attached object below.
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
        // Only the hash is persisted; plaintext stays in memory for the response.
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
      // Compute isExpired server-side using DB time so the client doesn't need
      // to compare raw timestamps against the browser clock. A pending
      // invitation is expired when its expiresAt is before NOW().
      isExpired: isExpiredExpr,
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
      isExpired: isExpiredExpr,
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
    .select({
      id: recruitingInvitations.id,
      assignmentId: recruitingInvitations.assignmentId,
      candidateName: recruitingInvitations.candidateName,
      candidateEmail: recruitingInvitations.candidateEmail,
      status: recruitingInvitations.status,
      metadata: recruitingInvitations.metadata,
      userId: recruitingInvitations.userId,
      expiresAt: recruitingInvitations.expiresAt,
      isExpired: isExpiredExpr,
      redeemedAt: recruitingInvitations.redeemedAt,
      ipAddress: recruitingInvitations.ipAddress,
      createdBy: recruitingInvitations.createdBy,
      createdAt: recruitingInvitations.createdAt,
      updatedAt: recruitingInvitations.updatedAt,
    })
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
  const updates: Record<string, unknown> = { updatedAt: await getDbNowUncached() };
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

  // Capture after guard so TypeScript narrows userId to string (not string | null).
  // This avoids the non-null assertion inside the transaction callback below,
  // where TypeScript cannot narrow across closure boundaries.
  const userId = invitation.userId;

  const invalidatedPasswordHash = await hashPassword(randomBytes(32).toString("hex"));
  const nextMetadata = {
    ...(invitation.metadata ?? {}),
    [ACCOUNT_PASSWORD_RESET_REQUIRED_KEY]: "true",
  };

  await db.transaction(async (tx) => {
    const now = await getDbNowUncached();
    await tx
      .update(users)
      .set({
        passwordHash: invalidatedPasswordHash,
        // Set mustChangePassword: true as defense-in-depth: even if session
        // invalidation via tokenInvalidatedAt has a race condition or gap,
        // the candidate will be forced to change their password on next login.
        mustChangePassword: true,
        tokenInvalidatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    await tx
      .update(recruitingInvitations)
      .set({
        metadata: nextMetadata,
        updatedAt: now,
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
  // Single atomic query with conditional aggregation — avoids the race
  // condition where invitations transition between two separate queries,
  // and uses NOW() for the expiry comparison to match redeemRecruitingToken.
  const [row] = await db
    .select({
      total: count(),
      pending: sql<number>`SUM(CASE WHEN ${recruitingInvitations.status} = 'pending' THEN 1 ELSE 0 END)`,
      redeemed: sql<number>`SUM(CASE WHEN ${recruitingInvitations.status} = 'redeemed' THEN 1 ELSE 0 END)`,
      revoked: sql<number>`SUM(CASE WHEN ${recruitingInvitations.status} = 'revoked' THEN 1 ELSE 0 END)`,
      expired: sql<number>`SUM(CASE WHEN ${recruitingInvitations.status} = 'pending' AND ${recruitingInvitations.expiresAt} IS NOT NULL AND ${recruitingInvitations.expiresAt} < NOW() THEN 1 ELSE 0 END)`,
    })
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.assignmentId, assignmentId));

  const total = Number(row?.total ?? 0);
  const pending = Number(row?.pending ?? 0) - Number(row?.expired ?? 0);
  const redeemed = Number(row?.redeemed ?? 0);
  const revoked = Number(row?.revoked ?? 0);
  const expired = Number(row?.expired ?? 0);

  return { total, pending: Math.max(pending, 0), redeemed, revoked, expired };
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
      // All timestamps in this transaction use DB server time (dbNow) for
      // consistency with the atomic NOW() expiry check at the claim step.
      const dbNow = await getDbNowUncached();

      // Read invitation inside transaction for consistent snapshot
      const [invitation] = await tx
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
              tokenInvalidatedAt: dbNow,
              updatedAt: dbNow,
            })
            .where(eq(users.id, existingUser.id));

          await tx
            .update(recruitingInvitations)
            .set({
              metadata: {
                ...(invitation.metadata ?? {}),
                [ACCOUNT_PASSWORD_RESET_REQUIRED_KEY]: "false",
              },
              updatedAt: dbNow,
            })
            .where(eq(recruitingInvitations.id, invitation.id));
        } else {
          const { valid } = await verifyAndRehashPassword(accountPassword, existingUser.id, existingUser.passwordHash);
          if (!valid) {
            return { ok: false as const, error: "accountPasswordIncorrect" };
          }
        }

        // Verify assignment still exists and isn't closed. Use SQL NOW() for
        // the deadline check to avoid clock skew between app and DB servers,
        // consistent with the atomic claim step in the initial redeem path.
        const [assignment] = await tx
          .select({
            id: assignments.id,
            groupId: assignments.groupId,
            deadline: assignments.deadline,
          })
          .from(assignments)
          .where(
            and(
              eq(assignments.id, invitation.assignmentId),
              sql`(${assignments.deadline} IS NULL OR ${assignments.deadline} > NOW())`
            )
          )
          .limit(1);

        if (!assignment) return { ok: false as const, error: "assignmentClosed" };

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

      // Expiry is validated atomically by the SQL WHERE clause at the atomic
      // claim step below (expires_at > NOW()). No JS-side gate here — that
      // would introduce a TOCTOU race between app and DB clocks. The SQL
      // check is the authoritative one.

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
      // Deadline is not checked on the JS side to avoid clock skew between app
      // server and DB server. The atomic SQL claim step below validates the
      // deadline using NOW() which is authoritative. If the contest has closed
      // between the read and claim, the SQL WHERE clause will return no rows
      // and the transaction will roll back with an appropriate error.

      if (!accountPassword) return { ok: false as const, error: "accountPasswordRequired" };

      // Create user + enroll + access token + atomically claim invitation
      const uid = nanoid();
      const username = nanoid(10);
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
        enrolledAt: dbNow,
      });

      await tx.insert(contestAccessTokens).values({
        id: nanoid(),
        assignmentId: assignment.id,
        userId: uid,
        redeemedAt: dbNow,
        ipAddress: ipAddress ?? null,
      });

      // Atomically claim — rolls back entire tx if already redeemed or expired
      const [updated] = await tx
        .update(recruitingInvitations)
        .set({
          status: "redeemed",
          userId: uid,
          redeemedAt: dbNow,
          ipAddress: ipAddress ?? null,
          updatedAt: dbNow,
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
        // The atomic update returned no rows — either the invitation was
        // claimed by another request or it expired between our read and the
        // claim. Default to "alreadyRedeemed" because:
        // (1) The SQL WHERE clause is the authoritative check — it already
        //     validated the deadline via NOW() and the status via "pending".
        // (2) Using new Date() to differentiate would introduce the same
        //     clock-skew risk that was removed from the pre-check paths
        //     (see commit b42a7fe4). The app server and DB server clocks
        //     may not be synchronized, so a JS-side date comparison could
        //     produce a misleading "tokenExpired" error when the real cause
        //     was a concurrent claim.
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
    if (err instanceof Error && err.message === "tokenExpired") {
      return { ok: false, error: "tokenExpired" };
    }
    throw err;
  }
}
