import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canAccessProblem } from "@/lib/auth/permissions";
import { validateAssignmentSubmission } from "@/lib/assignments/submissions";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";
import {
  deleteSourceDraft,
  getSourceDraftsForProblem,
  upsertSourceDraft,
} from "@/lib/drafts/source-draft-store";

// Match the submission source-code cap so a draft can always hold a submittable
// program (and a runaway autosave can't bloat the table).
const MAX_SOURCE_BYTES = 65536;

const assignmentIdSchema = z.string().min(1).max(64).nullable().optional();

const putSchema = z.object({
  language: z.string().min(1).max(64),
  sourceCode: z.string().max(MAX_SOURCE_BYTES),
  assignmentId: assignmentIdSchema,
});

const deleteSchema = z.object({
  language: z.string().min(1).max(64),
  assignmentId: assignmentIdSchema,
});

type DraftScope = { ok: true; assignmentId: string | null } | { ok: false; response: ReturnType<typeof apiError> };

// Contest drafts are isolated: inside a contest (examMode != "none") the editor
// reads and writes a draft scoped to that contest, so code autosaved on the
// practice page — or in another contest reusing the problem — never shows up
// there. Everything else (no assignment, plain homework) shares the practice
// scope. The scope is decided HERE, not by the client: the assignment is
// validated the same way the snapshot route does, which also keeps arbitrary
// assignmentId strings from minting new 64 KiB-capable rows.
async function resolveDraftScope(
  assignmentId: string | null | undefined,
  problemId: string,
  user: { id: string; role: string }
): Promise<DraftScope> {
  const normalizedAssignmentId = assignmentId?.trim() || null;
  if (!normalizedAssignmentId) return { ok: true, assignmentId: null };

  const validation = await validateAssignmentSubmission(normalizedAssignmentId, problemId, user.id, user.role);
  if (!validation.ok) {
    return { ok: false, response: apiError(validation.error, validation.status) };
  }
  return {
    ok: true,
    assignmentId: validation.assignment.examMode !== "none" ? validation.assignment.id : null,
  };
}

// Load the current user's saved drafts for a problem (one per language) so the
// editor can rehydrate unsubmitted work after a crash / device switch.
export const GET = createApiHandler({
  auth: true,
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return apiError("forbidden", 403);

    const scope = await resolveDraftScope(req.nextUrl.searchParams.get("assignmentId"), id, user);
    if (!scope.ok) return scope.response;

    const drafts = await getSourceDraftsForProblem(user.id, id, scope.assignmentId);
    return apiSuccess({ drafts });
  },
});

// Autosave (upsert) the current user's draft for a problem+language.
export const PUT = createApiHandler({
  auth: true,
  rateLimit: "source-draft",
  schema: putSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    // Per-user limit in addition to the IP limit — a single user shouldn't be
    // able to flood the table with autosaves.
    const userRateLimitResponse = await consumeUserApiRateLimit(req, user.id, "source-draft");
    if (userRateLimitResponse) return userRateLimitResponse;

    // Mirror the submission route's language gate: every distinct language
    // string is a NEW 64 KiB-capable row per (user, problem), so accepting
    // arbitrary strings lets one user grow source_drafts without bound. The
    // editor only ever sends real judge languages, so this is non-breaking.
    if (!isJudgeLanguage(body.language)) {
      return apiError("languageNotSupported", 400);
    }

    const { id } = params;
    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return apiError("forbidden", 403);

    const scope = await resolveDraftScope(body.assignmentId, id, user);
    if (!scope.ok) return scope.response;

    await upsertSourceDraft({
      userId: user.id,
      problemId: id,
      language: body.language,
      sourceCode: body.sourceCode,
      assignmentId: scope.assignmentId,
    });
    return apiSuccess({ ok: true });
  },
});

// Clear a draft (e.g. after a successful submission for that language).
// Deliberately does NOT gate on isJudgeLanguage: deleting a row keyed by any
// string is harmless and lets clients clean up rows from before the PUT gate.
export const DELETE = createApiHandler({
  auth: true,
  schema: deleteSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { id } = params;
    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return apiError("forbidden", 403);

    const scope = await resolveDraftScope(body.assignmentId, id, user);
    if (!scope.ok) return scope.response;

    await deleteSourceDraft({
      userId: user.id,
      problemId: id,
      language: body.language,
      assignmentId: scope.assignmentId,
    });
    return apiSuccess({ ok: true });
  },
});
