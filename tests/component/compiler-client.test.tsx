import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompilerClient } from "@/components/code/compiler-client";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

const translations: Record<string, string> = {
  language: "Language",
  run: "Run code",
  running: "Running...",
  alreadyRunning: "Already running",
  runFailed: "Run failed",
  networkError: "Network error",
  stdin: "Standard input",
  stdout: "Standard output",
  stderr: "Standard error",
  compileOutput: "Compile output",
  noOutput: "No output yet",
  testCaseLabel: "Test case {number}",
  addTestCase: "Add test case",
  removeTestCase: "Remove test case",
  timedOut: "Timed out",
  compileError: "Compile error",
  exitCode: "Exit code: {code}",
  executionTime: "Time: {time}ms",
  outputEmpty: "No output",
  outputTruncated: "Output truncated",
  showFullOutput: "Show full output",
  codeEditorLabel: "Code editor",
  fullscreenLabel: "Fullscreen",
  exitFullscreenLabel: "Exit fullscreen",
  exitFullscreen: "Exit",
  codeEditorFallback: "Code",
  loadingLanguages: "Loading languages...",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const template = translations[key] ?? key;
    if (values) {
      return Object.entries(values).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        template,
      );
    }
    return template;
  },
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/code/code-editor", () => ({
  CodeEditor: ({ language, value }: { language: string; value: string }) => (
    <div data-testid="code-editor" data-language={language}>
      {value}
    </div>
  ),
}));

vi.mock("@/components/language-selector", () => ({
  LanguageSelector: ({ value }: { value: string }) => (
    <div data-testid="language-selector">{value}</div>
  ),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
  parseApiResponse: async (res: { ok: boolean; json: () => Promise<unknown> }, fallback: unknown) => {
    try {
      const data = await res.json();
      return { ok: res.ok, data };
    } catch {
      return { ok: false, data: fallback };
    }
  },
}));

describe("CompilerClient", () => {
  const languages = [
    { id: "1", language: "python", displayName: "Python", standard: null, extension: ".py" },
    { id: "2", language: "javascript", displayName: "JavaScript", standard: null, extension: ".js" },
  ];

  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("hydrates the saved compiler language after mount", async () => {
    window.localStorage.setItem("compiler:language", "javascript");

    render(
      <CompilerClient
        languages={languages}
        title="Compiler"
        description="Run code"
        preferredLanguage="python"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("language-selector")).toHaveTextContent("javascript");
      expect(screen.getByTestId("code-editor")).toHaveAttribute("data-language", "javascript");
    });
  });

  it("supports multiple stdin test-case tabs with per-case names and results", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            stdout: "case-one",
            stderr: "",
            exitCode: 0,
            executionTimeMs: 5,
            timedOut: false,
            compileOutput: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            stdout: "case-two",
            stderr: "",
            exitCode: 0,
            executionTimeMs: 7,
            timedOut: false,
            compileOutput: null,
          },
        }),
      });

    render(
      <CompilerClient
        languages={languages}
        title="Compiler"
        description="Run code"
        preferredLanguage="python"
      />
    );

    // Test case 1 tab exists
    expect(screen.getAllByText("Test case 1").length).toBeGreaterThanOrEqual(1);

    // Run code on the first test case
    fireEvent.change(screen.getByLabelText(/standard input/i), { target: { value: "1 2" } });
    fireEvent.click(screen.getByRole("button", { name: /run code/i }));

    await waitFor(() => {
      expect(screen.getByText("case-one")).toBeInTheDocument();
    });

    // Add a second test case
    fireEvent.click(screen.getByRole("button", { name: /add test case/i }));

    // Type a custom name for the second test case
    const nameInput = screen.getByDisplayValue("Test case 2");
    fireEvent.change(nameInput, { target: { value: "Edge case" } });
    fireEvent.blur(nameInput);

    // Set stdin for the second test case
    const stdinTextareas = screen.getAllByLabelText(/standard input/i);
    fireEvent.change(stdinTextareas[0], { target: { value: "5 7" } });
    fireEvent.click(screen.getByRole("button", { name: /run code/i }));

    await waitFor(() => {
      expect(screen.getByText("case-two")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Edge case" })).toBeInTheDocument();
    });

    // Switch back to Test case 1
    const tc1Tabs = screen.getAllByRole("tab").filter((tab) => /test case 1/i.test(tab.textContent ?? ""));
    fireEvent.click(tc1Tabs[0]);
    await waitFor(() => {
      expect(screen.getByText("case-one")).toBeInTheDocument();
    });

    // Switch to the Edge case tab
    fireEvent.click(screen.getByRole("tab", { name: "Edge case" }));
    await waitFor(() => {
      expect(screen.getByText("case-two")).toBeInTheDocument();
    });
  });

  it("uses a custom run endpoint when provided", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          stdout: "3\\n",
          stderr: "",
          exitCode: 0,
          executionTimeMs: 5,
          timedOut: false,
          compileOutput: null,
        },
      }),
    });

    render(
      <CompilerClient
        languages={languages}
        title="Compiler"
        description="Run code"
        preferredLanguage="python"
        runEndpoint="/api/v1/playground/run"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /run code/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/playground/run",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
