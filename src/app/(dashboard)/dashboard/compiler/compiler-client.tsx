"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code/code-editor";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { Loader2, Play, AlertTriangle, Maximize2, Plus, X } from "lucide-react";

// Layout constants
const LAYOUT_CONSTANTS = {
  SELECTOR_WIDTH: 256, // w-64 in Tailwind
  EDITOR_MIN_HEIGHT: 300,
  STDIN_MIN_HEIGHT: 80,
  OUTPUT_TRUNCATE_THRESHOLD: 10000, // characters
} as const;

type CompilerLanguage = {
  id: string;
  language: string;
  displayName: string;
  standard: string | null;
  extension: string;
};

type CompilerResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  compileOutput: string | null;
};

type CompilerTestCase = {
  id: string;
  name: string;
  stdin: string;
  result: CompilerResult | null;
  error: string | null;
};

type CompilerClientProps = {
  languages: CompilerLanguage[];
  title: string;
  description: string;
  preferredLanguage?: string | null;
  runEndpoint?: string;
};

const DEFAULT_CODE: Record<string, string> = {
  c: '#include <stdio.h>\n\nint main() {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("%d\\n", a + b);\n    return 0;\n}',
  cpp20: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        int b = sc.nextInt();\n        System.out.println(a + b);\n    }\n}',
  python: "a, b = map(int, input().split())\nprint(a + b)",
  javascript: "const [a, b] = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split(' ').map(Number);\nconsole.log(a + b);",
  rust: 'use std::io::{self, BufRead};\n\nfn main() {\n    let stdin = io::stdin();\n    let line = stdin.lock().lines().next().unwrap().unwrap();\n    let nums: Vec<i32> = line.split_whitespace().map(|s| s.parse().unwrap()).collect();\n    println!("{}", nums[0] + nums[1]);\n}',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    var a, b int\n    fmt.Scan(&a, &b)\n    fmt.Println(a + b)\n}',
};

function getDefaultCode(language: string): string {
  if (DEFAULT_CODE[language]) return DEFAULT_CODE[language];
  // Check if it's a C/C++ variant
  if (language.startsWith("c") && !language.startsWith("cs")) return DEFAULT_CODE.c;
  if (language.startsWith("cpp") || language.startsWith("clang_cpp")) return DEFAULT_CODE.cpp20;
  if (language.startsWith("java")) return DEFAULT_CODE.java;
  if (language.startsWith("python")) return DEFAULT_CODE.python;
  return "";
}

function resolveInitialCompilerLanguage(
  languages: CompilerLanguage[],
  preferredLanguage?: string | null
) {
  return (
    (preferredLanguage && languages.some((l) => l.language === preferredLanguage) ? preferredLanguage : null)
    ?? languages.find((l) => l.language === "python")?.language
    ?? languages[0]?.language
    ?? "python"
  );
}

function buildDefaultTestCaseName(index: number) {
  return `TC ${index}`;
}

// Component for truncated output display
function TruncatedOutput({ content, className }: { content: string; className?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isTruncated = content.length > LAYOUT_CONSTANTS.OUTPUT_TRUNCATE_THRESHOLD;

  if (!isTruncated || isExpanded) {
    return <pre className={className}>{content || "(empty)"}</pre>;
  }

  const truncated = content.slice(0, LAYOUT_CONSTANTS.OUTPUT_TRUNCATE_THRESHOLD);
  return (
    <div>
      <pre className={className}>{truncated}\n... (output truncated)</pre>
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Maximize2 className="size-3" />
        Show full output ({(content.length / 1024).toFixed(1)} KB)
      </button>
    </div>
  );
}

export function CompilerClient({ languages, title, description, preferredLanguage, runEndpoint = "/api/v1/compiler/run" }: CompilerClientProps) {
  const t = useTranslations("compiler");
  const initialLanguage = resolveInitialCompilerLanguage(languages, preferredLanguage);
  const initialTestCaseRef = useRef<CompilerTestCase>({
    id: "tc-1",
    name: buildDefaultTestCaseName(1),
    stdin: "",
    result: null,
    error: null,
  });
  const nextTestCaseIndexRef = useRef(2);

  const [language, setLanguage] = useState(initialLanguage);
  const [sourceCode, setSourceCode] = useState(() => getDefaultCode(initialLanguage));
  const [testCases, setTestCases] = useState<CompilerTestCase[]>([initialTestCaseRef.current]);
  const [activeTestCaseId, setActiveTestCaseId] = useState(initialTestCaseRef.current.id);
  const [activeTab, setActiveTab] = useState("stdout");

  // HIGH FIX: Use ref to track isRunning for stale closure protection
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const hydratedPreferenceRef = useRef(false);

  const activeTestCase = testCases.find((testCase) => testCase.id === activeTestCaseId) ?? testCases[0] ?? initialTestCaseRef.current;
  const result = activeTestCase.result;
  const error = activeTestCase.error;

  const updateTestCase = useCallback((testCaseId: string, updater: (testCase: CompilerTestCase) => CompilerTestCase) => {
    setTestCases((currentCases) =>
      currentCases.map((testCase) => (testCase.id === testCaseId ? updater(testCase) : testCase))
    );
  }, []);

  useEffect(() => {
    if (hydratedPreferenceRef.current) return;
    hydratedPreferenceRef.current = true;

    const savedLanguage = window.localStorage.getItem("compiler:language");
    if (!savedLanguage || !languages.some((entry) => entry.language === savedLanguage)) {
      return;
    }
    if (savedLanguage === language) {
      return;
    }

    const currentDefault = getDefaultCode(initialLanguage);
    setLanguage(savedLanguage);
    setSourceCode((currentSource) =>
      currentSource === currentDefault ? getDefaultCode(savedLanguage) : currentSource
    );
    setTestCases((currentCases) =>
      currentCases.map((testCase) => ({
        ...testCase,
        result: null,
        error: null,
      }))
    );
  }, [initialLanguage, language, languages]);

  // Persist language preference
  useEffect(() => {
    localStorage.setItem("compiler:language", language);
  }, [language]);

  // Update code template when language changes
  const handleLanguageChange = useCallback(
    (newLang: string) => {
      const oldDefault = getDefaultCode(language);
      if (sourceCode === "" || sourceCode === oldDefault) {
        setSourceCode(getDefaultCode(newLang));
      }
      setLanguage(newLang);
      setTestCases((currentCases) =>
        currentCases.map((testCase) => ({
          ...testCase,
          result: null,
          error: null,
        }))
      );
    },
    [language, sourceCode]
  );

  const handleAddTestCase = useCallback(() => {
    const nextIndex = nextTestCaseIndexRef.current++;
    const nextTestCase: CompilerTestCase = {
      id: `tc-${nextIndex}`,
      name: buildDefaultTestCaseName(nextIndex),
      stdin: "",
      result: null,
      error: null,
    };
    setTestCases((currentCases) => [...currentCases, nextTestCase]);
    setActiveTestCaseId(nextTestCase.id);
    setActiveTab("stdout");
  }, []);

  const handleRemoveActiveTestCase = useCallback(() => {
    if (testCases.length <= 1) return;

    const activeIndex = testCases.findIndex((testCase) => testCase.id === activeTestCase.id);
    const fallbackCase = testCases[activeIndex - 1] ?? testCases[activeIndex + 1] ?? testCases[0];
    setTestCases((currentCases) => currentCases.filter((testCase) => testCase.id !== activeTestCase.id));
    setActiveTestCaseId(fallbackCase.id);
    setActiveTab("stdout");
  }, [activeTestCase.id, testCases]);

  const handleRun = useCallback(async () => {
    // HIGH FIX: Check ref to prevent concurrent runs
    if (isRunningRef.current) {
      toast.info(t("alreadyRunning", { defaultValue: "Already running." }));
      return;
    }

    // HIGH FIX: Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    isRunningRef.current = true;
    setIsRunning(true);
    const runningTestCaseId = activeTestCase.id;
    updateTestCase(runningTestCaseId, (testCase) => ({
      ...testCase,
      result: null,
      error: null,
    }));

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await apiFetch(runEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, sourceCode, stdin: activeTestCase.stdin }),
        signal: abortController.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.error || data.message || "Request failed";
        updateTestCase(runningTestCaseId, (testCase) => ({
          ...testCase,
          error: errorMessage,
          result: null,
        }));
        toast.error(t("runFailed", { defaultValue: "Failed to run code" }), {
          description: errorMessage,
        });
        return;
      }

      updateTestCase(runningTestCaseId, (testCase) => ({
        ...testCase,
        result: data.data as CompilerResult,
        error: null,
      }));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : "Network error";
      updateTestCase(runningTestCaseId, (testCase) => ({
        ...testCase,
        error: errorMessage,
        result: null,
      }));
      toast.error(t("networkError", { defaultValue: "Network error" }), {
        description: errorMessage,
      });
    } finally {
      isRunningRef.current = false;
      abortControllerRef.current = null;
      setIsRunning(false);
    }
  }, [activeTestCase.id, activeTestCase.stdin, language, runEndpoint, sourceCode, t, updateTestCase]);

  // Keyboard shortcut: Ctrl/Cmd+Enter to run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun]);

  // HIGH FIX: Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Scroll output into view when result arrives
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [result]);

  // Auto-select the most relevant tab when a new result arrives or the active case changes
  useEffect(() => {
    if (!result) {
      setActiveTab("stdout");
      return;
    }
    if (result.compileOutput) setActiveTab("compileOutput");
    else if (result.stderr) setActiveTab("stderr");
    else setActiveTab("stdout");
  }, [result]);

  if (languages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("loadingLanguages", { defaultValue: "Loading languages..." })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex items-center gap-3">
        <div style={{ width: LAYOUT_CONSTANTS.SELECTOR_WIDTH }}>
          <LanguageSelector
            languages={languages}
            value={language}
            onValueChange={handleLanguageChange}
            placeholder={t("language", { defaultValue: "Language" })}
          />
        </div>
        <Button
          onClick={handleRun}
          disabled={isRunning}
          type="button"
          aria-label={isRunning ? t("running", { defaultValue: "Running..." }) : t("run", { defaultValue: "Run code" })}
        >
          {isRunning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("running", { defaultValue: "Running..." })}
            </>
          ) : (
            <>
              <Play className="size-4" />
              {t("run", { defaultValue: "Run" })}
            </>
          )}
        </Button>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex-1 min-h-0">
            <CodeEditor
              language={language}
              value={sourceCode}
              onValueChange={setSourceCode}
              minHeight={LAYOUT_CONSTANTS.EDITOR_MIN_HEIGHT}
              ariaLabel={t("codeEditorLabel", { defaultValue: "Code editor" })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="stdin-input" className="text-xs font-medium text-muted-foreground">
                {t("stdin", { defaultValue: "Standard Input" })}
              </Label>
              <div className="flex items-center gap-2">
                {testCases.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveActiveTestCase}
                    aria-label={t("removeTestCase", { defaultValue: "Remove test case" })}
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddTestCase}
                  aria-label={t("addTestCase", { defaultValue: "Add test case" })}
                >
                  <Plus className="size-3.5" />
                  {t("addTestCase", { defaultValue: "Add test case" })}
                </Button>
              </div>
            </div>

            <Tabs value={activeTestCase.id} onValueChange={setActiveTestCaseId} className="flex flex-col gap-3">
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                {testCases.map((testCase) => (
                  <TabsTrigger key={testCase.id} value={testCase.id}>
                    {testCase.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="space-y-1.5">
                <Label htmlFor="stdin-case-name" className="text-xs font-medium text-muted-foreground">
                  {t("testCaseLabel", { defaultValue: "Test case label" })}
                </Label>
                <Input
                  id="stdin-case-name"
                  value={activeTestCase.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    updateTestCase(activeTestCase.id, (testCase) => ({
                      ...testCase,
                      name: nextName,
                    }));
                  }}
                  onBlur={() => {
                    if (activeTestCase.name.trim()) return;
                    const activeIndex = testCases.findIndex((entry) => entry.id === activeTestCase.id);
                    updateTestCase(activeTestCase.id, (testCase) => ({
                      ...testCase,
                      name: buildDefaultTestCaseName(activeIndex + 1),
                    }));
                  }}
                />
              </div>

              {testCases.map((testCase) => (
                <TabsContent key={testCase.id} value={testCase.id} className="m-0">
                  <textarea
                    id={testCase.id === activeTestCase.id ? "stdin-input" : undefined}
                    className="w-full rounded-lg border bg-transparent p-3 font-mono text-sm leading-relaxed focus:border-ring focus:ring-3 focus:ring-ring/15 focus:outline-none"
                    style={{ minHeight: LAYOUT_CONSTANTS.STDIN_MIN_HEIGHT, resize: "vertical", tabSize: 4 }}
                    value={testCase.stdin}
                    onChange={(event) =>
                      updateTestCase(testCase.id, (currentTestCase) => ({
                        ...currentTestCase,
                        stdin: event.target.value,
                      }))
                    }
                    placeholder="1 2"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-label={t("stdin", { defaultValue: "Standard input" })}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {error && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!result && !error && (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8">
              <p className="text-sm text-muted-foreground">
                {t("noOutput", { defaultValue: "Run your code to see output here" })}
              </p>
            </div>
          )}

          {result && (
            <div className="flex flex-1 flex-col gap-2 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {result.timedOut && (
                  <span className="font-medium text-yellow-600">
                    {t("timedOut", { defaultValue: "Time Limit Exceeded" })}
                  </span>
                )}
                {result.compileOutput && (
                  <span className="font-medium text-red-600">
                    {t("compileError", { defaultValue: "Compilation Error" })}
                  </span>
                )}
                {result.exitCode !== null && (
                  <span>{t("exitCode", { defaultValue: "Exit code: {code}", code: result.exitCode })}</span>
                )}
                <span>
                  {t("executionTime", { defaultValue: "{time}ms", time: result.executionTimeMs })}
                </span>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
                <TabsList>
                  <TabsTrigger value="stdout">{t("stdout", { defaultValue: "Output" })}</TabsTrigger>
                  <TabsTrigger value="stderr">{t("stderr", { defaultValue: "Error Output" })}</TabsTrigger>
                  {result.compileOutput && (
                    <TabsTrigger value="compileOutput">
                      {t("compileOutput", { defaultValue: "Compiler Output" })}
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="stdout" className="flex-1 overflow-auto">
                  <div ref={resultRef}>
                    <TruncatedOutput
                      content={result.stdout}
                      className="rounded-lg border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="stderr" className="flex-1 overflow-auto">
                  <TruncatedOutput
                    content={result.stderr}
                    className="rounded-lg border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap text-red-600"
                  />
                </TabsContent>
                {result.compileOutput && (
                  <TabsContent value="compileOutput" className="flex-1 overflow-auto">
                    <TruncatedOutput
                      content={result.compileOutput}
                      className="rounded-lg border bg-muted/50 p-3 font-mono text-sm whitespace-pre-wrap text-red-600"
                    />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
