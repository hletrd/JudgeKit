import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recruitingInvitations, assignments } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { validateRecruitingTokenSchema } from "@/lib/validators/recruiting-invitations";
import { hashToken } from "@/lib/security/token-hash";

export async function POST(req: NextRequest) {
  const rateLimitResponse = await consumeApiRateLimit(req, "recruiting:validate");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await req.json().catch(() => null);
  const parsed = validateRecruitingTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalidToken" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);

  // Use SQL NOW() for expiry validation instead of new Date() to avoid
  // clock skew between app server and DB server. The SQL-level check is
  // authoritative — same rationale as the redeemRecruitingToken fix
  // (commit b42a7fe4).
  const [invitation] = await db
    .select({
      status: recruitingInvitations.status,
      assignmentId: recruitingInvitations.assignmentId,
    })
    .from(recruitingInvitations)
    .where(
      and(
        eq(recruitingInvitations.tokenHash, tokenHash),
        sql`(${recruitingInvitations.expiresAt} IS NULL OR ${recruitingInvitations.expiresAt} > NOW())`,
      )
    )
    .limit(1);

  // Return a uniform invalid response for any failure case to avoid
  // leaking invitation status, expiration metadata, or assignment details
  // to anonymous callers.
  const invalid = () => NextResponse.json({ data: { valid: false } });

  if (!invitation) return invalid();
  if (invitation.status === "revoked") return invalid();

  // Use SQL NOW() for deadline validation — avoids the same clock-skew risk.
  const [assignment] = await db
    .select({
      id: assignments.id,
    })
    .from(assignments)
    .where(
      and(
        eq(assignments.id, invitation.assignmentId),
        sql`(${assignments.deadline} IS NULL OR ${assignments.deadline} > NOW())`,
      )
    )
    .limit(1);

  if (!assignment) return invalid();

  return NextResponse.json({
    data: { valid: true },
  });
}
