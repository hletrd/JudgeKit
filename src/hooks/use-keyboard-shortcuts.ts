"use client";

import { useEffect, useCallback } from "react";

type ShortcutMap = Record<string, () => void>;

/**
 * Register global keyboard shortcuts. Active only when no input/textarea
 * or CodeMirror editor has focus.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs, textareas, or CodeMirror editors
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      // Check for CodeMirror focus
      const cmFocused = (e.target as HTMLElement)?.closest?.(".cm-content");
      if (cmFocused) return;

      // Ignore when modifier keys are pressed (except for our own shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const handler = shortcuts[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
