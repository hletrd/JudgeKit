export const EDITOR_FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24] as const;
export const DEFAULT_EDITOR_FONT_SIZE = 14;

export const EDITOR_FONT_FAMILIES = [
  { id: "system", name: "System Default", css: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" },
  { id: "jetbrains-mono", name: "JetBrains Mono", css: "'JetBrains Mono', monospace" },
  { id: "fira-code", name: "Fira Code", css: "'Fira Code', monospace" },
  { id: "source-code-pro", name: "Source Code Pro", css: "'Source Code Pro', monospace" },
  { id: "roboto-mono", name: "Roboto Mono", css: "'Roboto Mono', monospace" },
  { id: "ubuntu-mono", name: "Ubuntu Mono", css: "'Ubuntu Mono', monospace" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", css: "'IBM Plex Mono', monospace" },
  { id: "cascadia-code", name: "Cascadia Code", css: "'Cascadia Code', monospace" },
  { id: "inconsolata", name: "Inconsolata", css: "'Inconsolata', monospace" },
] as const;
export const DEFAULT_EDITOR_FONT_FAMILY = "system";
