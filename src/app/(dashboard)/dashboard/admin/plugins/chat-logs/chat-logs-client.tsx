"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AssistantMarkdown } from "@/components/assistant-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import { ArrowLeft, MessageCircle, User } from "lucide-react";

interface ChatSession {
  sessionId: string;
  userId: string;
  problemId: string | null;
  provider: string | null;
  model: string | null;
  messageCount: number;
  firstMessage: string;
  startedAt: string;
  lastMessageAt: string;
  userName: string | null;
  username: string | null;
}

interface ChatMessage {
  id: string;
  userId: string;
  sessionId: string;
  role: string;
  content: string;
  problemId: string | null;
  model: string | null;
  provider: string | null;
  createdAt: string;
  user?: { id: string; name: string; username: string } | null;
}

export function ChatLogsClient() {
  const t = useTranslations("plugins.chatWidget");
  const tCommon = useTranslations("common");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchSessions = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/chat-logs?page=${p}`);
      const data = await res.json();
      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/chat-logs?sessionId=${sessionId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      setSelectedSession(sessionId);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions(1);
  }, [fetchSessions]);

  if (selectedSession) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedSession(null); setMessages([]); }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon("back")}
        </Button>

        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs opacity-70">
                  {msg.role === "user" ? (
                    <span><User className="inline h-3 w-3" /> {msg.user?.name ?? msg.user?.username ?? "User"}</span>
                  ) : (
                    <span><MessageCircle className="inline h-3 w-3" /> {t("name")}</span>
                  )}
                  {msg.createdAt && (
                    <span>{new Date(msg.createdAt).toLocaleString()}</span>
                  )}
                </div>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-1">
                    <AssistantMarkdown content={msg.content} />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && !loading && (
            <p className="text-center text-sm text-muted-foreground">{t("noMessages")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <Card
          key={s.sessionId}
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => void fetchMessages(s.sessionId)}
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.userName ?? s.username ?? "Unknown"}</span>
                  {s.username && <span className="text-xs text-muted-foreground">@{s.username}</span>}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {s.firstMessage?.slice(0, 100)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {s.provider && <Badge variant="outline">{s.provider}</Badge>}
                {s.model && <Badge variant="secondary">{s.model}</Badge>}
                <Badge variant="outline">{s.messageCount} messages</Badge>
                <span>{s.lastMessageAt ? new Date(Number(s.lastMessageAt) * 1000).toLocaleString() : ""}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {sessions.length === 0 && !loading && (
        <p className="text-center text-sm text-muted-foreground">{t("noLogs")}</p>
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => void fetchSessions(page - 1)}>
            {tCommon("previous")}
          </Button>
          <Button variant="outline" disabled={page * 50 >= total} onClick={() => void fetchSessions(page + 1)}>
            {tCommon("next")}
          </Button>
        </div>
      )}
    </div>
  );
}
