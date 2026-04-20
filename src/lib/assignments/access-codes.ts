import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { assignments, contestAccessTokens, enrollments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { withUpdatedAt } from "@/lib/db/helpers";
import { getDbNowUncached } from "@/lib/db-time";
import { rawQueryOne } from "@/lib/db/queries";

/**
 * Generate a random 8-character uppercase alphanumeric access code.
 * Uses crypto.randomBytes for cryptographic security.
 */
export function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for readability
  const len = chars.length; // 32
  const maxUnbiased = 256 - (256 % len); // rejection threshold
  let code = "";
  while (code.length < 8) {
    const byte = randomBytes(1)[0];
    if (byte < maxUnbiased) {
      code += chars[byte % len];
    }
  }
  return code;
}

/**
 * Set or regenerate an access code for an assignment.
 */
export async function setAccessCode(assignmentId: string, code?: string): Promise<string> {
  const now = await getDbNowUncached();
  const persistAccessCode = async (accessCode: string) => {
    await db.update(assignments)
      .set(withUpdatedAt({ accessCode }, now))
      .where(eq(assignments.id, assignmentId));
    return accessCode;
  };

  if (code) {
    return persistAccessCode(code);
  }

  const MAX_GENERATION_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const accessCode = generateAccessCode();
    try {
      return await persistAccessCode(accessCode);
    } catch (err: unknown) {
      if (
        typeof err === "object"
        && err !== null
        && "code" in err
        && err.code === "23505"
        && attempt < MAX_GENERATION_ATTEMPTS - 1
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("accessCodeGenerationFailed");
}

/**
 * Revoke (clear) the access code for an assignment.
 */
export async function revokeAccessCode(assignmentId: string): Promise<void> {
  const now = await getDbNowUncached();
  await db.update(assignments)
    .set(withUpdatedAt({ accessCode: null }, now))
    .where(eq(assignments.id, assignmentId));
}

/**
 * Get the current access code for an assignment.
 */
export async function getAccessCode(assignmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ accessCode: assignments.accessCode })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  return row?.accessCode ?? null;
}

type RedeemResult =
  | { ok: true; assignmentId: string; groupId: string; alreadyEnrolled?: boolean }
  | { ok: false; error: string };

/**
 * Redeem an access code: verify it, create access token, auto-enroll in group.
 * Entire operation runs inside a transaction to prevent TOCTOU races.
 */
export async function redeemAccessCode(
  code: string,
  userId: string,
  ipAddress?: string
): Promise<RedeemResult> {
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode || normalizedCode.length < 4) {
    return { ok: false, error: "invalidAccessCode" };
  }

  try {
    return await db.transaction(async (tx) => {
      // Read assignment inside transaction for consistent snapshot
      const [assignment] = await tx
        .select({
          id: assignments.id,
          groupId: assignments.groupId,
          accessCode: assignments.accessCode,
          examMode: assignments.examMode,
          deadline: assignments.deadline,
          lateDeadline: assignments.lateDeadline,
        })
        .from(assignments)
        .where(eq(assignments.accessCode, normalizedCode))
        .limit(1);

      if (!assignment) {
        return { ok: false as const, error: "invalidAccessCode" };
      }

      if (assignment.examMode === "none") {
        return { ok: false as const, error: "notAContest" };
      }

      // Block join after contest deadline (using DB server time within the
      // transaction to avoid clock skew between app server and DB server)
      const nowRow = await rawQueryOne<{ now: Date }>("SELECT NOW()::timestamptz AS now");
      if (!nowRow?.now) {
        throw new Error("Failed to fetch DB server time for access code redemption");
      }
      const now = nowRow.now;
      const effectiveClose = assignment.lateDeadline ?? assignment.deadline ?? null;
      if (effectiveClose && effectiveClose < now) {
        return { ok: false as const, error: "contestClosed" };
      }

      // Check if already redeemed (inside transaction to prevent race condition)
      const [existing] = await tx
        .select({ id: contestAccessTokens.id })
        .from(contestAccessTokens)
        .where(
          and(
            eq(contestAccessTokens.assignmentId, assignment.id),
            eq(contestAccessTokens.userId, userId)
          )
        )
        .limit(1);

      const ensureEnrollment = async () => {
        const [enrollment] = await tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.groupId, assignment.groupId),
              eq(enrollments.userId, userId)
            )
          )
          .limit(1);

        if (!enrollment) {
          await tx.insert(enrollments)
            .values({
              id: nanoid(),
              userId,
              groupId: assignment.groupId,
              enrolledAt: now,
            })
            .onConflictDoNothing({
              target: [enrollments.userId, enrollments.groupId],
            });
        }
      };

      if (existing) {
        await ensureEnrollment();
        return { ok: true as const, alreadyEnrolled: true, assignmentId: assignment.id, groupId: assignment.groupId };
      }

      // Create access token
      await tx.insert(contestAccessTokens)
        .values({
          id: nanoid(),
          assignmentId: assignment.id,
          userId,
          redeemedAt: now,
          ipAddress: ipAddress ?? null,
        });

      // Auto-enroll in group if not already enrolled
      await ensureEnrollment();

      return { ok: true as const, assignmentId: assignment.id, groupId: assignment.groupId };
    });
  } catch (err: unknown) {
    // Unique constraint violation on contestAccessTokens (concurrent redemption)
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      // Re-fetch assignment info for the response
      const [assignment] = await db
        .select({ id: assignments.id, groupId: assignments.groupId })
        .from(assignments)
        .where(eq(assignments.accessCode, normalizedCode))
        .limit(1);
      if (assignment) {
        return { ok: true, alreadyEnrolled: true, assignmentId: assignment.id, groupId: assignment.groupId };
      }
    }
    throw err;
  }
}
