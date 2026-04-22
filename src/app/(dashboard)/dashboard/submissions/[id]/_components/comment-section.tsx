"use client";

import { useCallback, useEffect, useState } from "react";
import { AssistantMarkdown } from "@/components/assistant-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { formatRelativeTimeFromNow } from "@/lib/datetime";
import { useTranslations, useLocale } from "next-intl";

type CommentView = {
  id: string;
  content: string;
  lineNumber: number | null;
  createdAt: string | number | null;
  author: {
    name: string | null;
    role: string;
  } | null;
};

type CommentSectionProps = {
  submissionId: string;
  canComment: boolean;
  targetLine?: number | null;
  onClearTargetLine?: () => void;
};

export function CommentSection({ submissionId, canComment, targetLine = null, onClearTargetLine }: CommentSectionProps) {
  const tCommon = useTranslations("common");
  const tComments = useTranslations("comments");
  const locale = useLocale();

  const [comments, setComments] = useState<CommentView[]>([]);
  const [commentContent, setCommentContent] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/v1/submissions/${submissionId}/comments`);
      if (response.ok) {
        const payload = (await response.json()) as { data?: CommentView[] };
        if (payload.data) {
          setComments(payload.data);
        }
      } else {
        toast.error(tComments("loadError"));
      }
    } catch {
      toast.error(tComments("loadError"));
    }
  }, [submissionId, tComments]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  async function handleCommentSubmit() {
    if (!commentContent.trim() || commentSubmitting) return;

    setCommentSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/submissions/${submissionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent.trim(), lineNumber: targetLine }),
      });

      if (response.ok) {
        setCommentContent("");
        onClearTargetLine?.();
        void fetchComments();
      } else {
        const errorBody = await response.json().catch(() => ({}));
        toast.error((errorBody as { error?: string }).error ?? tComments("submitError"));
      }
    } catch {
      toast.error(tComments("submitError"));
    } finally {
      setCommentSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tComments("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">{tComments("noComments")}</p>
        )}

        {comments.map((comment) => (
          <div key={comment.id} className="rounded-md border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              {comment.lineNumber != null && (
                <Badge variant="outline" className="text-xs font-mono">
                  L{comment.lineNumber}
                </Badge>
              )}
              <span className="font-medium">
                {comment.author
                  ? tComments("by", { author: comment.author.name ?? "-" })
                  : tComments("by", { author: tComments("aiAssistant") })}
              </span>
              {comment.author?.role ? (
                <Badge variant="secondary" className="text-xs">
                  {tCommon(`roles.${comment.author.role}` as Parameters<typeof tCommon>[0]) ?? comment.author.role}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                  AI
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">
                {comment.createdAt != null ? formatRelativeTimeFromNow(comment.createdAt, locale) : ""}
              </span>
            </div>
            {!comment.author ? (
              <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:overflow-x-auto prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-code:text-xs prose-pre:text-xs prose-code:break-all">
                <AssistantMarkdown content={comment.content} />
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
            )}
          </div>
        ))}

        {canComment && (
          <div className="space-y-2 pt-2">
            {targetLine != null && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono">L{targetLine}</Badge>
                <span className="text-muted-foreground">{tComments("commentingOnLine")}</span>
                <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={onClearTargetLine}>
                  {tCommon("clear")}
                </Button>
              </div>
            )}
            <Textarea
              placeholder={targetLine != null ? tComments("linePlaceholder", { line: targetLine }) : tComments("placeholder")}
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <Button
              onClick={() => void handleCommentSubmit()}
              disabled={commentSubmitting || !commentContent.trim()}
              size="sm"
            >
              {tComments("submit")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
