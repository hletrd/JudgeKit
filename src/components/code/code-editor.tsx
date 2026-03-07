"use client";

import { CodeSurface } from "./code-surface";

type CodeEditorProps = {
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  id?: string;
  language?: string | null;
  minHeight?: number;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function CodeEditor(props: CodeEditorProps) {
  return <CodeSurface {...props} minHeight={props.minHeight ?? 300} />;
}
