/**
 * Default code templates for competitive programming languages.
 * Preloaded into the editor when a user selects a language and the editor is empty.
 */

import type { FunctionSpec } from "@/lib/judge/function-judging/types";
import { getAdapter, supportsFunctionJudging, FUNCTION_JUDGING_LANGUAGES } from "@/lib/judge/function-judging/registry";

export const DEFAULT_TEMPLATES: Record<string, string> = {
  c: `#include <stdio.h>

int main(void) {

    return 0;
}`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main(void) {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}`,
  cpp17: `#include <bits/stdc++.h>
using namespace std;

int main(void) {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}`,
  cpp20: `#include <bits/stdc++.h>
using namespace std;

int main(void) {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}`,
  python: `import sys
input = sys.stdin.readline

def main():
    pass

if __name__ == "__main__":
    main()`,
  python3: `import sys
input = sys.stdin.readline

def main():
    pass

if __name__ == "__main__":
    main()`,
  pypy: `import sys
input = sys.stdin.readline

def main():
    pass

if __name__ == "__main__":
    main()`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st;

    }
}`,
  kotlin: "import java.io.*\nimport java.util.*\n\nfun main() {\n    val br = BufferedReader(InputStreamReader(System.`in`))\n\n}",
  rust: `use std::io::{self, BufRead, Write, BufWriter};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = BufWriter::new(stdout.lock());

    let mut lines = stdin.lock().lines();
}
`,
  go: `package main

import (
\t"bufio"
\t"fmt"
\t"os"
)

func main() {
\treader := bufio.NewReader(os.Stdin)
\twriter := bufio.NewWriter(os.Stdout)
\tdefer writer.Flush()

\t_ = reader
}`,
  csharp: `using System;
using System.IO;

class Program {
    static void Main() {

    }
}`,
  ruby: `$stdin.each_line do |line|

end
`,
  swift: `import Foundation

let input = readLine()!
`,
  javascript: `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {

});
`,
  typescript: `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

const lines: string[] = [];
rl.on('line', (line: string) => lines.push(line));
rl.on('close', () => {

});
`,
  pascal: `program Main;
begin

end.
`,
  php: `<?php
fscanf(STDIN, "%d", $n);
`,
};

/**
 * Resolve the starter code an editor should preload for a problem + language.
 *
 * For function-signature problems (`problemType === "function"`) with a spec
 * in a function-judging-capable language, this returns the adapter-generated
 * student stub (signature + empty body). Everything else falls back to the
 * normal per-language `DEFAULT_TEMPLATES` entry (empty string when none).
 */
export function getStarterCode(opts: {
  problemType?: string | null;
  functionSpec?: FunctionSpec | null;
  language: string;
}): string {
  const { problemType, functionSpec, language } = opts;
  if (problemType === "function" && functionSpec && supportsFunctionJudging(language)) {
    try {
      return getAdapter(language).generateStub(functionSpec);
    } catch {
      // Defensive: a malformed spec must not break the editor. Fall through to
      // the normal template (or empty) rather than throwing in render.
    }
  }
  return DEFAULT_TEMPLATES[language] ?? "";
}

/**
 * Check if the current editor content is effectively empty or
 * matches a known template (meaning the user hasn't written anything).
 *
 * For function-signature problems, the per-language adapter stubs are the
 * "template" the editor preloads, so when a `functionSpec` is supplied they
 * are treated as template-like too — this lets a language switch swap stubs
 * without clobbering code the student actually wrote.
 */
export function isTemplateLike(code: string, functionSpec?: FunctionSpec | null): boolean {
  const trimmed = code.trim();
  if (trimmed.length === 0) return true;

  // Check if it matches any existing template (ignoring whitespace)
  for (const tmpl of Object.values(DEFAULT_TEMPLATES)) {
    if (tmpl.trim() === trimmed) return true;
  }

  // For function problems, the adapter stub for any supported language is also
  // template-like (the student hasn't written real code yet).
  if (functionSpec) {
    for (const lang of FUNCTION_JUDGING_LANGUAGES) {
      try {
        if (getAdapter(lang).generateStub(functionSpec).trim() === trimmed) return true;
      } catch {
        /* malformed spec for this language — ignore */
      }
    }
  }

  return false;
}
