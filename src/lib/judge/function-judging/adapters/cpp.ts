import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";
import { isArrayType, elementType } from "../types";

/** Map a FunctionType to its C++ declaration type. */
function cppType(t: FunctionType): string {
  if (isArrayType(t)) return `std::vector<${cppScalar(elementType(t))}>`;
  return cppScalar(t);
}

function cppScalar(t: string): string {
  switch (t) {
    case "int":
    case "long":
      return "long long";
    case "double":
      return "double";
    case "bool":
      return "bool";
    case "string":
      return "std::string";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

// Self-contained prelude: a minimal one-line JSON parser over the args array,
// scalar readers for the supported types, and canonical writers matching
// serialization.ts (compact JSON, no inner spaces, true/false, %.10g doubles
// which the worker's whitespace-token float comparator accepts).
const PRELUDE = `#include <bits/stdc++.h>
using namespace std;

namespace __fnjudge {
struct Reader {
    const string &s;
    size_t i = 0;
    explicit Reader(const string &src) : s(src) {}
    void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\\t' || s[i] == '\\n' || s[i] == '\\r')) i++; }
    char peek() { ws(); return i < s.size() ? s[i] : '\\0'; }
    void expect(char c) { ws(); if (i >= s.size() || s[i] != c) { fprintf(stderr, "json: expected %c\\n", c); exit(1); } i++; }
    long long readInt() {
        ws();
        size_t start = i;
        if (i < s.size() && (s[i] == '-' || s[i] == '+')) i++;
        while (i < s.size() && (isdigit((unsigned char)s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++;
        return (long long)llround(stod(s.substr(start, i - start)));
    }
    double readDouble() {
        ws();
        size_t start = i;
        if (i < s.size() && (s[i] == '-' || s[i] == '+')) i++;
        while (i < s.size() && (isdigit((unsigned char)s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++;
        return stod(s.substr(start, i - start));
    }
    bool readBool() {
        ws();
        if (s.compare(i, 4, "true") == 0) { i += 4; return true; }
        if (s.compare(i, 5, "false") == 0) { i += 5; return false; }
        fprintf(stderr, "json: expected bool\\n"); exit(1);
    }
    string readStr() {
        ws();
        expect('"');
        string out;
        while (i < s.size() && s[i] != '"') {
            char c = s[i++];
            if (c == '\\\\' && i < s.size()) {
                char e = s[i++];
                switch (e) {
                    case 'n': out.push_back('\\n'); break;
                    case 't': out.push_back('\\t'); break;
                    case 'r': out.push_back('\\r'); break;
                    case 'b': out.push_back('\\b'); break;
                    case 'f': out.push_back('\\f'); break;
                    case '/': out.push_back('/'); break;
                    case '"': out.push_back('"'); break;
                    case '\\\\': out.push_back('\\\\'); break;
                    case 'u': {
                        int code = (int)strtol(s.substr(i, 4).c_str(), nullptr, 16);
                        i += 4;
                        if (code < 0x80) out.push_back((char)code);
                        else if (code < 0x800) {
                            out.push_back((char)(0xC0 | (code >> 6)));
                            out.push_back((char)(0x80 | (code & 0x3F)));
                        } else {
                            out.push_back((char)(0xE0 | (code >> 12)));
                            out.push_back((char)(0x80 | ((code >> 6) & 0x3F)));
                            out.push_back((char)(0x80 | (code & 0x3F)));
                        }
                        break;
                    }
                    default: out.push_back(e); break;
                }
            } else {
                out.push_back(c);
            }
        }
        expect('"');
        return out;
    }
    template <class F> void readArray(F onItem) {
        expect('[');
        if (peek() == ']') { i++; return; }
        while (true) {
            onItem();
            if (peek() == ',') { i++; continue; }
            break;
        }
        expect(']');
    }
};

inline void writeVal(string &o, long long v) { o += to_string(v); }
inline void writeVal(string &o, double v) { char buf[64]; snprintf(buf, sizeof(buf), "%.10g", v); o += buf; }
inline void writeVal(string &o, bool v) { o += v ? "true" : "false"; }
inline void writeVal(string &o, const string &v) {
    // Canonical JSON.stringify (ECMA-404) escaping: named short escapes for
    // \\b \\t \\n \\f \\r \\" \\\\, \\u00XX for any other control char < 0x20,
    // everything else (incl. <, >, &, and non-ASCII UTF-8 bytes) raw. Matches
    // serialization.ts encodeValue and the other adapters byte-for-byte.
    o.push_back('"');
    for (char c : v) {
        switch (c) {
            case '"': o += "\\\\\\""; break;
            case '\\\\': o += "\\\\\\\\"; break;
            case '\\b': o += "\\\\b"; break;
            case '\\f': o += "\\\\f"; break;
            case '\\n': o += "\\\\n"; break;
            case '\\t': o += "\\\\t"; break;
            case '\\r': o += "\\\\r"; break;
            default:
                if ((unsigned char)c < 0x20) {
                    char ubuf[8];
                    snprintf(ubuf, sizeof(ubuf), "\\\\u%04x", (unsigned char)c);
                    o += ubuf;
                } else {
                    o.push_back(c);
                }
                break;
        }
    }
    o.push_back('"');
}
template <class T> inline void writeVal(string &o, const vector<T> &v) {
    o.push_back('[');
    for (size_t k = 0; k < v.size(); k++) { if (k) o.push_back(','); writeVal(o, v[k]); }
    o.push_back(']');
}
} // namespace __fnjudge

`;

/** Generate a statement that reads one positional arg of the given type. */
function readArg(name: string, t: FunctionType): string {
  if (isArrayType(t)) {
    const el = elementType(t);
    const reader = scalarReadExpr(el);
    return `    ${cppType(t)} ${name};\n    __r.readArray([&]() { ${name}.push_back(${reader}); });`;
  }
  return `    ${cppType(t)} ${name} = ${scalarReadExpr(t)};`;
}

function scalarReadExpr(t: string): string {
  switch (t) {
    case "int":
    case "long":
      return "__r.readInt()";
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

export const cppAdapter: FunctionHarnessAdapter = {
  language: "cpp23",
  generateStub(spec: FunctionSpec): string {
    const ret = cppType(spec.returnType);
    const params = spec.params.map((p) => `${cppType(p.type)} ${p.name}`).join(", ");
    return `class Solution {\npublic:\n    ${ret} ${spec.functionName}(${params}) {\n        // TODO: implement\n    }\n};\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    const preludeLineCount = PRELUDE.split("\n").length - 1; // lines before student code

    const reads = spec.params
      .map((p) => readArg(p.name, p.type))
      .join("\n    __r.expect(',');\n");
    const callArgs = spec.params.map((p) => p.name).join(", ");
    const main = `

int main() {
    std::string __line;
    std::getline(std::cin, __line);
    __fnjudge::Reader __r(__line);
    __r.expect('[');
${reads}
    __r.expect(']');
    auto __result = Solution().${spec.functionName}(${callArgs});
    std::string __out;
${printBlock(spec.returnType)}
    std::cout << __out;
    return 0;
}
`;
    const source = `${PRELUDE}${studentCode}${main}`;
    return { source, preludeLineCount };
  },
};

/**
 * Emit the C++ statements that serialize `__result` into `__out`.
 *
 * double / double[] returns print whitespace-separated numeric tokens (a single
 * token for a scalar, space-joined for an array) to match encodeValue's
 * float/space-separated contract — the worker's whitespace-token float
 * comparator tokenizes these but cannot tokenize a JSON `[a,b]`. Both reuse the
 * existing `writeVal(string&, double)` formatter (`%.10g`), which the float
 * comparator accepts under tolerance. Every other type keeps the JSON writer.
 */
function printBlock(returnType: FunctionType): string {
  if (returnType === "double") {
    return "    __fnjudge::writeVal(__out, __result);";
  }
  if (returnType === "double[]") {
    return `    for (size_t __k = 0; __k < __result.size(); __k++) {
        if (__k) __out.push_back(' ');
        __fnjudge::writeVal(__out, __result[__k]);
    }`;
  }
  return "    __fnjudge::writeVal(__out, __result);";
}
