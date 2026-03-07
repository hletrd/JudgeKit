"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder,
} from "@codemirror/view";
import { useTheme } from "next-themes";
import { getCodeSurfaceLanguage } from "@/lib/code/language-map";
import { cn } from "@/lib/utils";

type CodeSurfaceTone = "default" | "danger";

type CodeSurfaceProps = {
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  id?: string;
  language?: string | null;
  minHeight?: number;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  tone?: CodeSurfaceTone;
  value: string;
};

type CodeSurfaceStyle = CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

const baseTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--code-surface-background)",
    color: "var(--code-surface-foreground)",
    fontSize: "0.875rem",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--code-surface-caret)",
    minHeight: "var(--code-surface-min-height)",
    padding: "0.875rem",
  },
  ".cm-line": {
    padding: 0,
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--code-surface-selection)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--code-surface-active-line)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--code-surface-caret)",
  },
  ".cm-placeholder": {
    color: "var(--code-surface-placeholder)",
  },
  ".cm-panels, .cm-tooltip": {
    backgroundColor: "var(--code-surface-background)",
    borderColor: "var(--code-surface-border)",
    color: "var(--code-surface-foreground)",
  },
});

const baseExtensions: Extension[] = [
  baseTheme,
  history(),
  drawSelection(),
  highlightActiveLine(),
  highlightSpecialChars(),
  indentOnInput(),
  bracketMatching(),
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
];

function getLanguageExtension(language: string | null | undefined): LanguageSupport | Extension {
  switch (getCodeSurfaceLanguage(language)) {
    case "c":
    case "cpp":
      return cpp();
    case "python":
      return python();
    default:
      return [];
  }
}

function getHighlightExtension(isDark: boolean) {
  return syntaxHighlighting(isDark ? oneDarkHighlightStyle : defaultHighlightStyle, {
    fallback: true,
  });
}

function getEditabilityExtension(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function getSurfaceStyle(minHeight: number, tone: CodeSurfaceTone): CodeSurfaceStyle {
  if (tone === "danger") {
    return {
      "--code-surface-active-line": "color-mix(in oklch, var(--destructive) 9%, var(--muted))",
      "--code-surface-background": "color-mix(in oklch, var(--destructive) 5%, var(--card))",
      "--code-surface-border": "color-mix(in oklch, var(--destructive) 20%, var(--border))",
      "--code-surface-caret": "var(--destructive)",
      "--code-surface-foreground": "color-mix(in oklch, var(--destructive) 72%, var(--card-foreground))",
      "--code-surface-min-height": `${minHeight}px`,
      "--code-surface-placeholder": "var(--muted-foreground)",
      "--code-surface-selection": "color-mix(in oklch, var(--destructive) 16%, var(--card))",
    };
  }

  return {
    "--code-surface-active-line": "color-mix(in oklch, var(--accent) 78%, var(--card))",
    "--code-surface-background": "var(--card)",
    "--code-surface-border": "var(--border)",
    "--code-surface-caret": "var(--foreground)",
    "--code-surface-foreground": "var(--card-foreground)",
    "--code-surface-min-height": `${minHeight}px`,
    "--code-surface-placeholder": "var(--muted-foreground)",
    "--code-surface-selection": "color-mix(in oklch, var(--ring) 18%, var(--card))",
  };
}

function getContentAttributes(
  id: string | undefined,
  ariaLabel: string | undefined,
  ariaLabelledby: string | undefined,
  readOnly: boolean
) {
  return {
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    ...(ariaLabelledby ? { "aria-labelledby": ariaLabelledby } : {}),
    ...(readOnly ? { "aria-readonly": "true" } : {}),
    ...(id ? { id } : {}),
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
  };
}

export function CodeSurface({
  ariaLabel,
  ariaLabelledby,
  className,
  id,
  language,
  minHeight = 220,
  onValueChange,
  placeholder: placeholderText,
  readOnly = false,
  tone = "default",
  value,
}: CodeSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const onValueChangeRef = useRef(onValueChange);
  const isSyncingRef = useRef(false);
  const languageCompartmentRef = useRef(new Compartment());
  const highlightCompartmentRef = useRef(new Compartment());
  const editabilityCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());

  onValueChangeRef.current = onValueChange;

  const editorStyle = useMemo(() => getSurfaceStyle(minHeight, tone), [minHeight, tone]);

  useEffect(() => {
    if (!editorHostRef.current) {
      return undefined;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions,
        languageCompartmentRef.current.of(getLanguageExtension(language)),
        highlightCompartmentRef.current.of(getHighlightExtension(resolvedTheme === "dark")),
        editabilityCompartmentRef.current.of(getEditabilityExtension(readOnly)),
        placeholderCompartmentRef.current.of(
          !readOnly && placeholderText ? placeholder(placeholderText) : []
        ),
        EditorView.contentAttributes.of(
          getContentAttributes(id, ariaLabel, ariaLabelledby, readOnly)
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isSyncingRef.current) {
            return;
          }

          onValueChangeRef.current?.(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({
      parent: editorHostRef.current,
      state,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [ariaLabel, ariaLabelledby, id, readOnly]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: highlightCompartmentRef.current.reconfigure(
        getHighlightExtension(resolvedTheme === "dark")
      ),
    });
  }, [resolvedTheme]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: [
        editabilityCompartmentRef.current.reconfigure(getEditabilityExtension(readOnly)),
        placeholderCompartmentRef.current.reconfigure(
          !readOnly && placeholderText ? placeholder(placeholderText) : []
        ),
      ],
    });
  }, [placeholderText, readOnly]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();

    if (currentValue === value) {
      return;
    }

    isSyncingRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        insert: value,
        to: currentValue.length,
      },
    });
    isSyncingRef.current = false;
  }, [value]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm transition-colors",
        readOnly ? "focus-within:border-border" : "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15",
        className
      )}
      style={editorStyle}
    >
      <div ref={editorHostRef} />
    </div>
  );
}
