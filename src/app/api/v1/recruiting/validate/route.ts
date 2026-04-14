import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recruitingInvitations, assignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { consumeInMemoryRateLimit } from "@/lib/security/in-memory-rate-limit";
import { extractClientIp } from "@/lib/security/ip";

export async function POST(req: Request) {
  // Rate limit: 10 attempts per minute per IP
  const ip = extractClientIp(req.headers);
  const { limited } = consumeInMemoryRateLimit(
    { headers: req.headers },
    `recruiting:validate:${ip}`,
    10,
    60000
  );
  if (limited) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.token || typeof body.token !== "string") {
    return NextResponse.json({ error: "invalidToken" }, { status: 400 });
  }

  const [invitation] = await db
    .select({
      id: recruitingInvitations.id,
      status: recruitingInvitations.status,
      candidateName: recruitingInvitations.candidateName,
      expiresAt: recruitingInvitations.expiresAt,
      assignmentId: recruitingInvitations.assignmentId,
      userId: recruitingInvitations.userId,
    })
    .from(recruitingInvitations)
    .where(eq(recruitingInvitations.token, body.token))
    .limit(1);

  if (!invitation) {
    return NextResponse.json({ data: { valid: false, reason: "notFound" } });
  }

  if (invitation.status === "revoked") {
    return NextResponse.json({ data: { valid: false, reason: "revoked" } });
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json({ data: { valid: false, reason: "expired" } });
  }

  const [assignment] = await db
    .select({
      title: assignments.title,
      examDurationMinutes: assignments.examDurationMinutes,
      deadline: assignments.deadline,
    })
    .from(assignments)
    .where(eq(assignments.id, invitation.assignmentId))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ data: { valid: false, reason: "assignmentNotFound" } });
  }

  if (assignment.deadline && assignment.deadline < new Date()) {
    return NextResponse.json({ data: { valid: false, reason: "contestClosed" } });
  }

  return NextResponse.json({
    data: {
      valid: true,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    },
  });
}
