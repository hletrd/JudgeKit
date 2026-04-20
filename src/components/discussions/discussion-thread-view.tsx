import { AssistantMarkdown } from "@/components/assistant-markdown";
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
  locale?: string;
  posts: PostView[];
};

export function DiscussionThreadView({ title, content, authorName, scopeLabel, repliesTitle, noRepliesLabel, actions, locale, posts }: DiscussionThreadViewProps) {
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
          <AssistantMarkdown className="text-sm leading-7 text-foreground/90" content={content} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className={`text-2xl font-semibold${locale && locale !== "ko" ? " tracking-tight" : ""}`}>{repliesTitle}</h2>
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
                  <AssistantMarkdown className="text-sm leading-7 text-foreground/90" content={post.content} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
