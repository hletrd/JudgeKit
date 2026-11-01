/**
 * Snapshot of the page the user is looking at, sent with each chat request so
 * the assistant can answer questions about what is on screen.
 *
 * Shared by the widget (capture) and the chat route (validation), so keep this
 * module free of DOM access at import time.
 */

export const PAGE_PATH_MAX_LENGTH = 500;
export const PAGE_TITLE_MAX_LENGTH = 300;
/** Cap on visible page text per request — bounds token cost on long pages. */
export const PAGE_TEXT_MAX_LENGTH = 8000;

export interface PageSnapshot {
  path: string;
  title: string;
  text: string;
}

/**
 * Capture the rendered text of the main content area. Only the pathname is
 * sent (never the query string) so one-time tokens in URLs cannot leak to the
 * LLM provider.
 */
export function capturePageSnapshot(): PageSnapshot | null {
  if (typeof document === "undefined") return null;

  const main = document.getElementById("main-content");
  // innerText follows layout (skips hidden tabs, keeps line breaks); jsdom
  // lacks it, so fall back to textContent there.
  const rawText = main ? (main.innerText ?? main.textContent ?? "") : "";
  const text = rawText
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    path: window.location.pathname.slice(0, PAGE_PATH_MAX_LENGTH),
    title: document.title.slice(0, PAGE_TITLE_MAX_LENGTH),
    text: text.slice(0, PAGE_TEXT_MAX_LENGTH),
  };
}
