"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorCompartments } from "@/hooks/use-editor-compartments";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
  placeholder,
} from "@codemirror/view";
import { useTheme } from "next-themes";
import { useNonce } from "@/components/nonce-provider";
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
  onValueChangeAction?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  tone?: CodeSurfaceTone;
  value: string;
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

// Material Lighter highlight style (based on JetBrains Material Theme - Lighter)
const materialLightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#7C4DFF" },
  { tag: tags.controlKeyword, color: "#7C4DFF" },
  { tag: tags.operatorKeyword, color: "#7C4DFF" },
  { tag: tags.definitionKeyword, color: "#7C4DFF" },
  { tag: tags.moduleKeyword, color: "#7C4DFF" },
  { tag: tags.operator, color: "#39ADB5" },
  { tag: tags.punctuation, color: "#39ADB5" },
  { tag: tags.string, color: "#91B859" },
  { tag: tags.special(tags.string), color: "#F76D47" },
  { tag: tags.number, color: "#F76D47" },
  { tag: tags.bool, color: "#7C4DFF" },
  { tag: tags.null, color: "#7C4DFF" },
  { tag: tags.comment, color: "#90A4AE", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#90A4AE", fontStyle: "italic" },
  { tag: tags.lineComment, color: "#90A4AE", fontStyle: "italic" },
  { tag: tags.docComment, color: "#90A4AE", fontStyle: "italic" },
  { tag: tags.function(tags.variableName), color: "#6182B8" },
  { tag: tags.function(tags.definition(tags.variableName)), color: "#6182B8" },
  { tag: tags.definition(tags.variableName), color: "#546E7A" },
  { tag: tags.variableName, color: "#546E7A" },
  { tag: tags.typeName, color: "#E2931D" },
  { tag: tags.className, color: "#E2931D" },
  { tag: tags.definition(tags.typeName), color: "#E2931D" },
  { tag: tags.tagName, color: "#E53935" },
  { tag: tags.attributeName, color: "#F6A434" },
  { tag: tags.propertyName, color: "#6182B8" },
  { tag: tags.meta, color: "#39ADB5" },
  { tag: tags.processingInstruction, color: "#39ADB5" },
  { tag: tags.regexp, color: "#91B859" },
  { tag: tags.self, color: "#7C4DFF" },
  { tag: tags.atom, color: "#F76D47" },
  { tag: tags.escape, color: "#F76D47" },
  { tag: tags.heading, color: "#E53935", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, color: "#6182B8", textDecoration: "underline" },
  { tag: tags.invalid, color: "#FF5370" },
]);

// drawSelection() replaces native selection rendering with CodeMirror's own layer,
// which conflicts with iOS Safari's UIKit selection handles and touch input.
const isIOS =
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

const baseExtensions: Extension[] = [
  baseTheme,
  EditorState.tabSize.of(4),
  indentUnit.of("    "),
  history(),
  ...(isIOS ? [] : [drawSelection()]),
  highlightSpecialChars(),
  bracketMatching(),
  EditorView.lineWrapping,
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
];

async function getLanguageExtension(language: string | null | undefined): Promise<Extension[]> {
  switch (getCodeSurfaceLanguage(language)) {
    case "c":
    case "cpp":
      return [(await import("@codemirror/lang-cpp")).cpp()];
    case "python":
      return [(await import("@codemirror/lang-python")).python()];
    case "javascript":
      return [(await import("@codemirror/lang-javascript")).javascript()];
    case "typescript":
      return [(await import("@codemirror/lang-javascript")).javascript({ typescript: true })];
    case "java": {
      const { java } = await import("@codemirror/legacy-modes/mode/clike");
      return [StreamLanguage.define(java)];
    }
    case "kotlin": {
      const { kotlin } = await import("@codemirror/legacy-modes/mode/clike");
      return [StreamLanguage.define(kotlin)];
    }
    case "csharp": {
      const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
      return [StreamLanguage.define(csharp)];
    }
    case "go": {
      const { go } = await import("@codemirror/legacy-modes/mode/go");
      return [StreamLanguage.define(go)];
    }
    case "rust": {
      const { rust } = await import("@codemirror/legacy-modes/mode/rust");
      return [StreamLanguage.define(rust)];
    }
    case "swift": {
      const { swift } = await import("@codemirror/legacy-modes/mode/swift");
      return [StreamLanguage.define(swift)];
    }
    case "r": {
      const { r: rMode } = await import("@codemirror/legacy-modes/mode/r");
      return [StreamLanguage.define(rMode)];
    }
    case "perl": {
      const { perl: perlMode } = await import("@codemirror/legacy-modes/mode/perl");
      return [StreamLanguage.define(perlMode)];
    }
    case "php":
      return [(await import("@codemirror/lang-php")).php()];
    default:
      return [];
  }
}

function getHighlightExtension(isDark: boolean) {
  return syntaxHighlighting(isDark ? oneDarkHighlightStyle : materialLightHighlightStyle);
}

function getEditabilityExtension(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

function getMinHeightExtension(minHeight: number) {
  return EditorView.theme({
    "&": { minHeight: `${minHeight}px` },
    ".cm-scroller": { minHeight: `${minHeight}px` },
    ".cm-content": { minHeight: `${minHeight}px` },
  });
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
  onValueChangeAction,
  placeholder: placeholderText,
  readOnly = false,
  tone = "default",
  value,
}: CodeSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const nonce = useNonce();
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const onValueChangeRef = useRef(onValueChangeAction);
  const isSyncingRef = useRef(false);
  const { language: languageCompartmentRef, highlight: highlightCompartmentRef, minHeight: minHeightCompartmentRef, editability: editabilityCompartmentRef, placeholderComp: placeholderCompartmentRef, contentAttributes: contentAttributesCompartmentRef } = useEditorCompartments();
  const [initialEditorConfig] = useState(() => ({
    ariaLabel,
    ariaLabelledby,
    id,
    language,
    minHeight,
    nonce,
    placeholderText,
    readOnly,
    resolvedTheme,
    value,
  }));

  useEffect(() => {
    onValueChangeRef.current = onValueChangeAction;
  }, [onValueChangeAction]);

  useEffect(() => {
    if (!editorHostRef.current) {
      return undefined;
    }

    const state = EditorState.create({
      doc: initialEditorConfig.value,
      extensions: [
        ...baseExtensions,
        languageCompartmentRef.current.of([]),
        highlightCompartmentRef.current.of(
          getHighlightExtension(initialEditorConfig.resolvedTheme === "dark")
        ),
        minHeightCompartmentRef.current.of(getMinHeightExtension(initialEditorConfig.minHeight)),
        editabilityCompartmentRef.current.of(getEditabilityExtension(initialEditorConfig.readOnly)),
        placeholderCompartmentRef.current.of(
          !initialEditorConfig.readOnly && initialEditorConfig.placeholderText
            ? placeholder(initialEditorConfig.placeholderText)
            : []
        ),
        contentAttributesCompartmentRef.current.of(
          EditorView.contentAttributes.of(
            getContentAttributes(
              initialEditorConfig.id,
              initialEditorConfig.ariaLabel,
              initialEditorConfig.ariaLabelledby,
              initialEditorConfig.readOnly
            )
          )
        ),
        EditorView.cspNonce.of(initialEditorConfig.nonce ?? ""),
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

    let cancelled = false;
    getLanguageExtension(initialEditorConfig.language).then((ext) => {
      if (!cancelled && editorViewRef.current) {
        editorViewRef.current.dispatch({
          effects: languageCompartmentRef.current.reconfigure(ext),
        });
      }
    });

    return () => {
      cancelled = true;
      view.destroy();
      editorViewRef.current = null;
    };
  }, [initialEditorConfig]);

  useEffect(() => {
    let cancelled = false;
    getLanguageExtension(language).then((ext) => {
      if (!cancelled && editorViewRef.current) {
        editorViewRef.current.dispatch({
          effects: languageCompartmentRef.current.reconfigure(ext),
        });
      }
    });
    return () => { cancelled = true; };
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
      effects: minHeightCompartmentRef.current.reconfigure(getMinHeightExtension(minHeight)),
    });
  }, [minHeight]);

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
        contentAttributesCompartmentRef.current.reconfigure(
          EditorView.contentAttributes.of(
            getContentAttributes(id, ariaLabel, ariaLabelledby, readOnly)
          )
        ),
      ],
    });
  }, [ariaLabel, ariaLabelledby, id, placeholderText, readOnly]);

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
    try {
      view.dispatch({
        changes: {
          from: 0,
          insert: value,
          to: currentValue.length,
        },
      });
    } finally {
      isSyncingRef.current = false;
    }
  }, [value]);

  return (
    <div
      className={cn(
        "code-surface overflow-hidden rounded-xl border bg-card shadow-sm transition-colors",
        tone === "danger" ? "code-surface-danger" : "code-surface-default",
        readOnly ? "focus-within:border-border" : "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15",
        className
      )}
      style={{ minHeight: minHeight + 16 }}
    >
      <div ref={editorHostRef} />
    </div>
  );
}
