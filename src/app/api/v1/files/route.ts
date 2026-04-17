import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { eq, desc, like, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, users } from "@/lib/db/schema";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { apiSuccess, apiError, apiPaginated } from "@/lib/api/responses";
import { createApiHandler } from "@/lib/api/handler";
import { parsePagination } from "@/lib/api/pagination";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { isImageMimeType, processImage } from "@/lib/files/image-processing";
import { isAllowedMimeType, validateFileSize, getExtensionForMime, isZipMimeType, validateZipDecompressedSize } from "@/lib/files/validation";
import { writeUploadedFile } from "@/lib/files/storage";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const rateLimitError = await consumeApiRateLimit(request, "files:upload");
    if (rateLimitError) return rateLimitError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    // Skip CSRF for API key auth (no cookies involved)
    const isApiKeyAuth = "_apiKeyAuth" in user;
    if (!isApiKeyAuth) {
      const csrfError = csrfForbidden(request);
      if (csrfError) return csrfError;
    }

    const caps = await resolveCapabilities(user.role);
    if (!caps.has("files.upload")) return forbidden();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiError("noFileProvided", 400);
    }

    if (!isAllowedMimeType(file.type)) {
      return apiError("unsupportedFileType", 400);
    }

    const settings = await getConfiguredSettings();
    const sizeError = validateFileSize(file.size, file.type, settings);
    if (sizeError) {
      return apiError(sizeError, 400);
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());

    // ZIP bomb protection: validate total decompressed size for ZIP uploads
    if (isZipMimeType(file.type)) {
      const zipError = await validateZipDecompressedSize(
        rawBuffer,
        settings.uploadMaxZipDecompressedSizeBytes,
      );
      if (zipError) {
        return apiError(zipError, 400);
      }
    }

    let finalBuffer: Buffer;
    let width: number | null = null;
    let height: number | null = null;
    let finalMimeType: string;
    let category: string;

    if (isImageMimeType(file.type)) {
      const processed = await processImage(rawBuffer, settings.uploadMaxImageDimension);
      finalBuffer = processed.buffer;
      width = processed.width;
      height = processed.height;
      finalMimeType = processed.mimeType;
      category = "image";
    } else {
      finalBuffer = rawBuffer;
      finalMimeType = file.type;
      category = "attachment";
    }

    const ext = getExtensionForMime(finalMimeType);
    const storedName = `${nanoid()}${ext}`;

    await writeUploadedFile(storedName, finalBuffer);

    const [inserted] = await db
      .insert(files)
      .values({
        originalName: file.name,
        storedName,
        mimeType: finalMimeType,
        sizeBytes: finalBuffer.length,
        category,
        width,
        height,
        uploadedBy: user.id,
      })
      .returning();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "file.uploaded",
      resourceType: "file",
      resourceId: inserted.id,
      resourceLabel: file.name,
      summary: `Uploaded file: ${file.name} (${category})`,
      details: { mimeType: finalMimeType, sizeBytes: finalBuffer.length, category },
      request,
    });

    return apiSuccess(
      {
        id: inserted.id,
        url: `/api/v1/files/${inserted.id}`,
        originalName: inserted.originalName,
        mimeType: inserted.mimeType,
        sizeBytes: inserted.sizeBytes,
        category: inserted.category,
        width: inserted.width,
        height: inserted.height,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ err: error }, "File upload failed");
    return apiError("internalServerError", 500);
  }
}

export const GET = createApiHandler({
  handler: async (req, { user }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("files.manage") && !caps.has("files.upload")) {
      return forbidden();
    }

    const searchParams = req.nextUrl.searchParams;
    const { page, limit, offset } = parsePagination(searchParams);
    const category = searchParams.get("category") ?? "all";
    const search = searchParams.get("search") ?? "";

    const conditions = [];
    if (category !== "all") {
      conditions.push(eq(files.category, category));
    }
    if (search) {
      const escaped = search.replace(/[%_\\]/g, "\\$&");
      conditions.push(like(files.originalName, `%${escaped}%`));
    }
    if (!caps.has("files.manage")) {
      conditions.push(eq(files.uploadedBy, user.id));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(where);

    const rows = await db
      .select({
        id: files.id,
        originalName: files.originalName,
        storedName: files.storedName,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        category: files.category,
        width: files.width,
        height: files.height,
        uploadedBy: files.uploadedBy,
        createdAt: files.createdAt,
        uploaderName: users.name,
      })
      .from(files)
      .leftJoin(users, eq(files.uploadedBy, users.id))
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset(offset);

    return apiPaginated(rows, page, limit, countResult.count);
  },
});
