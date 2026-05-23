"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type LectureColorScheme = "dark" | "light" | "solarized";
type LectureFontScale = "1.25" | "1.5" | "1.75" | "2.0" | "2.5" | "3.0" | "3.5" | "4.0";

type LectureModeContextValue = {
  active: boolean;
  toggle: () => void;
  fontScale: LectureFontScale;
  setFontScale: (scale: LectureFontScale) => void;
  colorScheme: LectureColorScheme;
  setColorScheme: (scheme: LectureColorScheme) => void;
};

const LectureModeContext = createContext<LectureModeContextValue | null>(null);

// Module-level default with stable identity to prevent infinite re-renders
// when destructured into useEffect/useCallback dependency arrays.
const DEFAULT_LECTURE_MODE: LectureModeContextValue = {
  active: false,
  toggle: () => {},
  fontScale: "1.5" as LectureFontScale,
  setFontScale: () => {},
  colorScheme: "dark" as LectureColorScheme,
  setColorScheme: () => {},
};

export function useLectureMode() {
  return useContext(LectureModeContext) ?? DEFAULT_LECTURE_MODE;
}

export function LectureModeProvider({
  children,
  initialActive = false,
  initialFontScale = "1.5",
  initialColorScheme = "dark",
  persistAction,
}: {
  children: React.ReactNode;
  initialActive?: boolean;
  initialFontScale?: string;
  initialColorScheme?: string;
  persistAction?: (input: Record<string, string | null>) => Promise<unknown>;
}) {
  const [active, setActive] = useState(initialActive);
  const [fontScale, setFontScaleState] = useState<LectureFontScale>(
    (["1.25", "1.5", "1.75", "2.0", "2.5", "3.0", "3.5", "4.0"].includes(initialFontScale) ? initialFontScale : "1.5") as LectureFontScale
  );
  const [colorScheme, setColorSchemeState] = useState<LectureColorScheme>(
    (["dark", "light", "solarized"].includes(initialColorScheme) ? initialColorScheme : "dark") as LectureColorScheme
  );

  // Apply/remove CSS classes on <html>
  useEffect(() => {
    const html = document.documentElement;
    if (active) {
      html.classList.add("lecture-mode");
      html.classList.remove("lecture-theme-dark", "lecture-theme-light", "lecture-theme-solarized");
      html.classList.add(`lecture-theme-${colorScheme}`);
      html.style.setProperty("--lecture-font-scale", fontScale);
    } else {
      html.classList.remove("lecture-mode", "lecture-theme-dark", "lecture-theme-light", "lecture-theme-solarized");
      html.style.removeProperty("--lecture-font-scale");
    }
  }, [active, colorScheme, fontScale]);

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev;
      persistAction?.({ lectureMode: next ? "on" : null }).catch(() => {});
      return next;
    });
  }, [persistAction]);

  const setFontScale = useCallback((scale: LectureFontScale) => {
    setFontScaleState(scale);
    persistAction?.({ lectureFontScale: scale }).catch(() => {});
  }, [persistAction]);

  const setColorScheme = useCallback((scheme: LectureColorScheme) => {
    setColorSchemeState(scheme);
    persistAction?.({ lectureColorScheme: scheme }).catch(() => {});
  }, [persistAction]);

  const value = useMemo(() => ({
    active,
    toggle,
    fontScale,
    setFontScale,
    colorScheme,
    setColorScheme,
  }), [active, toggle, fontScale, setFontScale, colorScheme, setColorScheme]);

  return (
    <LectureModeContext.Provider value={value}>
      {children}
    </LectureModeContext.Provider>
  );
}
