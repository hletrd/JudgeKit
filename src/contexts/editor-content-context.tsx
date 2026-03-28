"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

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
  return (
    <EditorContentContext.Provider value={{ content, setContent }}>
      {children}
    </EditorContentContext.Provider>
  );
}

export function useEditorContent() {
  return useContext(EditorContentContext);
}
