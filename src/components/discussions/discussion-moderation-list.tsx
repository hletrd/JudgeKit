import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DiscussionThreadModerationControls } from "@/components/discussions/discussion-thread-moderation-controls";

type ModerationItem = {
  id: string;
  title: string;
  authorName: string;
  scopeLabel: string;
  statusLabels: string[];
  metadataLabel: string;
  openHref: string;
  openLabel: string;
  moderation: {
    isLocked: boolean;
    isPinned: boolean;
    lockLabel: string;
    unlockLabel: string;
    pinLabel: string;
    unpinLabel: string;
    deleteLabel: string;
    successLabel: string;
    deleteSuccessLabel: string;
  };
};

type DiscussionModerationListProps = {
  title: string;
  description: string;
  emptyLabel: string;
  locale?: string;
  items: ModerationItem[];
};

export function DiscussionModerationList({ title, description, emptyLabel, locale, items }: DiscussionModerationListProps) {
  const headingTracking = locale && locale !== "ko" ? " tracking-tight" : "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-semibold${headingTracking}`}>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{emptyLabel}</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{item.scopeLabel}</Badge>
                  {item.statusLabels.map((label) => (
                    <Badge key={label} variant="outline">{label}</Badge>
                  ))}
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.authorName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                  <span>{item.metadataLabel}</span>
                  <Link href={item.openHref} className="font-medium text-primary hover:underline">
                    {item.openLabel}
                  </Link>
                </div>
                <DiscussionThreadModerationControls
                  threadId={item.id}
                  isLocked={item.moderation.isLocked}
                  isPinned={item.moderation.isPinned}
                  lockLabel={item.moderation.lockLabel}
                  unlockLabel={item.moderation.unlockLabel}
                  pinLabel={item.moderation.pinLabel}
                  unpinLabel={item.moderation.unpinLabel}
                  deleteLabel={item.moderation.deleteLabel}
                  successLabel={item.moderation.successLabel}
                  deleteSuccessLabel={item.moderation.deleteSuccessLabel}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
