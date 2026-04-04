"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

export function ProblemExportButton({ problemId }: { problemId: string }) {
  const t = useTranslations("problems");

  async function handleExport() {
    try {
      const res = await apiFetch(`/api/v1/problems/${problemId}/export`);
      if (!res.ok) {
        toast.error(t("exportFailed"));
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `problem-${data.data.problem.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("exportSuccess"));
    } catch {
      toast.error(t("exportFailed"));
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void handleExport()}>
      <Download className="mr-1 size-4" />
      {t("exportProblem")}
    </Button>
  );
}
