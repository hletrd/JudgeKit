"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CodeEditor } from "@/components/code/code-editor";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { Loader2, Play, AlertTriangle, Maximize2 } from "lucide-react";

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

type CompilerClientProps = {
  languages: CompilerLanguage[];
  title: string;
  description: string;
  preferredLanguage?: string | null;
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

export function CompilerClient({ languages, title, description, preferredLanguage }: CompilerClientProps) {
  const t = useTranslations("compiler");

  // MEDIUM FIX: Proper state initialization order
  const [initialState] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("compiler:language") : null;
    const defaultLanguage = saved && languages.some((l) => l.language === saved)
      ? saved
      : preferredLanguage && languages.some((l) => l.language === preferredLanguage)
        ? preferredLanguage
        : languages.find((l) => l.language === "python")?.language ?? languages[0]?.language;
    return {
      language: defaultLanguage,
      sourceCode: getDefaultCode(defaultLanguage ?? "python"),
    };
  });

  const [language, setLanguage] = useState(initialState.language);
  const [sourceCode, setSourceCode] = useState(initialState.sourceCode);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // HIGH FIX: Use ref to track isRunning for stale closure protection
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

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
      setResult(null);
      setError(null);
    },
    [language, sourceCode]
  );

  const handleRun = useCallback(async () => {
    // HIGH FIX: Check ref to prevent concurrent runs
    if (isRunningRef.current) {
      toast.info(t("alreadyRunning", { defaultValue: "Already running, please wait..." }));
      return;
    }

    // HIGH FIX: Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    isRunningRef.current = true;
    setIsRunning(true);
    setResult(null);
    setError(null);

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await apiFetch("/api/v1/compiler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, sourceCode, stdin }),
        signal: abortController.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.error || data.message || "Request failed";
        setError(errorMessage);
        // MEDIUM FIX: Add toast notification for errors
        toast.error(t("runFailed", { defaultValue: "Failed to run code" }), {
          description: errorMessage,
        });
        return;
      }

      setResult(data.data as CompilerResult);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was aborted, no error to show
        return;
      }
      const errorMessage = err instanceof Error ? err.message : "Network error";
      setError(errorMessage);
      // MEDIUM FIX: Add toast notification for network errors
      toast.error(t("networkError", { defaultValue: "Network error" }), {
        description: errorMessage,
      });
    } finally {
      isRunningRef.current = false;
      abortControllerRef.current = null;
      setIsRunning(false);
    }
  }, [language, sourceCode, stdin, t]);

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

  const activeTab = useMemo(() => {
    if (!result) return "stdout";
    if (result.compileOutput) return "compileOutput";
    if (result.stderr) return "stderr";
    return "stdout";
  }, [result]);

  // MEDIUM FIX: Show loading state when languages are empty
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
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Top bar: language + run */}
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

      {/* Main editor area */}
      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        {/* Left: Code editor + stdin */}
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
          <div className="flex flex-col gap-1">
            {/* HIGH FIX: Add proper label association */}
            <Label htmlFor="stdin-input" className="text-xs font-medium text-muted-foreground">
              {t("stdin", { defaultValue: "Standard Input" })}
            </Label>
            <textarea
              id="stdin-input"
              className="w-full rounded-lg border bg-transparent p-3 font-mono text-sm leading-relaxed focus:border-ring focus:ring-3 focus:ring-ring/15 focus:outline-none"
              style={{ minHeight: LAYOUT_CONSTANTS.STDIN_MIN_HEIGHT, resize: "vertical", tabSize: 4 }}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="1 2"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label={t("stdin", { defaultValue: "Standard input" })}
            />
          </div>
        </div>

        {/* Right: Output */}
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
              {/* Status bar */}
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

              {/* Output tabs */}
              <Tabs value={activeTab} className="flex flex-1 flex-col overflow-hidden">
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
