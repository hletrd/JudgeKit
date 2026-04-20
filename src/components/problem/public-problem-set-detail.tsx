import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProblemSetProblem = {
  id: string;
  href: string;
  title: string;
  difficultyLabel: string | null;
  solvedByViewer: boolean;
};

type PublicProblemSetDetailProps = {
  backHref: string;
  backLabel: string;
  title: string;
  description: string | null;
  creatorLabel: string;
  publicProblemCountLabel: string;
  problemsTitle: string;
  noProblemsLabel: string;
  solveNextHref?: string | null;
  solveNextLabel: string;
  solvedLabel: string;
  openLabel: string;
  locale: string;
  problems: ProblemSetProblem[];
};

export function PublicProblemSetDetail({
  backHref,
  backLabel,
  title,
  description,
  creatorLabel,
  publicProblemCountLabel,
  problemsTitle,
  noProblemsLabel,
  solveNextHref = null,
  solveNextLabel,
  solvedLabel,
  openLabel,
  locale,
  problems,
}: PublicProblemSetDetailProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""}`}>{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{creatorLabel}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">{publicProblemCountLabel}</Badge>
            {solveNextHref ? (
              <Link href={solveNextHref}>
                <Button size="sm">{solveNextLabel}</Button>
              </Link>
            ) : null}
          </div>
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{problemsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noProblemsLabel}</p>
          ) : (
            <div className="space-y-3">
              {problems.map((problem) => (
                <div key={problem.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="space-y-1">
                    <Link href={problem.href} className="font-medium hover:text-primary hover:underline">
                      {problem.title}
                    </Link>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {problem.difficultyLabel ? <span>{problem.difficultyLabel}</span> : null}
                      {problem.solvedByViewer ? <Badge variant="outline">{solvedLabel}</Badge> : null}
                    </div>
                  </div>
                  <Link href={problem.href}>
                    <Button variant="outline" size="sm">
                      {openLabel}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
