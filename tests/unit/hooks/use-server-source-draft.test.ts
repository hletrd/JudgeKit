// @vitest-environment jsdom

import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock, isTemplateLikeMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  isTemplateLikeMock: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiFetch: apiFetchMock }));
vi.mock("@/lib/judge/code-templates", () => ({ isTemplateLike: isTemplateLikeMock }));

import { useServerSourceDraft } from "@/hooks/use-server-source-draft";

function getResponse(drafts: Array<{ language: string; sourceCode: string }>) {
  return { ok: true, json: () => Promise.resolve({ data: { drafts } }) };
}

describe("useServerSourceDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: GET returns a stored python draft.
    apiFetchMock.mockResolvedValue(getResponse([{ language: "python", sourceCode: "RESTORED" }]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores the server draft into an empty/template editor", async () => {
    isTemplateLikeMock.mockReturnValue(true); // editor is empty/template
    const setSourceCode = vi.fn();
    renderHook(() =>
      useServerSourceDraft({ problemId: "problem-1", language: "python", sourceCode: "", setSourceCode })
    );

    await waitFor(() => expect(setSourceCode).toHaveBeenCalledWith("RESTORED"));
    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/problems/problem-1/draft");
  });

  it("NEVER overwrites a non-empty editor with the server draft (no data loss)", async () => {
    isTemplateLikeMock.mockReturnValue(false); // editor has real local work
    const setSourceCode = vi.fn();
    renderHook(() =>
      useServerSourceDraft({
        problemId: "problem-1",
        language: "python",
        sourceCode: "my real in-progress code",
        setSourceCode,
      })
    );

    // Let the hydration GET resolve.
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(setSourceCode).not.toHaveBeenCalled();
  });

  it("does not restore when no server draft exists for the language", async () => {
    isTemplateLikeMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValue(getResponse([{ language: "cpp", sourceCode: "OTHER" }]));
    const setSourceCode = vi.fn();
    renderHook(() =>
      useServerSourceDraft({ problemId: "problem-1", language: "python", sourceCode: "", setSourceCode })
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(setSourceCode).not.toHaveBeenCalled();
  });

  it("fires onRestored (with the draft's updatedAt) exactly when a restore happens", async () => {
    isTemplateLikeMock.mockReturnValue(true);
    apiFetchMock.mockResolvedValue(
      getResponse([{ language: "python", sourceCode: "RESTORED", updatedAt: "2026-06-10T12:00:00.000Z" } as never])
    );
    const setSourceCode = vi.fn();
    const onRestored = vi.fn();
    renderHook(() =>
      useServerSourceDraft({ problemId: "problem-1", language: "python", sourceCode: "", setSourceCode, onRestored })
    );

    await waitFor(() => expect(setSourceCode).toHaveBeenCalledWith("RESTORED"));
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(onRestored).toHaveBeenCalledWith({ updatedAt: "2026-06-10T12:00:00.000Z" });
  });

  it("does NOT fire onRestored when the editor already has work (no restore)", async () => {
    isTemplateLikeMock.mockReturnValue(false);
    const setSourceCode = vi.fn();
    const onRestored = vi.fn();
    renderHook(() =>
      useServerSourceDraft({
        problemId: "problem-1",
        language: "python",
        sourceCode: "my real in-progress code",
        setSourceCode,
        onRestored,
      })
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("autosaves a meaningful change after the debounce (PUT) once hydrated", async () => {
    isTemplateLikeMock.mockReturnValue(false); // non-empty content throughout
    apiFetchMock.mockResolvedValue(getResponse([])); // no draft to restore
    const setSourceCode = vi.fn();

    const { rerender } = renderHook(
      ({ code }: { code: string }) =>
        useServerSourceDraft({ problemId: "problem-1", language: "python", sourceCode: code, setSourceCode }),
      { initialProps: { code: "console.log(1)" } }
    );

    // Wait for the one-time hydration GET to complete (gates autosave).
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    rerender({ code: "console.log(2)" }); // meaningful change
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const putCalls = apiFetchMock.mock.calls.filter((c) => c[1] && (c[1] as { method?: string }).method === "PUT");
    expect(putCalls.length).toBe(1);
    expect(JSON.parse((putCalls[0][1] as { body: string }).body)).toMatchObject({
      language: "python",
      sourceCode: "console.log(2)",
    });
  });
});
