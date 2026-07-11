import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ProblemSubmissionForm } from "@/components/problem/problem-submission-form";
import { getAdapter } from "@/lib/judge/function-judging/registry";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })),
  parseApiResponse: vi.fn(async () => ({ ok: true, data: { data: {} } })),
}));

// Server-side draft recovery + editor-content context + navigation guard are
// orthogonal to stub preload / language gating — stub them out.
vi.mock("@/hooks/use-server-source-draft", () => ({
  useServerSourceDraft: () => {},
}));

vi.mock("@/hooks/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation: vi.fn() }),
}));

vi.mock("@/contexts/editor-content-context", () => ({
  useEditorContent: () => ({ setContent: vi.fn() }),
}));

// CodeEditor wraps CodeMirror — stub to a plain textarea exposing its value.
vi.mock("@/components/code/code-editor", () => ({
  CodeEditor: ({
    value,
    onValueChange,
    id,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    id?: string;
  }) => (
    <textarea data-testid="editor" id={id} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

// LanguageSelector — render one button per language so we can (a) assert the
// available set and (b) trigger a language switch deterministically.
vi.mock("@/components/language-selector", () => ({
  LanguageSelector: ({
    languages,
    onValueChange,
  }: {
    languages: Array<{ language: string }>;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="language-list">
      {languages.map((l) => (
        <button key={l.language} type="button" data-lang={l.language} onClick={() => onValueChange(l.language)}>
          {l.language}
        </button>
      ))}
    </div>
  ),
}));

// Minimal stateful stand-in for the localStorage-backed draft hook. Holds the
// selected language + per-language source, starting from initialLanguage with
// an empty editor (matching a fresh problem open).
vi.mock("@/hooks/use-source-draft", () => ({
  useSourceDraft: ({ initialLanguage }: { initialLanguage: string }) => {
    const [language, setLanguage] = useState(initialLanguage);
    const [sourceCode, setSourceCode] = useState("");
    return {
      language,
      setLanguage,
      sourceCode,
      setSourceCode,
      isDirty: false,
      clearAllDrafts: vi.fn(),
    };
  },
}));

const twoSum: FunctionSpec = {
  functionName: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returnType: "int[]",
  // python + cpp23 are function-judging languages; "rust" is enabled by the
  // author but NOT supported by the harness, so it must be gated out.
  enabledLanguages: ["python", "cpp23", "rust"],
};

const PYTHON_STARTER = "def solve():\n    pass\n";
const allLanguages = [
  { id: "1", language: "c", displayName: "C", standard: null },
  { id: "2", language: "python", displayName: "Python", standard: null, starterCode: PYTHON_STARTER },
  { id: "3", language: "cpp23", displayName: "C++", standard: "C++23" },
  { id: "4", language: "rust", displayName: "Rust", standard: null },
  { id: "5", language: "java", displayName: "Java", standard: null },
];

function baseProps() {
  return {
    userId: "user-1",
    problemId: "problem-1",
    languages: allLanguages,
    preferredLanguage: null,
    problemDefaultLanguage: null,
    siteDefaultLanguage: null,
    editorTheme: null,
  };
}

function editorValue(): string {
  return (screen.getByTestId("editor") as HTMLTextAreaElement).value;
}

function availableLangs(): string[] {
  return Array.from(screen.getByTestId("language-list").querySelectorAll("button")).map(
    (b) => b.getAttribute("data-lang") ?? "",
  );
}

describe("ProblemSubmissionForm — function-problem stub preload + language gating", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("limits the language dropdown to enabledLanguages ∩ FUNCTION_JUDGING_LANGUAGES", () => {
    render(
      <ProblemSubmissionForm
        {...baseProps()}
        problemType="function"
        functionSpec={twoSum}
        problemDefaultLanguage="python"
      />,
    );

    const langs = availableLangs();
    // python + cpp23 survive; rust (enabled but unsupported) and c/java (not
    // enabled by the author) are gated out.
    expect(langs.sort()).toEqual(["cpp23", "python"]);
    expect(langs).not.toContain("rust");
    expect(langs).not.toContain("c");
  });

  it("preloads the adapter stub for the selected language on open", async () => {
    render(
      <ProblemSubmissionForm
        {...baseProps()}
        problemType="function"
        functionSpec={twoSum}
        problemDefaultLanguage="python"
      />,
    );

    await waitFor(() => {
      expect(editorValue()).toBe(getAdapter("python").generateStub(twoSum));
    });
  });

  it("swaps to the new language's stub on language switch (does not clobber the prior stub)", async () => {
    render(
      <ProblemSubmissionForm
        {...baseProps()}
        problemType="function"
        functionSpec={twoSum}
        problemDefaultLanguage="python"
      />,
    );

    await waitFor(() => {
      expect(editorValue()).toBe(getAdapter("python").generateStub(twoSum));
    });

    fireEvent.click(screen.getByRole("button", { name: "cpp23" }));

    await waitFor(() => {
      expect(editorValue()).toBe(getAdapter("cpp23").generateStub(twoSum));
    });
  });

  it("does NOT overwrite code the student already wrote when switching language", async () => {
    render(
      <ProblemSubmissionForm
        {...baseProps()}
        problemType="function"
        functionSpec={twoSum}
        problemDefaultLanguage="python"
      />,
    );

    await waitFor(() => expect(editorValue()).toBe(getAdapter("python").generateStub(twoSum)));

    const studentCode = "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n";
    fireEvent.change(screen.getByTestId("editor"), { target: { value: studentCode } });
    expect(editorValue()).toBe(studentCode);

    fireEvent.click(screen.getByRole("button", { name: "cpp23" }));

    // Real work survives the language switch — no stub clobber.
    await new Promise((r) => setTimeout(r, 20));
    expect(editorValue()).toBe(studentCode);
  });

  it("normal (non-function) problem preloads the admin-configured starter, blank when unset", async () => {
    render(<ProblemSubmissionForm {...baseProps()} problemDefaultLanguage="c" />);

    // Full enabled-language list, unchanged.
    expect(availableLangs().sort()).toEqual(["c", "cpp23", "java", "python", "rust"].sort());

    // C has no configured starter → blank (default). Switching to python, which
    // DOES have a configured starter, preloads it into the empty editor.
    expect(editorValue()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "python" }));
    await waitFor(() => expect(editorValue()).toBe(PYTHON_STARTER));

    // Switching to rust (no configured starter) clears back to blank.
    fireEvent.click(screen.getByRole("button", { name: "rust" }));
    await waitFor(() => expect(editorValue()).toBe(""));
  });
});
