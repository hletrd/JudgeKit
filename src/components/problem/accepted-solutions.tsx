"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetchJson } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CodeViewer } from "@/components/code/code-viewer";
import { getLanguageDisplayLabel } from "@/lib/judge/languages";

type AcceptedSolution = {
  submissionId: string;
  userId: string | null;
  username: string;
  language: string;
  sourceCode: string;
  codeLength: number;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  submittedAt: string | number | Date | null;
  isAnonymous: boolean;
};

type AcceptedSolutionsProps = {
  problemId: string;
  languages: Array<{ language: string; displayName: string; standard: string | null }>;
};

type SortOption = "shortest" | "fastest" | "newest";

export function AcceptedSolutions({ problemId, languages }: AcceptedSolutionsProps) {
  const t = useTranslations("publicShell.practice.acceptedSolutions");
  const [sort, setSort] = useState<SortOption>("newest");
  const [language, setLanguage] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [solutions, setSolutions] = useState<AcceptedSolution[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const languageOptions = useMemo(
    () => languages.map((entry) => ({
      value: entry.language,
      label: `${entry.displayName}${entry.standard ? ` (${entry.standard})` : ""}`,
    })),
    [languages]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          sort,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (language !== "all") {
          params.set("language", language);
        }
        const { ok, data } = await apiFetchJson<{
          data?: { solutions?: AcceptedSolution[]; total?: number };
        }>(
          `/api/v1/problems/${problemId}/accepted-solutions?${params.toString()}`,
          { cache: "no-store" },
          { data: { solutions: [], total: 0 } }
        );
        if (!cancelled) {
          if (ok) {
            setSolutions(data.data?.solutions ?? []);
            setTotal(Number(data.data?.total ?? 0));
          } else {
            setSolutions([]);
            setTotal(0);
          }
        }
      } catch {
        if (!cancelled) {
          setSolutions([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [problemId, sort, language, page, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="accepted-solutions-sort">
            {t("sortLabel")}
          </label>
          <Select value={sort} onValueChange={(v) => { if (v) { setSort(v as SortOption); setPage(1); } }}>
            <SelectTrigger id="accepted-solutions-sort" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" label={t("sortNewest")}>{t("sortNewest")}</SelectItem>
              <SelectItem value="shortest" label={t("sortShortest")}>{t("sortShortest")}</SelectItem>
              <SelectItem value="fastest" label={t("sortFastest")}>{t("sortFastest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="accepted-solutions-language">
            {t("languageLabel")}
          </label>
          <Select value={language} onValueChange={(v) => { if (v) { setLanguage(v); setPage(1); } }}>
            <SelectTrigger id="accepted-solutions-language" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={t("allLanguages")}>{t("allLanguages")}</SelectItem>
              {languageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} label={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : solutions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-4">
          {solutions.map((solution) => {
            const expanded = expandedId === solution.submissionId;

            return (
              <div key={solution.submissionId} className="rounded-2xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {solution.isAnonymous ? t("anonymousUser") : solution.username}
                      </p>
                      <Badge variant="outline">{getLanguageDisplayLabel(solution.language)}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{t("codeLength", { value: solution.codeLength })}</span>
                      <span>{t("executionTime", { value: solution.executionTimeMs ?? "-" })}</span>
                      <span>{t("memoryUsage", { value: solution.memoryUsedKb ?? "-" })}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedId(expanded ? null : solution.submissionId)}
                  >
                    {expanded ? t("collapse") : t("expand")}
                  </Button>
                </div>
                {expanded ? (
                  <div className="mt-4">
                    <CodeViewer language={solution.language} minHeight={220} value={solution.sourceCode} />
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("pagination", { page, totalPages })}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
                {t("previous")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
                {t("next")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
