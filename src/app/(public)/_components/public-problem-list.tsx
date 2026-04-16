import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TierBadge } from "@/components/tier-badge";
import type { ProblemTierInfo } from "@/lib/problem-tiers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CircleCheck, CircleAlert, CircleX, CheckCircle2, XCircle, CircleDashed } from "lucide-react";

type ProblemProgress = "solved" | "attempted" | "untried";

type PublicProblemListItem = {
  id: string;
  href: string;
  sequenceNumber: number | null;
  title: string;
  difficultyLabel: string | null;
  difficultyTier: ProblemTierInfo | null;
  searchMatchLabels?: string[];
  tags: Array<{ name: string; color: string | null; href: string }>;
  solverCount: number;
  submissionCount: number;
  successRate: number | null;
  progress: ProblemProgress | null;
  createdAt: string | null;
};

type PublicProblemListProps = {
  title: string;
  description: string;
  noProblemsLabel: string;
  numberLabel: string;
  problemTitleLabel: string;
  difficultyLabel: string;
  tagLabel: string;
  solverCountLabel: string;
  successRateLabel: string;
  createdAtLabel: string;
  progressLabel: string;
  progressLabels: { solved: string; attempted: string; untried: string };
  problems: PublicProblemListItem[];
};

function renderProgress(
  progress: ProblemProgress,
  labels: { solved: string; attempted: string; untried: string },
) {
  if (progress === "solved") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        <span className="text-xs">{labels.solved}</span>
      </span>
    );
  }
  if (progress === "attempted") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <XCircle className="size-4" aria-hidden="true" />
        <span className="text-xs">{labels.attempted}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <CircleDashed className="size-4" aria-hidden="true" />
      <span className="text-xs">{labels.untried}</span>
    </span>
  );
}

export function PublicProblemList({
  title,
  description,
  noProblemsLabel,
  numberLabel,
  problemTitleLabel,
  difficultyLabel,
  tagLabel,
  solverCountLabel,
  successRateLabel,
  createdAtLabel,
  progressLabel,
  progressLabels,
  problems,
}: PublicProblemListProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {problems.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{noProblemsLabel}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">{numberLabel}</TableHead>
                    <TableHead>{problemTitleLabel}</TableHead>
                    <TableHead className="w-20 text-center">{solverCountLabel}</TableHead>
                    <TableHead className="w-24 text-center">{successRateLabel}</TableHead>
                    <TableHead className="w-28 text-center">{difficultyLabel}</TableHead>
                    <TableHead className="w-36">{tagLabel}</TableHead>
                    <TableHead className="w-20 text-center">{progressLabel}</TableHead>
                    <TableHead className="w-24 text-center">{createdAtLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {problems.map((problem, index) => (
                    <TableRow key={problem.id}>
                      <TableCell className="text-center font-mono text-sm text-muted-foreground">
                        {problem.sequenceNumber ?? index + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={problem.href}
                          className="text-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          {problem.title}
                        </Link>
                        {problem.searchMatchLabels && problem.searchMatchLabels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {problem.searchMatchLabels.map((label) => (
                              <Badge key={label} variant="outline" className="text-[11px] font-normal text-muted-foreground">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {problem.solverCount > 0 ? problem.solverCount : "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {problem.successRate != null ? (
                          <span className={
                            problem.successRate >= 60
                              ? "inline-flex items-center gap-1 text-green-600 dark:text-green-400"
                              : problem.successRate >= 30
                                ? "inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400"
                                : "inline-flex items-center gap-1 text-red-500 dark:text-red-400"
                          }>
                            {problem.successRate >= 60
                              ? <CircleCheck className="size-3.5" aria-hidden="true" />
                              : problem.successRate >= 30
                                ? <CircleAlert className="size-3.5" aria-hidden="true" />
                                : <CircleX className="size-3.5" aria-hidden="true" />
                            }
                            {problem.successRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {problem.difficultyTier ? (
                          <div className="flex flex-col items-center gap-1">
                            <TierBadge tier={problem.difficultyTier.tier} label={problem.difficultyTier.label} />
                            {problem.difficultyLabel ? <span>{problem.difficultyLabel}</span> : null}
                          </div>
                        ) : (
                          problem.difficultyLabel ?? "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {problem.tags.map((tag) => (
                            <Link key={tag.name} href={tag.href}>
                              <Badge
                                variant="secondary"
                                className="text-xs cursor-pointer hover:bg-accent"
                              >
                                {tag.name}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {problem.progress != null
                          ? renderProgress(problem.progress, progressLabels)
                          : <span className="text-muted-foreground text-xs">-</span>}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {problem.createdAt ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
