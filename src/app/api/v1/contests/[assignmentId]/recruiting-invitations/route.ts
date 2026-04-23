import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq, and, sql } from "drizzle-orm";
import { execTransaction } from "@/lib/db";
import { recruitingInvitations } from "@/lib/db/schema";
import {
  createRecruitingInvitation,
  getRecruitingInvitations,
} from "@/lib/assignments/recruiting-invitations";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { createRecruitingInvitationSchema } from "@/lib/validators/recruiting-invitations";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";
import { MAX_EXPIRY_MS } from "@/lib/assignments/recruiting-constants";

export const GET = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);
    if (!assignment) return apiError("notFound", 404, "Assignment");
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const invitations = await getRecruitingInvitations(assignmentId, { status, search });
    return apiSuccess(invitations);
  },
});

export const POST = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  rateLimit: "api-keys:create",
  schema: createRecruitingInvitationSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const { assignmentId } = params;
    const assignment = await getContestAssignment(assignmentId);
    if (!assignment) return apiError("notFound", 404, "Assignment");
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    try {
      const invitation = await execTransaction(async (tx) => {
        const normalizedEmail = body.candidateEmail?.trim().toLowerCase() ?? null;
        if (normalizedEmail) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(('x' || md5(${`${assignmentId}:${normalizedEmail}`}))::bit(64)::bigint)`
          );
          const existing = await tx
            .select({ id: recruitingInvitations.id })
            .from(recruitingInvitations)
            .where(
              and(
                eq(recruitingInvitations.assignmentId, assignmentId),
                sql`lower(${recruitingInvitations.candidateEmail}) = ${normalizedEmail}`,
              )
            )
            .limit(1);
          if (existing.length > 0) {
            throw new Error("emailAlreadyInvited");
          }
        }

        // Compute expiresAt server-side using DB time instead of accepting a
        // client-computed timestamp. This ensures the stored expiry is
        // consistent with the NOW()-based isExpired check.
        const dbNow = await getDbNowUncached();
        let expiresAt: Date | null = null;
        if (body.expiryDays) {
          expiresAt = new Date(dbNow.getTime() + body.expiryDays * 86400000);
        } else if (body.expiryDate) {
          // Custom date: compute end-of-day UTC to avoid timezone-dependent results.
          // The client sends a bare date (YYYY-MM-DD); we set 23:59:59 UTC.
          expiresAt = new Date(`${body.expiryDate}T23:59:59Z`);
          // Defense-in-depth: reject Invalid Date construction even though the
          // Zod schema enforces YYYY-MM-DD format. If the schema is ever
          // loosened or reused without the regex guard, NaN comparisons would
          // silently bypass the "in past" and "too far" checks below.
          if (!Number.isFinite(expiresAt.getTime())) {
            throw new Error("invalidExpiryDate");
          }
          // Validate the date is in the future (relative to DB time)
          if (expiresAt <= dbNow) {
            throw new Error("expiryDateInPast");
          }
        }
        // Reject unreasonably far-future expiry (consistent with expiryDays max 3650)
        if (expiresAt && (expiresAt.getTime() - dbNow.getTime()) > MAX_EXPIRY_MS) {
          throw new Error("expiryDateTooFar");
        }

        return createRecruitingInvitation({
          assignmentId,
          candidateName: body.candidateName,
          candidateEmail: body.candidateEmail,
          metadata: body.metadata,
          expiresAt,
          createdBy: user.id,
        }, tx);
      });

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "recruiting_invitation.created",
        resourceType: "recruiting_invitation",
        resourceId: invitation.id,
        resourceLabel: body.candidateName,
        summary: `Created recruiting invitation for "${body.candidateName}"`,
        details: { assignmentId, candidateEmail: body.candidateEmail ?? null },
        request: req,
      });

      return apiSuccess(invitation, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === "emailAlreadyInvited") {
        return apiError("emailAlreadyInvited", 409);
      }
      if (error instanceof Error && error.message === "expiryDateInPast") {
        return apiError("expiryDateInPast", 400);
      }
      if (error instanceof Error && error.message === "invalidExpiryDate") {
        return apiError("invalidExpiryDate", 400);
      }
      if (error instanceof Error && error.message === "expiryDateTooFar") {
        return apiError("expiryDateTooFar", 400);
      }
      throw error;
    }
  },
});
