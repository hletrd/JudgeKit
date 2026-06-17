import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";
import { isArrayType, elementType } from "../types";

/** Map a FunctionType to its Java declaration type. */
function javaType(t: FunctionType): string {
  if (isArrayType(t)) return `${javaScalar(elementType(t))}[]`;
  return javaScalar(t);
}

function javaScalar(t: string): string {
  switch (t) {
    case "int":
    case "long":
      return "long";
    case "double":
      return "double";
    case "bool":
      return "boolean";
    case "string":
      return "String";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

// Self-contained prelude: a minimal one-line JSON reader over the args array,
// scalar readers for the supported types, and canonical writers matching
// serialization.ts (compact JSON, no inner spaces, true/false, %.10g doubles
// which the worker's whitespace-token float comparator accepts). No external
// libraries (Gson/Jackson are not on the classpath). The Solution class is
// appended after this; class order is irrelevant to javac so Main (appended
// last) can reference both this helper and Solution.
//
// Broad java.util / java.util.stream imports are placed at the very top so the
// student's Solution code can use HashMap/HashSet/Arrays/List/streams without
// writing its own imports (student code is sandwiched between this prelude and
// the generated main, so it cannot add top-of-file imports). javac treats
// unused imports as warnings, not errors.
const PRELUDE = `import java.util.*;
import java.util.stream.*;

final class __FnJudge {
    private final String s;
    private int i = 0;
    __FnJudge(String src) { this.s = src; }

    private void ws() {
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == ' ' || c == '\\t' || c == '\\n' || c == '\\r') i++;
            else break;
        }
    }
    char peek() { ws(); return i < s.length() ? s.charAt(i) : '\\0'; }
    void expect(char c) {
        ws();
        if (i >= s.length() || s.charAt(i) != c) {
            System.err.println("json: expected " + c);
            System.exit(1);
        }
        i++;
    }
    private String number() {
        ws();
        int start = i;
        if (i < s.length() && (s.charAt(i) == '-' || s.charAt(i) == '+')) i++;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (Character.isDigit(c) || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i++;
            else break;
        }
        return s.substring(start, i);
    }
    long readLong() { return Math.round(Double.parseDouble(number())); }
    double readDouble() { return Double.parseDouble(number()); }
    boolean readBool() {
        ws();
        if (s.startsWith("true", i)) { i += 4; return true; }
        if (s.startsWith("false", i)) { i += 5; return false; }
        System.err.println("json: expected bool");
        System.exit(1);
        return false;
    }
    String readStr() {
        ws();
        expect('"');
        StringBuilder out = new StringBuilder();
        while (i < s.length() && s.charAt(i) != '"') {
            char c = s.charAt(i++);
            if (c == '\\\\' && i < s.length()) {
                char e = s.charAt(i++);
                switch (e) {
                    case 'n': out.append('\\n'); break;
                    case 't': out.append('\\t'); break;
                    case 'r': out.append('\\r'); break;
                    case 'b': out.append('\\b'); break;
                    case 'f': out.append('\\f'); break;
                    case '/': out.append('/'); break;
                    case '"': out.append('"'); break;
                    case '\\\\': out.append('\\\\'); break;
                    case 'u':
                        out.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                        break;
                    default: out.append(e); break;
                }
            } else {
                out.append(c);
            }
        }
        expect('"');
        return out.toString();
    }

    long[] readLongArray() {
        ArrayList<Long> v = new ArrayList<>();
        expect('[');
        if (peek() == ']') { i++; } else {
            while (true) {
                v.add(readLong());
                if (peek() == ',') { i++; continue; }
                break;
            }
            expect(']');
        }
        long[] a = new long[v.size()];
        for (int k = 0; k < a.length; k++) a[k] = v.get(k);
        return a;
    }
    double[] readDoubleArray() {
        ArrayList<Double> v = new ArrayList<>();
        expect('[');
        if (peek() == ']') { i++; } else {
            while (true) {
                v.add(readDouble());
                if (peek() == ',') { i++; continue; }
                break;
            }
            expect(']');
        }
        double[] a = new double[v.size()];
        for (int k = 0; k < a.length; k++) a[k] = v.get(k);
        return a;
    }
    boolean[] readBoolArray() {
        ArrayList<Boolean> v = new ArrayList<>();
        expect('[');
        if (peek() == ']') { i++; } else {
            while (true) {
                v.add(readBool());
                if (peek() == ',') { i++; continue; }
                break;
            }
            expect(']');
        }
        boolean[] a = new boolean[v.size()];
        for (int k = 0; k < a.length; k++) a[k] = v.get(k);
        return a;
    }
    String[] readStrArray() {
        ArrayList<String> v = new ArrayList<>();
        expect('[');
        if (peek() == ']') { i++; } else {
            while (true) {
                v.add(readStr());
                if (peek() == ',') { i++; continue; }
                break;
            }
            expect(']');
        }
        return v.toArray(new String[0]);
    }

    static void write(StringBuilder o, long v) { o.append(v); }
    static void write(StringBuilder o, double v) { o.append(String.format("%.10g", v)); }
    static void write(StringBuilder o, boolean v) { o.append(v ? "true" : "false"); }
    static void write(StringBuilder o, String v) {
        // Canonical JSON.stringify (ECMA-404) escaping: named short escapes for
        // \\b \\t \\n \\f \\r \\" \\\\, \\u00XX for any other control char < 0x20,
        // everything else (incl. <, >, &, and non-ASCII) raw. Matches
        // serialization.ts encodeValue and the other adapters byte-for-byte.
        o.append('"');
        for (int k = 0; k < v.length(); k++) {
            char c = v.charAt(k);
            switch (c) {
                case '"': o.append("\\\\\\""); break;
                case '\\\\': o.append("\\\\\\\\"); break;
                case '\\b': o.append("\\\\b"); break;
                case '\\f': o.append("\\\\f"); break;
                case '\\n': o.append("\\\\n"); break;
                case '\\t': o.append("\\\\t"); break;
                case '\\r': o.append("\\\\r"); break;
                default:
                    if (c < 0x20) {
                        o.append(String.format("\\\\u%04x", (int) c));
                    } else {
                        o.append(c);
                    }
                    break;
            }
        }
        o.append('"');
    }
    static void write(StringBuilder o, long[] v) {
        o.append('[');
        for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); write(o, v[k]); }
        o.append(']');
    }
    static void write(StringBuilder o, double[] v) {
        o.append('[');
        for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); write(o, v[k]); }
        o.append(']');
    }
    static void write(StringBuilder o, boolean[] v) {
        o.append('[');
        for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); write(o, v[k]); }
        o.append(']');
    }
    static void write(StringBuilder o, String[] v) {
        o.append('[');
        for (int k = 0; k < v.length; k++) { if (k > 0) o.append(','); write(o, v[k]); }
        o.append(']');
    }
}

`;

/** Reader call that yields one positional arg of the given type. */
function readExpr(t: FunctionType): string {
  if (isArrayType(t)) {
    switch (elementType(t)) {
      case "int":
      case "long":
        return "__r.readLongArray()";
      case "double":
        return "__r.readDoubleArray()";
      case "bool":
        return "__r.readBoolArray()";
      case "string":
        return "__r.readStrArray()";
    }
  }
  switch (t) {
    case "int":
    case "long":
      return "__r.readLong()";
    case "double":
      return "__r.readDouble()";
    case "bool":
      return "__r.readBool()";
    case "string":
      return "__r.readStr()";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

export const javaAdapter: FunctionHarnessAdapter = {
  language: "java",
  generateStub(spec: FunctionSpec): string {
    const ret = javaType(spec.returnType);
    const params = spec.params.map((p) => `${javaType(p.type)} ${p.name}`).join(", ");
    return `class Solution {\n    ${ret} ${spec.functionName}(${params}) {\n        // TODO: implement\n    }\n}\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    const preludeLineCount = PRELUDE.split("\n").length - 1; // lines before student code

    const reads = spec.params
      .map((p, idx) => {
        const lead = idx === 0 ? "" : "        __r.expect(',');\n";
        return `${lead}        ${javaType(p.type)} ${p.name} = ${readExpr(p.type)};`;
      })
      .join("\n");
    const callArgs = spec.params.map((p) => p.name).join(", ");
    const main = `

public class Main {
    public static void main(String[] args) throws Exception {
        java.io.BufferedReader __br = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        String __line = __br.readLine();
        if (__line == null) __line = "";
        __FnJudge __r = new __FnJudge(__line);
        __r.expect('[');
${reads}
        __r.expect(']');
        ${javaType(spec.returnType)} __result = new Solution().${spec.functionName}(${callArgs});
        StringBuilder __out = new StringBuilder();
        __FnJudge.write(__out, __result);
        System.out.print(__out);
    }
}
`;
    const source = `${PRELUDE}${studentCode}${main}`;
    return { source, preludeLineCount };
  },
};
