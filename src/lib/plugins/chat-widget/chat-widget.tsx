"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageCircle, X, Minus, Send } from "lucide-react";
import { AssistantMarkdown } from "@/components/assistant-markdown";
import { useEditorContent } from "@/contexts/editor-content-context";

interface Message {
  role: "user" | "assistant";
  content: string;
  displayContent?: string; // shown in UI instead of content (for auto-prompts)
}

export default function ChatWidget() {
  const t = useTranslations("plugins.chatWidget");
  const { content: editorContent } = useEditorContent();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

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

  // Hide AI assistant entirely in contest/assignment context
  const isInContestContext = Boolean(
    urlProblemContext?.assignmentId ||
    pathname.includes("/contests/") ||
    searchParams?.get("assignmentId")
  );

  // Reset chat when navigating to a different page
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      // Abort any in-progress request
      abortControllerRef.current?.abort();
      // Reset chat state
      setMessages([]);
      setError(null);
      setIsStreaming(false);
      setSessionId(null);
      setEventContext(null);
      setPendingAutoAnalysis(null);
      autoAnalysisTriggered.current = false;
    }
  }, [pathname]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: isStreaming ? "auto" : "smooth",
    });
  }, [isStreaming]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // Track pending auto-analysis request
  const [pendingAutoAnalysis, setPendingAutoAnalysis] = useState<{ status: string; submissionId: string } | null>(null);

  // Set context on submission results for proactive analysis when manually opened
  useEffect(() => {
    function handleSubmissionResult(e: CustomEvent) {
      if (e.detail?.problemId) {
        setEventContext({
          problemId: e.detail.problemId,
          assignmentId: e.detail.assignmentId,
          submissionId: e.detail.submissionId,
        });
        setPendingAutoAnalysis({
          status: e.detail.status,
          submissionId: e.detail.submissionId,
        });
        // Context is set so the widget can use it when manually opened
      }
    }
    window.addEventListener("oj:submission-result", handleSubmissionResult as EventListener);
    return () => window.removeEventListener("oj:submission-result", handleSubmissionResult as EventListener);
  }, []);

  // Auto-send proactive analysis when triggered by submission result
  const autoAnalysisTriggered = useRef(false);
  useEffect(() => {
    if (pendingAutoAnalysis && !isStreaming && problemContext && !autoAnalysisTriggered.current) {
      autoAnalysisTriggered.current = true;
      const isError = pendingAutoAnalysis.status !== "accepted";
      const apiPrompt = isError
        ? `My submission ID is "${pendingAutoAnalysis.submissionId}" and it got "${pendingAutoAnalysis.status}". Use get_submission_detail with this submission ID to fetch my source code and error details, then analyze the issue and help me fix it.`
        : `My submission ID is "${pendingAutoAnalysis.submissionId}" and it was accepted. Use get_submission_detail with this submission ID to fetch my source code, then review it for improvements, edge cases, or better practices.`;
      const displayText = isError
        ? t("autoAnalysisError")
        : t("autoAnalysisReview");
      setPendingAutoAnalysis(null);
      void sendMessage(apiPrompt, displayText, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoAnalysis, isStreaming, problemContext]);

  const sendMessage = useCallback(async (text: string, displayText?: string, skipLog?: boolean) => {
    if (!text || isStreaming) return;

    setError(null);
    const userMessage: Message = { role: "user", content: text, displayContent: displayText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Only send the last 20 messages to the API to limit token usage
    const recentMessages = newMessages.slice(-20);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("/api/v1/plugins/chat-widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          messages: recentMessages.map((m) => ({ role: m.role, content: m.content })),
          context: problemContext ? {
            problemId: problemContext.problemId,
            assignmentId: problemContext.assignmentId,
            editorCode: editorContent?.code,
            editorLanguage: editorContent?.language,
            sessionId: sessionId ?? undefined,
            skipLog: skipLog || undefined,
          } : sessionId ? { sessionId } : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error === "rateLimit" ? t("errorRateLimit") : t("errorGeneric"));
        setMessages((prev) => prev.slice(0, -1));
        setIsStreaming(false);
        return;
      }

      const responseSessionId = response.headers.get("X-Chat-Session-Id");
      if (responseSessionId) setSessionId(responseSessionId);

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
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(t("errorGeneric"));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
          return prev;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [editorContent?.code, editorContent?.language, isStreaming, messages, problemContext, sessionId, t]);

  const handleSend = useCallback(async () => {
    void sendMessage(input.trim());
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  if (isInContestContext) return null;

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
    <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden border-border/60 bg-background shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-xl sm:border sm:slide-in-from-bottom-2">
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
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
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
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words overflow-hidden ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                  : "bg-muted text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:overflow-x-auto prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-code:text-xs prose-pre:text-xs prose-code:break-all"
              }`}
            >
              {msg.role === "assistant" ? (
                <AssistantMarkdown content={msg.content} />
              ) : (
                msg.displayContent ?? msg.content
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
            className="shrink-0 self-end rounded-lg border border-primary bg-primary text-sm leading-5 px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("loggingNotice")}
        </p>
      </div>
    </div>
  );
}
