import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProblemDescription } from "@/components/problem-description";
import { TierBadge } from "@/components/tier-badge";
import type { ProblemTierInfo } from "@/lib/problem-tiers";

type PublicProblemDetailProps = {
  backHref: string;
  backLabel: string;
  title: string;
  description: string | null;
  authorLabel: string;
  tags: Array<{ name: string; color: string | null }>;
  timeLimitLabel: string;
  memoryLimitLabel: string;
  difficultyLabel?: string | null;
  difficultyTier?: ProblemTierInfo | null;
  playgroundHref: string;
  playgroundLabel: string;
  signInHref: string;
  signInLabel: string;
};

export function PublicProblemDetail({
  backHref,
  backLabel,
  title,
  description,
  authorLabel,
  tags,
  timeLimitLabel,
  memoryLimitLabel,
  difficultyLabel,
  difficultyTier = null,
  playgroundHref,
  playgroundLabel,
  signInHref,
  signInLabel,
}: PublicProblemDetailProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={backHref}
                className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
              >
                <ArrowLeft className="size-4" />
                {backLabel}
              </Link>
              <h1 className="text-3xl font-bold">{title}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={playgroundHref}>
                <Button variant="outline">{playgroundLabel}</Button>
              </Link>
              <Link href={signInHref}>
                <Button>{signInLabel}</Button>
              </Link>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{timeLimitLabel}</Badge>
            <Badge variant="outline">{memoryLimitLabel}</Badge>
            {difficultyTier ? <TierBadge tier={difficultyTier.tier} label={difficultyTier.label} /> : null}
            {difficultyLabel ? <Badge variant="outline">{difficultyLabel}</Badge> : null}
            <Badge variant="secondary">{authorLabel}</Badge>
            {tags.map((tag) => (
              <Badge key={tag.name} variant="secondary">{tag.name}</Badge>
            ))}
          </div>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ProblemDescription description={description ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
