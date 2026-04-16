import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ProblemSetListItem = {
  id: string;
  href: string;
  name: string;
  description: string | null;
  creatorName: string;
  publicProblemCountLabel: string;
};

type PublicProblemSetListProps = {
  title: string;
  description: string;
  emptyLabel: string;
  openLabel: string;
  items: ProblemSetListItem[];
};

export function PublicProblemSetList({
  title,
  description,
  emptyLabel,
  openLabel,
  items,
}: PublicProblemSetListProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{emptyLabel}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{item.name}</CardTitle>
                    <CardDescription>{item.creatorName}</CardDescription>
                  </div>
                  <Badge variant="secondary">{item.publicProblemCountLabel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.description ? (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                ) : null}
                <Link href={item.href} className="text-sm font-medium text-primary hover:underline">
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
