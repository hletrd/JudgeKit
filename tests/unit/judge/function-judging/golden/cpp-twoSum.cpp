#include <bits/stdc++.h>
using namespace std;

namespace __fnjudge {
struct Reader {
    const string &s;
    size_t i = 0;
    explicit Reader(const string &src) : s(src) {}
    void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++; }
    char peek() { ws(); return i < s.size() ? s[i] : '\0'; }
    void expect(char c) { ws(); if (i >= s.size() || s[i] != c) { fprintf(stderr, "json: expected %c\n", c); exit(1); } i++; }
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
        fprintf(stderr, "json: expected bool\n"); exit(1);
    }
    string readStr() {
        ws();
        expect('"');
        string out;
        while (i < s.size() && s[i] != '"') {
            char c = s[i++];
            if (c == '\\' && i < s.size()) {
                char e = s[i++];
                switch (e) {
                    case 'n': out.push_back('\n'); break;
                    case 't': out.push_back('\t'); break;
                    case 'r': out.push_back('\r'); break;
                    case 'b': out.push_back('\b'); break;
                    case 'f': out.push_back('\f'); break;
                    case '/': out.push_back('/'); break;
                    case '"': out.push_back('"'); break;
                    case '\\': out.push_back('\\'); break;
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
    o.push_back('"');
    for (char c : v) {
        switch (c) {
            case '"': o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\t': o += "\\t"; break;
            case '\r': o += "\\r"; break;
            default: o.push_back(c); break;
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

class Solution {
public:
    vector<long long> twoSum(vector<long long> nums, long long target) {
        unordered_map<long long, long long> seen;
        for (long long i = 0; i < (long long)nums.size(); i++) {
            long long need = target - nums[i];
            if (seen.count(need)) return {seen[need], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};


int main() {
    std::string __line;
    std::getline(std::cin, __line);
    __fnjudge::Reader __r(__line);
    __r.expect('[');
    std::vector<long long> nums;
    __r.readArray([&]() { nums.push_back(__r.readInt()); });
    __r.expect(',');
    long long target = __r.readInt();
    __r.expect(']');
    auto __result = Solution().twoSum(nums, target);
    std::string __out;
    __fnjudge::writeVal(__out, __result);
    std::cout << __out;
    return 0;
}
