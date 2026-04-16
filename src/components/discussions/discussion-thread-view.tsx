import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReactNode } from "react";

type PostView = {
  id: string;
  content: string;
  authorName: string;
  actions?: ReactNode;
};

type DiscussionThreadViewProps = {
  title: string;
  content: string;
  authorName: string;
  scopeLabel: string;
  repliesTitle: string;
  noRepliesLabel: string;
  actions?: ReactNode;
  posts: PostView[];
};

export function DiscussionThreadView({ title, content, authorName, scopeLabel, repliesTitle, noRepliesLabel, actions, posts }: DiscussionThreadViewProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardDescription>{scopeLabel}</CardDescription>
            {actions}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{authorName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{content}</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">{repliesTitle}</h2>
        {posts.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">{noRepliesLabel}</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <CardDescription>{post.authorName}</CardDescription>
                    {post.actions}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{post.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
