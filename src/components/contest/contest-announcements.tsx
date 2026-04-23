"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetch, apiFetchJson } from "@/lib/api/client";
import { formatContestTimestamp } from "@/lib/formatting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";

type ContestAnnouncement = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string | number | Date | null;
};

type ContestAnnouncementsProps = {
  assignmentId: string;
  canManage?: boolean;
  refreshInterval?: number;
};

export function ContestAnnouncements({
  assignmentId,
  canManage = false,
  refreshInterval = 30000,
}: ContestAnnouncementsProps) {
  const t = useTranslations("contests.announcements");
  const locale = useLocale();
  const [announcements, setAnnouncements] = useState<ContestAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialLoadDoneRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadAnnouncements = useCallback(async () => {
    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { ok, data } = await apiFetchJson<{ data?: ContestAnnouncement[] }>(
        `/api/v1/contests/${assignmentId}/announcements`,
        { cache: "no-store", signal: controller.signal },
        { data: [] }
      );
      if (ok) {
        setAnnouncements(Array.isArray(data.data) ? data.data : []);
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

  useVisibilityPolling(() => { void loadAnnouncements(); }, refreshInterval);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const url = editingId
        ? `/api/v1/contests/${assignmentId}/announcements/${editingId}`
        : `/api/v1/contests/${assignmentId}/announcements`;
      const response = await apiFetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, isPinned }),
      });
      if (!response.ok) {
        throw new Error("contestAnnouncementSaveFailed");
      }
      toast.success(editingId ? t("updateSuccess") : t("createSuccess"));
      setTitle("");
      setContent("");
      setIsPinned(false);
      setEditingId(null);
      await loadAnnouncements();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await apiFetch(`/api/v1/contests/${assignmentId}/announcements/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("contestAnnouncementDeleteFailed");
      }
      toast.success(t("deleteSuccess"));
      if (editingId === id) {
        setEditingId(null);
        setTitle("");
        setContent("");
        setIsPinned(false);
      }
      await loadAnnouncements();
    } catch {
      toast.error(t("deleteFailed"));
    }
  }

  async function handleTogglePinned(announcement: ContestAnnouncement) {
    try {
      const response = await apiFetch(`/api/v1/contests/${assignmentId}/announcements/${announcement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !announcement.isPinned }),
      });
      if (!response.ok) {
        throw new Error("contestAnnouncementPinFailed");
      }
      await loadAnnouncements();
    } catch {
      toast.error(t("saveFailed"));
    }
  }

  function handleEdit(announcement: ContestAnnouncement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setContent(announcement.content);
    setIsPinned(announcement.isPinned);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border bg-background p-4">
            <div className="space-y-2">
              <Label htmlFor="contest-announcement-title">{t("titleLabel")}</Label>
              <Input
                id="contest-announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-announcement-content">{t("contentLabel")}</Label>
              <Textarea
                id="contest-announcement-content"
                className="min-h-[120px]"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={isPinned} onCheckedChange={setIsPinned} disabled={submitting} />
              {t("pinned")}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting}>
                {editingId ? t("update") : t("create")}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setTitle("");
                    setContent("");
                    setIsPinned(false);
                  }}
                >
                  {t("cancelEdit")}
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-2xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{announcement.title}</h3>
                      {announcement.isPinned ? <Badge variant="secondary">{t("pinned")}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("postedAt", { value: formatContestTimestamp(announcement.createdAt, locale) ?? "-" })}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(announcement)}>
                        {t("edit")}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleTogglePinned(announcement)}>
                        {announcement.isPinned ? t("unpin") : t("pin")}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(announcement.id)}>
                        {t("delete")}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{announcement.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
