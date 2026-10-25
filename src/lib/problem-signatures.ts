/**
 * AI-use signature tokens in problem descriptions.
 *
 * Syntax (single line, anywhere in the description):
 *
 *     {{signature: sr5j}}
 *
 * A description may hold several markers, one token each. A token is 1-64
 * ASCII letters, digits, or underscores. Unlike `{{hidden: ...}}` notes, a
 * signature marker is never shown to students in any form: the renderer, the
 * clipboard, meta descriptions, search, AI prompts, and the student-facing
 * problem API all drop it completely (`stripSignatureMarkers`).
 *
 * When a submission's source code contains a signature token as a whole word
 * (in code or in a comment), the submission is flagged as "AI suspected" for
 * contest/group managers only. See src/lib/submissions/ai-signature-flags.ts
 * and docs/api.md → "Signature tokens and AI-use flags".
 */

export const SIGNATURE_TOKEN_MAX_LENGTH = 64;

const SIGNATURE_TOKEN_REGEX = /^[A-Za-z0-9_]{1,64}$/;

/** Any `{{signature: ...}}` marker on one line, valid or not (shortest match). */
const ANY_SIGNATURE_MARKER_SOURCE = String.raw`\{\{signature:[^\r\n]*?\}\}`;

/** A well-formed marker; group 1 is the token. */
const VALID_SIGNATURE_MARKER_SOURCE = String.raw`^\{\{signature:[ \t]*([A-Za-z0-9_]{1,64})[ \t]*\}\}$`;

/**
 * PostgreSQL ARE equivalent of the marker pattern (shortest match up to the
 * first `}}` on the same line), for `regexp_replace(..., 'g')`.
 */
export const SIGNATURE_MARKER_SQL_PATTERN = String.raw`\{\{signature:[^\r\n]*?\}\}`;

function anyMarkerPattern() {
  return new RegExp(ANY_SIGNATURE_MARKER_SOURCE, "g");
}

export function isValidSignatureToken(token: string): boolean {
  return SIGNATURE_TOKEN_REGEX.test(token);
}

export function hasSignatureMarkers(text: string | null | undefined): boolean {
  return typeof text === "string" && text.includes("{{signature:") && anyMarkerPattern().test(text);
}

/** Remove every `{{signature: ...}}` marker (valid or not) from `text`. */
export function stripSignatureMarkers(text: string): string;
export function stripSignatureMarkers(text: string | null | undefined): string | null | undefined;
export function stripSignatureMarkers(text: string | null | undefined) {
  if (typeof text !== "string" || !text.includes("{{signature:")) {
    return text;
  }
  return text.replace(anyMarkerPattern(), "");
}

/** Unique valid tokens in order of first appearance. */
export function extractSignatureTokens(text: string | null | undefined): string[] {
  if (!hasSignatureMarkers(text)) return [];
  const valid = new RegExp(VALID_SIGNATURE_MARKER_SOURCE);
  const tokens: string[] = [];
  for (const match of (text as string).matchAll(anyMarkerPattern())) {
    const token = valid.exec(match[0])?.[1];
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

/** Markers whose body is not a single valid token (e.g. `{{signature: a-b}}`). */
export function findInvalidSignatureMarkers(text: string | null | undefined): string[] {
  if (!hasSignatureMarkers(text)) return [];
  const valid = new RegExp(VALID_SIGNATURE_MARKER_SOURCE);
  return [...(text as string).matchAll(anyMarkerPattern())]
    .map((match) => match[0])
    .filter((marker) => !valid.test(marker));
}

export function sameSignatureTokens(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((token, index) => token === right[index]);
}

export type SignatureCandidate = {
  token: string;
  problemId: string;
};

export type SignatureMatch = SignatureCandidate;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word, case-sensitive token search over the raw source code (comments
 * included). A "word" character is an ASCII letter, digit, or underscore, so
 * `sr5j` matches `int sr5j = 0;` and `// sr5j` but not `sr5jx` or `_sr5j`.
 */
export function sourceContainsSignatureToken(sourceCode: string, token: string): boolean {
  if (!isValidSignatureToken(token) || !sourceCode.includes(token)) return false;
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(token)}(?![A-Za-z0-9_])`).test(sourceCode);
}

/**
 * Every candidate whose token appears in the source. The same token defined
 * by two problems yields one match per problem.
 */
export function matchSignatureTokens(
  sourceCode: string,
  candidates: readonly SignatureCandidate[],
): SignatureMatch[] {
  const matches: SignatureMatch[] = [];
  const seen = new Set<string>();
  const tokenHit = new Map<string, boolean>();
  for (const candidate of candidates) {
    const key = `${candidate.problemId}\u0000${candidate.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let hit = tokenHit.get(candidate.token);
    if (hit === undefined) {
      hit = sourceContainsSignatureToken(sourceCode, candidate.token);
      tokenHit.set(candidate.token, hit);
    }
    if (hit) matches.push({ token: candidate.token, problemId: candidate.problemId });
  }
  return matches;
}
