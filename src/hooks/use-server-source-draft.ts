"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import { isTemplateLike } from "@/lib/judge/code-templates";

interface UseServerSourceDraftOptions {
  problemId: string;
  language: string;
  sourceCode: string;
  setSourceCode: (code: string) => void;
  /** Disable entirely (e.g. for anonymous/preview contexts). Default true. */
  enabled?: boolean;
}

const AUTOSAVE_DEBOUNCE_MS = 3000;

/**
 * Additive server-side backup + recovery for the code editor, layered on top of
 * the existing localStorage draft (useSourceDraft). Lets unsubmitted work
 * survive a device crash / browser switch.
 *
 * SAFETY INVARIANTS (no data loss):
 *  - HYDRATION only ever replaces an EMPTY/template editor. localStorage
 *    hydrates synchronously on first render, so by the time this async GET
 *    resolves the editor already reflects any local work; a non-template editor
 *    is left untouched. Worst case is "no recovery", never "lost work".
 *  - AUTOSAVE is gated until after the initial hydration completes (so we never
 *    clobber the stored draft before reading it) and never saves empty/template
 *    content. It is best-effort: any failure leaves localStorage as the cache.
 */
export function useServerSourceDraft({
  problemId,
  language,
  sourceCode,
  setSourceCode,
  enabled = true,
}: UseServerSourceDraftOptions): void {
  const hydratedRef = useRef(false);
  const sourceRef = useRef(sourceCode);
  const languageRef = useRef(language);
  const setSourceRef = useRef(setSourceCode);
  const lastSavedRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sourceRef.current = sourceCode;
  }, [sourceCode]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    setSourceRef.current = setSourceCode;
  }, [setSourceCode]);

  // One-time hydration from the server draft (current language only).
  useEffect(() => {
    if (!enabled || hydratedRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/v1/problems/${problemId}/draft`);
        if (cancelled || !res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { data?: { drafts?: Array<{ language: string; sourceCode: string }> } }
          | null;
        const drafts = json?.data?.drafts ?? [];
        const match = drafts.find((d) => d.language === languageRef.current);
        // Only restore into an empty/template editor — never overwrite work.
        if (match && isTemplateLike(sourceRef.current)) {
          setSourceRef.current(match.sourceCode);
          lastSavedRef.current = match.sourceCode;
        }
      } catch {
        /* offline / failure: localStorage remains the fallback */
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, problemId]);

  // Debounced autosave of meaningful (non-template) changes.
  useEffect(() => {
    if (!enabled || !hydratedRef.current) return;
    if (sourceCode.trim().length === 0 || isTemplateLike(sourceCode)) return;
    if (sourceCode === lastSavedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const code = sourceRef.current;
      const lang = languageRef.current;
      lastSavedRef.current = code;
      void apiFetch(`/api/v1/problems/${problemId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, sourceCode: code }),
      }).catch(() => {
        /* best-effort; localStorage remains the primary cache */
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [enabled, problemId, sourceCode, language]);
}
