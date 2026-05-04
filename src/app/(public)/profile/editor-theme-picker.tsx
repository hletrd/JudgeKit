"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { indentUnit, bracketMatching } from "@codemirror/language";
import { cn } from "@/lib/utils";
import {
  EDITOR_THEMES,
  SAMPLE_CODE,
  loadEditorTheme,
  DEFAULT_LIGHT_THEME,
} from "@/lib/code/editor-themes";
import { updatePreferences } from "@/lib/actions/update-preferences";
import type { ValidThemeId } from "@/lib/code/problem-code-themes";
import { toast } from "sonner";

type EditorThemePickerProps = {
  initialTheme: string;
};

const baseEditorTheme = EditorView.theme({
  "&": { fontSize: "0.8125rem" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-content": { padding: "0.75rem" },
  ".cm-line": { padding: 0 },
  "&.cm-focused": { outline: "none" },
});

export function EditorThemePicker({ initialTheme }: EditorThemePickerProps) {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [selectedTheme, setSelectedTheme] = useState(
    initialTheme || DEFAULT_LIGHT_THEME
  );
  const [saving, setSaving] = useState(false);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const pythonExtRef = useRef<Extension | null>(null);

  const lightThemes = useMemo(
    () => EDITOR_THEMES.filter((t) => !t.isDark),
    []
  );
  const darkThemes = useMemo(
    () => EDITOR_THEMES.filter((t) => t.isDark),
    []
  );

  const buildEditor = useCallback((themeExt: Extension[]) => {
    const host = editorHostRef.current;
    if (!host) return;

    editorViewRef.current?.destroy();

    const extensions: Extension[] = [
      lineNumbers(),
      EditorState.tabSize.of(4),
      indentUnit.of("    "),
      bracketMatching(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      baseEditorTheme,
      ...themeExt,
    ];

    if (pythonExtRef.current) {
      extensions.push(pythonExtRef.current);
    }

    const state = EditorState.create({
      doc: SAMPLE_CODE,
      extensions,
    });

    editorViewRef.current = new EditorView({ parent: host, state });
  }, []);

  // Load Python extension once
  useEffect(() => {
    import("@codemirror/lang-python").then(({ python }) => {
      pythonExtRef.current = python();
    });
  }, []);

  // Build/rebuild editor when theme changes
  useEffect(() => {
    if (!editorHostRef.current) return;

    let cancelled = false;

    async function applyTheme() {
      // Wait for Python if not loaded yet
      if (!pythonExtRef.current) {
        const { python } = await import("@codemirror/lang-python");
        pythonExtRef.current = python();
      }

      if (cancelled) return;

      const themeExt = await loadEditorTheme(selectedTheme);
      if (cancelled) return;

      if (selectedTheme === "material-lighter") {
        const { HighlightStyle, syntaxHighlighting } = await import("@codemirror/language");
        const { tags } = await import("@lezer/highlight");
        if (cancelled) return;

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
          { tag: tags.function(tags.variableName), color: "#6182B8" },
          { tag: tags.definition(tags.variableName), color: "#546E7A" },
          { tag: tags.variableName, color: "#546E7A" },
          { tag: tags.typeName, color: "#E2931D" },
          { tag: tags.className, color: "#E2931D" },
          { tag: tags.self, color: "#7C4DFF" },
        ]);
        buildEditor([
          syntaxHighlighting(materialLightHighlightStyle),
          EditorView.theme({
            "&": { backgroundColor: "#FAFAFA", color: "#546E7A" },
          }),
        ]);
      } else {
        buildEditor(themeExt);
      }
    }

    void applyTheme();

    return () => {
      cancelled = true;
    };
  }, [selectedTheme, buildEditor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updatePreferences({ editorTheme: selectedTheme as ValidThemeId });
      if (result.success) {
        toast.success(t("updateSuccess"));
        router.refresh();
      } else {
        toast.error(t("updateError"));
      }
    } catch {
      toast.error(t("updateError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium mb-1.5">{t("editorThemeLight")}</p>
          <div className="flex flex-wrap gap-1.5">
            {lightThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setSelectedTheme(theme.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedTheme === theme.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-1.5">{t("editorThemeDark")}</p>
          <div className="flex flex-wrap gap-1.5">
            {darkThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setSelectedTheme(theme.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedTheme === theme.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm" style={{ minHeight: 200 }}>
        <div ref={editorHostRef} />
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || selectedTheme === initialTheme}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {saving ? tCommon("loading") : tCommon("save")}
      </button>
    </div>
  );
}
