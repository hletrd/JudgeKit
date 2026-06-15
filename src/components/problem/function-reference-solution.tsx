"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CodeEditor } from "@/components/code/code-editor";
import { cn } from "@/lib/utils";
import { apiFetch, getApiData } from "@/lib/api/client";
import { toast } from "sonner";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";
import { getAdapter, supportsFunctionJudging } from "@/lib/judge/function-judging/registry";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";

export type ReferenceSolution = { language: string; source: string };

type ComputedResult = {
  testCaseIndex: number;
  expectedOutput: string;
  ok: boolean;
  error?: string;
};

type FunctionReferenceSolutionProps = {
  spec: FunctionSpec;
  value: ReferenceSolution;
  onChange: (next: ReferenceSolution) => void;
  /** Problem id, or null when creating before the first save. */
  problemId: string | null;
  /** Called with the per-case computed outputs (canonical strings). */
  onComputed: (results: ComputedResult[]) => void;
  /** Number of test cases currently defined (to gate the compute button). */
  testCaseCount: number;
  disabled?: boolean;
  editorTheme?: string | null;
};

/** Native <select> styled like the shadcn trigger; testable in jsdom. */
function LanguageSelect({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-10 w-full max-w-[240px] items-center rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm",
        "outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
      )}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FunctionReferenceSolution({
  spec,
  value,
  onChange,
  problemId,
  onComputed,
  testCaseCount,
  disabled = false,
  editorTheme,
}: FunctionReferenceSolutionProps) {
  const t = useTranslations("problems");
  const [isComputing, setIsComputing] = useState(false);

  // The reference may only be one of the enabled languages.
  const languageOptions = useMemo(
    () =>
      spec.enabledLanguages
        .filter((id) => supportsFunctionJudging(id))
        .map((id) => ({ id, label: getLanguageDisplayLabel(id) })),
    [spec.enabledLanguages],
  );

  const selectedLanguage =
    value.language && languageOptions.some((o) => o.id === value.language)
      ? value.language
      : languageOptions[0]?.id ?? "";

  const stubPreview = useMemo(() => {
    if (!selectedLanguage || !supportsFunctionJudging(selectedLanguage)) return "";
    try {
      return getAdapter(selectedLanguage).generateStub(spec);
    } catch {
      return "";
    }
  }, [selectedLanguage, spec]);

  async function handleCompute() {
    if (!problemId) return;
    if (testCaseCount === 0) {
      toast.error(t("fnComputeNoCases"));
      return;
    }
    setIsComputing(true);
    try {
      const res = await apiFetch(`/api/v1/problems/${problemId}/compute-expected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({ data: {} }));
      if (!res.ok) {
        toast.error(t("fnComputeFailed"));
        return;
      }
      const data = getApiData(payload);
      const results =
        typeof data === "object" && data !== null && "results" in data && Array.isArray(data.results)
          ? (data.results as ComputedResult[])
          : [];
      onComputed(results);

      const okCount = results.filter((r) => r.ok).length;
      const failed = results.length - okCount;
      if (failed === 0) {
        toast.success(t("fnComputeSuccess", { count: okCount }));
      } else {
        toast.warning(t("fnComputePartial", { ok: okCount, total: results.length, failed }));
      }
    } catch {
      toast.error(t("fnComputeFailed"));
    } finally {
      setIsComputing(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t("fnReferenceTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("fnReferenceDescription")}</p>
      </div>

      <div className="space-y-2">
        <Label>{t("fnReferenceLanguageLabel")}</Label>
        <LanguageSelect
          ariaLabel={t("fnReferenceLanguageLabel")}
          value={selectedLanguage}
          options={languageOptions}
          disabled={disabled}
          onChange={(language) => onChange({ ...value, language })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fn-reference-code">{t("fnReferenceCodeLabel")}</Label>
        <CodeEditor
          id="fn-reference-code"
          ariaLabel={t("fnReferenceCodeLabel")}
          language={selectedLanguage || null}
          editorTheme={editorTheme}
          value={value.source}
          onValueChange={(source) => onChange({ ...value, source })}
          minHeight={220}
        />
      </div>

      <div className="space-y-2">
        <Button type="button" onClick={handleCompute} disabled={disabled || isComputing || !problemId}>
          {isComputing ? t("fnComputeRunning") : t("fnComputeExpected")}
        </Button>
        {!problemId && <p className="text-xs text-muted-foreground">{t("fnComputeSaveFirst")}</p>}
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <Label>{t("fnStubPreviewTitle")}</Label>
          <p className="text-xs text-muted-foreground">{t("fnStubPreviewHint")}</p>
        </div>
        <pre
          aria-label={t("fnStubPreviewTitle")}
          className="max-h-[260px] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre"
        >
          {stubPreview}
        </pre>
      </div>
    </div>
  );
}
