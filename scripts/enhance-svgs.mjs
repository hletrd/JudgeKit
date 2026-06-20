#!/usr/bin/env node
// ESM script to enhance problem descriptions with SVGs

const API_BASE = (process.env.JUDGE_BASE_URL || 'https://algo.xylolabs.com').replace(/\/$/, '');
const API_KEY = process.env.JUDGE_API_KEY;

if (!API_KEY) {
  console.error('Need JUDGE_API_KEY');
  process.exit(1);
}

async function fetchAllProblems() {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${API_BASE}/api/v1/problems?page=${page}&limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = await res.json();
    all.push(...data.data);
    if (all.length >= data.total) break;
    page++;
  }
  return all;
}

async function patchProblem(id, description) {
  const res = await fetch(`${API_BASE}/api/v1/problems/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PATCH ${id} failed ${res.status}: ${txt}`);
  }
  return res.json();
}

// ─── SVG enhancements keyed by sequenceNumber ───────────────────────────────

const SVG_BLOCK = {

  // 355 히스토그램에서 가장 큰 직사각형
  355: `
<div align="center">
<svg width="300" height="160" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:11px">
  <!-- bars: heights 2,1,5,6,2,3 (×20px) -->
  <rect x="20"  y="120" width="28" height="40"  fill="#795548"/>
  <rect x="53"  y="140" width="28" height="20"  fill="#795548"/>
  <rect x="86"  y="60"  width="28" height="100" fill="#795548"/>
  <rect x="119" y="40"  width="28" height="120" fill="#795548"/>
  <rect x="152" y="120" width="28" height="40"  fill="#795548"/>
  <rect x="185" y="100" width="28" height="60"  fill="#795548"/>
  <!-- largest rectangle (bars 3-4, height 5) -->
  <rect x="86" y="60" width="61" height="100" fill="#2196f3" opacity="0.35"/>
  <!-- label -->
  <text x="100" y="52" fill="#2196f3" font-weight="bold">최대 넓이</text>
  <text x="220" y="155" fill="#555">h: 2,1,5,6,2,3</text>
</svg>
</div>
`,

  // 361 슬라이딩 윈도우 최댓값
  361: `
<div align="center">
<svg width="300" height="130" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- array cells -->
  <rect x="10"  y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="50"  y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="90"  y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="130" y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="170" y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="210" y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="250" y="30" width="36" height="36" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <!-- values -->
  <text x="28"  y="54" text-anchor="middle" fill="#333">1</text>
  <text x="68"  y="54" text-anchor="middle" fill="#333">3</text>
  <text x="108" y="54" text-anchor="middle" fill="#333">-1</text>
  <text x="148" y="54" text-anchor="middle" fill="#333">-3</text>
  <text x="188" y="54" text-anchor="middle" fill="#333">5</text>
  <text x="228" y="54" text-anchor="middle" fill="#333">3</text>
  <text x="268" y="54" text-anchor="middle" fill="#333">6</text>
  <!-- window k=3 highlight (indices 0-2) -->
  <rect x="10" y="30" width="116" height="36" fill="none" stroke="#2196f3" stroke-width="2.5" rx="3"/>
  <text x="68" y="24" text-anchor="middle" fill="#2196f3" font-size="10">window (k=3)</text>
  <!-- max arrow -->
  <text x="68" y="90" text-anchor="middle" fill="#f44336" font-weight="bold">max = 3</text>
  <text x="10" y="115" fill="#555" font-size="10">덱(deque)으로 O(N) 처리</text>
</svg>
</div>
`,

  // 362 후위 표기식 변환
  362: `
<div align="center">
<svg width="300" height="130" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;font-size:13px">
  <!-- infix -->
  <text x="10" y="30" fill="#555" font-size="11">중위식 (infix)</text>
  <rect x="10" y="38" width="260" height="30" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="4"/>
  <text x="140" y="59" text-anchor="middle" fill="#333">( A + B ) * C - D</text>
  <!-- arrow -->
  <text x="140" y="86" text-anchor="middle" fill="#2196f3" font-size="18">↓</text>
  <!-- postfix -->
  <text x="10" y="102" fill="#555" font-size="11">후위식 (postfix)</text>
  <rect x="10" y="108" width="260" height="30" fill="#e8f5e9" stroke="#a5d6a7" stroke-width="1.5" rx="4"/>
  <text x="140" y="129" text-anchor="middle" fill="#333">A B + C * D -</text>
</svg>
</div>
`,

  // 363 최대 힙 / 364 최소 힙
  363: `
<div align="center">
<svg width="260" height="150" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:13px">
  <!-- max-heap tree -->
  <!-- level 0 -->
  <circle cx="130" cy="30"  r="20" fill="#2196f3"/>
  <text x="130" y="35" text-anchor="middle" fill="#fff" font-weight="bold">9</text>
  <!-- level 1 -->
  <line x1="115" y1="47" x2="75"  y2="73" stroke="#90caf9" stroke-width="1.5"/>
  <line x1="145" y1="47" x2="185" y2="73" stroke="#90caf9" stroke-width="1.5"/>
  <circle cx="70"  cy="90" r="20" fill="#42a5f5"/>
  <text x="70"  y="95" text-anchor="middle" fill="#fff">7</text>
  <circle cx="190" cy="90" r="20" fill="#42a5f5"/>
  <text x="190" y="95" text-anchor="middle" fill="#fff">5</text>
  <!-- level 2 -->
  <line x1="55"  y1="105" x2="35"  y2="125" stroke="#90caf9" stroke-width="1.5"/>
  <line x1="85"  y1="105" x2="105" y2="125" stroke="#90caf9" stroke-width="1.5"/>
  <circle cx="30"  cy="140" r="18" fill="#90caf9"/>
  <text x="30"  y="145" text-anchor="middle" fill="#fff">3</text>
  <circle cx="110" cy="140" r="18" fill="#90caf9"/>
  <text x="110" y="145" text-anchor="middle" fill="#fff">4</text>
  <text x="210" y="145" fill="#2196f3" font-size="11">최대 힙</text>
</svg>
</div>
`,

  // 367 중앙값 구하기
  367: `
<div align="center">
<svg width="300" height="130" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- two heaps -->
  <rect x="10"  y="10" width="120" height="100" fill="#fce4ec" stroke="#f48fb1" stroke-width="1.5" rx="6"/>
  <rect x="170" y="10" width="120" height="100" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="6"/>
  <text x="70"  y="30" text-anchor="middle" fill="#c62828" font-size="11">최대 힙 (하위)</text>
  <text x="230" y="30" text-anchor="middle" fill="#1565c0" font-size="11">최소 힙 (상위)</text>
  <!-- heap tops -->
  <text x="70"  y="70" text-anchor="middle" fill="#c62828" font-size="20" font-weight="bold">3</text>
  <text x="230" y="70" text-anchor="middle" fill="#1565c0" font-size="20" font-weight="bold">7</text>
  <!-- median arrow -->
  <line x1="130" y1="60" x2="170" y2="60" stroke="#4caf50" stroke-width="2" stroke-dasharray="4,3"/>
  <text x="150" y="52" text-anchor="middle" fill="#4caf50" font-size="10">중앙값</text>
  <text x="150" y="75" text-anchor="middle" fill="#4caf50" font-size="16" font-weight="bold">3</text>
  <text x="10" y="125" fill="#555" font-size="10">두 힙으로 중앙값 O(log N) 갱신</text>
</svg>
</div>
`,

  // 371 집합의 표현 / Union-Find
  371: `
<div align="center">
<svg width="300" height="150" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- before union -->
  <text x="10" y="20" fill="#555" font-size="11">합치기 전</text>
  <circle cx="40"  cy="60" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="40"  y="65" text-anchor="middle" fill="#333">1</text>
  <circle cx="90"  cy="60" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="90"  y="65" text-anchor="middle" fill="#333">2</text>
  <circle cx="140" cy="60" r="18" fill="#fce4ec" stroke="#f44336" stroke-width="2"/>
  <text x="140" y="65" text-anchor="middle" fill="#333">3</text>
  <circle cx="190" cy="60" r="18" fill="#fce4ec" stroke="#f44336" stroke-width="2"/>
  <text x="190" y="65" text-anchor="middle" fill="#333">4</text>
  <!-- union arrow -->
  <text x="150" y="100" text-anchor="middle" fill="#2196f3" font-size="18">↓</text>
  <text x="150" y="92" text-anchor="middle" fill="#555" font-size="10">union(2, 3)</text>
  <!-- after union -->
  <circle cx="40"  cy="135" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="40"  y="140" text-anchor="middle" fill="#333">1</text>
  <circle cx="90"  cy="135" r="18" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="90"  y="140" text-anchor="middle" fill="#333">2</text>
  <circle cx="140" cy="135" r="18" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="140" y="140" text-anchor="middle" fill="#333">3</text>
  <circle cx="190" cy="135" r="18" fill="#fce4ec" stroke="#f44336" stroke-width="2"/>
  <text x="190" y="140" text-anchor="middle" fill="#333">4</text>
  <line x1="90" y1="135" x2="140" y2="135" stroke="#4caf50" stroke-width="2"/>
</svg>
</div>
`,

  // 376 최소 스패닝 트리 (크루스칼)
  376: `
<div align="center">
<svg width="280" height="180" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- edges (non-MST) -->
  <line x1="60"  y1="50"  x2="200" y2="50"  stroke="#ddd" stroke-width="2"/>
  <line x1="60"  y1="50"  x2="130" y2="150" stroke="#ddd" stroke-width="2"/>
  <line x1="200" y1="50"  x2="130" y2="150" stroke="#ddd" stroke-width="2"/>
  <line x1="60"  y1="50"  x2="20"  y2="150" stroke="#ddd" stroke-width="2"/>
  <!-- MST edges -->
  <line x1="60"  y1="50"  x2="130" y2="50"  stroke="#2196f3" stroke-width="2.5"/>
  <line x1="20"  y1="150" x2="60"  y2="50"  stroke="#2196f3" stroke-width="2.5"/>
  <line x1="130" y1="50"  x2="200" y2="50"  stroke="#2196f3" stroke-width="2.5"/>
  <line x1="130" y1="50"  x2="130" y2="150" stroke="#2196f3" stroke-width="2.5"/>
  <!-- edge weights -->
  <text x="92"  y="43"  text-anchor="middle" fill="#2196f3">1</text>
  <text x="165" y="43"  text-anchor="middle" fill="#2196f3">2</text>
  <text x="35"  y="100" fill="#2196f3">3</text>
  <text x="133" y="105" fill="#2196f3">4</text>
  <!-- nodes -->
  <circle cx="20"  cy="150" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="60"  cy="50"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="130" cy="50"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="200" cy="50"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="130" cy="150" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="20"  y="155" text-anchor="middle" fill="#333">A</text>
  <text x="60"  y="55"  text-anchor="middle" fill="#333">B</text>
  <text x="130" y="55"  text-anchor="middle" fill="#333">C</text>
  <text x="200" y="55"  text-anchor="middle" fill="#333">D</text>
  <text x="130" y="155" text-anchor="middle" fill="#333">E</text>
  <text x="10" y="175" fill="#555" font-size="10">파란 선: MST (크루스칼)</text>
</svg>
</div>
`,

  // 378 구간 합 구하기 (세그먼트 트리)
  378: `
<div align="center">
<svg width="300" height="170" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:11px">
  <!-- leaf nodes (array) -->
  <rect x="10"  y="130" width="34" height="28" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="55"  y="130" width="34" height="28" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="100" y="130" width="34" height="28" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="145" y="130" width="34" height="28" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="190" y="130" width="34" height="28" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="235" y="130" width="34" height="28" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <text x="27"  y="149" text-anchor="middle" fill="#333">1</text>
  <text x="72"  y="149" text-anchor="middle" fill="#333">3</text>
  <text x="117" y="149" text-anchor="middle" fill="#333">5</text>
  <text x="162" y="149" text-anchor="middle" fill="#333">2</text>
  <text x="207" y="149" text-anchor="middle" fill="#333">7</text>
  <text x="252" y="149" text-anchor="middle" fill="#333">4</text>
  <!-- level 1 nodes -->
  <rect x="32"  y="85"  width="34" height="28" fill="#bbdefb" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <rect x="122" y="85"  width="34" height="28" fill="#bbdefb" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <rect x="212" y="85"  width="34" height="28" fill="#bbdefb" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <text x="49"  y="104" text-anchor="middle" fill="#1565c0">4</text>
  <text x="139" y="104" text-anchor="middle" fill="#1565c0">7</text>
  <text x="229" y="104" text-anchor="middle" fill="#1565c0">11</text>
  <!-- root -->
  <rect x="122" y="35"  width="46" height="30" fill="#2196f3" stroke="#1565c0" stroke-width="1.5" rx="3"/>
  <text x="145" y="55"  text-anchor="middle" fill="#fff" font-weight="bold">22</text>
  <!-- edges root->l1 -->
  <line x1="135" y1="65"  x2="66"  y2="85"  stroke="#90caf9" stroke-width="1.2"/>
  <line x1="145" y1="65"  x2="139" y2="85"  stroke="#90caf9" stroke-width="1.2"/>
  <line x1="155" y1="65"  x2="229" y2="85"  stroke="#90caf9" stroke-width="1.2"/>
  <!-- edges l1->leaves -->
  <line x1="42"  y1="113" x2="27"  y2="130" stroke="#90caf9" stroke-width="1.2"/>
  <line x1="56"  y1="113" x2="72"  y2="130" stroke="#90caf9" stroke-width="1.2"/>
  <line x1="132" y1="113" x2="117" y2="130" stroke="#90caf9" stroke-width="1.2"/>
  <line x1="146" y1="113" x2="162" y2="130" stroke="#90caf9" stroke-width="1.2"/>
  <line x1="222" y1="113" x2="207" y2="130" stroke="#90caf9" stroke-width="1.2"/>
  <line x1="236" y1="113" x2="252" y2="130" stroke="#90caf9" stroke-width="1.2"/>
  <text x="10" y="168" fill="#555" font-size="10">루트=전체 합, 내부 노드=구간 합</text>
</svg>
</div>
`,

  // 381 펜윅 트리 (구간 합)
  381: `
<div align="center">
<svg width="300" height="140" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:11px">
  <!-- BIT array indices 1-8 -->
  <!-- index labels -->
  <text x="20"  y="20" text-anchor="middle" fill="#555">1</text>
  <text x="56"  y="20" text-anchor="middle" fill="#555">2</text>
  <text x="92"  y="20" text-anchor="middle" fill="#555">3</text>
  <text x="128" y="20" text-anchor="middle" fill="#555">4</text>
  <text x="164" y="20" text-anchor="middle" fill="#555">5</text>
  <text x="200" y="20" text-anchor="middle" fill="#555">6</text>
  <text x="236" y="20" text-anchor="middle" fill="#555">7</text>
  <text x="272" y="20" text-anchor="middle" fill="#555">8</text>
  <!-- BIT cells -->
  <rect x="2"   y="25" width="36" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="2"/>
  <rect x="38"  y="25" width="36" height="26" fill="#bbdefb" stroke="#2196f3" stroke-width="1.5" rx="2"/>
  <rect x="74"  y="25" width="36" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="2"/>
  <rect x="110" y="25" width="36" height="26" fill="#1e88e5" stroke="#1565c0" stroke-width="1.5" rx="2"/>
  <rect x="146" y="25" width="36" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="2"/>
  <rect x="182" y="25" width="36" height="26" fill="#bbdefb" stroke="#2196f3" stroke-width="1.5" rx="2"/>
  <rect x="218" y="25" width="36" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="2"/>
  <rect x="254" y="25" width="36" height="26" fill="#0d47a1" stroke="#0d47a1" stroke-width="1.5" rx="2"/>
  <!-- values: each tree[i] covers lowbit(i) elements -->
  <text x="20"  y="43" text-anchor="middle" fill="#333">A[1]</text>
  <text x="56"  y="43" text-anchor="middle" fill="#1565c0">∑1-2</text>
  <text x="92"  y="43" text-anchor="middle" fill="#333">A[3]</text>
  <text x="128" y="43" text-anchor="middle" fill="#fff">∑1-4</text>
  <text x="164" y="43" text-anchor="middle" fill="#333">A[5]</text>
  <text x="200" y="43" text-anchor="middle" fill="#1565c0">∑5-6</text>
  <text x="236" y="43" text-anchor="middle" fill="#333">A[7]</text>
  <text x="272" y="43" text-anchor="middle" fill="#fff">∑1-8</text>
  <!-- responsibility bars -->
  <line x1="2"   y1="62" x2="38"  y2="62" stroke="#90caf9" stroke-width="1"/>
  <line x1="38"  y1="68" x2="74"  y2="68" stroke="#2196f3" stroke-width="2"/>
  <line x1="110" y1="78" x2="146" y2="78" stroke="#1565c0" stroke-width="3"/>
  <line x1="254" y1="88" x2="290" y2="88" stroke="#0d47a1" stroke-width="4"/>
  <text x="10" y="115" fill="#555" font-size="10">각 칸은 lowbit(i) 개 원소의 구간 합을 저장</text>
  <text x="10" y="130" fill="#555" font-size="10">갱신·쿼리 모두 O(log N)</text>
</svg>
</div>
`,

  // 307 토마토 (2D) - BFS multi-source
  307: `
<div align="center">
<svg width="270" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- 5x4 grid -->
  <!-- row 0 -->
  <rect x="10"  y="10" width="44" height="44" fill="#ffcdd2" stroke="#ef9a9a" stroke-width="1.5" rx="3"/>
  <rect x="60"  y="10" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="110" y="10" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="160" y="10" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="210" y="10" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <!-- row 1 -->
  <rect x="10"  y="60" width="44" height="44" fill="#ffcdd2" stroke="#ef9a9a" stroke-width="1.5" rx="3"/>
  <rect x="60"  y="60" width="44" height="44" fill="#ffcdd2" stroke="#ef9a9a" stroke-width="1.5" rx="3"/>
  <rect x="110" y="60" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="160" y="60" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="210" y="60" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <!-- row 2 -->
  <rect x="10"  y="110" width="44" height="44" fill="#c8e6c9" stroke="#a5d6a7" stroke-width="1.5" rx="3"/>
  <rect x="60"  y="110" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="110" y="110" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="160" y="110" width="44" height="44" fill="#fff9c4" stroke="#fff176" stroke-width="1.5" rx="3"/>
  <rect x="210" y="110" width="44" height="44" fill="#c8e6c9" stroke="#a5d6a7" stroke-width="1.5" rx="3"/>
  <!-- labels -->
  <text x="32"  y="38" text-anchor="middle" fill="#c62828">1</text>
  <text x="82"  y="38" text-anchor="middle" fill="#f57f17">0</text>
  <text x="132" y="38" text-anchor="middle" fill="#f57f17">0</text>
  <text x="182" y="38" text-anchor="middle" fill="#f57f17">0</text>
  <text x="232" y="38" text-anchor="middle" fill="#f57f17">0</text>
  <text x="32"  y="88" text-anchor="middle" fill="#c62828">1</text>
  <text x="82"  y="88" text-anchor="middle" fill="#c62828">1</text>
  <text x="132" y="88" text-anchor="middle" fill="#f57f17">0</text>
  <text x="182" y="88" text-anchor="middle" fill="#f57f17">0</text>
  <text x="232" y="88" text-anchor="middle" fill="#f57f17">0</text>
  <text x="32"  y="138" text-anchor="middle" fill="#2e7d32">1</text>
  <text x="82"  y="138" text-anchor="middle" fill="#f57f17">0</text>
  <text x="132" y="138" text-anchor="middle" fill="#f57f17">0</text>
  <text x="182" y="138" text-anchor="middle" fill="#f57f17">0</text>
  <text x="232" y="138" text-anchor="middle" fill="#2e7d32">1</text>
  <!-- legend -->
  <rect x="10"  y="165" width="14" height="14" fill="#c8e6c9" stroke="#4caf50" stroke-width="1"/>
  <text x="28"  y="177" fill="#333">익은 토마토</text>
  <rect x="100" y="165" width="14" height="14" fill="#ffcdd2" stroke="#ef9a9a" stroke-width="1"/>
  <text x="118" y="177" fill="#333">BFS 전파 중</text>
  <rect x="190" y="165" width="14" height="14" fill="#fff9c4" stroke="#fff176" stroke-width="1"/>
  <text x="208" y="177" fill="#333">안 익음</text>
  <text x="10"  y="196" fill="#555" font-size="10">다중 출발점 BFS — 동시 전파</text>
</svg>
</div>
`,

  // 316 다익스트라 (기본)
  316: `
<div align="center">
<svg width="280" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- edges -->
  <line x1="50"  y1="100" x2="140" y2="40"  stroke="#ccc" stroke-width="2"/>
  <line x1="50"  y1="100" x2="140" y2="160" stroke="#ccc" stroke-width="2"/>
  <line x1="140" y1="40"  x2="230" y2="100" stroke="#ccc" stroke-width="2"/>
  <line x1="140" y1="160" x2="230" y2="100" stroke="#ccc" stroke-width="2"/>
  <line x1="140" y1="40"  x2="140" y2="160" stroke="#ccc" stroke-width="2"/>
  <!-- shortest path edges -->
  <line x1="50"  y1="100" x2="140" y2="40"  stroke="#2196f3" stroke-width="2.5"/>
  <line x1="140" y1="40"  x2="230" y2="100" stroke="#2196f3" stroke-width="2.5"/>
  <!-- edge weights -->
  <text x="85"  y="62"  fill="#555">2</text>
  <text x="195" y="62"  fill="#555">3</text>
  <text x="85"  y="140" fill="#555">5</text>
  <text x="195" y="140" fill="#555">1</text>
  <text x="148" y="105" fill="#555">4</text>
  <!-- nodes -->
  <circle cx="50"  cy="100" r="20" fill="#4caf50" stroke="#2e7d32" stroke-width="2"/>
  <circle cx="140" cy="40"  r="20" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="140" cy="160" r="20" fill="#e3f2fd" stroke="#90caf9" stroke-width="2"/>
  <circle cx="230" cy="100" r="20" fill="#fff9c4" stroke="#f9a825" stroke-width="2"/>
  <text x="50"  y="105" text-anchor="middle" fill="#fff"  font-weight="bold">S</text>
  <text x="140" y="45"  text-anchor="middle" fill="#333">B</text>
  <text x="140" y="165" text-anchor="middle" fill="#333">C</text>
  <text x="230" y="105" text-anchor="middle" fill="#333">T</text>
  <!-- dist labels -->
  <text x="50"  y="128" text-anchor="middle" fill="#2e7d32" font-size="10">d=0</text>
  <text x="140" y="18"  text-anchor="middle" fill="#1565c0" font-size="10">d=2</text>
  <text x="140" y="185" text-anchor="middle" fill="#90a4ae" font-size="10">d=5</text>
  <text x="230" y="128" text-anchor="middle" fill="#f57f17" font-size="10">d=5</text>
  <text x="10" y="196" fill="#555" font-size="10">파란 선: 최단 경로 (우선순위 큐)</text>
</svg>
</div>
`,

  // 340 트리의 지름
  340: `
<div align="center">
<svg width="280" height="190" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- edges -->
  <line x1="140" y1="30"  x2="70"  y2="90"  stroke="#ccc" stroke-width="2"/>
  <line x1="140" y1="30"  x2="210" y2="90"  stroke="#ccc" stroke-width="2"/>
  <line x1="70"  y1="90"  x2="30"  y2="160" stroke="#f44336" stroke-width="3"/>
  <line x1="70"  y1="90"  x2="110" y2="160" stroke="#ccc" stroke-width="2"/>
  <line x1="210" y1="90"  x2="180" y2="160" stroke="#ccc" stroke-width="2"/>
  <line x1="210" y1="90"  x2="250" y2="160" stroke="#f44336" stroke-width="3"/>
  <line x1="140" y1="30"  x2="140" y2="90"  stroke="#f44336" stroke-width="3"/>
  <!-- diameter label -->
  <text x="10"  y="175" fill="#f44336" font-weight="bold" font-size="11">지름 경로 (빨간 선)</text>
  <!-- nodes -->
  <circle cx="140" cy="30"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="70"  cy="90"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="210" cy="90"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="30"  cy="160" r="16" fill="#ffcdd2" stroke="#f44336" stroke-width="2.5"/>
  <circle cx="110" cy="160" r="16" fill="#e3f2fd" stroke="#90caf9" stroke-width="2"/>
  <circle cx="140" cy="90"  r="16" fill="#ffcdd2" stroke="#f44336" stroke-width="2.5"/>
  <circle cx="180" cy="160" r="16" fill="#e3f2fd" stroke="#90caf9" stroke-width="2"/>
  <circle cx="250" cy="160" r="16" fill="#ffcdd2" stroke="#f44336" stroke-width="2.5"/>
  <text x="140" y="35"  text-anchor="middle" fill="#333">1</text>
  <text x="70"  y="95"  text-anchor="middle" fill="#333">2</text>
  <text x="210" y="95"  text-anchor="middle" fill="#333">3</text>
  <text x="30"  y="165" text-anchor="middle" fill="#c62828">4</text>
  <text x="110" y="165" text-anchor="middle" fill="#333">5</text>
  <text x="140" y="95"  text-anchor="middle" fill="#c62828">6</text>
  <text x="180" y="165" text-anchor="middle" fill="#333">7</text>
  <text x="250" y="165" text-anchor="middle" fill="#c62828">8</text>
  <text x="10"  y="190" fill="#555" font-size="10">두 번의 BFS/DFS로 지름 탐색</text>
</svg>
</div>
`,

  // 347 LCA (최소 공통 조상)
  347: `
<div align="center">
<svg width="280" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- tree edges -->
  <line x1="140" y1="30"  x2="75"  y2="90"  stroke="#ccc" stroke-width="2"/>
  <line x1="140" y1="30"  x2="205" y2="90"  stroke="#ccc" stroke-width="2"/>
  <line x1="75"  y1="90"  x2="40"  y2="155" stroke="#ccc" stroke-width="2"/>
  <line x1="75"  y1="90"  x2="110" y2="155" stroke="#ccc" stroke-width="2"/>
  <line x1="205" y1="90"  x2="170" y2="155" stroke="#ccc" stroke-width="2"/>
  <line x1="205" y1="90"  x2="240" y2="155" stroke="#ccc" stroke-width="2"/>
  <!-- LCA path -->
  <line x1="40"  y1="155" x2="75"  y2="90"  stroke="#f44336" stroke-width="2.5" stroke-dasharray="5,3"/>
  <line x1="75"  y1="90"  x2="140" y2="30"  stroke="#f44336" stroke-width="2.5" stroke-dasharray="5,3"/>
  <line x1="240" y1="155" x2="205" y2="90"  stroke="#2196f3" stroke-width="2.5" stroke-dasharray="5,3"/>
  <line x1="205" y1="90"  x2="140" y2="30"  stroke="#2196f3" stroke-width="2.5" stroke-dasharray="5,3"/>
  <!-- nodes -->
  <circle cx="140" cy="30"  r="18" fill="#fff9c4" stroke="#f9a825" stroke-width="2.5"/>
  <circle cx="75"  cy="90"  r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="205" cy="90"  r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="40"  cy="155" r="18" fill="#ffcdd2" stroke="#f44336" stroke-width="2.5"/>
  <circle cx="110" cy="155" r="18" fill="#e3f2fd" stroke="#90caf9" stroke-width="2"/>
  <circle cx="170" cy="155" r="18" fill="#e3f2fd" stroke="#90caf9" stroke-width="2"/>
  <circle cx="240" cy="155" r="18" fill="#e8f5e9" stroke="#4caf50" stroke-width="2.5"/>
  <text x="140" y="35"  text-anchor="middle" fill="#7b6000" font-weight="bold">1</text>
  <text x="75"  y="95"  text-anchor="middle" fill="#333">2</text>
  <text x="205" y="95"  text-anchor="middle" fill="#333">3</text>
  <text x="40"  y="160" text-anchor="middle" fill="#c62828">4</text>
  <text x="110" y="160" text-anchor="middle" fill="#333">5</text>
  <text x="170" y="160" text-anchor="middle" fill="#333">6</text>
  <text x="240" y="160" text-anchor="middle" fill="#1b5e20">7</text>
  <text x="105" y="20"  fill="#7b6000" font-size="10">LCA(4,7) = 1</text>
  <text x="10"  y="192" fill="#555" font-size="10">빨간/파란 경로가 만나는 조상</text>
</svg>
</div>
`,

  // 355 already done above; 357 요세푸스 문제
  357: `
<div align="center">
<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:13px">
  <!-- circle of 7 people, k=3 -->
  <circle cx="120" cy="120" r="80" fill="none" stroke="#e0e0e0" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- people at positions on circle -->
  <circle cx="120" cy="42"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="185" cy="68"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="200" cy="140" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="162" cy="198" r="16" fill="#ffcdd2" stroke="#f44336" stroke-width="2.5"/>
  <circle cx="78"  cy="198" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="40"  cy="140" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="55"  cy="68"  r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <!-- labels -->
  <text x="120" y="47"  text-anchor="middle" fill="#333">1</text>
  <text x="185" y="73"  text-anchor="middle" fill="#333">2</text>
  <text x="200" y="145" text-anchor="middle" fill="#333">3</text>
  <text x="162" y="203" text-anchor="middle" fill="#c62828" font-weight="bold">4</text>
  <text x="78"  y="203" text-anchor="middle" fill="#333">5</text>
  <text x="40"  y="145" text-anchor="middle" fill="#333">6</text>
  <text x="55"  y="73"  text-anchor="middle" fill="#333">7</text>
  <!-- arrow pointing to eliminated -->
  <path d="M120,120 L150,190" stroke="#f44336" stroke-width="2" fill="none" marker-end="url(#arr)"/>
  <defs>
    <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#f44336"/>
    </marker>
  </defs>
  <text x="120" y="118" text-anchor="middle" fill="#2196f3" font-size="10">k=3번째</text>
  <text x="120" y="132" text-anchor="middle" fill="#2196f3" font-size="10">제거: 4</text>
</svg>
</div>
`,

  // 384 K번째 수 (세그먼트 트리) — order-statistic tree
  384: `
<div align="center">
<svg width="300" height="160" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:11px">
  <!-- segment tree counting how many values fall in each range -->
  <!-- root -->
  <rect x="112" y="10" width="76" height="28" fill="#2196f3" stroke="#1565c0" rx="4"/>
  <text x="150" y="29" text-anchor="middle" fill="#fff" font-weight="bold">count=6</text>
  <text x="150" y="8"  text-anchor="middle" fill="#555" font-size="10">[1..8]</text>
  <!-- left child -->
  <rect x="50"  y="60" width="76" height="28" fill="#42a5f5" stroke="#1565c0" rx="4"/>
  <text x="88"  y="79" text-anchor="middle" fill="#fff">count=3</text>
  <text x="88"  y="58" text-anchor="middle" fill="#555" font-size="10">[1..4]</text>
  <!-- right child -->
  <rect x="174" y="60" width="76" height="28" fill="#42a5f5" stroke="#1565c0" rx="4"/>
  <text x="212" y="79" text-anchor="middle" fill="#fff">count=3</text>
  <text x="212" y="58" text-anchor="middle" fill="#555" font-size="10">[5..8]</text>
  <!-- edges -->
  <line x1="130" y1="38" x2="100" y2="60" stroke="#90caf9" stroke-width="1.5"/>
  <line x1="170" y1="38" x2="200" y2="60" stroke="#90caf9" stroke-width="1.5"/>
  <!-- path highlight for k=4 -->
  <rect x="174" y="60" width="76" height="28" fill="none" stroke="#f44336" stroke-width="2.5" rx="4"/>
  <text x="212" y="105" text-anchor="middle" fill="#f44336" font-size="10">k=4 → 오른쪽</text>
  <!-- leaf level -->
  <rect x="15"  y="118" width="36" height="24" fill="#e3f2fd" stroke="#90caf9" rx="3"/>
  <rect x="55"  y="118" width="36" height="24" fill="#e3f2fd" stroke="#90caf9" rx="3"/>
  <rect x="139" y="118" width="36" height="24" fill="#e3f2fd" stroke="#90caf9" rx="3"/>
  <rect x="179" y="118" width="36" height="24" fill="#fff9c4" stroke="#f9a825" rx="3" stroke-width="2"/>
  <text x="33"  y="134" text-anchor="middle" fill="#333">[1,2]</text>
  <text x="73"  y="134" text-anchor="middle" fill="#333">[3,4]</text>
  <text x="157" y="134" text-anchor="middle" fill="#333">[5,6]</text>
  <text x="197" y="134" text-anchor="middle" fill="#f57f17" font-weight="bold">[7,8]</text>
  <text x="10"  y="156" fill="#555" font-size="10">K번째 원소를 O(log N)에 탐색</text>
</svg>
</div>
`,

  // 387 KMP 문자열 검색
  387: `
<div align="center">
<svg width="300" height="140" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;font-size:13px">
  <!-- text string -->
  <text x="10" y="22" fill="#555" font-size="10">텍스트 T</text>
  <rect x="10"  y="28" width="24" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="34"  y="28" width="24" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="58"  y="28" width="24" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="82"  y="28" width="24" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="106" y="28" width="24" height="26" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <rect x="130" y="28" width="24" height="26" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <rect x="154" y="28" width="24" height="26" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <rect x="178" y="28" width="24" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <rect x="202" y="28" width="24" height="26" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5"/>
  <text x="22"  y="46" text-anchor="middle" fill="#333">A</text>
  <text x="46"  y="46" text-anchor="middle" fill="#333">B</text>
  <text x="70"  y="46" text-anchor="middle" fill="#333">A</text>
  <text x="94"  y="46" text-anchor="middle" fill="#333">B</text>
  <text x="118" y="46" text-anchor="middle" fill="#2e7d32">A</text>
  <text x="142" y="46" text-anchor="middle" fill="#2e7d32">B</text>
  <text x="166" y="46" text-anchor="middle" fill="#2e7d32">C</text>
  <text x="190" y="46" text-anchor="middle" fill="#333">A</text>
  <text x="214" y="46" text-anchor="middle" fill="#333">B</text>
  <!-- pattern -->
  <text x="10" y="80" fill="#555" font-size="10">패턴 P</text>
  <rect x="106" y="86" width="24" height="26" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <rect x="130" y="86" width="24" height="26" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <rect x="154" y="86" width="24" height="26" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="118" y="104" text-anchor="middle" fill="#2e7d32">A</text>
  <text x="142" y="104" text-anchor="middle" fill="#2e7d32">B</text>
  <text x="166" y="104" text-anchor="middle" fill="#2e7d32">C</text>
  <!-- failure function -->
  <text x="10" y="130" fill="#555" font-size="10">실패 함수(π)로 불필요한 비교 건너뜀</text>
</svg>
</div>
`,

  // 390 트라이 (기본)
  390: `
<div align="center">
<svg width="290" height="190" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Trie for: cat, car, do, dot -->
  <!-- root -->
  <circle cx="145" cy="25" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="145" y="30" text-anchor="middle" fill="#333">ε</text>
  <!-- c, d branches -->
  <line x1="138" y1="40" x2="80"  y2="75" stroke="#90caf9" stroke-width="1.5"/>
  <line x1="152" y1="40" x2="210" y2="75" stroke="#90caf9" stroke-width="1.5"/>
  <circle cx="75"  cy="90" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="215" cy="90" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="75"  y="95" text-anchor="middle" fill="#333">c</text>
  <text x="215" y="95" text-anchor="middle" fill="#333">d</text>
  <!-- ca, do -->
  <line x1="70"  y1="104" x2="55"  y2="135" stroke="#90caf9" stroke-width="1.5"/>
  <line x1="215" y1="104" x2="215" y2="135" stroke="#90caf9" stroke-width="1.5"/>
  <circle cx="50"  cy="150" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <circle cx="215" cy="150" r="16" fill="#4caf50" stroke="#2e7d32" stroke-width="2"/>
  <text x="50"  y="155" text-anchor="middle" fill="#333">a</text>
  <text x="215" y="155" text-anchor="middle" fill="#fff">o*</text>
  <!-- cat, car -->
  <line x1="45"  y1="164" x2="20"  y2="188" stroke="#90caf9" stroke-width="1.5"/>
  <line x1="58"  y1="164" x2="85"  y2="188" stroke="#90caf9" stroke-width="1.5"/>
  <!-- dot -->
  <line x1="215" y1="164" x2="215" y2="188" stroke="#90caf9" stroke-width="1.5"/>
  <circle cx="18"  cy="190" r="14" fill="#4caf50" stroke="#2e7d32" stroke-width="2"/>
  <circle cx="88"  cy="190" r="14" fill="#4caf50" stroke="#2e7d32" stroke-width="2"/>
  <circle cx="215" cy="190" r="14" fill="#4caf50" stroke="#2e7d32" stroke-width="2"/>
  <text x="18"  y="195" text-anchor="middle" fill="#fff" font-size="11">t*</text>
  <text x="88"  y="195" text-anchor="middle" fill="#fff" font-size="11">r*</text>
  <text x="215" y="195" text-anchor="middle" fill="#fff" font-size="11">t*</text>
  <text x="155" y="186" fill="#555" font-size="10">* = 단어 끝</text>
</svg>
</div>
`,

  // 395 Z 알고리즘
  395: `
<div align="center">
<svg width="300" height="130" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;font-size:12px">
  <!-- string S = aabxaa -->
  <text x="10" y="18" fill="#555" font-size="10">문자열 S</text>
  <!-- cells -->
  <rect x="10"  y="22" width="34" height="32" fill="#fff9c4" stroke="#f9a825" stroke-width="2" rx="3"/>
  <rect x="48"  y="22" width="34" height="32" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="86"  y="22" width="34" height="32" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="124" y="22" width="34" height="32" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <rect x="162" y="22" width="34" height="32" fill="#c8e6c9" stroke="#4caf50" stroke-width="2" rx="3"/>
  <rect x="200" y="22" width="34" height="32" fill="#c8e6c9" stroke="#4caf50" stroke-width="2" rx="3"/>
  <rect x="238" y="22" width="34" height="32" fill="#e3f2fd" stroke="#90caf9" stroke-width="1.5" rx="3"/>
  <text x="27"  y="43" text-anchor="middle" fill="#7b6000">a</text>
  <text x="65"  y="43" text-anchor="middle" fill="#333">a</text>
  <text x="103" y="43" text-anchor="middle" fill="#333">b</text>
  <text x="141" y="43" text-anchor="middle" fill="#333">x</text>
  <text x="179" y="43" text-anchor="middle" fill="#2e7d32">a</text>
  <text x="217" y="43" text-anchor="middle" fill="#2e7d32">a</text>
  <text x="255" y="43" text-anchor="middle" fill="#333">b</text>
  <!-- Z-array -->
  <text x="10" y="75" fill="#555" font-size="10">Z 배열</text>
  <text x="27"  y="90" text-anchor="middle" fill="#999">—</text>
  <text x="65"  y="90" text-anchor="middle" fill="#555">1</text>
  <text x="103" y="90" text-anchor="middle" fill="#555">0</text>
  <text x="141" y="90" text-anchor="middle" fill="#555">0</text>
  <text x="179" y="90" text-anchor="middle" fill="#2e7d32" font-weight="bold">2</text>
  <text x="217" y="90" text-anchor="middle" fill="#555">1</text>
  <text x="255" y="90" text-anchor="middle" fill="#555">0</text>
  <text x="10" y="115" fill="#555" font-size="10">Z[i]=S[i..]와 S[0..]의 최장 공통 접두사 길이</text>
</svg>
</div>
`,

  // 400 평면 스위핑 — 선분 교차
  400: `
<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- sweep line -->
  <line x1="160" y1="10" x2="160" y2="185" stroke="#2196f3" stroke-width="1.5" stroke-dasharray="6,4"/>
  <text x="162" y="20" fill="#2196f3" font-size="10">스위프 선</text>
  <!-- horizontal segment 1 -->
  <line x1="30"  y1="60"  x2="200" y2="60"  stroke="#795548" stroke-width="2.5"/>
  <circle cx="30"  cy="60"  r="4" fill="#4caf50"/>
  <circle cx="200" cy="60"  r="4" fill="#f44336"/>
  <!-- vertical segment -->
  <line x1="130" y1="40"  x2="130" y2="120" stroke="#9c27b0" stroke-width="2.5"/>
  <circle cx="130" cy="40"  r="4" fill="#4caf50"/>
  <circle cx="130" cy="120" r="4" fill="#f44336"/>
  <!-- horizontal segment 2 -->
  <line x1="80"  y1="100" x2="250" y2="100" stroke="#ff9800" stroke-width="2.5"/>
  <circle cx="80"  cy="100" r="4" fill="#4caf50"/>
  <circle cx="250" cy="100" r="4" fill="#f44336"/>
  <!-- intersection point -->
  <circle cx="130" cy="60"  r="7" fill="#f44336" opacity="0.8"/>
  <circle cx="130" cy="100" r="7" fill="#f44336" opacity="0.8"/>
  <text x="138" y="57"  fill="#c62828" font-size="10">교점</text>
  <text x="138" y="97"  fill="#c62828" font-size="10">교점</text>
  <!-- legend -->
  <circle cx="20" cy="170" r="5" fill="#4caf50"/><text x="30" y="175" fill="#333">시작점</text>
  <circle cx="90" cy="170" r="5" fill="#f44336"/><text x="100" y="175" fill="#333">끝점</text>
  <text x="10" y="192" fill="#555" font-size="10">세그먼트 트리로 수직선 교차 O(N log N)</text>
</svg>
</div>
`,

};

// Build insertion text for each problem
function buildSVGInsertion(seq, currentDesc, svgBlock) {
  // Insert SVG right after the first paragraph (before ## 입력)
  const insertBefore = '\n\n## 입력';
  const idx = currentDesc.indexOf(insertBefore);
  if (idx === -1) {
    // fallback: append before first ##
    const idx2 = currentDesc.indexOf('\n\n##');
    if (idx2 === -1) return currentDesc + '\n' + svgBlock.trim();
    return currentDesc.slice(0, idx2) + '\n' + svgBlock.trim() + currentDesc.slice(idx2);
  }
  return currentDesc.slice(0, idx) + '\n' + svgBlock.trim() + currentDesc.slice(idx);
}

async function main() {
  console.log('Fetching all problems...');
  const all = await fetchAllProblems();
  console.log(`Total problems: ${all.length}`);

  const maxSeq = Math.max(...all.filter(p => p.sequenceNumber).map(p => p.sequenceNumber));
  console.log(`Max sequence number: ${maxSeq}`);

  if (maxSeq >= 401) {
    console.log('Expert problems (401+) exist!');
  } else {
    console.log('No expert problems yet (max is 400). Enhancing 400-set problems with SVGs.');
  }

  // Build lookup by sequenceNumber
  const bySeq = {};
  for (const p of all) {
    if (p.sequenceNumber) bySeq[p.sequenceNumber] = p;
  }

  let patched = 0;
  let skipped = 0;

  for (const [seqStr, svgBlock] of Object.entries(SVG_BLOCK)) {
    const seq = Number(seqStr);
    const problem = bySeq[seq];
    if (!problem) {
      console.log(`  [SKIP] seq ${seq}: not found`);
      skipped++;
      continue;
    }
    if (problem.description && problem.description.includes('<svg')) {
      console.log(`  [SKIP] seq ${seq} "${problem.title}": already has SVG`);
      skipped++;
      continue;
    }
    const newDesc = buildSVGInsertion(seq, problem.description || '', svgBlock);
    try {
      await patchProblem(problem.id, newDesc);
      console.log(`  [OK]   seq ${seq} "${problem.title}" patched`);
      patched++;
    } catch (e) {
      console.error(`  [ERR]  seq ${seq} "${problem.title}": ${e.message}`);
    }
    // small delay to be polite
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\nDone. Patched: ${patched}, Skipped: ${skipped}`);
}

main().catch(console.error);
