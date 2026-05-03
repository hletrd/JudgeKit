// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSourceDraft } from "@/hooks/use-source-draft";

const STORAGE_KEY = "oj:submission-draft:user-1:problem-1";
const PREFERENCE_KEY = "oj:preferred-language:user-1";

/**
 * jsdom 29 + vitest 4 ship a non-functional Storage on `window.localStorage`
 * (calling `setItem`/`clear` throws "is not a function"). Install a
 * minimal in-memory Storage shim so the hook's persistence path can be
 * exercised in isolation. The shim implements the full Storage interface so
 * `Object.keys`, `length`, and indexed access via `key()` all behave.
 */
function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: (index: number) => {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: shim,
  });
}

describe("useSourceDraft", () => {
  const languages = ["javascript", "python"];

  beforeEach(() => {
    installLocalStorageShim();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("hydrates stored drafts and preferred language after mount without marking the form dirty", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        latestLanguage: "python",
        drafts: {
          javascript: "console.log(1)",
          python: "print(1)",
        },
      }),
    );
    window.localStorage.setItem(PREFERENCE_KEY, "python");

    const { result } = renderHook(() =>
      useSourceDraft({
        userId: "user-1",
        problemId: "problem-1",
        languages,
        initialLanguage: "javascript",
      }),
    );

    await waitFor(() => expect(result.current.language).toBe("python"));
    expect(result.current.sourceCode).toBe("print(1)");
    expect(result.current.isDirty).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("preserves hydrated drafts when persisting after mount", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        latestLanguage: "javascript",
        drafts: {
          javascript: "console.log('kept')",
        },
      }),
    );

    const { result } = renderHook(() =>
      useSourceDraft({
        userId: "user-1",
        problemId: "problem-1",
        languages,
        initialLanguage: "python",
      }),
    );

    await waitFor(() => expect(result.current.sourceCode).toBe("console.log('kept')"));

    act(() => {
      result.current.setSourceCode("console.log('updated')");
    });

    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("console.log('updated')"),
    );
  });

  it("does not drop unsaved draft state when the languages prop is recreated with the same values", async () => {
    const { result, rerender } = renderHook(
      (props: { languages: string[] }) =>
        useSourceDraft({
          userId: "user-1",
          problemId: "problem-1",
          languages: props.languages,
          initialLanguage: "javascript",
        }),
      {
        initialProps: {
          languages: ["javascript", "python"],
        },
      },
    );

    await waitFor(() => expect(result.current.language).toBe("javascript"));

    act(() => {
      result.current.setSourceCode("console.log('draft')");
    });

    expect(result.current.sourceCode).toBe("console.log('draft')");

    rerender({
      languages: ["javascript", "python"],
    });

    expect(result.current.sourceCode).toBe("console.log('draft')");
    expect(result.current.isDirty).toBe(true);
  });
});
