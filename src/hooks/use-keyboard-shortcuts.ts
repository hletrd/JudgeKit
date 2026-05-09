"use client";

import { useEffect, useCallback, useRef } from "react";

type ShortcutMap = Record<string, () => void>;

function getShortcutKey(e: KeyboardEvent): string {
  const modifiers: string[] = [];
  if (e.ctrlKey) modifiers.push("Ctrl");
  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");
  if (e.metaKey) modifiers.push("Meta");

  // If the key itself is a modifier, don't include it in the modifiers list
  const modifierKeys = new Set(["Control", "Alt", "Shift", "Meta"]);
  if (modifierKeys.has(e.key)) {
    return e.key;
  }

  return modifiers.length > 0 ? `${modifiers.join("+")}+${e.key}` : e.key;
}

/**
 * Register global keyboard shortcuts. Active only when no input/textarea
 * or CodeMirror editor has focus. Uses a ref to avoid re-attaching the
 * listener on every render when the shortcuts object changes identity.
 *
 * Shortcut keys can include modifiers using the format "Ctrl+k", "Alt+p",
 * "Shift+Enter", "Ctrl+Shift+s", etc. Plain keys like "n" only match when
 * no modifier keys are pressed.
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

      // Ignore modifier keys by themselves — they are not actionable shortcuts
      const modifierKeys = new Set(["Control", "Alt", "Shift", "Meta"]);
      if (modifierKeys.has(e.key)) return;

      const key = getShortcutKey(e);
      const handler = shortcutsRef.current[key];
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
