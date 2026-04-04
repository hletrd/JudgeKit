import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { db, execTransaction } from "@/lib/db";
import { assignments, contestAccessTokens, enrollments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

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
export function setAccessCode(assignmentId: string, code?: string): string {
  const accessCode = code ?? generateAccessCode();
  db.update(assignments)
    .set({ accessCode })
    .where(eq(assignments.id, assignmentId))
    .run();
  return accessCode;
}

/**
 * Revoke (clear) the access code for an assignment.
 */
export function revokeAccessCode(assignmentId: string): void {
  db.update(assignments)
    .set({ accessCode: null })
    .where(eq(assignments.id, assignmentId))
    .run();
}

/**
 * Get the current access code for an assignment.
 */
export function getAccessCode(assignmentId: string): string | null {
  const row = db
    .select({ accessCode: assignments.accessCode })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .get();
  return row?.accessCode ?? null;
}

type RedeemResult =
  | { ok: true; assignmentId: string; groupId: string; alreadyEnrolled?: boolean }
  | { ok: false; error: string };

/**
 * Redeem an access code: verify it, create access token, auto-enroll in group.
 */
export function redeemAccessCode(
  code: string,
  userId: string,
  ipAddress?: string
): RedeemResult {
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode || normalizedCode.length < 4) {
    return { ok: false, error: "invalidAccessCode" };
  }

  const assignment = db
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
    .get();

  if (!assignment) {
    return { ok: false, error: "invalidAccessCode" };
  }

  if (assignment.examMode === "none") {
    return { ok: false, error: "notAContest" };
  }

  // Block join after contest deadline
  const now = Date.now();
  const effectiveClose = assignment.lateDeadline?.valueOf() ?? assignment.deadline?.valueOf() ?? null;
  if (effectiveClose && effectiveClose < now) {
    return { ok: false, error: "contestClosed" };
  }

  // Transaction: check + create token + auto-enroll (atomic to prevent TOCTOU race)
  execTransaction(() => {
    // Check if already redeemed (inside transaction to prevent race condition)
    const existing = db
      .select({ id: contestAccessTokens.id })
      .from(contestAccessTokens)
      .where(
        and(
          eq(contestAccessTokens.assignmentId, assignment.id),
          eq(contestAccessTokens.userId, userId)
        )
      )
      .get();

    if (existing) {
      return { alreadyRedeemed: true as const };
    }

    // Create access token
    db.insert(contestAccessTokens)
      .values({
        id: nanoid(),
        assignmentId: assignment.id,
        userId,
        redeemedAt: new Date(),
        ipAddress: ipAddress ?? null,
      })
      .run();

    // Auto-enroll in group if not already enrolled
    const enrollment = db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.groupId, assignment.groupId),
          eq(enrollments.userId, userId)
        )
      )
      .get();

    if (!enrollment) {
      db.insert(enrollments)
        .values({
          id: nanoid(),
          userId,
          groupId: assignment.groupId,
          enrolledAt: new Date(),
        })
        .run();
    }

    return { alreadyRedeemed: false as const };
  });

  const result = execute();

  if (result.alreadyRedeemed) {
    return { ok: true, alreadyEnrolled: true, assignmentId: assignment.id, groupId: assignment.groupId };
  }

  return { ok: true, assignmentId: assignment.id, groupId: assignment.groupId };
}
