import { NextRequest, NextResponse } from "next/server";
import { getApiUser, unauthorized, forbidden, csrfForbidden } from "@/lib/api/auth";
import { validateExport, type JudgeKitExport } from "@/lib/db/export";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

async function readJsonBodyWithLimit(request: NextRequest) {
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
    return JSON.parse(text);
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
