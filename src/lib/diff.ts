/**
 * Simple LCS-based line diff utility.
 * Computes a unified-style diff between two strings and also provides
 * a side-by-side line-pair view.
 */

export type DiffLineKind = "equal" | "add" | "remove";

export interface DiffLine {
  kind: DiffLineKind;
  /** 1-based line number in the original (expected) text; null for pure additions */
  oldNo: number | null;
  /** 1-based line number in the new (actual) text; null for pure removals */
  newNo: number | null;
  content: string;
}

export interface SideBySidePair {
  left: { kind: DiffLineKind; lineNo: number | null; content: string } | null;
  right: { kind: DiffLineKind; lineNo: number | null; content: string } | null;
}

/**
 * Compute the LCS table for two string arrays.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Backtrack through the LCS table to produce a unified diff.
 */
function backtrack(dp: number[][], a: string[], b: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;

  // We build in reverse then reverse at the end
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ kind: "equal", oldNo: i, newNo: j, content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ kind: "add", oldNo: null, newNo: j, content: b[j - 1] });
      j--;
    } else if (i > 0) {
      result.push({ kind: "remove", oldNo: i, newNo: null, content: a[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

/**
 * Compute a unified diff between two strings, line by line.
 */
export function computeDiff(expected: string, actual: string): DiffLine[] {
  const a = expected.split("\n");
  const b = actual.split("\n");
  const dp = lcsTable(a, b);
  return backtrack(dp, a, b);
}

/**
 * Convert a unified diff into side-by-side pairs for rendering.
 * Adjacent remove/add pairs are aligned; unmatched lines get null on the other side.
 */
export function toSideBySide(lines: DiffLine[]): SideBySidePair[] {
  const pairs: SideBySidePair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.kind === "equal") {
      pairs.push({
        left: { kind: "equal", lineNo: line.oldNo, content: line.content },
        right: { kind: "equal", lineNo: line.newNo, content: line.content },
      });
      i++;
    } else if (line.kind === "remove") {
      // Collect consecutive removes
      const removes: DiffLine[] = [];
      while (i < lines.length && lines[i].kind === "remove") {
        removes.push(lines[i]);
        i++;
      }
      // Collect consecutive adds
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].kind === "add") {
        adds.push(lines[i]);
        i++;
      }

      // Pair them up
      const maxLen = Math.max(removes.length, adds.length);
      for (let k = 0; k < maxLen; k++) {
        const rem = removes[k] ?? null;
        const add = adds[k] ?? null;
        pairs.push({
          left: rem ? { kind: "remove", lineNo: rem.oldNo, content: rem.content } : null,
          right: add ? { kind: "add", lineNo: add.newNo, content: add.content } : null,
        });
      }
    } else if (line.kind === "add") {
      // Pure additions (no preceding removes)
      pairs.push({
        left: null,
        right: { kind: "add", lineNo: line.newNo, content: line.content },
      });
      i++;
    }
  }

  return pairs;
}
