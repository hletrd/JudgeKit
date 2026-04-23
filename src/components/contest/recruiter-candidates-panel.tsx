"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, ArrowUpDown } from "lucide-react";
import { apiFetchJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CandidateEntry = {
  rank: number;
  name: string;
  username: string;
  className: string | null;
  totalScore: number;
  problemsSolved: number;
  problems: Array<{
    title: string;
    score: number;
    attempts: number;
    solved: boolean;
  }>;
  antiCheatEventCount: number;
  ipAddresses: string;
};

type SortKey = "rank" | "totalScore" | "name" | "antiCheatEventCount";

export function RecruiterCandidatesPanel({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations("contests.recruiter");
  const [candidates, setCandidates] = useState<CandidateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const fetchCandidates = useCallback(async () => {
    try {
      const { ok, data } = await apiFetchJson<CandidateEntry[]>(
        `/api/v1/contests/${assignmentId}/export?format=json`,
        undefined,
        []
      );
      if (ok) {
        setCandidates(Array.isArray(data) ? data : []);
      } else {
        toast.error(t("fetchError"));
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, t]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === "rank");
    }
  }

  const filtered = candidates.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.username.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === "name") return mul * a.name.localeCompare(b.name);
    return mul * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
  });

  function handleCsvDownload() {
    window.open(`/api/v1/contests/${assignmentId}/export?format=csv&download=1`, "_blank");
  }

  function handleAnonymizedCsvDownload() {
    window.open(
      `/api/v1/contests/${assignmentId}/export?format=csv&anonymized=1&download=1`,
      "_blank"
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("title")}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary">{t("candidateCount", { count: candidates.length })}</Badge>
            <Button variant="outline" size="sm" onClick={handleAnonymizedCsvDownload}>
              <Download className="mr-1 size-4" />
              {t("exportAnonymizedCsv")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCsvDownload}>
              <Download className="mr-1 size-4" />
              {t("exportCsv")}
            </Button>
          </div>
        </div>
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 max-w-sm"
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => handleSort("rank")}>
                  # <ArrowUpDown className="ml-1 inline size-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => handleSort("name")}>
                  {t("name")} <ArrowUpDown className="ml-1 inline size-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => handleSort("totalScore")}>
                  {t("score")} <ArrowUpDown className="ml-1 inline size-3" />
                </Button>
              </TableHead>
              <TableHead>{t("solved")}</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => handleSort("antiCheatEventCount")}>
                  {t("flags")} <ArrowUpDown className="ml-1 inline size-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("noCandidates")}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((c) => (
                <TableRow key={c.username}>
                  <TableCell className="font-mono text-sm">{c.rank}</TableCell>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.username}</div>
                  </TableCell>
                  <TableCell className="font-semibold">{c.totalScore}</TableCell>
                  <TableCell>
                    {c.problemsSolved}/{c.problems.length}
                  </TableCell>
                  <TableCell>
                    {c.antiCheatEventCount > 0 ? (
                      <Badge variant="destructive">{c.antiCheatEventCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
