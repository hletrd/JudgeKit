"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { nanoid } from "nanoid";
import { Plus, Trash2, X, ImageIcon, Upload } from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import { ProblemDescription } from "@/components/problem-description";

type ProblemVisibility = "public" | "private" | "hidden";
type ProblemType = "auto" | "manual";

type ProblemTestCaseDraft = {
  _key?: string;
  input: string;
  expectedOutput: string;
  isVisible: boolean;
  _inputDirty?: boolean;
  _outputDirty?: boolean;
};

const LARGE_TESTCASE_THRESHOLD = 5000;

export type ProblemFormInitialData = {
  id: string;
  title: string;
  description: string;
  sequenceNumber: number | null;
  problemType: ProblemType;
  timeLimitMs: number;
  memoryLimitMb: number;
  visibility: ProblemVisibility;
  showCompileOutput: boolean;
  showDetailedResults: boolean;
  showRuntimeErrors: boolean;
  allowAiAssistant: boolean;
  comparisonMode: "exact" | "float";
  floatAbsoluteError: number | null;
  floatRelativeError: number | null;
  difficulty: number | null;
  defaultLanguage: string | null;
  testCases: ProblemTestCaseDraft[];
  tags: string[];
};

type CreateProblemFormProps = {
  mode?: "create" | "edit";
  initialProblem?: ProblemFormInitialData;
  testCasesLocked?: boolean;
  allowTestCaseOverride?: boolean;
  canUploadFiles?: boolean;
  forceDisableAiAssistant?: boolean;
};

function createEmptyTestCase(): ProblemTestCaseDraft {
  return {
    _key: nanoid(),
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
  canUploadFiles = false,
  forceDisableAiAssistant = false,
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
  const [sequenceNumber, setSequenceNumber] = useState<string>(
    initialProblem?.sequenceNumber?.toString() ?? ""
  );
  const [timeLimitMs, setTimeLimitMs] = useState(initialProblem?.timeLimitMs ?? 2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(initialProblem?.memoryLimitMb ?? 256);
  const [problemType, setProblemType] = useState<ProblemType>(initialProblem?.problemType ?? "auto");
  const [visibility, setVisibility] = useState<ProblemVisibility>(initialProblem?.visibility ?? "private");
  const [showCompileOutput, setShowCompileOutput] = useState(initialProblem?.showCompileOutput ?? true);
  const [showDetailedResults, setShowDetailedResults] = useState(initialProblem?.showDetailedResults ?? true);
  const [showRuntimeErrors, setShowRuntimeErrors] = useState(initialProblem?.showRuntimeErrors ?? true);
  const [allowAiAssistant, setAllowAiAssistant] = useState(
    forceDisableAiAssistant ? false : (initialProblem?.allowAiAssistant ?? true)
  );
  const [comparisonMode, setComparisonMode] = useState<"exact" | "float">(initialProblem?.comparisonMode ?? "exact");
  const [floatAbsoluteError, setFloatAbsoluteError] = useState<string>(initialProblem?.floatAbsoluteError?.toString() ?? "1e-6");
  const [floatRelativeError, setFloatRelativeError] = useState<string>(initialProblem?.floatRelativeError?.toString() ?? "1e-6");
  const [difficulty, setDifficulty] = useState<string>(initialProblem?.difficulty?.toString() ?? "");
  const [defaultLanguage, setDefaultLanguage] = useState<string>(initialProblem?.defaultLanguage ?? "");
  const [testCaseOverrideEnabled, setTestCaseOverrideEnabled] = useState(false);
  const [testCases, setTestCases] = useState<ProblemTestCaseDraft[]>(
    initialProblem?.testCases.length
      ? initialProblem.testCases.map((tc) => ({ ...tc, _key: nanoid() }))
      : []
  );
  const areTestCasesEditable = !testCasesLocked || testCaseOverrideEnabled;
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set());
  const originalTestCasesRef = useRef<Map<number, { input: string; expectedOutput: string }>>(new Map());

  // Store original test case content for change detection
  useEffect(() => {
    if (initialProblem?.testCases.length) {
      const map = new Map<number, { input: string; expectedOutput: string }>();
      initialProblem.testCases.forEach((tc, i) => map.set(i, { input: tc.input, expectedOutput: tc.expectedOutput }));
      originalTestCasesRef.current = map;
    }
  }, [initialProblem]);

  useEffect(() => {
    if (forceDisableAiAssistant) {
      setAllowAiAssistant(false);
    }
  }, [forceDisableAiAssistant]);

  // Tags state
  const [currentTags, setCurrentTags] = useState<string[]>(initialProblem?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const testCaseInputFileRefs = useRef<HTMLInputElement[]>([]);
  const testCaseOutputFileRefs = useRef<HTMLInputElement[]>([]);
  const zipImportRef = useRef<HTMLInputElement>(null);

  const handleZipImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    try {
      const zip = await JSZip.loadAsync(file);
      const fileMap = new Map<string, { input?: string; output?: string }>();

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const name = path.split("/").pop() ?? path;
        const match = name.match(/^(\d+)\.(in|out|input|output|ans)$/i);
        if (!match) continue;
        const num = match[1];
        const kind = match[2].toLowerCase();
        const content = await entry.async("string");
        const existing = fileMap.get(num) ?? {};
        if (kind === "in" || kind === "input") {
          existing.input = content;
        } else {
          existing.output = content;
        }
        fileMap.set(num, existing);
      }

      const sortedKeys = [...fileMap.keys()].sort((a, b) => Number(a) - Number(b));
      const imported: ProblemTestCaseDraft[] = [];

      for (const key of sortedKeys) {
        const pair = fileMap.get(key)!;
        if (pair.input === undefined || pair.output === undefined) continue;
        imported.push({
          _key: nanoid(),
          input: pair.input,
          expectedOutput: pair.output,
          isVisible: false,
        });
      }

      if (imported.length === 0) {
        toast.error(t("zipImportNoPairs"));
        return;
      }

      setTestCases((prev) => [...prev, ...imported]);
      toast.success(t("zipImportSuccess", { count: imported.length }));
    } catch {
      toast.error(t("zipImportFailed"));
    }
  }, [t]);

  // Fetch tag suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    try {
      const res = await apiFetch(`/api/v1/tags?q=${encodeURIComponent(query)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setTagSuggestions(data.data ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tagInput.trim().length > 0) {
      const timeout = setTimeout(() => fetchSuggestions(tagInput.trim()), 200);
      return () => clearTimeout(timeout);
    } else {
      setTagSuggestions([]);
    }
  }, [tagInput, fetchSuggestions]);

  // Close suggestions on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || currentTags.includes(trimmed) || currentTags.length >= 20) return;
    setCurrentTags((prev) => [...prev, trimmed]);
    setTagInput("");
    setShowSuggestions(false);
  }

  function removeTag(name: string) {
    setCurrentTags((prev) => prev.filter((t) => t !== name));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
      }
    } else if (e.key === "Backspace" && !tagInput && currentTags.length > 0) {
      setCurrentTags((prev) => prev.slice(0, -1));
    }
  }

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
      case "invalidDifficulty":
        return t("invalidDifficulty");
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

  async function handleImageUpload(file: File) {
    if (!canUploadFiles) return;
    setIsUploadingImage(true);

    const placeholder = `![${t("imageUploading")}]()`;
    const textarea = descriptionRef.current;
    const cursorPos = textarea?.selectionStart ?? description.length;
    const before = description.slice(0, cursorPos);
    const after = description.slice(cursorPos);
    setDescription(before + placeholder + after);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/v1/files", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "uploadFailed");
      }

      const { data } = await res.json();
      const markdown = `![${data.originalName}](${data.url})`;
      setDescription((prev) => prev.replace(placeholder, markdown));
      toast.success(t("imageUploadSuccess"));
    } catch {
      setDescription((prev) => prev.replace(placeholder, ""));
      toast.error(t("imageUploadError"));
    } finally {
      setIsUploadingImage(false);
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
    } catch {
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
      const parsedSeqNum = sequenceNumber ? parseInt(sequenceNumber, 10) : null;
      const res = await apiFetch(isEditing ? `/api/v1/problems/${initialProblem.id}` : "/api/v1/problems", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          sequenceNumber: parsedSeqNum && Number.isFinite(parsedSeqNum) && parsedSeqNum > 0 ? parsedSeqNum : null,
          problemType,
          timeLimitMs,
          memoryLimitMb,
          visibility,
          showCompileOutput,
          showDetailedResults,
          showRuntimeErrors,
          allowAiAssistant,
          comparisonMode,
          floatAbsoluteError: comparisonMode === "float" ? parseFloat(floatAbsoluteError) || null : null,
          floatRelativeError: comparisonMode === "float" ? parseFloat(floatRelativeError) || null : null,
          difficulty: difficulty !== "" && Number.isFinite(parseFloat(difficulty)) ? parseFloat(difficulty) : null,
          defaultLanguage: defaultLanguage || null,
          tags: currentTags,
          ...(areTestCasesEditable
            ? { testCases: testCases.map(({ _key, _inputDirty, _outputDirty, ...rest }, i) => {
                void _key;
                const orig = originalTestCasesRef.current.get(i);
                if (isEditing && orig) {
                  return {
                    ...rest,
                    input: orig.input === rest.input ? undefined : rest.input,
                    expectedOutput: orig.expectedOutput === rest.expectedOutput ? undefined : rest.expectedOutput,
                  };
                }
                return rest;
              }) }
            : {}),
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_200px_160px]">
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
          <Label htmlFor="sequenceNumber">{t("sequenceNumberLabel")}</Label>
          <Input
            id="sequenceNumber"
            type="number"
            min={1}
            value={sequenceNumber}
            onChange={(e) => setSequenceNumber(e.target.value)}
            placeholder={t("sequenceNumberPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("sequenceNumberHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="difficulty">{t("difficultyLabel")}</Label>
          <Input
            id="difficulty"
            type="number"
            min={0}
            max={10}
            step={0.01}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            placeholder={t("difficultyPlaceholder")}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">{t("difficultyHint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("descLabel")}</Label>
        <Tabs value={descriptionTab} onValueChange={(v) => setDescriptionTab(v as "write" | "preview")}>
          <TabsList>
            <TabsTrigger value="write">{t("writeTab")}</TabsTrigger>
            <TabsTrigger value="preview">{t("previewTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            {canUploadFiles && (
              <div className="flex items-center gap-1 rounded-t-md border border-b-0 px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploadingImage}
                >
                  <ImageIcon className="size-4 mr-1" />
                  {t("insertImage")}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
            <Textarea
              ref={descriptionRef}
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`min-h-[200px] ${canUploadFiles ? "rounded-t-none" : ""}`}
              onPaste={canUploadFiles ? (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                  if (item.type.startsWith("image/")) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) handleImageUpload(file);
                    return;
                  }
                }
              } : undefined}
              onDrop={canUploadFiles ? (e) => {
                const droppedFiles = e.dataTransfer?.files;
                if (!droppedFiles) return;
                for (const file of droppedFiles) {
                  if (file.type.startsWith("image/")) {
                    e.preventDefault();
                    handleImageUpload(file);
                    return;
                  }
                }
              } : undefined}
              onDragOver={canUploadFiles ? (e) => e.preventDefault() : undefined}
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

      {/* Tags */}
      <div className="space-y-2">
        <Label>{t("tagsLabel")}</Label>
        <div className="flex flex-wrap gap-1.5 rounded-md border p-2 min-h-[42px] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          {currentTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <div className="relative flex-1 min-w-[120px]">
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (tagInput.trim()) setShowSuggestions(true);
              }}
              onKeyDown={handleTagKeyDown}
              placeholder={currentTags.length === 0 ? t("tagsPlaceholder") : ""}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground h-7"
              disabled={isLoading}
            />
            {showSuggestions && tagSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md"
              >
                {tagSuggestions
                  .filter((s) => !currentTags.includes(s.name))
                  .map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(suggestion.name);
                      }}
                    >
                      {suggestion.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("tagsHint")}</p>
      </div>

      {problemType === "auto" && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="timeLimit">{t("timeLimitLabel")}</Label>
          <Input
            id="timeLimit"
            type="number"
            min={100}
            max={10000}
            value={timeLimitMs}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setTimeLimitMs(v); }}
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
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setMemoryLimitMb(v); }}
            required
          />
        </div>
      </div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="problemType">{t("problemTypeLabel")}</Label>
          <Select value={problemType} onValueChange={(v) => { if (v) setProblemType(v as ProblemType); }}>
            <SelectTrigger id="problemType">
              <SelectValue>{problemType === "auto" ? t("problemTypeAuto") : t("problemTypeManual")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto" label={t("problemTypeAuto")}>{t("problemTypeAuto")}</SelectItem>
              <SelectItem value="manual" label={t("problemTypeManual")}>{t("problemTypeManual")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {problemType === "manual" ? t("problemTypeManualHint") : t("problemTypeAutoHint")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="visibility">{t("visibilityLabel")}</Label>
          <Select value={visibility} onValueChange={(v) => { if (v) setVisibility(v); }}>
            <SelectTrigger id="visibility">
              <SelectValue>{visibilityLabels[visibility]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public" label={visibilityLabels.public}>{visibilityLabels.public}</SelectItem>
              <SelectItem value="private" label={visibilityLabels.private}>{visibilityLabels.private}</SelectItem>
              <SelectItem value="hidden" label={visibilityLabels.hidden}>{visibilityLabels.hidden}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {problemType === "auto" && <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-base font-semibold">{t("comparisonModeLabel")}</h3>
        <div className="space-y-2">
          <Select value={comparisonMode} onValueChange={(v) => setComparisonMode(v as "exact" | "float")}>
            <SelectTrigger className="w-64">
              <SelectValue>{comparisonMode === "exact" ? t("comparisonExact") : t("comparisonFloat")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exact" label={t("comparisonExact")}>{t("comparisonExact")}</SelectItem>
              <SelectItem value="float" label={t("comparisonFloat")}>{t("comparisonFloat")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {comparisonMode === "float" && (
          <div className="ml-4 space-y-3 border-l-2 pl-4">
            <div className="space-y-1">
              <Label htmlFor="float-abs-error">{t("floatAbsoluteError")}</Label>
              <Input
                id="float-abs-error"
                value={floatAbsoluteError}
                onChange={(e) => setFloatAbsoluteError(e.target.value)}
                placeholder="1e-6"
                className="w-48"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">{t("floatAbsoluteErrorHint")}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="float-rel-error">{t("floatRelativeError")}</Label>
              <Input
                id="float-rel-error"
                value={floatRelativeError}
                onChange={(e) => setFloatRelativeError(e.target.value)}
                placeholder="1e-6"
                className="w-48"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">{t("floatRelativeErrorHint")}</p>
            </div>
          </div>
        )}
      </div>}

      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-base font-semibold">{t("studentVisibilityLabel")}</h3>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showCompileOutput}
            onCheckedChange={(checked) => setShowCompileOutput(checked === true)}
            disabled={isLoading}
          />
          <span>{t("showCompileOutput")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showDetailedResults}
            onCheckedChange={(checked) => setShowDetailedResults(checked === true)}
            disabled={isLoading}
          />
          <span>{t("showDetailedResults")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showRuntimeErrors}
            onCheckedChange={(checked) => setShowRuntimeErrors(checked === true)}
            disabled={isLoading}
          />
          <span>{t("showRuntimeErrors")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allowAiAssistant}
            onCheckedChange={(checked) => setAllowAiAssistant(checked === true)}
            disabled={isLoading || forceDisableAiAssistant}
          />
          <span>{t("allowAiAssistant")}</span>
        </label>
        {forceDisableAiAssistant && (
          <p className="text-xs text-muted-foreground">{t("allowAiAssistantRestricted")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="default-language">{t("defaultLanguage")}</Label>
        <Input
          id="default-language"
          value={defaultLanguage}
          onChange={(e) => setDefaultLanguage(e.target.value)}
          placeholder={t("defaultLanguagePlaceholder")}
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">{t("defaultLanguageHint")}</p>
      </div>

      {problemType === "auto" && <div className="space-y-4 rounded-lg border p-4">
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
              <Plus aria-hidden="true" />
              {t("addTestCase")}
            </Button>
            <input
              ref={zipImportRef}
              type="file"
              accept=".zip"
              className="sr-only"
              onChange={(e) => { void handleZipImport(e); }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => zipImportRef.current?.click()}
              disabled={isLoading || !areTestCasesEditable}
            >
              <Upload aria-hidden="true" />
              {t("importFromZip")}
            </Button>
          </div>
        </div>

        {testCases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTestCases")}</p>
        ) : (
          <div className="space-y-4">
            {testCases.map((testCase, index) => (
              <div key={testCase._key} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="font-medium">{t("testCaseLabel", { number: index + 1 })}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTestCase(index)}
                    disabled={isLoading || !areTestCasesEditable}
                  >
                    <Trash2 aria-hidden="true" />
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
                          ref={(el) => { testCaseInputFileRefs.current[index] = el!; }}
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
                          onClick={() => testCaseInputFileRefs.current[index]?.click()}
                        >
                          {t("testCaseUploadInput")}
                        </Button>
                      </div>
                    </div>
                    {testCase.input.length > LARGE_TESTCASE_THRESHOLD && !expandedTestCases.has(`input-${index}`) ? (
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 min-h-[140px]">
                        <span className="text-sm text-muted-foreground">{(testCase.input.length / 1024).toFixed(1)} KB</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => setExpandedTestCases((s) => new Set(s).add(`input-${index}`))}>
                          {t("showContent")}
                        </Button>
                      </div>
                    ) : (
                      <Textarea
                        id={`test-case-input-${index}`}
                        value={testCase.input}
                        onChange={(event) => updateTestCase(index, { input: event.target.value })}
                        className="min-h-[140px] max-h-[400px] overflow-y-auto font-mono text-sm"
                        disabled={isLoading || !areTestCasesEditable}
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`test-case-output-${index}`}>{t("testCaseOutputLabel")}</Label>
                      <div>
                        <input
                          className="sr-only"
                          ref={(el) => { testCaseOutputFileRefs.current[index] = el!; }}
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
                          onClick={() => testCaseOutputFileRefs.current[index]?.click()}
                        >
                          {t("testCaseUploadOutput")}
                        </Button>
                      </div>
                    </div>
                    {testCase.expectedOutput.length > LARGE_TESTCASE_THRESHOLD && !expandedTestCases.has(`output-${index}`) ? (
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 min-h-[140px]">
                        <span className="text-sm text-muted-foreground">{(testCase.expectedOutput.length / 1024).toFixed(1)} KB</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => setExpandedTestCases((s) => new Set(s).add(`output-${index}`))}>
                          {t("showContent")}
                        </Button>
                      </div>
                    ) : (
                      <Textarea
                        id={`test-case-output-${index}`}
                        value={testCase.expectedOutput}
                        onChange={(event) =>
                          updateTestCase(index, { expectedOutput: event.target.value })
                        }
                        className="min-h-[140px] max-h-[400px] overflow-y-auto font-mono text-sm"
                        disabled={isLoading || !areTestCasesEditable}
                      />
                    )}
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
      </div>}

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
