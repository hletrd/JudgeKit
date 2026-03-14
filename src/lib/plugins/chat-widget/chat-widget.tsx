"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageCircle, X, Minus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PluginWidgetProps } from "@/lib/plugins/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatWidget(_props: PluginWidgetProps) {
  const t = useTranslations("plugins.chatWidget");
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [aiDisabled, setAiDisabled] = useState<string | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Detect problem context from URL
  const urlProblemContext = (() => {
    const match = pathname.match(/\/dashboard\/problems\/([^/]+)$/);
    if (!match) return null;
    const problemId = match[1];
    const assignmentId = searchParams?.get("assignmentId") ?? undefined;
    return { problemId, assignmentId };
  })();

  // Event-sourced context (from submission error events)
  const [eventContext, setEventContext] = useState<{ problemId: string; assignmentId?: string; submissionId?: string } | null>(null);

  // Use URL context first, fall back to event context
  const problemContext = urlProblemContext ?? eventContext;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // Auto-open on submission errors and capture problem context
  useEffect(() => {
    function handleSubmissionError(e: CustomEvent) {
      if (e.detail?.hasError) {
        if (e.detail.problemId) {
          setEventContext({
            problemId: e.detail.problemId,
            assignmentId: e.detail.assignmentId,
            submissionId: e.detail.submissionId,
          });
        }
        setIsOpen(true);
        setIsMinimized(false);
      }
    }
    window.addEventListener("oj:submission-error", handleSubmissionError as EventListener);
    return () => window.removeEventListener("oj:submission-error", handleSubmissionError as EventListener);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    const userMessage: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Read editor code from global bridge (set by problem submission form)
      const editorState = typeof window !== "undefined" ? (window as any).__ojEditorContent : null;

      const response = await fetch("/api/v1/plugins/chat-widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context: problemContext ? {
            problemId: problemContext.problemId,
            assignmentId: problemContext.assignmentId,
            editorCode: editorState?.code,
            editorLanguage: editorState?.language,
          } : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setError(t("errorRateLimit"));
        } else if (data.error === "notConfigured") {
          setError(t("errorNotConfigured"));
        } else if (data.error === "aiDisabled" || data.error === "aiDisabledForProblem") {
          setAiDisabled(data.error);
          setError(t(data.error === "aiDisabledForProblem" ? "aiDisabledForProblem" : "aiDisabledGlobally"));
        } else {
          setError(t("errorGeneric"));
        }
        // Remove empty assistant message
        setMessages((prev) => prev.slice(0, -1));
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        setError(t("errorGeneric"));
        setMessages((prev) => prev.slice(0, -1));
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + text };
          }
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
      } else {
        setError(t("errorGeneric"));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, messages, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Chat"
      >
        <MessageCircle className="h-6 w-6" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
            {messages.filter((m) => m.role === "assistant").length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden border-border/60 bg-background shadow-2xl sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-xl sm:border">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
        <span className="text-sm font-semibold">{t("name")}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="rounded p-1 hover:bg-primary-foreground/20"
            aria-label={t("minimize")}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              abortControllerRef.current?.abort();
            }}
            className="rounded p-1 hover:bg-primary-foreground/20"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            {t("placeholder")}
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                  : "bg-muted text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-code:text-xs prose-pre:text-xs"
              }`}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
              {msg.role === "assistant" && !msg.content && isStreaming && i === messages.length - 1 && (
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              )}
            </div>
          </div>
        ))}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isStreaming}
            aria-label={t("send")}
            className="shrink-0 self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
