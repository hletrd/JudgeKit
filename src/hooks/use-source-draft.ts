"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

const STORAGE_PREFIX = "oj:submission-draft";
const LANGUAGE_PREF_PREFIX = "oj:preferred-language";
const STORAGE_VERSION = 1;
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SAVE_DEBOUNCE_MS = 500;

type DraftPayload = {
  version: number;
  updatedAt: number;
  latestLanguage: string | null;
  drafts: Record<string, string>;
};

type DraftState = {
  drafts: Record<string, string>;
  latestLanguage: string | null;
};

type DraftStoreState = DraftState & {
  selectedLanguage: string;
  initialDrafts: Record<string, string>;
  hydratedFallbackLanguage: string;
  isReady: boolean;
};

type DraftStore = {
  getSnapshot: () => DraftStoreState;
  getServerSnapshot: () => DraftStoreState;
  subscribe: (listener: () => void) => () => void;
  updateSnapshot: (updater: (state: DraftStoreState) => DraftStoreState) => DraftStoreState;
  replaceSnapshot: (nextState: DraftStoreState) => DraftStoreState;
};

type UseSourceDraftOptions = {
  userId: string;
  problemId: string;
  languages: readonly string[];
  initialLanguage: string;
};

type UseSourceDraftResult = {
  language: string;
  setLanguage: (language: string) => void;
  sourceCode: string;
  setSourceCode: (sourceCode: string) => void;
  isDirty: boolean;
  clearAllDrafts: () => void;
  clearDraft: (language?: string) => void;
};

function getStorageKey(userId: string, problemId: string) {
  return `${STORAGE_PREFIX}:${userId}:${problemId}`;
}

function getPreferredLanguage(userId: string, languages: readonly string[]): string | null {
  try {
    const value = window.localStorage.getItem(`${LANGUAGE_PREF_PREFIX}:${userId}`);
    if (value && languages.includes(value)) return value;
  } catch {}
  return null;
}

function savePreferredLanguage(userId: string, language: string) {
  try {
    window.localStorage.setItem(`${LANGUAGE_PREF_PREFIX}:${userId}`, language);
  } catch {}
}

function normalizeDrafts(drafts: unknown, languages: readonly string[]) {
  if (!drafts || typeof drafts !== "object") {
    return {};
  }

  const allowedLanguages = new Set(languages);
  const normalizedEntries = Object.entries(drafts).filter(
    ([language, value]) => allowedLanguages.has(language) && typeof value === "string" && value.length > 0,
  );

  return Object.fromEntries(normalizedEntries);
}

function resolveLatestLanguage(latestLanguage: string | null, drafts: Record<string, string>, languages: readonly string[]) {
  if (latestLanguage && drafts[latestLanguage]) {
    return latestLanguage;
  }

  for (const language of languages) {
    if (drafts[language]) {
      return language;
    }
  }

  const [fallbackLanguage] = Object.keys(drafts);
  return fallbackLanguage ?? null;
}

function createEmptyDraftState(): DraftState {
  return {
    drafts: {},
    latestLanguage: null,
  };
}

function createDraftStoreState(
  state: DraftState,
  languages: readonly string[],
  fallbackLanguage: string,
  options: {
    initialDrafts?: Record<string, string>;
    hydratedFallbackLanguage?: string;
    isReady?: boolean;
  } = {},
): DraftStoreState {
  return {
    ...state,
    selectedLanguage:
      resolveLatestLanguage(state.latestLanguage, state.drafts, languages) ?? fallbackLanguage,
    initialDrafts: options.initialDrafts ?? {},
    hydratedFallbackLanguage: options.hydratedFallbackLanguage ?? fallbackLanguage,
    isReady: options.isReady ?? false,
  };
}

function getPersistedDraftState(state: DraftStoreState): DraftState {
  return {
    drafts: state.drafts,
    latestLanguage: state.latestLanguage,
  };
}

function subscribeToHydration() {
  return () => {};
}

function createDraftStore(
  languages: readonly string[],
  fallbackLanguage: string
): DraftStore {
  const serverSnapshot = createDraftStoreState(createEmptyDraftState(), languages, fallbackLanguage);
  let snapshot = serverSnapshot;
  const listeners = new Set<() => void>();

  function notifyListeners() {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    updateSnapshot(updater) {
      snapshot = updater(snapshot);
      notifyListeners();

      return snapshot;
    },
    replaceSnapshot(nextState) {
      snapshot = nextState;
      notifyListeners();
      return snapshot;
    },
  };
}

function readDraftPayload(storageKey: string, languages: readonly string[]) {
  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return createEmptyDraftState();
    }

    const parsedValue = JSON.parse(rawValue) as Partial<DraftPayload>;

    if (parsedValue.version !== STORAGE_VERSION || typeof parsedValue.updatedAt !== "number") {
      window.localStorage.removeItem(storageKey);
      return createEmptyDraftState();
    }

    if (Date.now() - parsedValue.updatedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(storageKey);
      return createEmptyDraftState();
    }

    const drafts = normalizeDrafts(parsedValue.drafts, languages);
    const latestLanguage = resolveLatestLanguage(
      typeof parsedValue.latestLanguage === "string" ? parsedValue.latestLanguage : null,
      drafts,
      languages,
    );

    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(storageKey);
      return createEmptyDraftState();
    }

    return {
      drafts,
      latestLanguage,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return createEmptyDraftState();
  }
}

export function useSourceDraft({ userId, problemId, languages, initialLanguage }: UseSourceDraftOptions): UseSourceDraftResult {
  const languagesSignature = useMemo(() => languages.join("\u0000"), [languages]);
  const availableLanguages = useMemo(
    () => (languages.length > 0 ? [...languages] : [initialLanguage]),
    [initialLanguage, languagesSignature],
  );
  const fallbackLanguage = useMemo(
    () => initialLanguage ?? availableLanguages[0],
    [availableLanguages, initialLanguage],
  );
  const storageKey = useMemo(() => getStorageKey(userId, problemId), [problemId, userId]);
  const draftStore = useMemo(
    () => createDraftStore(availableLanguages, fallbackLanguage),
    [availableLanguages, fallbackLanguage],
  );

  const hasHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const draftState = useSyncExternalStore(
    draftStore.subscribe,
    draftStore.getSnapshot,
    draftStore.getServerSnapshot,
  );

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const nextFallbackLanguage =
      getPreferredLanguage(userId, availableLanguages) ?? initialLanguage ?? availableLanguages[0];
    const persistedDraftState = readDraftPayload(storageKey, availableLanguages);
    const hydratedState = createDraftStoreState(
      persistedDraftState,
      availableLanguages,
      nextFallbackLanguage,
      {
        initialDrafts: { ...persistedDraftState.drafts },
        hydratedFallbackLanguage: nextFallbackLanguage,
        isReady: true,
      },
    );

    draftStore.replaceSnapshot(hydratedState);
  }, [availableLanguages, draftStore, hasHydrated, initialLanguage, storageKey, userId]);

  const persistDraftState = useCallback(
    (state: DraftState) => {
      try {
        const drafts = normalizeDrafts(state.drafts, availableLanguages);

        if (Object.keys(drafts).length === 0) {
          window.localStorage.removeItem(storageKey);
          return;
        }

        const payload: DraftPayload = {
          version: STORAGE_VERSION,
          updatedAt: Date.now(),
          latestLanguage: resolveLatestLanguage(state.latestLanguage, drafts, availableLanguages),
          drafts,
        };

        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        return;
      }
    },
    [availableLanguages, storageKey],
  );

  useEffect(() => {
    if (!hasHydrated || !draftState.isReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      persistDraftState(getPersistedDraftState(draftState));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draftState, hasHydrated, persistDraftState]);

  useEffect(() => {
    if (!hasHydrated || !draftState.isReady) {
      return;
    }

    const flushDraftState = () => {
      persistDraftState(getPersistedDraftState(draftStore.getSnapshot()));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraftState();
      }
    };

    window.addEventListener("pagehide", flushDraftState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushDraftState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushDraftState();
    };
  }, [draftState.isReady, draftStore, hasHydrated, persistDraftState]);

  const setLanguage = useCallback(
    (nextLanguage: string) => {
      savePreferredLanguage(userId, nextLanguage);
      draftStore.updateSnapshot((state) => ({
        ...state,
        selectedLanguage: nextLanguage,
      }));
    },
    [draftStore, userId],
  );

  const setSourceCode = useCallback(
    (nextSourceCode: string) => {
      draftStore.updateSnapshot((state) => {
        const nextDrafts = { ...state.drafts };
        const activeLanguage = state.selectedLanguage;

        if (nextSourceCode.length === 0) {
          delete nextDrafts[activeLanguage];
        } else {
          nextDrafts[activeLanguage] = nextSourceCode;
        }

        return {
          ...state,
          drafts: nextDrafts,
          latestLanguage:
            nextSourceCode.length === 0
              ? resolveLatestLanguage(
                  state.latestLanguage === activeLanguage ? null : state.latestLanguage,
                  nextDrafts,
                  availableLanguages,
                )
              : activeLanguage,
          selectedLanguage: activeLanguage,
        };
      });
    },
    [availableLanguages, draftStore],
  );

  const clearDraft = useCallback(
    (languageToClear?: string) => {
      const targetLanguage = languageToClear ?? draftStore.getSnapshot().selectedLanguage;
      const nextState = draftStore.updateSnapshot((state) => {
        const nextDrafts = { ...state.drafts };
        delete nextDrafts[targetLanguage];
        const nextLatestLanguage = resolveLatestLanguage(
          state.latestLanguage === targetLanguage ? null : state.latestLanguage,
          nextDrafts,
          availableLanguages,
        );

        return {
          ...state,
          drafts: nextDrafts,
          latestLanguage: nextLatestLanguage,
          selectedLanguage:
            state.selectedLanguage === targetLanguage
              ? nextLatestLanguage ?? state.hydratedFallbackLanguage
              : state.selectedLanguage,
        };
      });

      persistDraftState(getPersistedDraftState(nextState));
    },
    [availableLanguages, draftStore, persistDraftState],
  );

  const clearAllDrafts = useCallback(() => {
    draftStore.updateSnapshot(() =>
      createDraftStoreState(createEmptyDraftState(), availableLanguages, draftState.hydratedFallbackLanguage, {
        initialDrafts: {},
        hydratedFallbackLanguage: draftState.hydratedFallbackLanguage,
        isReady: true,
      }),
    );
    window.localStorage.removeItem(storageKey);
  }, [availableLanguages, draftState.hydratedFallbackLanguage, draftStore, storageKey]);

  const isDirty = useMemo(() => {
    if (!hasHydrated || !draftState.isReady) return false;
    const currentDrafts = draftState.drafts;
    const currentKeys = Object.keys(currentDrafts);
    const initialKeys = Object.keys(draftState.initialDrafts);
    if (currentKeys.length !== initialKeys.length) return true;
    return currentKeys.some((key) => currentDrafts[key] !== draftState.initialDrafts[key]);
  }, [draftState.drafts, draftState.initialDrafts, draftState.isReady, hasHydrated]);

  return {
    language: draftState.selectedLanguage,
    setLanguage,
    sourceCode: draftState.drafts[draftState.selectedLanguage] ?? "",
    setSourceCode,
    isDirty,
    clearAllDrafts,
    clearDraft,
  };
}
