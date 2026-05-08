"use client";

import { useEffect, useCallback, useRef } from "react";

type ShortcutMap = Record<string, () => void>;

/**
 * Register global keyboard shortcuts. Active only when no input/textarea
 * or CodeMirror editor has focus. Uses a ref to avoid re-attaching the
 * listener on every render when the shortcuts object changes identity.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs, textareas, or CodeMirror editors
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      // Check for CodeMirror focus
      const cmFocused = (e.target as HTMLElement)?.closest?.(".cm-content");
      if (cmFocused) return;

      const handler = shortcutsRef.current[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
