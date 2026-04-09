import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { importDatabase } from "@/lib/db/import";
import { validateExport, type JudgeKitExport } from "@/lib/db/export";
import { recordAuditEvent } from "@/lib/audit/events";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

async function readJsonBodyWithLimit(request: NextRequest): Promise<JudgeKitExport> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_IMPORT_BYTES) {
      throw new Error("fileTooLarge");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error("invalidJson");
  }

  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMPORT_BYTES) {
      throw new Error("fileTooLarge");
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();

  try {
    return JSON.parse(text) as JudgeKitExport;
  } catch {
    throw new Error("invalidJson");
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (user.role !== "super_admin") return forbidden();

    const rateLimitError = await consumeApiRateLimit(request, "admin:migrate-import");
    if (rateLimitError) return rateLimitError;

    const contentType = request.headers.get("content-type");
    let data: JudgeKitExport;

    if (contentType?.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "noFileProvided" }, { status: 400 });
      }
      if (file.size > 500 * 1024 * 1024) {
        return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
      }
      const text = await file.text();
      try {
        data = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "invalidJson" }, { status: 400 });
      }
    } else {
      try {
        data = await readJsonBodyWithLimit(request);
      } catch (error) {
        if (error instanceof Error && error.message === "fileTooLarge") {
          return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
        }
        if (error instanceof Error && error.message === "invalidJson") {
          return NextResponse.json({ error: "invalidJson" }, { status: 400 });
        }
        throw error;
      }
    }

    // Validate before importing
    const errors = validateExport(data);
    if (errors.length > 0) {
      return NextResponse.json({ error: "invalidExport", details: errors }, { status: 400 });
    }

    // Record audit BEFORE the import (since import replaces all data)
    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.data_imported",
      resourceType: "system_settings",
      resourceId: "database",
      resourceLabel: "Database import",
      summary: `Importing database from ${data.sourceDialect} export (${data.exportedAt})`,
      request,
    });

    const result = await importDatabase(data);

    if (!result.success) {
      return NextResponse.json({
        error: "importFailed",
        details: result.errors,
        partial: result.tableResults,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tablesImported: result.tablesImported,
      totalRowsImported: result.totalRowsImported,
      tableResults: result.tableResults,
    });
  } catch (error) {
    logger.error({ err: error }, "Database import error");
    return NextResponse.json({ error: "importFailed" }, { status: 500 });
  }
}
