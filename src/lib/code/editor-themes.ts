import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

export type EditorThemeDefinition = {
  id: string;
  label: string;
  isDark: boolean;
};

/**
 * Registry of available editor themes.
 * The actual CodeMirror extensions are loaded dynamically to keep the initial bundle small.
 */
export const EDITOR_THEMES: EditorThemeDefinition[] = [
  // Light themes
  { id: "material-lighter", label: "Material Lighter", isDark: false },
  { id: "ayu-light", label: "Ayu Light", isDark: false },
  { id: "clouds", label: "Clouds", isDark: false },
  { id: "noctis-lilac", label: "Noctis Lilac", isDark: false },
  { id: "rose-pine-dawn", label: "Rose Pine Dawn", isDark: false },
  { id: "solarized-light", label: "Solarized Light", isDark: false },
  { id: "smoothy", label: "Smoothy", isDark: false },
  { id: "github-light", label: "GitHub Light", isDark: false },
  { id: "catppuccin-latte", label: "Catppuccin Latte", isDark: false },
  // Dark themes — Popular
  { id: "one-dark", label: "One Dark", isDark: true },
  { id: "dracula", label: "Dracula", isDark: true },
  { id: "darcula", label: "Darcula (JetBrains)", isDark: true },
  { id: "monokai", label: "Monokai", isDark: true },
  { id: "tokyo-night", label: "Tokyo Night", isDark: true },
  { id: "nord", label: "Nord", isDark: true },
  { id: "night-owl", label: "Night Owl", isDark: true },
  { id: "synthwave-84", label: "Synthwave '84", isDark: true },
  { id: "material-palenight", label: "Material Palenight", isDark: true },
  { id: "ultraviolet", label: "Ultraviolet", isDark: true },
  { id: "kanagawa", label: "Kanagawa", isDark: true },
  { id: "panda-syntax", label: "Panda Syntax", isDark: true },
  { id: "solarized-dark", label: "Solarized Dark", isDark: true },
  { id: "vitesse-dark", label: "Vitesse Dark", isDark: true },
  // Dark themes — VS Code family
  { id: "vscode-dark", label: "VS Code Dark+", isDark: true },
  { id: "vscode-dark-modern", label: "VS Code Dark Modern", isDark: true },
  // Dark themes — Catppuccin / Gruvbox / Ayu
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", isDark: true },
  { id: "gruvbox-dark", label: "Gruvbox Dark", isDark: true },
  { id: "ayu-dark", label: "Ayu Dark", isDark: true },
  // Dark themes — Others
  { id: "cobalt", label: "Cobalt", isDark: true },
  { id: "amy", label: "Amy", isDark: true },
  { id: "cool-glow", label: "Cool Glow", isDark: true },
  { id: "espresso", label: "Espresso", isDark: true },
  { id: "tomorrow", label: "Tomorrow", isDark: true },
  // Light themes — VS Code family
  { id: "vscode-light", label: "VS Code Light+", isDark: false },
];

export const DEFAULT_LIGHT_THEME = "material-lighter";
export const DEFAULT_DARK_THEME = "one-dark";

export function getEditorThemeDefinition(id: string): EditorThemeDefinition | undefined {
  return EDITOR_THEMES.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Inline theme definitions (no extra npm packages)
// ---------------------------------------------------------------------------

function buildTheme(
  editorView: Parameters<typeof EditorView.theme>[0],
  highlightTags: Parameters<typeof HighlightStyle.define>[0]
): Extension[] {
  return [
    EditorView.theme(editorView),
    syntaxHighlighting(HighlightStyle.define(highlightTags)),
  ];
}

function githubLightTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#ffffff", color: "#24292e" },
      ".cm-content": { caretColor: "#24292e" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#24292e" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#b3d5f2",
      },
      ".cm-gutters": { backgroundColor: "#f6f8fa", color: "#6a737d", border: "none", borderRight: "1px solid #e1e4e8" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#f1f8ff" },
    },
    [
      { tag: tags.keyword, color: "#d73a49" },
      { tag: tags.controlKeyword, color: "#d73a49" },
      { tag: tags.operatorKeyword, color: "#d73a49" },
      { tag: tags.definitionKeyword, color: "#d73a49" },
      { tag: tags.moduleKeyword, color: "#d73a49" },
      { tag: tags.operator, color: "#d73a49" },
      { tag: tags.punctuation, color: "#24292e" },
      { tag: tags.string, color: "#032f62" },
      { tag: tags.special(tags.string), color: "#032f62" },
      { tag: tags.number, color: "#005cc5" },
      { tag: tags.bool, color: "#005cc5" },
      { tag: tags.null, color: "#005cc5" },
      { tag: tags.comment, color: "#6a737d", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#6a737d", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#6a737d", fontStyle: "italic" },
      { tag: tags.docComment, color: "#6a737d", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#6f42c1" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#6f42c1" },
      { tag: tags.definition(tags.variableName), color: "#e36209" },
      { tag: tags.variableName, color: "#24292e" },
      { tag: tags.typeName, color: "#6f42c1" },
      { tag: tags.className, color: "#6f42c1" },
      { tag: tags.tagName, color: "#22863a" },
      { tag: tags.attributeName, color: "#6f42c1" },
      { tag: tags.propertyName, color: "#005cc5" },
      { tag: tags.regexp, color: "#032f62" },
      { tag: tags.self, color: "#005cc5" },
      { tag: tags.atom, color: "#005cc5" },
      { tag: tags.escape, color: "#032f62" },
      { tag: tags.heading, color: "#005cc5", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#032f62", textDecoration: "underline" },
      { tag: tags.invalid, color: "#b31d28" },
    ]
  );
}

function catppuccinLatteTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#eff1f5", color: "#4c4f69" },
      ".cm-content": { caretColor: "#dc8a78" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#dc8a78" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#acb0be",
      },
      ".cm-gutters": { backgroundColor: "#e6e9ef", color: "#8c8fa1", border: "none", borderRight: "1px solid #ccd0da" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#e6e9ef" },
    },
    [
      { tag: tags.keyword, color: "#8839ef" },
      { tag: tags.controlKeyword, color: "#8839ef" },
      { tag: tags.operatorKeyword, color: "#8839ef" },
      { tag: tags.definitionKeyword, color: "#8839ef" },
      { tag: tags.moduleKeyword, color: "#8839ef" },
      { tag: tags.operator, color: "#04a5e5" },
      { tag: tags.punctuation, color: "#4c4f69" },
      { tag: tags.string, color: "#40a02b" },
      { tag: tags.special(tags.string), color: "#fe640b" },
      { tag: tags.number, color: "#fe640b" },
      { tag: tags.bool, color: "#fe640b" },
      { tag: tags.null, color: "#fe640b" },
      { tag: tags.comment, color: "#8c8fa1", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#8c8fa1", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#8c8fa1", fontStyle: "italic" },
      { tag: tags.docComment, color: "#8c8fa1", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#1e66f5" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#1e66f5" },
      { tag: tags.definition(tags.variableName), color: "#4c4f69" },
      { tag: tags.variableName, color: "#4c4f69" },
      { tag: tags.typeName, color: "#df8e1d" },
      { tag: tags.className, color: "#df8e1d" },
      { tag: tags.tagName, color: "#d20f39" },
      { tag: tags.attributeName, color: "#fe640b" },
      { tag: tags.propertyName, color: "#1e66f5" },
      { tag: tags.regexp, color: "#40a02b" },
      { tag: tags.self, color: "#e64553" },
      { tag: tags.atom, color: "#fe640b" },
      { tag: tags.escape, color: "#fe640b" },
      { tag: tags.heading, color: "#1e66f5", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#04a5e5", textDecoration: "underline" },
      { tag: tags.invalid, color: "#d20f39" },
    ]
  );
}

function monokaiTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#272822", color: "#f8f8f2" },
      ".cm-content": { caretColor: "#f8f8f0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f8f8f0" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#49483e",
      },
      ".cm-gutters": { backgroundColor: "#272822", color: "#75715e", border: "none", borderRight: "1px solid #3e3d32" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#3e3d32" },
    },
    [
      { tag: tags.keyword, color: "#f92672" },
      { tag: tags.controlKeyword, color: "#f92672" },
      { tag: tags.operatorKeyword, color: "#f92672" },
      { tag: tags.definitionKeyword, color: "#f92672" },
      { tag: tags.moduleKeyword, color: "#f92672" },
      { tag: tags.operator, color: "#f92672" },
      { tag: tags.punctuation, color: "#f8f8f2" },
      { tag: tags.string, color: "#e6db74" },
      { tag: tags.special(tags.string), color: "#e6db74" },
      { tag: tags.number, color: "#ae81ff" },
      { tag: tags.bool, color: "#ae81ff" },
      { tag: tags.null, color: "#ae81ff" },
      { tag: tags.comment, color: "#75715e", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#75715e", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#75715e", fontStyle: "italic" },
      { tag: tags.docComment, color: "#75715e", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#a6e22e" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#a6e22e" },
      { tag: tags.definition(tags.variableName), color: "#f8f8f2" },
      { tag: tags.variableName, color: "#f8f8f2" },
      { tag: tags.typeName, color: "#66d9e8" },
      { tag: tags.className, color: "#a6e22e" },
      { tag: tags.tagName, color: "#f92672" },
      { tag: tags.attributeName, color: "#a6e22e" },
      { tag: tags.propertyName, color: "#66d9e8" },
      { tag: tags.regexp, color: "#e6db74" },
      { tag: tags.self, color: "#fd971f" },
      { tag: tags.atom, color: "#ae81ff" },
      { tag: tags.escape, color: "#ae81ff" },
      { tag: tags.heading, color: "#a6e22e", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#66d9e8", textDecoration: "underline" },
      { tag: tags.invalid, color: "#f92672" },
    ]
  );
}

function tokyoNightTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#1a1b26", color: "#a9b1d6" },
      ".cm-content": { caretColor: "#c0caf5" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#c0caf5" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#283457",
      },
      ".cm-gutters": { backgroundColor: "#1a1b26", color: "#3b3f5c", border: "none", borderRight: "1px solid #1e2030" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#1e2030" },
    },
    [
      { tag: tags.keyword, color: "#bb9af7" },
      { tag: tags.controlKeyword, color: "#bb9af7" },
      { tag: tags.operatorKeyword, color: "#bb9af7" },
      { tag: tags.definitionKeyword, color: "#bb9af7" },
      { tag: tags.moduleKeyword, color: "#bb9af7" },
      { tag: tags.operator, color: "#89ddff" },
      { tag: tags.punctuation, color: "#89ddff" },
      { tag: tags.string, color: "#9ece6a" },
      { tag: tags.special(tags.string), color: "#73daca" },
      { tag: tags.number, color: "#ff9e64" },
      { tag: tags.bool, color: "#ff9e64" },
      { tag: tags.null, color: "#ff9e64" },
      { tag: tags.comment, color: "#565f89", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#565f89", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#565f89", fontStyle: "italic" },
      { tag: tags.docComment, color: "#565f89", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#7aa2f7" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#7aa2f7" },
      { tag: tags.definition(tags.variableName), color: "#c0caf5" },
      { tag: tags.variableName, color: "#c0caf5" },
      { tag: tags.typeName, color: "#2ac3de" },
      { tag: tags.className, color: "#ff9e64" },
      { tag: tags.tagName, color: "#f7768e" },
      { tag: tags.attributeName, color: "#73daca" },
      { tag: tags.propertyName, color: "#7aa2f7" },
      { tag: tags.regexp, color: "#b4f9f8" },
      { tag: tags.self, color: "#f7768e" },
      { tag: tags.atom, color: "#ff9e64" },
      { tag: tags.escape, color: "#73daca" },
      { tag: tags.heading, color: "#7aa2f7", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#73daca", textDecoration: "underline" },
      { tag: tags.invalid, color: "#f7768e" },
    ]
  );
}

function catppuccinMochaTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#1e1e2e", color: "#cdd6f4" },
      ".cm-content": { caretColor: "#f5e0dc" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f5e0dc" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#585b70",
      },
      ".cm-gutters": { backgroundColor: "#181825", color: "#585b70", border: "none", borderRight: "1px solid #313244" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#181825" },
    },
    [
      { tag: tags.keyword, color: "#cba6f7" },
      { tag: tags.controlKeyword, color: "#cba6f7" },
      { tag: tags.operatorKeyword, color: "#cba6f7" },
      { tag: tags.definitionKeyword, color: "#cba6f7" },
      { tag: tags.moduleKeyword, color: "#cba6f7" },
      { tag: tags.operator, color: "#89dceb" },
      { tag: tags.punctuation, color: "#cdd6f4" },
      { tag: tags.string, color: "#a6e3a1" },
      { tag: tags.special(tags.string), color: "#fab387" },
      { tag: tags.number, color: "#fab387" },
      { tag: tags.bool, color: "#fab387" },
      { tag: tags.null, color: "#fab387" },
      { tag: tags.comment, color: "#6c7086", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#6c7086", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#6c7086", fontStyle: "italic" },
      { tag: tags.docComment, color: "#6c7086", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#89b4fa" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#89b4fa" },
      { tag: tags.definition(tags.variableName), color: "#cdd6f4" },
      { tag: tags.variableName, color: "#cdd6f4" },
      { tag: tags.typeName, color: "#f9e2af" },
      { tag: tags.className, color: "#f38ba8" },
      { tag: tags.tagName, color: "#f38ba8" },
      { tag: tags.attributeName, color: "#fab387" },
      { tag: tags.propertyName, color: "#89b4fa" },
      { tag: tags.regexp, color: "#a6e3a1" },
      { tag: tags.self, color: "#f38ba8" },
      { tag: tags.atom, color: "#fab387" },
      { tag: tags.escape, color: "#fab387" },
      { tag: tags.heading, color: "#89b4fa", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#89dceb", textDecoration: "underline" },
      { tag: tags.invalid, color: "#f38ba8" },
    ]
  );
}

function gruvboxDarkTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#282828", color: "#ebdbb2" },
      ".cm-content": { caretColor: "#ebdbb2" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ebdbb2" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#504945",
      },
      ".cm-gutters": { backgroundColor: "#3c3836", color: "#7c6f64", border: "none", borderRight: "1px solid #504945" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#3c3836" },
    },
    [
      { tag: tags.keyword, color: "#fb4934" },
      { tag: tags.controlKeyword, color: "#fb4934" },
      { tag: tags.operatorKeyword, color: "#fb4934" },
      { tag: tags.definitionKeyword, color: "#fe8019" },
      { tag: tags.moduleKeyword, color: "#fb4934" },
      { tag: tags.operator, color: "#8ec07c" },
      { tag: tags.punctuation, color: "#ebdbb2" },
      { tag: tags.string, color: "#b8bb26" },
      { tag: tags.special(tags.string), color: "#8ec07c" },
      { tag: tags.number, color: "#d3869b" },
      { tag: tags.bool, color: "#d3869b" },
      { tag: tags.null, color: "#d3869b" },
      { tag: tags.comment, color: "#928374", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#928374", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#928374", fontStyle: "italic" },
      { tag: tags.docComment, color: "#928374", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#fabd2f" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#fabd2f" },
      { tag: tags.definition(tags.variableName), color: "#ebdbb2" },
      { tag: tags.variableName, color: "#ebdbb2" },
      { tag: tags.typeName, color: "#83a598" },
      { tag: tags.className, color: "#8ec07c" },
      { tag: tags.tagName, color: "#fb4934" },
      { tag: tags.attributeName, color: "#fabd2f" },
      { tag: tags.propertyName, color: "#83a598" },
      { tag: tags.regexp, color: "#b8bb26" },
      { tag: tags.self, color: "#fe8019" },
      { tag: tags.atom, color: "#d3869b" },
      { tag: tags.escape, color: "#8ec07c" },
      { tag: tags.heading, color: "#fabd2f", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#83a598", textDecoration: "underline" },
      { tag: tags.invalid, color: "#fb4934" },
    ]
  );
}

function ayuDarkTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#0d1017", color: "#bfbdb6" },
      ".cm-content": { caretColor: "#e6b450" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#e6b450" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#33415580",
      },
      ".cm-gutters": { backgroundColor: "#0d1017", color: "#6c7380", border: "none", borderRight: "1px solid #131721" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#131721" },
    },
    [
      { tag: tags.keyword, color: "#ff8f40" },
      { tag: tags.controlKeyword, color: "#ff8f40" },
      { tag: tags.operatorKeyword, color: "#ff8f40" },
      { tag: tags.definitionKeyword, color: "#ff8f40" },
      { tag: tags.moduleKeyword, color: "#ff8f40" },
      { tag: tags.operator, color: "#f29668" },
      { tag: tags.punctuation, color: "#bfbdb6" },
      { tag: tags.string, color: "#aad94c" },
      { tag: tags.special(tags.string), color: "#95e6cb" },
      { tag: tags.number, color: "#e6b673" },
      { tag: tags.bool, color: "#e6b673" },
      { tag: tags.null, color: "#e6b673" },
      { tag: tags.comment, color: "#626a73", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#626a73", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#626a73", fontStyle: "italic" },
      { tag: tags.docComment, color: "#626a73", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#ffb454" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#ffb454" },
      { tag: tags.definition(tags.variableName), color: "#bfbdb6" },
      { tag: tags.variableName, color: "#bfbdb6" },
      { tag: tags.typeName, color: "#59c2ff" },
      { tag: tags.className, color: "#59c2ff" },
      { tag: tags.tagName, color: "#39bae6" },
      { tag: tags.attributeName, color: "#ffb454" },
      { tag: tags.propertyName, color: "#59c2ff" },
      { tag: tags.regexp, color: "#95e6cb" },
      { tag: tags.self, color: "#e6b450" },
      { tag: tags.atom, color: "#e6b673" },
      { tag: tags.escape, color: "#95e6cb" },
      { tag: tags.heading, color: "#59c2ff", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#59c2ff", textDecoration: "underline" },
      { tag: tags.invalid, color: "#ff3333" },
    ]
  );
}

function nordTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#2e3440", color: "#d8dee9" },
      ".cm-content": { caretColor: "#d8dee9" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#d8dee9" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#434c5e" },
      ".cm-gutters": { backgroundColor: "#2e3440", color: "#4c566a", border: "none", borderRight: "1px solid #3b4252" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#3b4252" },
    },
    [
      { tag: tags.keyword, color: "#81a1c1" },
      { tag: tags.controlKeyword, color: "#81a1c1" },
      { tag: tags.operatorKeyword, color: "#81a1c1" },
      { tag: tags.definitionKeyword, color: "#81a1c1" },
      { tag: tags.moduleKeyword, color: "#81a1c1" },
      { tag: tags.operator, color: "#81a1c1" },
      { tag: tags.punctuation, color: "#eceff4" },
      { tag: tags.string, color: "#a3be8c" },
      { tag: tags.special(tags.string), color: "#ebcb8b" },
      { tag: tags.number, color: "#b48ead" },
      { tag: tags.bool, color: "#81a1c1" },
      { tag: tags.null, color: "#81a1c1" },
      { tag: tags.comment, color: "#616e88", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#616e88", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#616e88", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#88c0d0" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#88c0d0" },
      { tag: tags.definition(tags.variableName), color: "#d8dee9" },
      { tag: tags.variableName, color: "#d8dee9" },
      { tag: tags.typeName, color: "#8fbcbb" },
      { tag: tags.className, color: "#8fbcbb" },
      { tag: tags.tagName, color: "#81a1c1" },
      { tag: tags.attributeName, color: "#8fbcbb" },
      { tag: tags.propertyName, color: "#88c0d0" },
      { tag: tags.regexp, color: "#ebcb8b" },
      { tag: tags.self, color: "#bf616a" },
      { tag: tags.atom, color: "#b48ead" },
      { tag: tags.escape, color: "#ebcb8b" },
      { tag: tags.heading, color: "#88c0d0", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#88c0d0", textDecoration: "underline" },
      { tag: tags.invalid, color: "#bf616a" },
    ]
  );
}

function nightOwlTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#011627", color: "#d6deeb" },
      ".cm-content": { caretColor: "#80a4c2" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#80a4c2" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#1d3b53" },
      ".cm-gutters": { backgroundColor: "#011627", color: "#4b6479", border: "none", borderRight: "1px solid #122d42" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#0b2942" },
    },
    [
      { tag: tags.keyword, color: "#c792ea" },
      { tag: tags.controlKeyword, color: "#c792ea" },
      { tag: tags.operatorKeyword, color: "#c792ea" },
      { tag: tags.definitionKeyword, color: "#c792ea" },
      { tag: tags.moduleKeyword, color: "#c792ea" },
      { tag: tags.operator, color: "#7fdbca" },
      { tag: tags.punctuation, color: "#d6deeb" },
      { tag: tags.string, color: "#ecc48d" },
      { tag: tags.special(tags.string), color: "#addb67" },
      { tag: tags.number, color: "#f78c6c" },
      { tag: tags.bool, color: "#ff5874" },
      { tag: tags.null, color: "#ff5874" },
      { tag: tags.comment, color: "#637777", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#637777", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#637777", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#82aaff" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#82aaff" },
      { tag: tags.definition(tags.variableName), color: "#d6deeb" },
      { tag: tags.variableName, color: "#d6deeb" },
      { tag: tags.typeName, color: "#ffcb8b" },
      { tag: tags.className, color: "#ffcb8b" },
      { tag: tags.tagName, color: "#caece6" },
      { tag: tags.attributeName, color: "#addb67" },
      { tag: tags.propertyName, color: "#7fdbca" },
      { tag: tags.regexp, color: "#5ca7e4" },
      { tag: tags.self, color: "#7fdbca" },
      { tag: tags.atom, color: "#f78c6c" },
      { tag: tags.escape, color: "#addb67" },
      { tag: tags.heading, color: "#82aaff", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#82aaff", textDecoration: "underline" },
      { tag: tags.invalid, color: "#ff5874" },
    ]
  );
}

function darculaTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#2b2b2b", color: "#a9b7c6" },
      ".cm-content": { caretColor: "#bbbbbb" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#bbbbbb" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#214283" },
      ".cm-gutters": { backgroundColor: "#313335", color: "#606366", border: "none", borderRight: "1px solid #555555" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#323232" },
    },
    [
      { tag: tags.keyword, color: "#cc7832" },
      { tag: tags.controlKeyword, color: "#cc7832" },
      { tag: tags.operatorKeyword, color: "#cc7832" },
      { tag: tags.definitionKeyword, color: "#cc7832" },
      { tag: tags.moduleKeyword, color: "#cc7832" },
      { tag: tags.operator, color: "#a9b7c6" },
      { tag: tags.punctuation, color: "#a9b7c6" },
      { tag: tags.string, color: "#6a8759" },
      { tag: tags.special(tags.string), color: "#6a8759" },
      { tag: tags.number, color: "#6897bb" },
      { tag: tags.bool, color: "#cc7832" },
      { tag: tags.null, color: "#cc7832" },
      { tag: tags.comment, color: "#808080", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#808080", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#808080", fontStyle: "italic" },
      { tag: tags.docComment, color: "#629755", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#ffc66d" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#ffc66d" },
      { tag: tags.definition(tags.variableName), color: "#a9b7c6" },
      { tag: tags.variableName, color: "#a9b7c6" },
      { tag: tags.typeName, color: "#a9b7c6" },
      { tag: tags.className, color: "#a9b7c6" },
      { tag: tags.tagName, color: "#e8bf6a" },
      { tag: tags.attributeName, color: "#bababa" },
      { tag: tags.propertyName, color: "#9876aa" },
      { tag: tags.regexp, color: "#646695" },
      { tag: tags.self, color: "#cc7832" },
      { tag: tags.atom, color: "#6897bb" },
      { tag: tags.escape, color: "#cc7832" },
      { tag: tags.heading, color: "#ffc66d", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#287bde", textDecoration: "underline" },
      { tag: tags.invalid, color: "#ff0000" },
    ]
  );
}

function synthwave84Theme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#262335", color: "#ffffff" },
      ".cm-content": { caretColor: "#ff7edb" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ff7edb" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#463465" },
      ".cm-gutters": { backgroundColor: "#262335", color: "#495495", border: "none", borderRight: "1px solid #34294f" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#34294f" },
    },
    [
      { tag: tags.keyword, color: "#fede5d" },
      { tag: tags.controlKeyword, color: "#fede5d" },
      { tag: tags.operatorKeyword, color: "#fede5d" },
      { tag: tags.definitionKeyword, color: "#fede5d" },
      { tag: tags.moduleKeyword, color: "#fede5d" },
      { tag: tags.operator, color: "#36f9f6" },
      { tag: tags.punctuation, color: "#ffffff" },
      { tag: tags.string, color: "#ff8b39" },
      { tag: tags.special(tags.string), color: "#ff8b39" },
      { tag: tags.number, color: "#f97e72" },
      { tag: tags.bool, color: "#f97e72" },
      { tag: tags.null, color: "#f97e72" },
      { tag: tags.comment, color: "#848bbd", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#848bbd", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#848bbd", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#36f9f6" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#36f9f6" },
      { tag: tags.definition(tags.variableName), color: "#ff7edb" },
      { tag: tags.variableName, color: "#ff7edb" },
      { tag: tags.typeName, color: "#fe4450" },
      { tag: tags.className, color: "#fe4450" },
      { tag: tags.tagName, color: "#72f1b8" },
      { tag: tags.attributeName, color: "#fede5d" },
      { tag: tags.propertyName, color: "#36f9f6" },
      { tag: tags.regexp, color: "#ff8b39" },
      { tag: tags.self, color: "#fe4450" },
      { tag: tags.atom, color: "#f97e72" },
      { tag: tags.escape, color: "#72f1b8" },
      { tag: tags.heading, color: "#36f9f6", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#72f1b8", textDecoration: "underline" },
      { tag: tags.invalid, color: "#fe4450" },
    ]
  );
}

function materialPalenightTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#292d3e", color: "#a6accd" },
      ".cm-content": { caretColor: "#ffcc00" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffcc00" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#3c435c" },
      ".cm-gutters": { backgroundColor: "#292d3e", color: "#3a3f58", border: "none", borderRight: "1px solid #3a3f58" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#32374c" },
    },
    [
      { tag: tags.keyword, color: "#c792ea" },
      { tag: tags.controlKeyword, color: "#c792ea" },
      { tag: tags.operatorKeyword, color: "#c792ea" },
      { tag: tags.definitionKeyword, color: "#c792ea" },
      { tag: tags.moduleKeyword, color: "#c792ea" },
      { tag: tags.operator, color: "#89ddff" },
      { tag: tags.punctuation, color: "#89ddff" },
      { tag: tags.string, color: "#c3e88d" },
      { tag: tags.special(tags.string), color: "#f07178" },
      { tag: tags.number, color: "#f78c6c" },
      { tag: tags.bool, color: "#f78c6c" },
      { tag: tags.null, color: "#f78c6c" },
      { tag: tags.comment, color: "#676e95", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#676e95", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#676e95", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#82aaff" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#82aaff" },
      { tag: tags.definition(tags.variableName), color: "#a6accd" },
      { tag: tags.variableName, color: "#a6accd" },
      { tag: tags.typeName, color: "#ffcb6b" },
      { tag: tags.className, color: "#ffcb6b" },
      { tag: tags.tagName, color: "#f07178" },
      { tag: tags.attributeName, color: "#c792ea" },
      { tag: tags.propertyName, color: "#82aaff" },
      { tag: tags.regexp, color: "#89ddff" },
      { tag: tags.self, color: "#f07178" },
      { tag: tags.atom, color: "#f78c6c" },
      { tag: tags.escape, color: "#89ddff" },
      { tag: tags.heading, color: "#82aaff", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#82aaff", textDecoration: "underline" },
      { tag: tags.invalid, color: "#ff5370" },
    ]
  );
}

function ultravioletTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#1a1037", color: "#bfbfbf" },
      ".cm-content": { caretColor: "#a855f7" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#a855f7" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#2d1b69" },
      ".cm-gutters": { backgroundColor: "#1a1037", color: "#4a3573", border: "none", borderRight: "1px solid #2d1b69" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#221548" },
    },
    [
      { tag: tags.keyword, color: "#c084fc" },
      { tag: tags.controlKeyword, color: "#c084fc" },
      { tag: tags.operatorKeyword, color: "#c084fc" },
      { tag: tags.definitionKeyword, color: "#c084fc" },
      { tag: tags.moduleKeyword, color: "#c084fc" },
      { tag: tags.operator, color: "#67e8f9" },
      { tag: tags.punctuation, color: "#bfbfbf" },
      { tag: tags.string, color: "#86efac" },
      { tag: tags.special(tags.string), color: "#fbbf24" },
      { tag: tags.number, color: "#fb923c" },
      { tag: tags.bool, color: "#fb923c" },
      { tag: tags.null, color: "#fb923c" },
      { tag: tags.comment, color: "#6b5b95", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#6b5b95", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#6b5b95", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#818cf8" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#818cf8" },
      { tag: tags.definition(tags.variableName), color: "#e0e0e0" },
      { tag: tags.variableName, color: "#e0e0e0" },
      { tag: tags.typeName, color: "#f472b6" },
      { tag: tags.className, color: "#f472b6" },
      { tag: tags.tagName, color: "#fb7185" },
      { tag: tags.attributeName, color: "#c084fc" },
      { tag: tags.propertyName, color: "#67e8f9" },
      { tag: tags.regexp, color: "#86efac" },
      { tag: tags.self, color: "#fb7185" },
      { tag: tags.atom, color: "#fb923c" },
      { tag: tags.escape, color: "#fbbf24" },
      { tag: tags.heading, color: "#818cf8", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#67e8f9", textDecoration: "underline" },
      { tag: tags.invalid, color: "#ef4444" },
    ]
  );
}

function kanagawaTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#1f1f28", color: "#dcd7ba" },
      ".cm-content": { caretColor: "#c8c093" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#c8c093" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#2d4f67" },
      ".cm-gutters": { backgroundColor: "#1f1f28", color: "#54546d", border: "none", borderRight: "1px solid #2a2a37" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#2a2a37" },
    },
    [
      { tag: tags.keyword, color: "#957fb8" },
      { tag: tags.controlKeyword, color: "#957fb8" },
      { tag: tags.operatorKeyword, color: "#957fb8" },
      { tag: tags.definitionKeyword, color: "#957fb8" },
      { tag: tags.moduleKeyword, color: "#957fb8" },
      { tag: tags.operator, color: "#c0a36e" },
      { tag: tags.punctuation, color: "#9cabca" },
      { tag: tags.string, color: "#98bb6c" },
      { tag: tags.special(tags.string), color: "#d27e99" },
      { tag: tags.number, color: "#d27e99" },
      { tag: tags.bool, color: "#ff9e3b" },
      { tag: tags.null, color: "#ff9e3b" },
      { tag: tags.comment, color: "#727169", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#727169", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#727169", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#7e9cd8" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#7e9cd8" },
      { tag: tags.definition(tags.variableName), color: "#dcd7ba" },
      { tag: tags.variableName, color: "#dcd7ba" },
      { tag: tags.typeName, color: "#7fb4ca" },
      { tag: tags.className, color: "#7fb4ca" },
      { tag: tags.tagName, color: "#e6c384" },
      { tag: tags.attributeName, color: "#d27e99" },
      { tag: tags.propertyName, color: "#7e9cd8" },
      { tag: tags.regexp, color: "#e46876" },
      { tag: tags.self, color: "#ff9e3b" },
      { tag: tags.atom, color: "#d27e99" },
      { tag: tags.escape, color: "#e46876" },
      { tag: tags.heading, color: "#7e9cd8", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#7fb4ca", textDecoration: "underline" },
      { tag: tags.invalid, color: "#e82424" },
    ]
  );
}

function pandaSyntaxTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#292a2b", color: "#e6e6e6" },
      ".cm-content": { caretColor: "#ff75b5" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ff75b5" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#3e4042" },
      ".cm-gutters": { backgroundColor: "#292a2b", color: "#757575", border: "none", borderRight: "1px solid #3e4042" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#333435" },
    },
    [
      { tag: tags.keyword, color: "#ff75b5" },
      { tag: tags.controlKeyword, color: "#ff75b5" },
      { tag: tags.operatorKeyword, color: "#ff75b5" },
      { tag: tags.definitionKeyword, color: "#ff75b5" },
      { tag: tags.moduleKeyword, color: "#ff75b5" },
      { tag: tags.operator, color: "#f3f3f3" },
      { tag: tags.punctuation, color: "#e6e6e6" },
      { tag: tags.string, color: "#19f9d8" },
      { tag: tags.special(tags.string), color: "#19f9d8" },
      { tag: tags.number, color: "#ffb86c" },
      { tag: tags.bool, color: "#ffb86c" },
      { tag: tags.null, color: "#ffb86c" },
      { tag: tags.comment, color: "#676b79", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#676b79", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#676b79", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#6fc1ff" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#6fc1ff" },
      { tag: tags.definition(tags.variableName), color: "#e6e6e6" },
      { tag: tags.variableName, color: "#e6e6e6" },
      { tag: tags.typeName, color: "#ffcc95" },
      { tag: tags.className, color: "#ffcc95" },
      { tag: tags.tagName, color: "#ff75b5" },
      { tag: tags.attributeName, color: "#ffcc95" },
      { tag: tags.propertyName, color: "#6fc1ff" },
      { tag: tags.regexp, color: "#19f9d8" },
      { tag: tags.self, color: "#ff9ac1" },
      { tag: tags.atom, color: "#ffb86c" },
      { tag: tags.escape, color: "#ff75b5" },
      { tag: tags.heading, color: "#6fc1ff", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#19f9d8", textDecoration: "underline" },
      { tag: tags.invalid, color: "#ff2c6d" },
    ]
  );
}

function solarizedDarkTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#002b36", color: "#839496" },
      ".cm-content": { caretColor: "#839496" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#839496" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#073642" },
      ".cm-gutters": { backgroundColor: "#002b36", color: "#586e75", border: "none", borderRight: "1px solid #073642" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#073642" },
    },
    [
      { tag: tags.keyword, color: "#859900" },
      { tag: tags.controlKeyword, color: "#859900" },
      { tag: tags.operatorKeyword, color: "#859900" },
      { tag: tags.definitionKeyword, color: "#859900" },
      { tag: tags.moduleKeyword, color: "#859900" },
      { tag: tags.operator, color: "#93a1a1" },
      { tag: tags.punctuation, color: "#93a1a1" },
      { tag: tags.string, color: "#2aa198" },
      { tag: tags.special(tags.string), color: "#cb4b16" },
      { tag: tags.number, color: "#d33682" },
      { tag: tags.bool, color: "#cb4b16" },
      { tag: tags.null, color: "#cb4b16" },
      { tag: tags.comment, color: "#586e75", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#586e75", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#586e75", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#268bd2" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#268bd2" },
      { tag: tags.definition(tags.variableName), color: "#93a1a1" },
      { tag: tags.variableName, color: "#93a1a1" },
      { tag: tags.typeName, color: "#b58900" },
      { tag: tags.className, color: "#b58900" },
      { tag: tags.tagName, color: "#268bd2" },
      { tag: tags.attributeName, color: "#93a1a1" },
      { tag: tags.propertyName, color: "#268bd2" },
      { tag: tags.regexp, color: "#dc322f" },
      { tag: tags.self, color: "#268bd2" },
      { tag: tags.atom, color: "#d33682" },
      { tag: tags.escape, color: "#cb4b16" },
      { tag: tags.heading, color: "#268bd2", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#6c71c4", textDecoration: "underline" },
      { tag: tags.invalid, color: "#dc322f" },
    ]
  );
}

function vitesseDarkTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#121212", color: "#dbd7ca" },
      ".cm-content": { caretColor: "#dbd7ca" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#dbd7ca" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#2832405c" },
      ".cm-gutters": { backgroundColor: "#121212", color: "#3b3b3b", border: "none", borderRight: "1px solid #1e1e1e" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#1e1e1e" },
    },
    [
      { tag: tags.keyword, color: "#4d9375" },
      { tag: tags.controlKeyword, color: "#4d9375" },
      { tag: tags.operatorKeyword, color: "#4d9375" },
      { tag: tags.definitionKeyword, color: "#4d9375" },
      { tag: tags.moduleKeyword, color: "#4d9375" },
      { tag: tags.operator, color: "#cb7676" },
      { tag: tags.punctuation, color: "#666666" },
      { tag: tags.string, color: "#c98a7d" },
      { tag: tags.special(tags.string), color: "#c98a7d" },
      { tag: tags.number, color: "#4c9a91" },
      { tag: tags.bool, color: "#4d9375" },
      { tag: tags.null, color: "#4d9375" },
      { tag: tags.comment, color: "#555555", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#555555", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#555555", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#80a665" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#80a665" },
      { tag: tags.definition(tags.variableName), color: "#dbd7ca" },
      { tag: tags.variableName, color: "#dbd7ca" },
      { tag: tags.typeName, color: "#5da9a7" },
      { tag: tags.className, color: "#5da9a7" },
      { tag: tags.tagName, color: "#4d9375" },
      { tag: tags.attributeName, color: "#80a665" },
      { tag: tags.propertyName, color: "#80a665" },
      { tag: tags.regexp, color: "#c4704f" },
      { tag: tags.self, color: "#cb7676" },
      { tag: tags.atom, color: "#4c9a91" },
      { tag: tags.escape, color: "#c4704f" },
      { tag: tags.heading, color: "#80a665", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#5da9a7", textDecoration: "underline" },
      { tag: tags.invalid, color: "#cb7676" },
    ]
  );
}

function vscodeDarkTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#1e1e1e", color: "#d4d4d4" },
      ".cm-content": { caretColor: "#aeafad" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#aeafad" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#264f78" },
      ".cm-gutters": { backgroundColor: "#1e1e1e", color: "#858585", border: "none", borderRight: "1px solid #333333" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#2a2d2e" },
    },
    [
      { tag: tags.keyword, color: "#569cd6" },
      { tag: tags.controlKeyword, color: "#c586c0" },
      { tag: tags.operatorKeyword, color: "#569cd6" },
      { tag: tags.definitionKeyword, color: "#569cd6" },
      { tag: tags.moduleKeyword, color: "#c586c0" },
      { tag: tags.operator, color: "#d4d4d4" },
      { tag: tags.punctuation, color: "#d4d4d4" },
      { tag: tags.string, color: "#ce9178" },
      { tag: tags.special(tags.string), color: "#d7ba7d" },
      { tag: tags.number, color: "#b5cea8" },
      { tag: tags.bool, color: "#569cd6" },
      { tag: tags.null, color: "#569cd6" },
      { tag: tags.comment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.docComment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#dcdcaa" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#dcdcaa" },
      { tag: tags.definition(tags.variableName), color: "#9cdcfe" },
      { tag: tags.variableName, color: "#9cdcfe" },
      { tag: tags.typeName, color: "#4ec9b0" },
      { tag: tags.className, color: "#4ec9b0" },
      { tag: tags.tagName, color: "#569cd6" },
      { tag: tags.attributeName, color: "#9cdcfe" },
      { tag: tags.propertyName, color: "#9cdcfe" },
      { tag: tags.regexp, color: "#d16969" },
      { tag: tags.self, color: "#569cd6" },
      { tag: tags.atom, color: "#569cd6" },
      { tag: tags.escape, color: "#d7ba7d" },
      { tag: tags.heading, color: "#569cd6", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#569cd6", textDecoration: "underline" },
      { tag: tags.invalid, color: "#f44747" },
    ]
  );
}

function vscodeDarkModernTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#181818", color: "#cccccc" },
      ".cm-content": { caretColor: "#aeafad" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#aeafad" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#264f78" },
      ".cm-gutters": { backgroundColor: "#181818", color: "#6e7681", border: "none", borderRight: "1px solid #2b2b2b" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#222222" },
    },
    [
      { tag: tags.keyword, color: "#569cd6" },
      { tag: tags.controlKeyword, color: "#c586c0" },
      { tag: tags.operatorKeyword, color: "#569cd6" },
      { tag: tags.definitionKeyword, color: "#569cd6" },
      { tag: tags.moduleKeyword, color: "#c586c0" },
      { tag: tags.operator, color: "#cccccc" },
      { tag: tags.punctuation, color: "#cccccc" },
      { tag: tags.string, color: "#ce9178" },
      { tag: tags.special(tags.string), color: "#d7ba7d" },
      { tag: tags.number, color: "#b5cea8" },
      { tag: tags.bool, color: "#569cd6" },
      { tag: tags.null, color: "#569cd6" },
      { tag: tags.comment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#6a9955", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#dcdcaa" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#dcdcaa" },
      { tag: tags.definition(tags.variableName), color: "#9cdcfe" },
      { tag: tags.variableName, color: "#9cdcfe" },
      { tag: tags.typeName, color: "#4ec9b0" },
      { tag: tags.className, color: "#4ec9b0" },
      { tag: tags.tagName, color: "#569cd6" },
      { tag: tags.attributeName, color: "#9cdcfe" },
      { tag: tags.propertyName, color: "#9cdcfe" },
      { tag: tags.regexp, color: "#d16969" },
      { tag: tags.self, color: "#569cd6" },
      { tag: tags.atom, color: "#569cd6" },
      { tag: tags.escape, color: "#d7ba7d" },
      { tag: tags.heading, color: "#569cd6", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#569cd6", textDecoration: "underline" },
      { tag: tags.invalid, color: "#f44747" },
    ]
  );
}

function vscodeLightTheme(): Extension[] {
  return buildTheme(
    {
      "&": { backgroundColor: "#ffffff", color: "#000000" },
      ".cm-content": { caretColor: "#000000" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#000000" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#add6ff" },
      ".cm-gutters": { backgroundColor: "#ffffff", color: "#6e7681", border: "none", borderRight: "1px solid #e5e5e5" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-activeLine": { backgroundColor: "#fff8c5" },
    },
    [
      { tag: tags.keyword, color: "#0000ff" },
      { tag: tags.controlKeyword, color: "#af00db" },
      { tag: tags.operatorKeyword, color: "#0000ff" },
      { tag: tags.definitionKeyword, color: "#0000ff" },
      { tag: tags.moduleKeyword, color: "#af00db" },
      { tag: tags.operator, color: "#000000" },
      { tag: tags.punctuation, color: "#000000" },
      { tag: tags.string, color: "#a31515" },
      { tag: tags.special(tags.string), color: "#a31515" },
      { tag: tags.number, color: "#098658" },
      { tag: tags.bool, color: "#0000ff" },
      { tag: tags.null, color: "#0000ff" },
      { tag: tags.comment, color: "#008000", fontStyle: "italic" },
      { tag: tags.blockComment, color: "#008000", fontStyle: "italic" },
      { tag: tags.lineComment, color: "#008000", fontStyle: "italic" },
      { tag: tags.function(tags.variableName), color: "#795e26" },
      { tag: tags.function(tags.definition(tags.variableName)), color: "#795e26" },
      { tag: tags.definition(tags.variableName), color: "#001080" },
      { tag: tags.variableName, color: "#001080" },
      { tag: tags.typeName, color: "#267f99" },
      { tag: tags.className, color: "#267f99" },
      { tag: tags.tagName, color: "#800000" },
      { tag: tags.attributeName, color: "#e50000" },
      { tag: tags.propertyName, color: "#001080" },
      { tag: tags.regexp, color: "#811f3f" },
      { tag: tags.self, color: "#0000ff" },
      { tag: tags.atom, color: "#0000ff" },
      { tag: tags.escape, color: "#ee0000" },
      { tag: tags.heading, color: "#800000", fontWeight: "bold" },
      { tag: tags.emphasis, fontStyle: "italic" },
      { tag: tags.strong, fontWeight: "bold" },
      { tag: tags.link, color: "#4078f2", textDecoration: "underline" },
      { tag: tags.invalid, color: "#cd3131" },
    ]
  );
}

/**
 * Dynamically load a CodeMirror theme extension by ID.
 * Returns both the theme extension and its highlight style.
 */
export async function loadEditorTheme(id: string): Promise<Extension[]> {
  switch (id) {
    case "material-lighter":
      // Built-in custom theme — handled separately in code-surface.tsx
      return [];
    case "one-dark": {
      const { oneDark } = await import("@codemirror/theme-one-dark");
      return [oneDark];
    }
    case "ayu-light": {
      const { ayuLight } = await import("thememirror");
      return [ayuLight];
    }
    case "clouds": {
      const { clouds } = await import("thememirror");
      return [clouds];
    }
    case "noctis-lilac": {
      const { noctisLilac } = await import("thememirror");
      return [noctisLilac];
    }
    case "rose-pine-dawn": {
      const { rosePineDawn } = await import("thememirror");
      return [rosePineDawn];
    }
    case "solarized-light": {
      const { solarizedLight } = await import("thememirror");
      return [solarizedLight];
    }
    case "smoothy": {
      const { smoothy } = await import("thememirror");
      return [smoothy];
    }
    case "github-light":
      return githubLightTheme();
    case "catppuccin-latte":
      return catppuccinLatteTheme();
    case "dracula": {
      const { dracula } = await import("thememirror");
      return [dracula];
    }
    case "cobalt": {
      const { cobalt } = await import("thememirror");
      return [cobalt];
    }
    case "amy": {
      const { amy } = await import("thememirror");
      return [amy];
    }
    case "cool-glow": {
      const { coolGlow } = await import("thememirror");
      return [coolGlow];
    }
    case "espresso": {
      const { espresso } = await import("thememirror");
      return [espresso];
    }
    case "tomorrow": {
      const { tomorrow } = await import("thememirror");
      return [tomorrow];
    }
    case "monokai":
      return monokaiTheme();
    case "tokyo-night":
      return tokyoNightTheme();
    case "catppuccin-mocha":
      return catppuccinMochaTheme();
    case "gruvbox-dark":
      return gruvboxDarkTheme();
    case "ayu-dark":
      return ayuDarkTheme();
    case "nord":
      return nordTheme();
    case "night-owl":
      return nightOwlTheme();
    case "darcula":
      return darculaTheme();
    case "synthwave-84":
      return synthwave84Theme();
    case "material-palenight":
      return materialPalenightTheme();
    case "ultraviolet":
      return ultravioletTheme();
    case "kanagawa":
      return kanagawaTheme();
    case "panda-syntax":
      return pandaSyntaxTheme();
    case "solarized-dark":
      return solarizedDarkTheme();
    case "vitesse-dark":
      return vitesseDarkTheme();
    case "vscode-dark":
      return vscodeDarkTheme();
    case "vscode-dark-modern":
      return vscodeDarkModernTheme();
    case "vscode-light":
      return vscodeLightTheme();
    default:
      return [];
  }
}

export const SAMPLE_CODE = `def fibonacci(n):
    """Generate the first n Fibonacci numbers."""
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

# Print the first 10 numbers
numbers = fibonacci(10)
print(f"Fibonacci: {numbers}")
`;
