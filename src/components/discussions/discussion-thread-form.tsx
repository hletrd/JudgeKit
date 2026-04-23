"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DiscussionThreadFormProps = {
  scopeType: "general" | "problem" | "editorial" | "solution";
  problemId?: string;
  titleLabel: string;
  contentLabel: string;
  submitLabel: string;
  successLabel: string;
  errorLabel: string;
  signInLabel: string;
  canPost: boolean;
  signInHref: string;
};

export function DiscussionThreadForm({
  scopeType,
  problemId,
  titleLabel,
  contentLabel,
  submitLabel,
  successLabel,
  errorLabel,
  signInLabel,
  canPost,
  signInHref,
}: DiscussionThreadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/v1/community/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, problemId: problemId ?? null, title, content }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error("Discussion thread creation failed:", (errorBody as { error?: string }).error);
        throw new Error(errorLabel);
      }
      setTitle("");
      setContent("");
      toast.success(successLabel);
      router.refresh();
    } catch (error) {
      console.error("Discussion thread creation failed:", error);
      toast.error(errorLabel);
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
        <Label htmlFor={`discussion-thread-title-${scopeType}`}>{titleLabel}</Label>
        <Input
          id={`discussion-thread-title-${scopeType}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isSubmitting}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`discussion-thread-content-${scopeType}`}>{contentLabel}</Label>
        <Textarea
          id={`discussion-thread-content-${scopeType}`}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-[140px]"
          disabled={isSubmitting}
          required
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
    </form>
  );
}
