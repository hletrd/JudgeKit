import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canAccessProblem } from "@/lib/auth/permissions";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";
import {
  deleteSourceDraft,
  getSourceDraftsForProblem,
  upsertSourceDraft,
} from "@/lib/drafts/source-draft-store";

// Match the submission source-code cap so a draft can always hold a submittable
// program (and a runaway autosave can't bloat the table).
const MAX_SOURCE_BYTES = 65536;

const putSchema = z.object({
  language: z.string().min(1).max(64),
  sourceCode: z.string().max(MAX_SOURCE_BYTES),
});

const deleteSchema = z.object({
  language: z.string().min(1).max(64),
});

// Load the current user's saved drafts for a problem (one per language) so the
// editor can rehydrate unsubmitted work after a crash / device switch.
export const GET = createApiHandler({
  auth: true,
  handler: async (_req: NextRequest, { user, params }) => {
    const { id } = params;
    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return apiError("forbidden", 403);

    const drafts = await getSourceDraftsForProblem(user.id, id);
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

    const { id } = params;
    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return apiError("forbidden", 403);

    await upsertSourceDraft({
      userId: user.id,
      problemId: id,
      language: body.language,
      sourceCode: body.sourceCode,
    });
    return apiSuccess({ ok: true });
  },
});

// Clear a draft (e.g. after a successful submission for that language).
export const DELETE = createApiHandler({
  auth: true,
  schema: deleteSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { id } = params;
    const hasAccess = await canAccessProblem(id, user.id, user.role);
    if (!hasAccess) return apiError("forbidden", 403);

    await deleteSourceDraft({ userId: user.id, problemId: id, language: body.language });
    return apiSuccess({ ok: true });
  },
});
