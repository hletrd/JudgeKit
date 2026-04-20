import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MyDiscussionItem = {
  id: string;
  title: string;
  authorName: string;
  replyCountLabel: string;
  authoredBadge?: string | null;
  participatedBadge?: string | null;
};

type MyDiscussionsListProps = {
  title: string;
  description: string;
  emptyLabel: string;
  openLabel: string;
  locale?: string;
  items: MyDiscussionItem[];
};

export function MyDiscussionsList({ title, description, emptyLabel, openLabel, locale, items }: MyDiscussionsListProps) {
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
                  {item.authoredBadge ? <Badge variant="secondary">{item.authoredBadge}</Badge> : null}
                  {item.participatedBadge ? <Badge variant="outline">{item.participatedBadge}</Badge> : null}
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.authorName}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{item.replyCountLabel}</span>
                <Link href={`/community/threads/${item.id}`} className="text-sm font-medium text-primary hover:underline">
                  {openLabel}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
