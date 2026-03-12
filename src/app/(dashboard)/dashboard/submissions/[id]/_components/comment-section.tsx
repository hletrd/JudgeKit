"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { formatRelativeTimeFromNow } from "@/lib/datetime";
import { useTranslations } from "next-intl";

type CommentView = {
  id: string;
  content: string;
  createdAt: string | number | null;
  author: {
    name: string | null;
    role: string;
  } | null;
};

type CommentSectionProps = {
  submissionId: string;
  canComment: boolean;
};

export function CommentSection({ submissionId, canComment }: CommentSectionProps) {
  const tCommon = useTranslations("common");
  const tComments = useTranslations("comments");

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
        body: JSON.stringify({ content: commentContent.trim() }),
      });

      if (response.ok) {
        setCommentContent("");
        void fetchComments();
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
              <span className="font-medium">
                {tComments("by", { author: comment.author?.name ?? "-" })}
              </span>
              {comment.author?.role && (
                <Badge variant="secondary" className="text-xs">
                  {tCommon(`roles.${comment.author.role}` as Parameters<typeof tCommon>[0]) ?? comment.author.role}
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">
                {comment.createdAt != null ? formatRelativeTimeFromNow(comment.createdAt) : ""}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
          </div>
        ))}

        {canComment && (
          <div className="space-y-2 pt-2">
            <Textarea
              placeholder={tComments("placeholder")}
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
