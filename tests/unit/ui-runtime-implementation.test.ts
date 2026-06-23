import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("UI/runtime implementation guards", () => {
  it("keeps the code snapshot timer stable across keystrokes via refs", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/problem/problem-submission-form.tsx"),
      "utf8"
    );

    expect(source).toContain("const sourceCodeRef = useRef(sourceCode);");
    expect(source).toContain("const languageRef = useRef(language);");
    expect(source).toContain("}, [assignmentId, problemId]);");
  });

  it("guards duplicate submission-result events and cleans up SSE fallback polling", () => {
    const detailSource = readFileSync(
      join(process.cwd(), "src/components/submissions/submission-detail-client.tsx"),
      "utf8"
    );
    const pollingSource = readFileSync(
      join(process.cwd(), "src/hooks/use-submission-polling.ts"),
      "utf8"
    );

    expect(detailSource).toContain("const firedEventRef = useRef<string | null>(null);");
    expect(detailSource).toContain("if (firedEventRef.current === key) return;");

    expect(pollingSource).toContain("controller.abort();");
    expect(pollingSource).toContain("clearScheduledRefresh();");
    expect(pollingSource).toContain('document.removeEventListener("visibilitychange", handleVisibilityChange);');
    expect(pollingSource).toContain("fallbackCleanup?.();");
    expect(pollingSource).toContain("es.close();");
    expect(pollingSource).toContain("/api/v1/submissions/${submissionId}/queue-status");
    expect(pollingSource).toContain("ACTIVE_SUBMISSION_STATUSES.has(nextStatus)");
    expect(pollingSource).toContain("submissionStatusRefreshFailed");
  });

  it("uses null-safe plugin config access and explicit migrate JSON parse errors", () => {
    const pluginSource = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/plugins/[id]/route.ts"),
      "utf8"
    );
    const migrateExportSource = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/migrate/export/route.ts"),
      "utf8"
    );
    const migrateImportSource = readFileSync(
      join(process.cwd(), "src/app/api/v1/admin/migrate/import/route.ts"),
      "utf8"
    );

    expect(pluginSource).toContain("existingRow?.config");
    expect(pluginSource).not.toContain("existingRow!.config");
    expect(migrateExportSource).toContain('error: "invalidRequestBody"');
    expect(migrateImportSource).toContain('error: "invalidJson"');
  });
});
