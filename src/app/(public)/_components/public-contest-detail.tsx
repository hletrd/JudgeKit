import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PublicContestDetailProps = {
  backHref: string;
  backLabel: string;
  title: string;
  description: string | null;
  groupLabel: string;
  statusLabel: string;
  modeLabel: string;
  scoringLabel: string;
  startsAtLabel: string;
  deadlineLabel: string;
  problemCountLabel: string;
  publicProblemCountLabel: string;
  publicProblemsTitle: string;
  noPublicProblemsLabel: string;
  problemTitleLabel: string;
  difficultyLabel: string;
  solverCountLabel: string;
  successRateLabel: string;
  actionLabel: string;
  publicProblems: Array<{
    id: string;
    title: string;
    href: string;
    difficultyLabel: string | null;
    solverCount: number | null;
    successRateLabel: string | null;
  }>;
  finalRankingsTitle?: string | null;
  noFinalRankingsLabel?: string | null;
  rankLabel?: string | null;
  nameLabel?: string | null;
  totalScoreLabel?: string | null;
  penaltyLabel?: string | null;
  finalRankings?: Array<{
    userId: string;
    name: string;
    rank: number;
    totalScoreLabel: string;
    penaltyLabel: string | null;
  }>;
  signInHref: string;
  signInLabel: string;
  overviewLabel: string;
  dashboardHref: string;
  dashboardLabel: string;
};

export function PublicContestDetail({
  backHref,
  backLabel,
  title,
  description,
  groupLabel,
  statusLabel,
  modeLabel,
  scoringLabel,
  startsAtLabel,
  deadlineLabel,
  problemCountLabel,
  publicProblemCountLabel,
  publicProblemsTitle,
  noPublicProblemsLabel,
  problemTitleLabel,
  difficultyLabel,
  solverCountLabel,
  successRateLabel,
  actionLabel,
  publicProblems,
  finalRankingsTitle = null,
  noFinalRankingsLabel = null,
  rankLabel = null,
  nameLabel = null,
  totalScoreLabel = null,
  penaltyLabel = null,
  finalRankings = [],
  signInHref,
  signInLabel,
  overviewLabel,
  dashboardHref,
  dashboardLabel,
}: PublicContestDetailProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div>
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{statusLabel}</Badge>
                <Badge variant="secondary">{modeLabel}</Badge>
                <Badge variant="secondary">{scoringLabel}</Badge>
              </div>
              <h1 className="text-3xl font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground">{groupLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={dashboardHref}>
                <Button variant="outline">{dashboardLabel}</Button>
              </Link>
              <Link href={signInHref}>
                <Button>{signInLabel}</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{overviewLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{startsAtLabel}</Badge>
            <Badge variant="outline">{deadlineLabel}</Badge>
            <Badge variant="outline">{problemCountLabel}</Badge>
            <Badge variant="outline">{publicProblemCountLabel}</Badge>
          </div>
          {description ? (
            <p className="description-copy text-sm leading-7 text-muted-foreground">{description}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{publicProblemsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {publicProblems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noPublicProblemsLabel}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{problemTitleLabel}</TableHead>
                  <TableHead className="w-28 text-center">{difficultyLabel}</TableHead>
                  <TableHead className="w-24 text-center">{solverCountLabel}</TableHead>
                  <TableHead className="w-28 text-center">{successRateLabel}</TableHead>
                  <TableHead className="w-32">{actionLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publicProblems.map((problem) => (
                  <TableRow key={problem.id}>
                    <TableCell className="font-medium">
                      <Link href={problem.href} className="hover:underline">
                        {problem.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {problem.difficultyLabel ?? "-"}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {problem.solverCount ?? "-"}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {problem.successRateLabel ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Link href={problem.href}>
                        <Button variant="outline" size="sm">
                          {actionLabel}
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {finalRankingsTitle ? (
        <Card>
          <CardHeader>
            <CardTitle>{finalRankingsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {finalRankings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{noFinalRankingsLabel}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">{rankLabel}</TableHead>
                    <TableHead>{nameLabel}</TableHead>
                    <TableHead className="w-28 text-center">{totalScoreLabel}</TableHead>
                    {penaltyLabel ? <TableHead className="w-28 text-center">{penaltyLabel}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finalRankings.map((entry) => (
                    <TableRow key={entry.userId}>
                      <TableCell className="text-center font-medium">{entry.rank}</TableCell>
                      <TableCell>{entry.name}</TableCell>
                      <TableCell className="text-center">{entry.totalScoreLabel}</TableCell>
                      {penaltyLabel ? (
                        <TableCell className="text-center">{entry.penaltyLabel ?? "-"}</TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
