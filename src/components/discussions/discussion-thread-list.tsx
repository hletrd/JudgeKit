import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

type ThreadListItem = {
  id: string;
  title: string;
  content: string;
  authorName: string;
  replyCountLabel: string;
  locked: boolean;
  pinned: boolean;
  href: string;
  actions?: ReactNode;
};

type DiscussionThreadListProps = {
  title: string;
  description?: string;
  emptyLabel: string;
  openLabel: string;
  pinnedLabel: string;
  lockedLabel: string;
  threads: ThreadListItem[];
  titleAs?: "h1" | "h2";
  locale?: string;
};

function summarize(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function DiscussionThreadList({
  title,
  description,
  emptyLabel,
  openLabel,
  pinnedLabel,
  lockedLabel,
  threads,
  titleAs = "h2",
  locale,
}: DiscussionThreadListProps) {
  const TitleTag = titleAs;
  const headingTracking = locale && locale !== "ko" ? " tracking-tight" : "";

  return (
    <div className="space-y-4">
      <div>
        <TitleTag className={`text-2xl font-semibold${headingTracking}`}>{title}</TitleTag>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {threads.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">{emptyLabel}</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {threads.map((thread) => (
            <Card key={thread.id}>
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  {thread.pinned ? <Badge variant="secondary">{pinnedLabel}</Badge> : null}
                  {thread.locked ? <Badge variant="outline">{lockedLabel}</Badge> : null}
                </div>
                <CardTitle>{thread.title}</CardTitle>
                <CardDescription>{thread.authorName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{summarize(thread.content)}</p>
                <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>{thread.replyCountLabel}</span>
                    {thread.actions}
                  </div>
                  <Link href={thread.href} className="font-medium text-primary hover:underline">
                    {openLabel}
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
