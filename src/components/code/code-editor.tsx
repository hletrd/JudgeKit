"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Maximize2, Minimize2 } from "lucide-react";
import { CodeEditorSkeleton } from "./code-editor-skeleton";
import { RAW_TEXTAREA_LANGUAGES } from "@/lib/code/language-map";
import { cn } from "@/lib/utils";

const CodeSurface = dynamic(
  () => import("./code-surface").then((m) => ({ default: m.CodeSurface })),
  { ssr: false, loading: () => <CodeEditorSkeleton minHeight={300} /> }
);

type CodeEditorProps = {
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  editorTheme?: string | null;
  id?: string;
  language?: string | null;
  lineWrapping?: boolean;
  minHeight?: number;
  onSubmitShortcut?: () => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  showFullscreen?: boolean;
  value: string;
};

export function CodeEditor(props: CodeEditorProps) {
  const { minHeight, onSubmitShortcut, onValueChange, showFullscreen = false, lineWrapping, ...surfaceProps } = props;
  const height = minHeight ?? 300;
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => setIsFullscreen((f) => !f), []);

  useEffect(() => {
    if (!isFullscreen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsFullscreen(false);
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  const fullscreenOverlay = isFullscreen
    ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col p-4"
    : "";

  const editorContent = props.language && RAW_TEXTAREA_LANGUAGES.has(props.language) ? (
    <textarea
      id={props.id}
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledby}
      className={cn(
        "code-surface code-surface-default w-full overflow-auto rounded-xl border bg-[var(--code-surface-background)] p-4 font-mono text-sm text-[var(--code-surface-foreground)] leading-relaxed shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15 focus:outline-none",
        isFullscreen && "flex-1",
        props.className,
      )}
      style={isFullscreen ? { tabSize: 4, whiteSpace: "pre" } : { minHeight: height, tabSize: 4, whiteSpace: "pre", resize: "vertical" }}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          onSubmitShortcut?.();
        }
      }}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
    />
  ) : (
    <CodeSurface
      {...surfaceProps}
      minHeight={isFullscreen ? undefined : height}
      lineWrapping={lineWrapping}
      onSubmitShortcut={onSubmitShortcut}
      onValueChangeAction={onValueChange}
    />
  );

  return (
    <div className={fullscreenOverlay || undefined}>
      {!isFullscreen && showFullscreen && (
        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Fullscreen (F) · Exit (Esc)"
            aria-label="Fullscreen (F)"
          >
            <Maximize2 className="size-3.5" />
            <span>F</span>
          </button>
        </div>
      )}
      {isFullscreen && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">
            {props.language ?? "Code Editor"}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Exit fullscreen (Esc)"
            aria-label="Exit fullscreen (Esc)"
          >
            <Minimize2 className="size-3.5" />
            Exit
          </button>
        </div>
      )}
      {editorContent}
    </div>
  );
}
