import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";
import { isArrayType, elementType } from "../types";

/** Map a FunctionType to its C# declaration type. */
function csType(t: FunctionType): string {
  if (isArrayType(t)) return `${csScalar(elementType(t))}[]`;
  return csScalar(t);
}

function csScalar(t: string): string {
  switch (t) {
    case "int":
    case "long":
      return "long";
    case "double":
      return "double";
    case "bool":
      return "bool";
    case "string":
      return "string";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

// Self-contained prelude: a minimal one-line JSON reader over the args array,
// scalar readers for the supported types, and canonical writers matching
// serialization.ts (compact JSON, no inner spaces, true/false, doubles via an
// invariant-culture round-trip form the worker's whitespace-token float
// comparator accepts). No external assemblies are referenced: Mono 6.12's mcs
// only sees mscorlib/System by default, so System.Text.Json is unavailable and
// a hand-written reader is used instead. The Solution class is appended after
// this; the Main entry is appended last.
//
// Common usings (collections + LINQ) live at the top so the student's Solution
// code can use Dictionary/List/LINQ without writing its own usings (student
// code is sandwiched between this prelude and the generated main). Unused
// usings are fine in Mono's mcs.
const PRELUDE = `using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

sealed class __FnJudge {
    private readonly string s;
    private int i = 0;
    public __FnJudge(string src) { s = src; }

    private void Ws() {
        while (i < s.Length) {
            char c = s[i];
            if (c == ' ' || c == '\\t' || c == '\\n' || c == '\\r') i++;
            else break;
        }
    }
    public char Peek() { Ws(); return i < s.Length ? s[i] : '\\0'; }
    public void Expect(char c) {
        Ws();
        if (i >= s.Length || s[i] != c) {
            Console.Error.WriteLine("json: expected " + c);
            Environment.Exit(1);
        }
        i++;
    }
    private string Number() {
        Ws();
        int start = i;
        if (i < s.Length && (s[i] == '-' || s[i] == '+')) i++;
        while (i < s.Length) {
            char c = s[i];
            if (char.IsDigit(c) || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i++;
            else break;
        }
        return s.Substring(start, i - start);
    }
    public long ReadLong() {
        return (long)Math.Round(double.Parse(Number(), CultureInfo.InvariantCulture));
    }
    public double ReadDouble() {
        return double.Parse(Number(), CultureInfo.InvariantCulture);
    }
    public bool ReadBool() {
        Ws();
        if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
        if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
        Console.Error.WriteLine("json: expected bool");
        Environment.Exit(1);
        return false;
    }
    public string ReadStr() {
        Ws();
        Expect('"');
        var sb = new StringBuilder();
        while (i < s.Length && s[i] != '"') {
            char c = s[i++];
            if (c == '\\\\' && i < s.Length) {
                char e = s[i++];
                switch (e) {
                    case 'n': sb.Append('\\n'); break;
                    case 't': sb.Append('\\t'); break;
                    case 'r': sb.Append('\\r'); break;
                    case 'b': sb.Append('\\b'); break;
                    case 'f': sb.Append('\\f'); break;
                    case '/': sb.Append('/'); break;
                    case '"': sb.Append('"'); break;
                    case '\\\\': sb.Append('\\\\'); break;
                    case 'u':
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            } else {
                sb.Append(c);
            }
        }
        Expect('"');
        return sb.ToString();
    }

    private List<T> ReadArray<T>(Func<T> item) {
        var v = new List<T>();
        Expect('[');
        if (Peek() == ']') { i++; return v; }
        while (true) {
            v.Add(item());
            if (Peek() == ',') { i++; continue; }
            break;
        }
        Expect(']');
        return v;
    }
    public long[] ReadLongArray() { return ReadArray(ReadLong).ToArray(); }
    public double[] ReadDoubleArray() { return ReadArray(ReadDouble).ToArray(); }
    public bool[] ReadBoolArray() { return ReadArray(ReadBool).ToArray(); }
    public string[] ReadStrArray() { return ReadArray(ReadStr).ToArray(); }

    public static void Write(StringBuilder o, long v) { o.Append(v.ToString(CultureInfo.InvariantCulture)); }
    public static void Write(StringBuilder o, double v) { o.Append(v.ToString("R", CultureInfo.InvariantCulture)); }
    public static void Write(StringBuilder o, bool v) { o.Append(v ? "true" : "false"); }
    public static void Write(StringBuilder o, string v) {
        // Canonical JSON.stringify (ECMA-404) escaping: named short escapes for
        // \\b \\t \\n \\f \\r \\" \\\\, \\u00XX for any other control char < 0x20,
        // everything else (incl. <, >, &, and non-ASCII) raw. Matches
        // serialization.ts encodeValue and the other adapters byte-for-byte.
        o.Append('"');
        foreach (char c in v) {
            switch (c) {
                case '"': o.Append("\\\\\\""); break;
                case '\\\\': o.Append("\\\\\\\\"); break;
                case '\\b': o.Append("\\\\b"); break;
                case '\\f': o.Append("\\\\f"); break;
                case '\\n': o.Append("\\\\n"); break;
                case '\\t': o.Append("\\\\t"); break;
                case '\\r': o.Append("\\\\r"); break;
                default:
                    if (c < 0x20) {
                        o.Append("\\\\u").Append(((int) c).ToString("x4", CultureInfo.InvariantCulture));
                    } else {
                        o.Append(c);
                    }
                    break;
            }
        }
        o.Append('"');
    }
    public static void Write(StringBuilder o, long[] v) {
        o.Append('[');
        for (int k = 0; k < v.Length; k++) { if (k > 0) o.Append(','); Write(o, v[k]); }
        o.Append(']');
    }
    public static void Write(StringBuilder o, double[] v) {
        o.Append('[');
        for (int k = 0; k < v.Length; k++) { if (k > 0) o.Append(','); Write(o, v[k]); }
        o.Append(']');
    }
    public static void Write(StringBuilder o, bool[] v) {
        o.Append('[');
        for (int k = 0; k < v.Length; k++) { if (k > 0) o.Append(','); Write(o, v[k]); }
        o.Append(']');
    }
    public static void Write(StringBuilder o, string[] v) {
        o.Append('[');
        for (int k = 0; k < v.Length; k++) { if (k > 0) o.Append(','); Write(o, v[k]); }
        o.Append(']');
    }
}

`;

/** Reader call that yields one positional arg of the given type. */
function readExpr(t: FunctionType): string {
  if (isArrayType(t)) {
    switch (elementType(t)) {
      case "int":
      case "long":
        return "__r.ReadLongArray()";
      case "double":
        return "__r.ReadDoubleArray()";
      case "bool":
        return "__r.ReadBoolArray()";
      case "string":
        return "__r.ReadStrArray()";
    }
  }
  switch (t) {
    case "int":
    case "long":
      return "__r.ReadLong()";
    case "double":
      return "__r.ReadDouble()";
    case "bool":
      return "__r.ReadBool()";
    case "string":
      return "__r.ReadStr()";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

export const csharpAdapter: FunctionHarnessAdapter = {
  language: "csharp",
  generateStub(spec: FunctionSpec): string {
    const ret = csType(spec.returnType);
    const params = spec.params.map((p) => `${csType(p.type)} ${p.name}`).join(", ");
    return `class Solution {\n    public ${ret} ${spec.functionName}(${params}) {\n        // TODO: implement\n    }\n}\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    const preludeLineCount = PRELUDE.split("\n").length - 1; // lines before student code

    const reads = spec.params
      .map((p, idx) => {
        const lead = idx === 0 ? "" : "        __r.Expect(',');\n";
        return `${lead}        ${csType(p.type)} ${p.name} = ${readExpr(p.type)};`;
      })
      .join("\n");
    const callArgs = spec.params.map((p) => p.name).join(", ");
    const main = `

static class __Program {
    static void Main(string[] __ignored) {
        // Read stdin as UTF-8 explicitly. Mono 6.12 runs under the judge
        // container's default (POSIX/C) locale, so Console.In would decode the
        // args line with a non-UTF-8 encoding and replace every non-ASCII input
        // byte with '?' before the harness ever parses it — corrupting any
        // string argument containing non-ASCII (e.g. "café→", "한국어"). A UTF-8
        // StreamReader over the raw standard input stream keeps the bytes intact.
        string __line;
        using (var __stdin = new System.IO.StreamReader(Console.OpenStandardInput(), new System.Text.UTF8Encoding(false))) {
            __line = __stdin.ReadLine() ?? "";
        }
        var __r = new __FnJudge(__line);
        __r.Expect('[');
${reads}
        __r.Expect(']');
        ${csType(spec.returnType)} __result = new Solution().${spec.functionName}(${callArgs});
        var __out = new StringBuilder();
        __FnJudge.Write(__out, __result);
        // Write raw UTF-8 bytes straight to stdout instead of Console.Write.
        // Mono 6.12 runs under the judge container's default (POSIX/C) locale,
        // so Console.Out picks a non-UTF-8 encoding and replaces every non-ASCII
        // char with '?'. That would byte-diverge expected/actual for any string
        // return containing non-ASCII (e.g. "café→", "한국어"). Encoding the
        // canonical text as UTF-8 (no BOM) and writing it to the standard output
        // stream keeps the bytes identical to serialization.ts encodeValue and
        // the other adapters regardless of the ambient locale.
        var __bytes = new System.Text.UTF8Encoding(false).GetBytes(__out.ToString());
        using (var __stdout = Console.OpenStandardOutput()) {
            __stdout.Write(__bytes, 0, __bytes.Length);
            __stdout.Flush();
        }
    }
}
`;
    const source = `${PRELUDE}${studentCode}${main}`;
    return { source, preludeLineCount };
  },
};
