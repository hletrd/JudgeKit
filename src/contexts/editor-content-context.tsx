"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type EditorContent = { code: string; language: string } | null;

const EditorContentContext = createContext<{
  content: EditorContent;
  setContent: (content: EditorContent) => void;
}>({
  content: null,
  setContent: () => {},
});

export function EditorContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<EditorContent>(null);
  const value = useMemo(() => ({ content, setContent }), [content, setContent]);
  return (
    <EditorContentContext.Provider value={value}>
      {children}
    </EditorContentContext.Provider>
  );
}

export function useEditorContent() {
  return useContext(EditorContentContext);
}
