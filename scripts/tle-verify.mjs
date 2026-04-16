#!/usr/bin/env node
// Verify TLE on data structure problems by submitting naive C++ implementations

const API_BASE = 'https://algo.xylolabs.com';
const API_KEY = 'jk_d74b5170d9202945aa32a033c0b33b0bf106d1b7';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

// C++ newline helper: \\n in template literal = \n in JS string = C++ newline escape
const NL = '"\\n"';

// Target problems with naive C++ implementations
const problems = [
  {
    id: 'KRRAZxJ1k01iXwgr1_yTy',
    title: '구간 합 구하기 (세그먼트 트리)',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, M;',
      '  cin >> N >> M;',
      '  vector<long long> a(N+1);',
      '  for (int i = 1; i <= N; i++) cin >> a[i];',
      '  while (M--) {',
      '    int op; cin >> op;',
      '    if (op == 1) {',
      '      int i; long long v; cin >> i >> v;',
      '      a[i] = v;',
      '    } else {',
      '      int l, r; cin >> l >> r;',
      '      long long s = 0;',
      '      for (int i = l; i <= r; i++) s += a[i];',
      '      cout << s << "\\n";',
      '    }',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    id: 'GIdZ060iKjkBy4GKucenm',
    title: '구간 최솟값 쿼리 (RMQ)',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, M; cin >> N >> M;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  while (M--) {',
      '    int l, r; cin >> l >> r;',
      '    int m = INT_MAX;',
      '    for (int i = l-1; i < r; i++) m = min(m, a[i]);',
      '    cout << m << "\\n";',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    id: 'ut1daWAIYcoHIisZ99Kou',
    title: '구간 최댓값 쿼리',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, M; cin >> N >> M;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  while (M--) {',
      '    int l, r; cin >> l >> r;',
      '    int m = INT_MIN;',
      '    for (int i = l-1; i < r; i++) m = max(m, a[i]);',
      '    cout << m << "\\n";',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    id: 'xPfU_OaUs14uC9yl5_27N',
    title: '펜윅 트리 (구간 합)',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, M;',
      '  cin >> N >> M;',
      '  vector<long long> a(N+1);',
      '  for (int i = 1; i <= N; i++) cin >> a[i];',
      '  while (M--) {',
      '    int op; cin >> op;',
      '    if (op == 1) {',
      '      int i; long long v; cin >> i >> v;',
      '      a[i] = v;',
      '    } else {',
      '      int l, r; cin >> l >> r;',
      '      long long s = 0;',
      '      for (int i = l; i <= r; i++) s += a[i];',
      '      cout << s << "\\n";',
      '    }',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    id: 'y3Zf3N9EdoeUzAYkdw76Q',
    title: '역전 수 세기 (BIT)',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N; cin >> N;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  long long cnt = 0;',
      '  for (int i = 0; i < N; i++)',
      '    for (int j = i+1; j < N; j++)',
      '      if (a[i] > a[j]) cnt++;',
      '  cout << cnt << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    id: 'tFmWkN1KiZNmff2VDCPsN',
    title: '슬라이딩 윈도우 최솟값',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, K; cin >> N >> K;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  for (int i = 0; i <= N-K; i++) {',
      '    int m = INT_MAX;',
      '    for (int j = i; j < i+K; j++) m = min(m, a[j]);',
      '    if (i > 0) cout << " ";',
      '    cout << m;',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    id: 'RDj63-A0NmyW5u1a3BKCf',
    title: '슬라이딩 윈도우 최댓값',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, K; cin >> N >> K;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  for (int i = 0; i <= N-K; i++) {',
      '    int m = INT_MIN;',
      '    for (int j = i; j < i+K; j++) m = max(m, a[j]);',
      '    if (i > 0) cout << " ";',
      '    cout << m;',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    id: 'hptq8VQPJ78TZjgcsT3ze',
    title: '오큰수 (NGE)',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N; cin >> N;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  for (int i = 0; i < N; i++) {',
      '    int res = -1;',
      '    for (int j = i+1; j < N; j++) {',
      '      if (a[j] > a[i]) { res = a[j]; break; }',
      '    }',
      '    cout << res;',
      '    if (i < N-1) cout << " ";',
      '  }',
      '  cout << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    id: 'nfZCBk2KRRoQgtyFWEzP6',
    title: '히스토그램에서 가장 큰 직사각형',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N; cin >> N;',
      '  vector<long long> h(N);',
      '  for (auto& x : h) cin >> x;',
      '  long long ans = 0;',
      '  for (int i = 0; i < N; i++) {',
      '    long long mn = h[i];',
      '    for (int j = i; j < N; j++) {',
      '      mn = min(mn, h[j]);',
      '      ans = max(ans, mn * (j - i + 1));',
      '    }',
      '  }',
      '  cout << ans << "\\n";',
      '}',
    ].join('\n'),
  },
  {
    id: 'XRHZxCyY0H_keXwWRWCO1',
    title: 'K번째 수 (세그먼트 트리)',
    code: [
      '#include <bits/stdc++.h>',
      'using namespace std;',
      'int main() {',
      '  ios::sync_with_stdio(false);',
      '  cin.tie(nullptr);',
      '  int N, Q; cin >> N >> Q;',
      '  vector<int> a(N);',
      '  for (auto& x : a) cin >> x;',
      '  while (Q--) {',
      '    int op; cin >> op;',
      '    if (op == 1) {',
      '      int i, v; cin >> i >> v;',
      '      a[i-1] = v;',
      '    } else {',
      '      int k; cin >> k;',
      '      vector<int> sorted_a = a;',
      '      sort(sorted_a.begin(), sorted_a.end());',
      '      cout << sorted_a[k-1] << "\\n";',
      '    }',
      '  }',
      '}',
    ].join('\n'),
  },
];

// Verify no actual newlines snuck into the C++ string literals
for (const p of problems) {
  if (p.code.includes('"' + '\n' + '"')) {
    throw new Error(`Problem ${p.title} has literal newline in string literal!`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Track last submit time to enforce 65s minimum gap
let lastSubmitTime = 0;

async function submit(problem) {
  // Enforce 65s gap from last successful submit
  const elapsed = Date.now() - lastSubmitTime;
  if (elapsed < 65000 && lastSubmitTime > 0) {
    const waitMs = 65000 - elapsed;
    console.log(`  Waiting ${Math.ceil(waitMs/1000)}s for rate limit window...`);
    await sleep(waitMs);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await fetch(`${API_BASE}/api/v1/submissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        problemId: problem.id,
        language: 'cpp20',
        sourceCode: problem.code,
      }),
    });
    if (resp.status === 429) {
      const body = await resp.json().catch(() => ({}));
      const retryAfter = Number(resp.headers.get('retry-after') ?? 60);
      console.log(`  429 ${body.error ?? 'rateLimited'}, waiting ${retryAfter + 5}s...`);
      await sleep((retryAfter + 5) * 1000);
      lastSubmitTime = 0;
      continue;
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Submit failed ${resp.status}: ${text}`);
    }
    lastSubmitTime = Date.now();
    return resp.json();
  }
  throw new Error('Submit failed after 5 attempts');
}

async function poll(submissionId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(3000);
    const resp = await fetch(`${API_BASE}/api/v1/submissions/${submissionId}`, { headers });
    if (!resp.ok) throw new Error(`Poll failed ${resp.status}`);
    const envelope = await resp.json();
    const record = envelope.data ?? envelope;
    const verdict = record.status ?? record.verdict ?? record.result;
    if (!['pending', 'running', 'queued', 'judging'].includes(verdict)) {
      return record;
    }
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for verdict');
}

async function main() {
  const results = [];

  for (const problem of problems) {
    console.log(`\n[${problem.title}]`);
    console.log(`  Problem ID: ${problem.id}`);

    let submission;
    try {
      submission = await submit(problem);
    } catch (e) {
      console.error(`  Submit error: ${e.message}`);
      results.push({ title: problem.title, verdict: 'SUBMIT_ERROR', error: e.message });
      await sleep(3000);
      continue;
    }

    const subId = submission.id ?? submission.submissionId ?? submission.data?.id;
    console.log(`  Submission ID: ${subId}`);
    process.stdout.write('  Polling');

    let result;
    try {
      result = await poll(subId);
    } catch (e) {
      console.error(`\n  Poll error: ${e.message}`);
      results.push({ title: problem.title, verdict: 'POLL_ERROR', submissionId: subId });
      await sleep(3000);
      continue;
    }

    const verdict = result.status ?? result.verdict ?? result.result ?? 'UNKNOWN';
    const time = result.executionTimeMs ?? result.timeMs ?? result.executionTime ?? '?';
    console.log(`\n  Verdict: ${verdict}  Time: ${time}ms`);

    results.push({ title: problem.title, verdict, time, submissionId: subId });
  }

  console.log('\n\n=== SUMMARY ===');
  console.log('Title | Verdict | Time(ms)');
  console.log('------|---------|--------');
  for (const r of results) {
    console.log(`${r.title} | ${r.verdict} | ${r.time ?? '-'}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
