import java.util.*;
import java.util.stream.*;

final class __FnJudge {
    private final String s;
    private int i = 0;
    __FnJudge(String src) { this.s = src; }

    private void ws() {
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
            else break;
        }
    }
    char peek() { ws(); return i < s.length() ? s.charAt(i) : '\0'; }
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
            if (c == '\\' && i < s.length()) {
                char e = s.charAt(i++);
                switch (e) {
                    case 'n': out.append('\n'); break;
                    case 't': out.append('\t'); break;
                    case 'r': out.append('\r'); break;
                    case 'b': out.append('\b'); break;
                    case 'f': out.append('\f'); break;
                    case '/': out.append('/'); break;
                    case '"': out.append('"'); break;
                    case '\\': out.append('\\'); break;
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
        o.append('"');
        for (int k = 0; k < v.length(); k++) {
            char c = v.charAt(k);
            switch (c) {
                case '"': o.append("\\\""); break;
                case '\\': o.append("\\\\"); break;
                case '\n': o.append("\\n"); break;
                case '\t': o.append("\\t"); break;
                case '\r': o.append("\\r"); break;
                default: o.append(c); break;
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

class Solution {
    long[] twoSum(long[] nums, long target) {
        java.util.HashMap<Long, Integer> seen = new java.util.HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            long need = target - nums[i];
            if (seen.containsKey(need)) return new long[]{seen.get(need), i};
            seen.put(nums[i], i);
        }
        return new long[]{};
    }
}


public class Main {
    public static void main(String[] args) throws Exception {
        java.io.BufferedReader __br = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        String __line = __br.readLine();
        if (__line == null) __line = "";
        __FnJudge __r = new __FnJudge(__line);
        __r.expect('[');
        long[] nums = __r.readLongArray();
        __r.expect(',');
        long target = __r.readLong();
        __r.expect(']');
        long[] __result = new Solution().twoSum(nums, target);
        StringBuilder __out = new StringBuilder();
        __FnJudge.write(__out, __result);
        System.out.print(__out);
    }
}
