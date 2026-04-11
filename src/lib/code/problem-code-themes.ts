import type { CSSProperties } from "react";

/**
 * Maps editor theme IDs to syntax-highlight colors for problem description
 * code blocks. Colors are extracted from the CodeMirror theme definitions in
 * `editor-themes.ts` so that `<pre>` blocks rendered via rehype-highlight
 * visually match the user's chosen editor theme.
 */

type ThemeColors = {
  /** Background */            bg: string;
  /** Foreground */            fg: string;
  /** Keywords */              kw: string;
  /** Strings */               str: string;
  /** Numbers */               num: string;
  /** Comments */              cmt: string;
  /** Function names/titles */ fn: string;
  /** Dark theme? */           dark: boolean;
};

export const VALID_THEME_IDS = [
  "material-lighter", "ayu-light", "clouds", "noctis-lilac", "rose-pine-dawn",
  "solarized-light", "smoothy", "github-light", "catppuccin-latte", "vscode-light", "tomorrow",
  "one-dark", "dracula", "darcula", "monokai", "tokyo-night", "nord", "night-owl",
  "synthwave-84", "material-palenight", "ultraviolet", "kanagawa", "panda-syntax",
  "solarized-dark", "vitesse-dark", "vscode-dark", "vscode-dark-modern", "catppuccin-mocha",
  "gruvbox-dark", "ayu-dark", "cobalt", "amy", "cool-glow", "espresso",
] as const;

export type ValidThemeId = (typeof VALID_THEME_IDS)[number];

const THEMES: Record<string, ThemeColors> = {
  // ── Light themes ────────────────────────────────────────────────────────
  "material-lighter": { bg: "#fafafa", fg: "#546e7a", kw: "#7c4dff", str: "#91b859", num: "#f76d47", cmt: "#90a4ae", fn: "#6182b8", dark: false },
  "ayu-light":        { bg: "#fafafa", fg: "#5c6773", kw: "#fa8d3e", str: "#86b300", num: "#a37acc", cmt: "#abb0b6", fn: "#f2ae49", dark: false },
  "clouds":           { bg: "#f1f1f1", fg: "#000000", kw: "#af956f", str: "#5d90cd", num: "#46a609", cmt: "#bcc8ba", fn: "#af956f", dark: false },
  "noctis-lilac":     { bg: "#f2f1f8", fg: "#0c006b", kw: "#7060eb", str: "#00a0be", num: "#e65100", cmt: "#9995b7", fn: "#7060eb", dark: false },
  "rose-pine-dawn":   { bg: "#faf4ed", fg: "#575279", kw: "#907aa9", str: "#d7827e", num: "#ea9d34", cmt: "#9893a5", fn: "#286983", dark: false },
  "solarized-light":  { bg: "#fdf6e3", fg: "#657b83", kw: "#859900", str: "#2aa198", num: "#d33682", cmt: "#93a1a1", fn: "#268bd2", dark: false },
  "smoothy":          { bg: "#f9f9f9", fg: "#312e2a", kw: "#3c855e", str: "#e64f3c", num: "#c86612", cmt: "#bec7c5", fn: "#3c855e", dark: false },
  "github-light":     { bg: "#ffffff", fg: "#24292e", kw: "#d73a49", str: "#032f62", num: "#005cc5", cmt: "#6a737d", fn: "#6f42c1", dark: false },
  "catppuccin-latte": { bg: "#eff1f5", fg: "#4c4f69", kw: "#8839ef", str: "#40a02b", num: "#fe640b", cmt: "#8c8fa1", fn: "#1e66f5", dark: false },
  "vscode-light":     { bg: "#ffffff", fg: "#000000", kw: "#0000ff", str: "#a31515", num: "#098658", cmt: "#008000", fn: "#795e26", dark: false },
  "tomorrow":         { bg: "#ffffff", fg: "#4d4d4c", kw: "#8959a8", str: "#718c00", num: "#f5871f", cmt: "#8e908c", fn: "#4271ae", dark: false },

  // ── Dark themes ─────────────────────────────────────────────────────────
  "one-dark":            { bg: "#282c34", fg: "#abb2bf", kw: "#c678dd", str: "#98c379", num: "#d19a66", cmt: "#5c6370", fn: "#61afef", dark: true },
  "dracula":             { bg: "#282a36", fg: "#f8f8f2", kw: "#ff79c6", str: "#f1fa8c", num: "#bd93f9", cmt: "#6272a4", fn: "#50fa7b", dark: true },
  "darcula":             { bg: "#2b2b2b", fg: "#a9b7c6", kw: "#cc7832", str: "#6a8759", num: "#6897bb", cmt: "#808080", fn: "#ffc66d", dark: true },
  "monokai":             { bg: "#272822", fg: "#f8f8f2", kw: "#f92672", str: "#e6db74", num: "#ae81ff", cmt: "#75715e", fn: "#a6e22e", dark: true },
  "tokyo-night":         { bg: "#1a1b26", fg: "#a9b1d6", kw: "#bb9af7", str: "#9ece6a", num: "#ff9e64", cmt: "#565f89", fn: "#7aa2f7", dark: true },
  "nord":                { bg: "#2e3440", fg: "#d8dee9", kw: "#81a1c1", str: "#a3be8c", num: "#b48ead", cmt: "#616e88", fn: "#88c0d0", dark: true },
  "night-owl":           { bg: "#011627", fg: "#d6deeb", kw: "#c792ea", str: "#ecc48d", num: "#f78c6c", cmt: "#637777", fn: "#82aaff", dark: true },
  "synthwave-84":        { bg: "#262335", fg: "#ffffff", kw: "#fede5d", str: "#ff8b39", num: "#f97e72", cmt: "#848bbd", fn: "#36f9f6", dark: true },
  "material-palenight":  { bg: "#292d3e", fg: "#a6accd", kw: "#c792ea", str: "#c3e88d", num: "#f78c6c", cmt: "#676e95", fn: "#82aaff", dark: true },
  "ultraviolet":         { bg: "#1a1037", fg: "#bfbfbf", kw: "#c084fc", str: "#86efac", num: "#fb923c", cmt: "#6b5b95", fn: "#818cf8", dark: true },
  "kanagawa":            { bg: "#1f1f28", fg: "#dcd7ba", kw: "#957fb8", str: "#98bb6c", num: "#d27e99", cmt: "#727169", fn: "#7e9cd8", dark: true },
  "panda-syntax":        { bg: "#292a2b", fg: "#e6e6e6", kw: "#ff75b5", str: "#19f9d8", num: "#ffb86c", cmt: "#676b79", fn: "#6fc1ff", dark: true },
  "solarized-dark":      { bg: "#002b36", fg: "#839496", kw: "#859900", str: "#2aa198", num: "#d33682", cmt: "#586e75", fn: "#268bd2", dark: true },
  "vitesse-dark":        { bg: "#121212", fg: "#dbd7ca", kw: "#4d9375", str: "#c98a7d", num: "#4c9a91", cmt: "#555555", fn: "#80a665", dark: true },
  "vscode-dark":         { bg: "#1e1e1e", fg: "#d4d4d4", kw: "#569cd6", str: "#ce9178", num: "#b5cea8", cmt: "#6a9955", fn: "#dcdcaa", dark: true },
  "vscode-dark-modern":  { bg: "#181818", fg: "#cccccc", kw: "#569cd6", str: "#ce9178", num: "#b5cea8", cmt: "#6a9955", fn: "#dcdcaa", dark: true },
  "catppuccin-mocha":    { bg: "#1e1e2e", fg: "#cdd6f4", kw: "#cba6f7", str: "#a6e3a1", num: "#fab387", cmt: "#6c7086", fn: "#89b4fa", dark: true },
  "gruvbox-dark":        { bg: "#282828", fg: "#ebdbb2", kw: "#fb4934", str: "#b8bb26", num: "#d3869b", cmt: "#928374", fn: "#fabd2f", dark: true },
  "ayu-dark":            { bg: "#0d1017", fg: "#bfbdb6", kw: "#ff8f40", str: "#aad94c", num: "#e6b673", cmt: "#626a73", fn: "#ffb454", dark: true },
  "cobalt":              { bg: "#002240", fg: "#ffffff", kw: "#ff9d00", str: "#3ad900", num: "#ff628c", cmt: "#0088ff", fn: "#ffc600", dark: true },
  "amy":                 { bg: "#200020", fg: "#d0d0ff", kw: "#ff6600", str: "#999999", num: "#7090ff", cmt: "#90a0a0", fn: "#aaaaff", dark: true },
  "cool-glow":           { bg: "#060521", fg: "#e0e0ff", kw: "#ff5da0", str: "#b8ff50", num: "#ff9700", cmt: "#707fff", fn: "#50b8ff", dark: true },
  "espresso":            { bg: "#2a211c", fg: "#bdae9d", kw: "#43a8ed", str: "#049b0a", num: "#44aa43", cmt: "#c8c8c8", fn: "#bdae9d", dark: true },
};

/**
 * Return inline CSS custom-property overrides that re-theme problem code
 * blocks to match the given editor theme.  Returns `undefined` when no
 * override is needed (unknown or missing theme → CSS defaults apply).
 */
export function getProblemCodeThemeStyle(
  themeId: string | null | undefined,
): CSSProperties | undefined {
  if (!themeId) return undefined;
  const t = THEMES[themeId];
  if (!t) return undefined;

  return {
    "--problem-code-background": t.bg,
    "--problem-code-foreground": t.fg,
    "--problem-code-keyword": t.kw,
    "--problem-code-string": t.str,
    "--problem-code-number": t.num,
    "--problem-code-comment": t.cmt,
    "--problem-code-title": t.fn,
    "--problem-code-border": `color-mix(in srgb, ${t.bg} 50%, ${t.dark ? "#666" : "#bbb"})`,
    "--problem-code-highlight": t.dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
  } as CSSProperties;
}
