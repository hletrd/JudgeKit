"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code/code-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LanguageSelector } from "@/components/language-selector";
import { apiFetch } from "@/lib/api/client";
import { useSourceDraft } from "@/hooks/use-source-draft";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useEditorContent } from "@/contexts/editor-content-context";
import { ChevronDown, ChevronRight, Play, Loader2 } from "lucide-react";

type SubmissionLanguage = {
  id: string;
  language: string;
  displayName: string;
  standard: string | null;
};

type ProblemSubmissionFormProps = {
  userId: string;
  problemId: string;
  languages: SubmissionLanguage[];
  assignmentId?: string | null;
  preferredLanguage?: string | null;
  problemDefaultLanguage?: string | null;
  siteDefaultLanguage?: string | null;
  editorTheme?: string | null;
};

export function ProblemSubmissionForm({
  userId,
  problemId,
  languages,
  assignmentId = null,
  preferredLanguage = null,
  problemDefaultLanguage = null,
  siteDefaultLanguage = null,
  editorTheme = null,
}: ProblemSubmissionFormProps) {
  const router = useRouter();
  const t = useTranslations("problems");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const availableLanguages = useMemo(() => languages.map((entry) => entry.language), [languages]);
  const { language, setLanguage, sourceCode, setSourceCode, isDirty, clearAllDrafts } = useSourceDraft({
    userId,
    problemId,
    languages: availableLanguages,
    initialLanguage:
      (problemDefaultLanguage && availableLanguages.includes(problemDefaultLanguage) ? problemDefaultLanguage : null)
      ?? (preferredLanguage && availableLanguages.includes(preferredLanguage) ? preferredLanguage : null)
      ?? (siteDefaultLanguage && availableLanguages.includes(siteDefaultLanguage) ? siteDefaultLanguage : null)
      ?? (availableLanguages.includes("c") ? "c" : languages[0]?.language ?? "c"),
  });

  const { allowNextNavigation } = useUnsavedChangesGuard({ isDirty });
  const { setContent } = useEditorContent();

  // Adaptive code snapshots: 10s after a change, backs off to 60s if idle
  const lastSnapshotRef = useRef<string>("");
  const lastChangeRef = useRef<number>(0);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!assignmentId) return;
    lastChangeRef.current = Date.now();
  }, [sourceCode, assignmentId]);

  useEffect(() => {
    if (!assignmentId) return;
    function tick() {
      const now = Date.now();
      const sinceLastChange = now - lastChangeRef.current;
      const changed = sourceCode !== lastSnapshotRef.current && sourceCode.trim().length > 0;

      if (changed) {
        lastSnapshotRef.current = sourceCode;
        void apiFetch("/api/v1/code-snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problemId, assignmentId, language, sourceCode }),
        }).catch(() => {});
      }

      // Next check: 10s if recently changed, up to 60s if idle
      const nextDelay = sinceLastChange < 30000 ? 10000 : 60000;
      snapshotTimerRef.current = setTimeout(tick, nextDelay);
    }
    snapshotTimerRef.current = setTimeout(tick, 10000);
    return () => { if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current); };
  }, [assignmentId, problemId, language, sourceCode]);
  const [isRunning, setIsRunning] = useState(false);
  const [stdinOpen, setStdinOpen] = useState(false);
  const [stdin, setStdin] = useState("");
  const [runResult, setRunResult] = useState<{
    stdout: string;
    stderr: string;
    executionTimeMs: number;
    timedOut: boolean;
    oomKilled: boolean;
    compileOutput: string | null;
  } | null>(null);

  const translateSubmissionError = useCallback((error: unknown) => {
    if (typeof error !== "string") {
      return tCommon("error");
    }

    const legacyErrorMap: Record<string, string> = {
      Unauthorized: "submissionErrors.unauthorized",
      Forbidden: "submissionErrors.forbidden",
      "problemId is required": "submissionErrors.problemRequired",
      "language is required": "submissionErrors.languageRequired",
      "sourceCode is required": "submissionErrors.sourceCodeRequired",
      [`sourceCode exceeds the 65536-byte limit`]: "submissionErrors.sourceCodeTooLarge",
      "Internal server error": "submissionErrors.submissionCreateFailed",
    };

    const translationKey = legacyErrorMap[error] ?? `submissionErrors.${error}`;

    try {
      return t(translationKey as never);
    } catch {
      return tCommon("error");
    }
  }, [t, tCommon]);

  const handleRun = useCallback(async () => {
    if (!sourceCode) {
      toast.error(translateSubmissionError("sourceCode is required"));
      return;
    }
    setIsRunning(true);
    setRunResult(null);
    try {
      const response = await apiFetch("/api/v1/compiler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, sourceCode, stdin }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? tCommon("error"));
        return;
      }
      setRunResult(payload.data);
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsRunning(false);
    }
  }, [sourceCode, language, stdin, tCommon, translateSubmissionError]);

  // Publish editor content for AI chat widget (read-only bridge)
  useEffect(() => {
    setContent({ code: sourceCode, language });
    return () => {
      setContent(null);
    };
  }, [sourceCode, language, setContent]);

  async function handleSourceFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    try {
      const fileContents = await selectedFile.text();
      setSourceCode(fileContents);
      toast.success(t("sourceFileLoaded", { name: selectedFile.name }));
    } catch {
      toast.error(t("sourceFileLoadFailed"));
    } finally {
      event.target.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceCode) {
      toast.error(translateSubmissionError("sourceCode is required"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiFetch("/api/v1/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problemId,
          language,
          sourceCode,
          assignmentId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        toast.error(translateSubmissionError(payload.error));
        return;
      }

      const submissionId = payload.data?.id;

      if (!submissionId || typeof submissionId !== "string") {
        toast.error(tCommon("error"));
        return;
      }

      allowNextNavigation();
      router.push(`/dashboard/submissions/${submissionId}?from=problem`);
      clearAllDrafts();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Label htmlFor="language">{t("selectLanguage")}</Label>
          <input
            ref={fileInputRef}
            className="sr-only"
            onChange={(event) => {
              void handleSourceFileChange(event);
            }}
            type="file"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("uploadSourceFile")}
          </Button>
        </div>
        <LanguageSelector
          id="language"
          languages={languages}
          value={language}
          onValueChange={setLanguage}
          preferredLanguage={preferredLanguage}
          placeholder={t("selectLanguage")}
          searchPlaceholder={t("searchLanguages")}
          recentlyUsedLabel={t("recentlyUsed")}
          otherLabel={t("otherLanguages")}
        />
      </div>
      <div className="space-y-2">
        <Label id="sourceCode-label" htmlFor="sourceCode">
          {t("sourceCodeLabel")}
        </Label>
        <CodeEditor
          id="sourceCode"
          ariaLabelledby="sourceCode-label"
          placeholder={t("writeCodePlaceholder")}
          value={sourceCode}
          language={language}
          editorTheme={editorTheme}
          onValueChange={setSourceCode}
        />
      </div>
      <div className="space-y-2">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setStdinOpen((prev) => !prev)}
        >
          {stdinOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {t("stdinLabel")}
        </button>
        {stdinOpen && (
          <Textarea
            placeholder={t("stdinPlaceholder")}
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={4}
            className="font-mono text-sm"
          />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isRunning || isSubmitting}
          onClick={() => void handleRun()}
        >
          {isRunning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
          {isRunning ? t("running") : t("run")}
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting || isRunning}>
          {isSubmitting ? tCommon("loading") : tCommon("submit")}
        </Button>
      </div>
      {runResult && (
        <div className="rounded-md border bg-muted/50 p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t("runResult")}</span>
            <span className="text-xs text-muted-foreground">
              {runResult.timedOut
                ? t("timedOut")
                : runResult.oomKilled
                  ? t("memoryLimitExceeded")
                  : `${runResult.executionTimeMs}ms`}
            </span>
          </div>
          {runResult.compileOutput && (
            <div>
              <Label className="text-xs text-destructive">{t("compileError")}</Label>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-xs whitespace-pre-wrap">{runResult.compileOutput}</pre>
            </div>
          )}
          {!runResult.compileOutput && (
            <>
              <div>
                <Label className="text-xs">{t("stdout")}</Label>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-xs whitespace-pre-wrap">{runResult.stdout || t("noOutput")}</pre>
              </div>
              {runResult.stderr && (
                <div>
                  <Label className="text-xs text-yellow-600 dark:text-yellow-400">{t("stderr")}</Label>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-xs whitespace-pre-wrap">{runResult.stderr}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
