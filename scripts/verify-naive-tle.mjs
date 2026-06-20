#!/usr/bin/env node
/**
 * verify-naive-tle.mjs
 *
 * Submits naive C++ implementations to algo.xylolabs.com to verify that
 * TLE is correctly triggered on search/sort problems.
 *
 * If any problem returns AC with the naive solution, it is flagged — the
 * test cases for that problem need more stress.
 *
 * Usage: node scripts/verify-naive-tle.mjs
 */

const BASE_URL = (process.env.JUDGE_BASE_URL || 'https://algo.xylolabs.com').replace(/\/$/, '');
const API_KEY = process.env.JUDGE_API_KEY;
const LANGUAGE = 'cpp20';
const SUBMIT_DELAY_MS = 15000;  // delay between submissions (rate limit: 5/min)
const POLL_INTERVAL_MS = 2000;  // polling interval
const POLL_TIMEOUT_MS = 90000;  // max wait per submission

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!API_KEY) {
  console.error('Need JUDGE_API_KEY');
  process.exit(1);
}

// ─── Problem IDs (from /api/v1/problems search) ───────────────────────────────
// seq 269 — 나무 자르기
// seq 270 — 랜선 자르기
// seq 272 — 공유기 설치
// seq 271 — 예산
// seq 275 — 입국심사
// seq 273 — K번째 수 (곱셈 배열)
// seq 423 — 이분 탐색 경계
// seq 387 — KMP 문자열 검색
// seq 181 — 수 정렬하기 (대용량)
// seq 284 — 병합 정렬
// seq 421 — 퀵소트 킬러
// seq 426 — 카운팅 소트
// ──────────────────────────────────────────────────────────────────────────────

// NOTE: C++ source strings use \\n so the JSON body contains literal \n
// (backslash-n), not an actual newline character inside C++ string literals.

const PROBLEMS = [
  {
    name: '나무 자르기 (seq 269)',
    id: '1JDGBXvfd9FcuagCWSt9Z',
    strategy: 'Linear scan H from 10^9 down to 0 instead of binary search',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N; long long M;',
      '  cin >> N >> M;',
      '  vector<long long> trees(N);',
      '  for (auto& x : trees) cin >> x;',
      '  for (long long h = 1000000000LL; h >= 0; h--) {',
      '    long long sum = 0;',
      '    for (auto x : trees) if (x > h) sum += x - h;',
      '    if (sum >= M) { cout << h << "\\n"; return 0; }',
      '  }',
      '  cout << 0 << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '랜선 자르기 (seq 270)',
    id: 'LdgscZkndlvk5h_J_Ib5N',
    strategy: 'Linear scan length from max down to 1 instead of binary search',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int K, N;',
      '  cin >> K >> N;',
      '  vector<long long> cables(K);',
      '  long long maxLen = 0;',
      '  for (auto& x : cables) { cin >> x; maxLen = max(maxLen, x); }',
      '  for (long long len = maxLen; len >= 1; len--) {',
      '    long long cnt = 0;',
      '    for (auto x : cables) cnt += x / len;',
      '    if (cnt >= N) { cout << len << "\\n"; return 0; }',
      '  }',
      '  cout << 0 << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '공유기 설치 (seq 272)',
    id: 'eZmoThkFJXtXTbWgqn1aq',
    strategy: 'Linear scan min distance from 1 up to max gap instead of binary search',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, C;',
      '  cin >> N >> C;',
      '  vector<long long> houses(N);',
      '  for (auto& x : houses) cin >> x;',
      '  sort(houses.begin(), houses.end());',
      '  long long maxGap = houses.back() - houses.front();',
      '  long long ans = 1;',
      '  for (long long d = 1; d <= maxGap; d++) {',
      '    int cnt = 1;',
      '    long long last = houses[0];',
      '    for (int i = 1; i < N; i++) {',
      '      if (houses[i] - last >= d) { cnt++; last = houses[i]; }',
      '    }',
      '    if (cnt >= C) ans = d;',
      '  }',
      '  cout << ans << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '예산 (seq 271)',
    id: 'uMBKHYKujbbn0aOxB2yaL',
    strategy: 'Linear scan cap from max down to 0 instead of binary search',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N;',
      '  cin >> N;',
      '  vector<long long> req(N);',
      '  long long budget;',
      '  for (auto& x : req) cin >> x;',
      '  cin >> budget;',
      '  long long maxReq = *max_element(req.begin(), req.end());',
      '  for (long long cap = maxReq; cap >= 0; cap--) {',
      '    long long total = 0;',
      '    for (auto x : req) total += min(x, cap);',
      '    if (total <= budget) { cout << cap << "\\n"; return 0; }',
      '  }',
      '  cout << 0 << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '입국심사 (seq 275)',
    id: 'gu1TmrHynaLDtDl122Yab',
    strategy: 'Linear scan time from 1 to N*max_time instead of binary search',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  long long N, M;',
      '  cin >> N >> M;',
      '  vector<long long> times(M);',
      '  for (auto& x : times) cin >> x;',
      '  long long maxT = *max_element(times.begin(), times.end());',
      '  for (long long t = 1; t <= N * maxT; t++) {',
      '    long long cnt = 0;',
      '    for (auto ti : times) cnt += t / ti;',
      '    if (cnt >= N) { cout << t << "\\n"; return 0; }',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    name: 'K번째 수 (곱셈 배열) (seq 273)',
    id: 'O9csb3qDuWE4_ZX7bD5ar',
    strategy: 'Build full N^2 array explicitly and sort — O(N^2 log N)',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  long long N, K;',
      '  cin >> N >> K;',
      '  vector<long long> arr;',
      '  arr.reserve((size_t)N * N);',
      '  for (long long i = 1; i <= N; i++)',
      '    for (long long j = 1; j <= N; j++)',
      '      arr.push_back(i * j);',
      '  sort(arr.begin(), arr.end());',
      '  cout << arr[K - 1] << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '이분 탐색 경계 (seq 423)',
    id: 'WJvq1ftWdxdRkbQXr75jW',
    strategy: 'Naive O(N) linear search instead of binary search — single lower_bound query',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N;',
      '  cin >> N;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  int X;',
      '  cin >> X;',
      '  // linear scan for first position >= X (1-indexed)',
      '  int ans = N + 1;',
      '  for (int i = 0; i < N; i++) {',
      '    if (a[i] >= X) { ans = i + 1; break; }',
      '  }',
      '  cout << ans << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: 'KMP 문자열 검색 (seq 387)',
    id: 'x-Z-YNAaw7JXq4wjKGHYy',
    strategy: 'Naive O(|T|*|P|) substring matching instead of KMP',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  string T, P;',
      '  cin >> T >> P;',
      '  int n = (int)T.size(), m = (int)P.size();',
      '  int cnt = 0;',
      '  vector<int> positions;',
      '  for (int i = 0; i + m <= n; i++) {',
      '    bool match = true;',
      '    for (int j = 0; j < m; j++) {',
      '      if (T[i + j] != P[j]) { match = false; break; }',
      '    }',
      '    if (match) { cnt++; positions.push_back(i + 1); }',
      '  }',
      '  cout << cnt << "\\n";',
      '  for (int p : positions) cout << p << " ";',
      '  if (cnt) cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '수 정렬하기 (대용량) (seq 181)',
    id: 'r3-O8DRXNDuDd9o7iFlFS',
    strategy: 'Bubble sort O(N^2) instead of O(N log N)',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N;',
      '  cin >> N;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  for (int i = 0; i < N; i++)',
      '    for (int j = 0; j + 1 < N - i; j++)',
      '      if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);',
      '  for (int i = 0; i < N; i++) {',
      '    if (i) cout << " ";',
      '    cout << a[i];',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '병합 정렬 (seq 284)',
    id: 'Tubg9Vgy_Lk1K-GbVQHWq',
    strategy: 'Bubble sort O(N^2) submitted instead of merge sort',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N;',
      '  cin >> N;',
      '  vector<long long> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  for (int i = 0; i < N; i++)',
      '    for (int j = 0; j + 1 < N - i; j++)',
      '      if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);',
      '  for (int i = 0; i < N; i++) {',
      '    if (i) cout << " ";',
      '    cout << a[i];',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '퀵소트 킬러 (seq 421)',
    id: 'g2bPSnC7_yV4MtwFixmzZ',
    strategy: 'First-element pivot quicksort — O(N^2) on sorted/reverse-sorted input',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'void qsort(vector<int>& a, int lo, int hi) {',
      '  if (lo >= hi) return;',
      '  int pivot = a[lo];',
      '  int i = lo + 1, j = hi;',
      '  while (i <= j) {',
      '    if (a[i] <= pivot) i++;',
      '    else swap(a[i], a[j--]);',
      '  }',
      '  swap(a[lo], a[j]);',
      '  qsort(a, lo, j - 1);',
      '  qsort(a, j + 1, hi);',
      '}',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N;',
      '  cin >> N;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  qsort(a, 0, N - 1);',
      '  for (int i = 0; i < N; i++) {',
      '    if (i) cout << " ";',
      '    cout << a[i];',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    name: '카운팅 소트 (seq 426)',
    id: 'nPluY5QeeK1ySAwqPcQ1Z',
    strategy: 'std::sort O(N log N) comparison sort instead of counting sort',
    source: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N;',
      '  cin >> N;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  sort(a.begin(), a.end());',
      '  for (int i = 0; i < N; i++) {',
      '    if (i) cout << " ";',
      '    cout << a[i];',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
];

// ─── API helpers ──────────────────────────────────────────────────────────────

async function submit(problemId, sourceCode, retries = 8) {
  const res = await fetch(`${BASE_URL}/api/v1/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ problemId, language: LANGUAGE, sourceCode }),
  });
  if (res.status === 429 && retries > 0) {
    console.log(`    Rate limited — waiting 65s and retrying (${retries} retries left)...`);
    await sleep(65000);
    return submit(problemId, sourceCode, retries - 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function pollSubmission(id) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let res;
    try {
      res = await fetch(`${BASE_URL}/api/v1/submissions/${id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
    } catch (e) {
      console.log(`    Poll network error (${e.message}), retrying...`);
      continue;
    }
    if (res.status === 502 || res.status === 503) {
      console.log(`    Poll ${res.status}, retrying...`);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Poll HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    const sub = data.data ?? data;
    const status = sub.status;
    if (status && !['pending', 'queued', 'judging'].includes(status)) {
      return sub;
    }
  }
  throw new Error(`Timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nNaive TLE Verifier — ${PROBLEMS.length} problems\n${'='.repeat(60)}`);

  const results = [];

  for (let i = 0; i < PROBLEMS.length; i++) {
    const p = PROBLEMS[i];
    console.log(`\n[${i + 1}/${PROBLEMS.length}] ${p.name}`);
    console.log(`  Strategy: ${p.strategy}`);

    let submissionId;
    try {
      const resp = await submit(p.id, p.source);
      const sub = resp.data ?? resp;
      submissionId = sub.id;
      console.log(`  Submitted — id: ${submissionId}`);
    } catch (err) {
      console.error(`  SUBMIT ERROR: ${err.message}`);
      results.push({ name: p.name, verdict: 'SUBMIT_ERROR', detail: err.message });
      if (i + 1 < PROBLEMS.length) await sleep(SUBMIT_DELAY_MS);
      continue;
    }

    let sub;
    try {
      sub = await pollSubmission(submissionId);
    } catch (err) {
      console.error(`  POLL ERROR: ${err.message}`);
      results.push({ name: p.name, verdict: 'POLL_ERROR', detail: err.message });
      if (i + 1 < PROBLEMS.length) await sleep(SUBMIT_DELAY_MS);
      continue;
    }

    const verdict = sub.status ?? 'unknown';
    const timeMs = sub.executionTimeMs ?? '?';
    const score = sub.score ?? '?';

    console.log(`  Verdict: ${verdict}  time: ${timeMs}ms  score: ${score}`);

    if (verdict === 'accepted') {
      console.log(`  *** FLAG: naive solution got AC — test cases need more stress! ***`);
    }

    results.push({ name: p.name, verdict, timeMs, score, id: submissionId });

    if (i + 1 < PROBLEMS.length) await sleep(SUBMIT_DELAY_MS);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY\n');

  const flagged = [];
  const tle = [];
  const errors = [];
  const other = [];

  for (const r of results) {
    if (r.verdict === 'accepted') flagged.push(r);
    else if (r.verdict === 'time_limit_exceeded') tle.push(r);
    else if (['SUBMIT_ERROR', 'POLL_ERROR'].includes(r.verdict)) errors.push(r);
    else other.push(r);
  }

  for (const r of results) {
    const icon =
      r.verdict === 'accepted' ? '!!! AC (needs stress)' :
      r.verdict === 'time_limit_exceeded' ? 'TLE (expected)    ' :
      r.verdict === 'SUBMIT_ERROR' || r.verdict === 'POLL_ERROR' ? 'ERROR             ' :
      r.verdict.toUpperCase().padEnd(18);
    console.log(`  ${icon}  ${r.name}`);
  }

  console.log(`\nTLE (correct): ${tle.length}/${PROBLEMS.length}`);
  if (flagged.length > 0) {
    console.log(`\nFLAGGED (AC with naive — needs stress testing):`);
    for (const r of flagged) console.log(`  - ${r.name}  submission: ${r.id}`);
  }
  if (other.length > 0) {
    console.log(`\nOther verdicts:`);
    for (const r of other) console.log(`  ${r.verdict.padEnd(20)}  ${r.name}`);
  }
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const r of errors) console.log(`  ${r.verdict}  ${r.name}: ${r.detail}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
