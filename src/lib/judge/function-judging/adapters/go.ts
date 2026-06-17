import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";
import { isArrayType, elementType } from "../types";

/** Map a FunctionType to its Go declaration type. */
function goType(t: FunctionType): string {
  if (isArrayType(t)) return `[]${goScalar(elementType(t))}`;
  return goScalar(t);
}

function goScalar(t: string): string {
  switch (t) {
    case "int":
    case "long":
      return "int64";
    case "double":
      return "float64";
    case "bool":
      return "bool";
    case "string":
      return "string";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

// Self-contained prelude: package, imports, and a decode helper. The args line
// is read as a JSON array of raw messages; each positional arg is unmarshalled
// into its typed Go value. encoding/json marshals the return compactly (no
// inner spaces, true/false, strings quoted) and renders float64 in a shortest
// round-trip form the worker's whitespace-token float comparator accepts. The
// student's bare func is appended after this prelude; main() is appended last.
//
// Go forbids imports after declarations and errors on unused imports, so the
// student's sandwiched Solution code cannot add packages itself. A common set
// (math/sort/strconv/strings) is pre-imported here; package-level blank
// references keep the file compiling under `go build` (the worker's command)
// when the student uses none of them. `go vet` may flag the blank-usage form,
// but the worker only runs `go build`, which succeeds.
const PRELUDE = `package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

var (
	_ = math.Abs
	_ = sort.Ints
	_ = strconv.Itoa
	_ = strings.Split
)

func __decode(raw json.RawMessage, dst any) {
	if err := json.Unmarshal(raw, dst); err != nil {
		fmt.Fprintln(os.Stderr, "json:", err)
		os.Exit(1)
	}
}

`;

export const goAdapter: FunctionHarnessAdapter = {
  language: "go",
  generateStub(spec: FunctionSpec): string {
    const ret = goType(spec.returnType);
    const params = spec.params.map((p) => `${p.name} ${goType(p.type)}`).join(", ");
    return `func ${spec.functionName}(${params}) ${ret} {\n\t// TODO: implement\n}\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    const preludeLineCount = PRELUDE.split("\n").length - 1; // lines before student code

    const decls = spec.params
      .map((p, idx) => `\tvar ${p.name} ${goType(p.type)}\n\t__decode(__raw[${idx}], &${p.name})`)
      .join("\n");
    const callArgs = spec.params.map((p) => p.name).join(", ");
    const main = `

func main() {
	__reader := bufio.NewReader(os.Stdin)
	__line, _ := __reader.ReadString('\\n')
	var __raw []json.RawMessage
	__decode(json.RawMessage(__line), &__raw)
${decls}
	__result := ${spec.functionName}(${callArgs})
${printBlock(spec.returnType)}
}
`;
    const source = `${PRELUDE}${studentCode}${main}`;
    return { source, preludeLineCount };
  },
};

/**
 * Emit the Go statements that print the return value.
 *
 * double / double[] returns print whitespace-separated numeric tokens (a single
 * token for a scalar, space-joined for an array) to match encodeValue's
 * float/space-separated contract — the worker's whitespace-token float
 * comparator tokenizes these but cannot tokenize a JSON `[a,b]`. strconv with
 * 'g'/-1 gives Go's shortest round-trip float form, fine under tolerance-based
 * comparison. Every other type keeps the canonical compact-JSON encoder path.
 */
function printBlock(returnType: FunctionType): string {
  if (returnType === "double") {
    return `	os.Stdout.WriteString(strconv.FormatFloat(__result, 'g', -1, 64))`;
  }
  if (returnType === "double[]") {
    return `	__tokens := make([]string, len(__result))
	for __i, __v := range __result {
		__tokens[__i] = strconv.FormatFloat(__v, 'g', -1, 64)
	}
	os.Stdout.WriteString(strings.Join(__tokens, " "))`;
  }
  // The emitted comment below documents the generated harness (kept inside the
  // template so an assembled source stays self-explanatory during debugging).
  return `	// Encoder with SetEscapeHTML(false) keeps <, >, & raw — matching the
	// canonical JSON.stringify contract in serialization.ts and the other
	// adapters. json.Marshal's default escapes them to \\u003c/\\u003e/\\u0026,
	// which would byte-diverge expected/actual for string returns judged
	// cross-language. The encoder appends a trailing newline; trim it so the
	// output stays a single compact JSON value like the other adapters.
	var __buf strings.Builder
	__enc := json.NewEncoder(&__buf)
	__enc.SetEscapeHTML(false)
	if __err := __enc.Encode(__result); __err != nil {
		fmt.Fprintln(os.Stderr, "json:", __err)
		os.Exit(1)
	}
	os.Stdout.WriteString(strings.TrimRight(__buf.String(), "\\n"))`;
}
