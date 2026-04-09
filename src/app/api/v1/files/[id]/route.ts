import { NextRequest, NextResponse } from "next/server";
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, problems } from "@/lib/db/schema";
import { getApiUser, unauthorized, csrfForbidden, forbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { readUploadedFile, deleteUploadedFile } from "@/lib/files/storage";
import { isImageMimeType } from "@/lib/files/image-processing";
import { logger } from "@/lib/logger";
import { getAccessibleProblemIds } from "@/lib/auth/permissions";

async function canAccessFile(
  fileId: string,
  problemId: string | null,
  uploadedBy: string | null,
  userId: string,
  role: string
) {
  const caps = await resolveCapabilities(role);

  if (caps.has("files.manage")) {
    return true;
  }

  if (caps.has("files.upload") && uploadedBy === userId) {
    return true;
  }

  const problemRows = problemId
    ? await db
        .select({
          id: problems.id,
          visibility: problems.visibility,
          authorId: problems.authorId,
        })
        .from(problems)
        .where(eq(problems.id, problemId))
    : await db
        .select({
          id: problems.id,
          visibility: problems.visibility,
          authorId: problems.authorId,
        })
        .from(problems)
        .where(like(problems.description, `%"/api/v1/files/${fileId}"%`));

  if (problemRows.length === 0) {
    return false;
  }

  if (!problemId && problemRows.length === 1) {
    void db.update(files)
      .set({ problemId: problemRows[0].id })
      .where(eq(files.id, fileId));
  }

  const accessibleProblemIds = await getAccessibleProblemIds(
    userId,
    role,
    problemRows.map((problem) => ({
      ...problem,
      visibility: problem.visibility ?? "private",
    }))
  );
  return accessibleProblemIds.size > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;

    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);

    if (!file) {
      return apiError("notFound", 404);
    }

    const allowed = await canAccessFile(file.id, file.problemId ?? null, file.uploadedBy ?? null, user.id, user.role);
    if (!allowed) {
      return forbidden();
    }

    // Check ETag for conditional request
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === `"${file.id}"`) {
      return new NextResponse(null, { status: 304 });
    }

    let buffer: Buffer;
    try {
      buffer = await readUploadedFile(file.storedName);
    } catch {
      return apiError("notFound", 404);
    }

    const isImage = isImageMimeType(file.mimeType);
    const disposition = isImage
      ? "inline"
      : `attachment; filename="${encodeURIComponent(file.originalName)}"`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store, max-age=0",
        ETag: `"${file.id}"`,
        Vary: "Cookie, Authorization",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "File serve failed");
    return apiError("internalServerError", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitError = await consumeApiRateLimit(request, "files:delete");
    if (rateLimitError) return rateLimitError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const caps = await resolveCapabilities(user.role);
    const { id } = await params;

    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, id))
      .limit(1);

    if (!file) {
      return apiError("notFound", 404);
    }

    // Must have files.manage, or own the file with files.upload
    if (!caps.has("files.manage")) {
      if (!caps.has("files.upload") || file.uploadedBy !== user.id) {
        return apiError("forbidden", 403);
      }
    }

    // Delete from DB first; if this succeeds the row is gone regardless of disk outcome.
    await db.delete(files).where(eq(files.id, id));

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "file.deleted",
      resourceType: "file",
      resourceId: file.id,
      resourceLabel: file.originalName,
      summary: `Deleted file: ${file.originalName}`,
      request,
    });

    // Best-effort disk cleanup — log failures but don't fail the response.
    try {
      await deleteUploadedFile(file.storedName);
    } catch (diskErr) {
      logger.warn({ err: diskErr, storedName: file.storedName }, "Failed to delete file from disk after DB delete");
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    logger.error({ err: error }, "File delete failed");
    return apiError("internalServerError", 500);
  }
}
