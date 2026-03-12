"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { ProblemDescription } from "@/components/problem-description";

type ProblemVisibility = "public" | "private" | "hidden";

type ProblemTestCaseDraft = {
  input: string;
  expectedOutput: string;
  isVisible: boolean;
};

export type ProblemFormInitialData = {
  id: string;
  title: string;
  description: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  visibility: ProblemVisibility;
  testCases: ProblemTestCaseDraft[];
};

type CreateProblemFormProps = {
  mode?: "create" | "edit";
  initialProblem?: ProblemFormInitialData;
  testCasesLocked?: boolean;
  allowTestCaseOverride?: boolean;
};

function createEmptyTestCase(): ProblemTestCaseDraft {
  return {
    input: "",
    expectedOutput: "",
    isVisible: false,
  };
}

export default function CreateProblemForm({
  mode = "create",
  initialProblem,
  testCasesLocked = false,
  allowTestCaseOverride = false,
}: CreateProblemFormProps) {
  const t = useTranslations("problems");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const visibilityLabels = {
    public: t("visibilityOptions.public"),
    private: t("visibilityOptions.private"),
    hidden: t("visibilityOptions.hidden"),
  };

  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState(initialProblem?.title ?? "");
  const [description, setDescription] = useState(initialProblem?.description ?? "");
  const [descriptionTab, setDescriptionTab] = useState<"write" | "preview">("write");
  const [timeLimitMs, setTimeLimitMs] = useState(initialProblem?.timeLimitMs ?? 2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(initialProblem?.memoryLimitMb ?? 256);
  const [visibility, setVisibility] = useState<ProblemVisibility>(initialProblem?.visibility ?? "private");
  const [testCaseOverrideEnabled, setTestCaseOverrideEnabled] = useState(false);
  const [testCases, setTestCases] = useState<ProblemTestCaseDraft[]>(
    initialProblem?.testCases.length ? initialProblem.testCases : []
  );
  const areTestCasesEditable = !testCasesLocked || testCaseOverrideEnabled;

  function getErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
      return tCommon("error");
    }

    switch (error.message) {
      case "titleRequired":
        return t("titleRequired");
      case "titleTooLong":
        return t("titleTooLong");
      case "descriptionTooLong":
        return t("descriptionTooLong");
      case "invalidTimeLimit":
        return t("invalidTimeLimit");
      case "invalidMemoryLimit":
        return t("invalidMemoryLimit");
      case "testCaseInputRequired":
        return t("testCaseInputRequired");
      case "testCaseOutputRequired":
        return t("testCaseOutputRequired");
      case "tooManyTestCases":
        return t("tooManyTestCases");
      case "testCasesLocked":
        return t("testCasesLocked");
      case "updateError":
        return t("updateError");
      case "createError":
        return t("createError");
      default:
        return error.message || tCommon("error");
    }
  }

  function updateTestCase(index: number, updates: Partial<ProblemTestCaseDraft>) {
    setTestCases((current) =>
      current.map((testCase, currentIndex) =>
        currentIndex === index ? { ...testCase, ...updates } : testCase
      )
    );
  }

  function addTestCase() {
    setTestCases((current) => [...current, createEmptyTestCase()]);
  }

  function removeTestCase(index: number) {
    setTestCases((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleTestCaseFileChange(
    index: number,
    field: "input" | "expectedOutput",
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    try {
      const fileContents = await selectedFile.text();
      updateTestCase(index, { [field]: fileContents });
      toast.success(t("testCaseFileLoaded", { name: selectedFile.name }));
    } catch (error) {
      console.error("Failed to read test case file:", error);
      toast.error(t("testCaseFileLoadFailed"));
    } finally {
      event.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const isEditing = mode === "edit" && initialProblem;
      const res = await apiFetch(isEditing ? `/api/v1/problems/${initialProblem.id}` : "/api/v1/problems", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          timeLimitMs,
          memoryLimitMb,
          visibility,
          ...(areTestCasesEditable ? { testCases } : {}),
          ...(testCaseOverrideEnabled ? { allowLockedTestCases: true } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || (isEditing ? "updateError" : "createError"));
      }

      const nextProblemId = data.data?.id ?? initialProblem?.id;

      toast.success(isEditing ? t("updateSuccess") : t("createSuccess"));
      router.push(nextProblemId ? `/dashboard/problems/${nextProblemId}` : "/dashboard/problems");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">{t("titleLabel")}</Label>
        <Input 
          id="title" 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          required 
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("descLabel")}</Label>
        <Tabs value={descriptionTab} onValueChange={(v) => setDescriptionTab(v as "write" | "preview")}>
          <TabsList>
            <TabsTrigger value="write">{t("writeTab")}</TabsTrigger>
            <TabsTrigger value="preview">{t("previewTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[200px]"
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="min-h-[200px] rounded-md border px-3 py-2 text-sm">
              {description.trim() ? (
                <ProblemDescription description={description} />
              ) : (
                <p className="text-muted-foreground">{t("noDescription")}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="timeLimit">{t("timeLimitLabel")}</Label>
          <Input 
            id="timeLimit" 
            type="number" 
            min={100} 
            max={10000} 
            value={timeLimitMs} 
            onChange={(e) => setTimeLimitMs(parseInt(e.target.value, 10))}
            required 
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memoryLimit">{t("memoryLimitLabel")}</Label>
          <Input 
            id="memoryLimit" 
            type="number" 
            min={16} 
            max={1024} 
            value={memoryLimitMb} 
            onChange={(e) => setMemoryLimitMb(parseInt(e.target.value, 10))}
            required 
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="visibility">{t("visibilityLabel")}</Label>
        <Select value={visibility} onValueChange={(v) => { if (v) setVisibility(v); }}>
          <SelectTrigger id="visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">{visibilityLabels.public}</SelectItem>
            <SelectItem value="private">{visibilityLabels.private}</SelectItem>
            <SelectItem value="hidden">{visibilityLabels.hidden}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{t("testCasesTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("testCasesDescription")}</p>
            {testCasesLocked && (
              <p className="text-sm text-amber-600">
                {testCaseOverrideEnabled && allowTestCaseOverride
                  ? t("testCasesUnlockWarning")
                  : t("testCasesLockedNotice")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allowTestCaseOverride && testCasesLocked && (
              <Button
                type="button"
                variant={testCaseOverrideEnabled ? "secondary" : "outline"}
                onClick={() => setTestCaseOverrideEnabled((current) => !current)}
                disabled={isLoading}
              >
                {t("testCasesUnlockForAdmin")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={addTestCase}
              disabled={isLoading || !areTestCasesEditable}
            >
              <Plus />
              {t("addTestCase")}
            </Button>
          </div>
        </div>

        {testCases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTestCases")}</p>
        ) : (
          <div className="space-y-4">
            {testCases.map((testCase, index) => (
              <div key={`${mode}-test-case-${index}`} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="font-medium">{t("testCaseLabel", { number: index + 1 })}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTestCase(index)}
                    disabled={isLoading || !areTestCasesEditable}
                  >
                    <Trash2 />
                    {t("removeTestCase")}
                  </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`test-case-input-${index}`}>{t("testCaseInputLabel")}</Label>
                      <div>
                        <input
                          className="sr-only"
                          id={`test-case-input-file-${index}`}
                          onChange={(event) => {
                            void handleTestCaseFileChange(index, "input", event);
                          }}
                          type="file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isLoading || !areTestCasesEditable}
                          onClick={() =>
                            document.getElementById(`test-case-input-file-${index}`)?.click()
                          }
                        >
                          {t("testCaseUploadInput")}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id={`test-case-input-${index}`}
                      value={testCase.input}
                      onChange={(event) => updateTestCase(index, { input: event.target.value })}
                      className="min-h-[140px] font-mono text-sm"
                      disabled={isLoading || !areTestCasesEditable}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`test-case-output-${index}`}>{t("testCaseOutputLabel")}</Label>
                      <div>
                        <input
                          className="sr-only"
                          id={`test-case-output-file-${index}`}
                          onChange={(event) => {
                            void handleTestCaseFileChange(index, "expectedOutput", event);
                          }}
                          type="file"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isLoading || !areTestCasesEditable}
                          onClick={() =>
                            document.getElementById(`test-case-output-file-${index}`)?.click()
                          }
                        >
                          {t("testCaseUploadOutput")}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id={`test-case-output-${index}`}
                      value={testCase.expectedOutput}
                      onChange={(event) =>
                        updateTestCase(index, { expectedOutput: event.target.value })
                      }
                      className="min-h-[140px] font-mono text-sm"
                      disabled={isLoading || !areTestCasesEditable}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={testCase.isVisible}
                    onCheckedChange={(checked) => updateTestCase(index, { isVisible: checked === true })}
                    disabled={isLoading || !areTestCasesEditable}
                  />
                  <span>{t("testCaseVisibleLabel")}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => router.back()}
          disabled={isLoading}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? tCommon("loading")
            : mode === "edit"
              ? tCommon("save")
              : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}
