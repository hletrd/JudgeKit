import { nanoid } from "nanoid";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, users } from "@/lib/db/schema";
import { apiSuccess, apiError, apiPaginated } from "@/lib/api/responses";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { parsePagination } from "@/lib/api/pagination";
import { recordAuditEvent } from "@/lib/audit/events";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { isImageMimeType, processImage } from "@/lib/files/image-processing";
import { isAllowedMimeType, validateFileSize, getExtensionForMime, isZipMimeType, validateZipDecompressedSize, verifyFileMagicBytes } from "@/lib/files/validation";
import { writeUploadedFile } from "@/lib/files/storage";
import { logger } from "@/lib/logger";
import { escapeLikePattern } from "@/lib/db/like";

export const POST = createApiHandler({
  auth: { capabilities: ["files.upload"] },
  rateLimit: "files:upload",
  handler: async (request, { user }) => {
    try {
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

      // Magic-byte verification: ensure the file content matches the declared
      // MIME type. This prevents uploading disguised executables (e.g., an
      // .exe with a .pdf MIME type). Images are verified by sharp during
      // processing; text types are checked for null bytes (binary indicator).
      if (!verifyFileMagicBytes(rawBuffer, file.type)) {
        return apiError("fileContentMismatch", 400);
      }

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
        let processed;
        try {
          processed = await processImage(rawBuffer, settings.uploadMaxImageDimension);
        } catch (imgErr) {
          logger.info({ err: imgErr, mimeType: file.type, fileName: file.name }, "[files] Image processing failed — likely invalid format");
          return apiError("invalidImageFormat", 400);
        }
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
  },
});

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
      conditions.push(sql`${files.originalName} LIKE ${`%${escapeLikePattern(search)}%`} ESCAPE '\\'`);
    }
    if (!caps.has("files.manage")) {
      conditions.push(eq(files.uploadedBy, user.id));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
        _total: sql<number>`count(*) over()`,
      })
      .from(files)
      .leftJoin(users, eq(files.uploadedBy, users.id))
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset(offset);

    const total = rows.length > 0 ? Number(rows[0]._total) : 0;
    const cleanRows = rows.map(({ _total, ...rest }) => rest);

    return apiPaginated(cleanRows, page, limit, total);
  },
});
