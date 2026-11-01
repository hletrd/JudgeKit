import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateProblemForm, { type ProblemFormInitialData } from "@/app/(public)/problems/create/create-problem-form";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  getApiError: () => null,
  getApiData: (payload: { data?: unknown }) => payload.data,
}));

const PROBLEM: ProblemFormInitialData = {
  id: "problem-1",
  title: "A + B",
  description: "Add two numbers.",
  sequenceNumber: null,
  problemType: "auto",
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  visibility: "public",
  showCompileOutput: true,
  showDetailedResults: true,
  showRuntimeErrors: true,
  allowAiAssistant: true,
  comparisonMode: "exact",
  floatAbsoluteError: null,
  floatRelativeError: null,
  difficulty: null,
  defaultLanguage: null,
  testCases: [],
  tags: [],
};

async function saveAndGetBody() {
  fireEvent.submit(screen.getByRole("checkbox", { name: "allowAiAssistant" }).closest("form")!);
  await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  return JSON.parse((apiFetchMock.mock.calls[0][1] as RequestInit).body as string);
}

describe("CreateProblemForm AI assistant toggle", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "problem-1" } }), { status: 200 })
    );
  });

  it("keeps the stored setting when the platform mode forces AI off", async () => {
    render(<CreateProblemForm mode="edit" initialProblem={PROBLEM} forceDisableAiAssistant />);

    const checkbox = screen.getByRole("checkbox", { name: "allowAiAssistant" });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();

    // The mode restriction is applied at runtime; saving must not bake it
    // into the problem, or AI stays off after the mode changes back.
    const body = await saveAndGetBody();
    expect(body.allowAiAssistant).toBe(true);
  });

  it("saves the author's choice when the mode does not restrict AI", async () => {
    render(<CreateProblemForm mode="edit" initialProblem={PROBLEM} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "allowAiAssistant" }));

    const body = await saveAndGetBody();
    expect(body.allowAiAssistant).toBe(false);
  });
});
