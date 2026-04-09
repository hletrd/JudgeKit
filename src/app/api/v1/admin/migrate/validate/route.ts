import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { validateExport, type JudgeKitExport } from "@/lib/db/export";
import { MAX_IMPORT_BYTES, readJsonBodyWithLimit, readUploadedJsonFileWithLimit } from "@/lib/db/import-transfer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("system.backup")) return forbidden();

    const contentType = request.headers.get("content-type");
    let data: unknown;

    if (contentType?.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "noFileProvided" }, { status: 400 });
      }
      if (file.size > MAX_IMPORT_BYTES) {
        return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
      }
      try {
        data = await readUploadedJsonFileWithLimit(file);
      } catch (error) {
        if (error instanceof Error && error.message === "fileTooLarge") {
          return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });
        }
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

    const errors = validateExport(data);
    const exp = data as JudgeKitExport;

    const tableSummary: Record<string, number> = {};
    if (exp.tables && typeof exp.tables === "object") {
      for (const [name, tableData] of Object.entries(exp.tables)) {
        const rowCount = typeof tableData === "object" && tableData !== null && "rowCount" in tableData
          ? tableData.rowCount
          : undefined;
        tableSummary[name] = typeof rowCount === "number" ? rowCount : 0;
      }
    }

    return NextResponse.json({
      valid: errors.length === 0,
      errors,
      sourceDialect: exp.sourceDialect ?? null,
      exportedAt: exp.exportedAt ?? null,
      tableCount: Object.keys(tableSummary).length,
      totalRows: Object.values(tableSummary).reduce((a, b) => a + b, 0),
      tables: tableSummary,
    });
  } catch (error) {
    logger.error({ err: error }, "Export validation error");
    return NextResponse.json({ error: "validationFailed" }, { status: 500 });
  }
}
