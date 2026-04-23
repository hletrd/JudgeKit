"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch, apiFetchJson } from "@/lib/api/client";
import { formatContestTimestamp } from "@/lib/formatting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ContestClarification = {
  id: string;
  problemId: string | null;
  userId: string;
  question: string;
  answer: string | null;
  answerType: "yes" | "no" | "no_comment" | "custom" | null;
  answeredBy: string | null;
  answeredAt: string | number | Date | null;
  isPublic: boolean;
  createdAt: string | number | Date | null;
};

type ProblemOption = {
  id: string;
  title: string;
};

type ContestClarificationsProps = {
  assignmentId: string;
  currentUserId: string;
  problems: ProblemOption[];
  canManage?: boolean;
  refreshInterval?: number;
};

export function ContestClarifications({
  assignmentId,
  currentUserId,
  problems,
  canManage = false,
  refreshInterval = 30000,
}: ContestClarificationsProps) {
  const t = useTranslations("contests.clarifications");
  const locale = useLocale();
  const [clarifications, setClarifications] = useState<ContestClarification[]>([]);
  const [loading, setLoading] = useState(true);
  const [problemId, setProblemId] = useState("general");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const initialLoadDoneRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const problemLabelMap = useMemo(
    () => Object.fromEntries(problems.map((problem) => [problem.id, problem.title])),
    [problems]
  );

  const loadClarifications = useCallback(async () => {
    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { ok, data } = await apiFetchJson<{ data?: ContestClarification[] }>(
        `/api/v1/contests/${assignmentId}/clarifications`,
        { cache: "no-store", signal: controller.signal },
        { data: [] }
      );
      if (ok) {
        setClarifications(Array.isArray(data.data) ? data.data : []);
      } else if (!initialLoadDoneRef.current) {
        toast.error(t("fetchError"));
      }
    } catch (err) {
      // AbortError means the request was cancelled — not a real error
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Only show toast on the initial load — polling refreshes should fail
      // silently to avoid spamming the user with error toasts every 30 seconds.
      if (!initialLoadDoneRef.current) {
        toast.error(t("fetchError"));
      }
    } finally {
      initialLoadDoneRef.current = true;
      setLoading(false);
    }
  }, [assignmentId, t]);

  useVisibilityPolling(() => { void loadClarifications(); }, refreshInterval);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/contests/${assignmentId}/clarifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problemId === "general" ? null : problemId,
          question,
        }),
      });
      if (!response.ok) {
        throw new Error("contestClarificationCreateFailed");
      }
      toast.success(t("createSuccess"));
      setQuestion("");
      setProblemId("general");
      await loadClarifications();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnswer(id: string, answerType: "yes" | "no" | "no_comment" | "custom", answerText?: string) {
    const answer = answerText ?? answerDrafts[id] ?? "";
    try {
      const response = await apiFetch(`/api/v1/contests/${assignmentId}/clarifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer,
          answerType,
          isPublic: true,
        }),
      });
      if (!response.ok) {
        throw new Error("contestClarificationAnswerFailed");
      }
      toast.success(t("answerSuccess"));
      setAnswerDrafts((current) => ({ ...current, [id]: "" }));
      await loadClarifications();
    } catch {
      toast.error(t("saveFailed"));
    }
  }

  async function handleTogglePublic(clarification: ContestClarification) {
    try {
      const response = await apiFetch(`/api/v1/contests/${assignmentId}/clarifications/${clarification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !clarification.isPublic }),
      });
      if (!response.ok) {
        throw new Error("contestClarificationVisibilityFailed");
      }
      await loadClarifications();
    } catch {
      toast.error(t("saveFailed"));
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await apiFetch(`/api/v1/contests/${assignmentId}/clarifications/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("contestClarificationDeleteFailed");
      }
      toast.success(t("deleteSuccess"));
      await loadClarifications();
    } catch {
      toast.error(t("deleteFailed"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage ? (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border bg-background p-4">
            <div className="space-y-2">
              <Label>{t("problemLabel")}</Label>
              <Select value={problemId} onValueChange={(v) => { if (v) setProblemId(v); }} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general" label={t("generalOption")}>{t("generalOption")}</SelectItem>
                  {problems.map((problem) => (
                    <SelectItem key={problem.id} value={problem.id} label={problem.title}>
                      {problem.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-clarification-question">{t("questionLabel")}</Label>
              <Textarea
                id="contest-clarification-question"
                className="min-h-[120px]"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {t("create")}
            </Button>
          </form>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : clarifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-3">
            {clarifications.map((clarification) => (
              <div key={clarification.id} className="rounded-2xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {clarification.problemId ? problemLabelMap[clarification.problemId] ?? clarification.problemId : t("generalOption")}
                      </Badge>
                      <Badge variant={clarification.answer ? "secondary" : "outline"}>
                        {clarification.answer ? t("answered") : t("pending")}
                      </Badge>
                      {clarification.isPublic ? <Badge variant="secondary">{t("public")}</Badge> : null}
                    </div>
                    <p className="text-sm font-medium whitespace-pre-wrap">{clarification.question}</p>
                    <p className="text-xs text-muted-foreground">
                      {clarification.userId === currentUserId ? t("askedByMe") : t("askedByOther")}
                      {" · "}
                      {formatContestTimestamp(clarification.createdAt, locale) ?? "-"}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleTogglePublic(clarification)}>
                        {clarification.isPublic ? t("makePrivate") : t("makePublic")}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(clarification.id)}>
                        {t("delete")}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {clarification.answer ? (
                  <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm">
                    <p className="font-medium">{t("answerLabel")}</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{clarification.answer}</p>
                  </div>
                ) : null}

                {canManage ? (
                  <div className="mt-3 space-y-3 rounded-xl border p-3">
                    <div className="space-y-2">
                      <Label htmlFor={`clarification-answer-${clarification.id}`}>{t("answerLabel")}</Label>
                      <Textarea
                        id={`clarification-answer-${clarification.id}`}
                        className="min-h-[100px]"
                        value={answerDrafts[clarification.id] ?? clarification.answer ?? ""}
                        onChange={(event) =>
                          setAnswerDrafts((current) => ({
                            ...current,
                            [clarification.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => void handleAnswer(clarification.id, "yes", "Yes")}>
                        {t("quickYes")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void handleAnswer(clarification.id, "no", "No")}>
                        {t("quickNo")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void handleAnswer(clarification.id, "no_comment", "No comment")}>
                        {t("quickNoComment")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void handleAnswer(clarification.id, "custom")}>
                        {t("submitAnswer")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
