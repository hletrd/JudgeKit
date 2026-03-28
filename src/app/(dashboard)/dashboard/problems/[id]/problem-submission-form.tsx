"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code/code-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { useSourceDraft } from "@/hooks/use-source-draft";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

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
  editorTheme?: string | null;
};

export function ProblemSubmissionForm({
  userId,
  problemId,
  languages,
  assignmentId = null,
  preferredLanguage = null,
  editorTheme = null,
}: ProblemSubmissionFormProps) {
  const router = useRouter();
  const t = useTranslations("problems");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const availableLanguages = useMemo(() => languages.map((entry) => entry.language), [languages]);
  const languageLabelMap = useMemo(() => Object.fromEntries(
    languages.map((entry) => [entry.language, `${entry.displayName}${entry.standard ? ` (${entry.standard})` : ""}`])
  ), [languages]);
  const { language, setLanguage, sourceCode, setSourceCode, isDirty, clearAllDrafts } = useSourceDraft({
    userId,
    problemId,
    languages: availableLanguages,
    initialLanguage: (preferredLanguage && availableLanguages.includes(preferredLanguage) ? preferredLanguage : null) ?? (availableLanguages.includes("c") ? "c" : languages[0]?.language ?? "c"),
  });

  const { allowNextNavigation } = useUnsavedChangesGuard({ isDirty });

  // Publish editor content for AI chat widget (read-only bridge)
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__ojEditorContent = { code: sourceCode, language };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__ojEditorContent;
      }
    };
  }, [sourceCode, language]);

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

  function translateSubmissionError(error: unknown) {
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
        <Select value={language} onValueChange={(value) => value && setLanguage(value)}>
          <SelectTrigger id="language">
            <SelectValue placeholder={t("selectLanguage")}>
              {languageLabelMap[language] ?? language}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {languages.map((entry) => (
              <SelectItem key={entry.id} value={entry.language} label={`${entry.displayName}${entry.standard ? ` (${entry.standard})` : ""}`}>
                {entry.displayName} {entry.standard ? `(${entry.standard})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? tCommon("loading") : tCommon("submit")}
      </Button>
    </form>
  );
}
