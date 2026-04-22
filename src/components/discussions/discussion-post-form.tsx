"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DiscussionPostFormProps = {
  threadId: string;
  contentLabel: string;
  submitLabel: string;
  successLabel: string;
  signInLabel: string;
  canPost: boolean;
  signInHref: string;
};

export function DiscussionPostForm({
  threadId,
  contentLabel,
  submitLabel,
  successLabel,
  signInLabel,
  canPost,
  signInHref,
}: DiscussionPostFormProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/community/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error((errorBody as { error?: string }).error || "discussionReplyCreateFailed");
      }
      setContent("");
      toast.success(successLabel);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "discussionReplyCreateFailed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canPost) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <a href={signInHref} className="font-medium text-primary hover:underline">{signInLabel}</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border bg-background p-4">
      <div className="space-y-2">
        <Label htmlFor={`discussion-reply-${threadId}`}>{contentLabel}</Label>
        <Textarea
          id={`discussion-reply-${threadId}`}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-[120px]"
          disabled={isSubmitting}
          required
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
    </form>
  );
}
