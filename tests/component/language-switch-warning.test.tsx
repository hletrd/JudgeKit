import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProblemSubmissionForm } from "@/components/problem/problem-submission-form";

// Uses the REAL per-language draft hook (useSourceDraft): the warning exists
// precisely because a language switch swaps the editor to another language's
// draft/starter, so a shared-state stand-in would hide the behavior under test.

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

vi.mock("@/hooks/use-server-source-draft", () => ({
  useServerSourceDraft: () => {},
}));

vi.mock("@/hooks/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({ allowNextNavigation: vi.fn() }),
}));

vi.mock("@/contexts/editor-content-context", () => ({
  useEditorContent: () => ({ setContent: vi.fn() }),
}));

vi.mock("@/components/code/code-editor", () => ({
  CodeEditor: ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

vi.mock("@/components/language-selector", () => ({
  LanguageSelector: ({
    languages,
    value,
    onValueChange,
  }: {
    languages: Array<{ language: string }>;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="language-list" data-selected={value}>
      {languages.map((l) => (
        <button key={l.language} type="button" onClick={() => onValueChange(l.language)}>
          {l.language}
        </button>
      ))}
    </div>
  ),
}));

const PYTHON_STARTER = "def main():\n    pass\n";
const languages = [
  { id: "1", language: "c17", displayName: "C", standard: "C17" },
  { id: "2", language: "python", displayName: "Python", standard: "3.14", starterCode: PYTHON_STARTER },
  { id: "3", language: "cpp23", displayName: "C++", standard: "C++23" },
];

function installLocalStorageShim() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    } satisfies Storage,
  });
}

function renderForm(initialLanguage: string) {
  return render(
    <ProblemSubmissionForm
      userId="user-1"
      problemId="problem-1"
      languages={languages}
      problemDefaultLanguage={initialLanguage}
    />,
  );
}

const editorValue = () => (screen.getByTestId("editor") as HTMLTextAreaElement).value;
const selectedLanguage = () => screen.getByTestId("language-list").getAttribute("data-selected");
const typeCode = (code: string) => fireEvent.change(screen.getByTestId("editor"), { target: { value: code } });

describe("ProblemSubmissionForm — language switch warning", () => {
  beforeEach(() => {
    installLocalStorageShim();
  });

  afterEach(() => {
    cleanup();
  });

  it("asks before a skeleton replaces the student's code, and switching back restores it", async () => {
    renderForm("c17");
    const studentCode = "int main(void) { return 0; }";
    typeCode(studentCode);

    fireEvent.click(screen.getByRole("button", { name: "python" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent('languageSwitchShowsStarter:{"language":"Python (3.14)"}');
    expect(dialog).toHaveTextContent('languageSwitchKeepsCode:{"language":"C (C17)"}');
    // Nothing has changed yet.
    expect(selectedLanguage()).toBe("c17");
    expect(editorValue()).toBe(studentCode);

    fireEvent.click(screen.getByRole("button", { name: "languageSwitchConfirm" }));

    await waitFor(() => expect(selectedLanguage()).toBe("python"));
    await waitFor(() => expect(editorValue()).toBe(PYTHON_STARTER));

    // The editor only holds the skeleton now, so going back needs no warning
    // and brings the C code back.
    fireEvent.click(screen.getByRole("button", { name: "c17" }));
    await waitFor(() => expect(selectedLanguage()).toBe("c17"));
    expect(editorValue()).toBe(studentCode);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("cancel keeps the current language and code", async () => {
    renderForm("c17");
    const studentCode = "int main(void) { return 1; }";
    typeCode(studentCode);

    fireEvent.click(screen.getByRole("button", { name: "cpp23" }));
    const dialog = await screen.findByRole("alertdialog");
    // cpp23 has no skeleton: the editor would go blank.
    expect(dialog).toHaveTextContent('languageSwitchShowsBlank:{"language":"C++ (C++23)"}');

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(selectedLanguage()).toBe("c17");
    expect(editorValue()).toBe(studentCode);
  });

  it("switches straight away while the editor only holds the skeleton", async () => {
    renderForm("python");
    await waitFor(() => expect(editorValue()).toBe(PYTHON_STARTER));

    fireEvent.click(screen.getByRole("button", { name: "cpp23" }));

    await waitFor(() => expect(selectedLanguage()).toBe("cpp23"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("warns that the target language's own draft will be shown", async () => {
    renderForm("c17");
    typeCode("int main(void) { return 2; }");

    // Write some C++ first (skeleton-less, so the C code above is not on screen
    // while doing it), then come back to C.
    fireEvent.click(screen.getByRole("button", { name: "cpp23" }));
    fireEvent.click(await screen.findByRole("button", { name: "languageSwitchConfirm" }));
    await waitFor(() => expect(selectedLanguage()).toBe("cpp23"));
    typeCode("int main() { return 3; }");

    fireEvent.click(screen.getByRole("button", { name: "c17" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent('languageSwitchShowsDraft:{"language":"C (C17)"}');
  });
});
