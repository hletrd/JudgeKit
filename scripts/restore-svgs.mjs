#!/usr/bin/env node
// Restore SVG diagrams to 24 problems that lost them

const BASE = (process.env.JUDGE_BASE_URL || 'https://algo.xylolabs.com').replace(/\/$/, '');
const KEY = process.env.JUDGE_API_KEY;

if (!KEY) {
  console.error('Need JUDGE_API_KEY');
  process.exit(1);
}

const TARGET_SEQS = new Set([
  340, 341, 342, 343, 347, 351, 353, 355, 357, 360, 361, 362,
  363, 367, 371, 375, 376, 378, 381, 384, 387, 390, 395, 400
]);

const headers = {
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchProblems(page) {
  const res = await fetch(`${BASE}/api/v1/problems?page=${page}&limit=50`, { headers });
  return res.json();
}

async function patchProblem(id, description) {
  const res = await fetch(`${BASE}/api/v1/problems/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH failed ${res.status}: ${text}`);
  }
  return res.json();
}

// SVG definitions keyed by sequence number
function getSvg(seq, title) {
  switch (seq) {
    case 340: // 트리의 지름
      return `<div align="center">
<svg width="320" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Tree with diameter path highlighted in red -->
  <!-- Nodes -->
  <circle cx="160" cy="30" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="160" y="35" text-anchor="middle" fill="#333">1</text>
  <circle cx="80" cy="90" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="80" y="95" text-anchor="middle" fill="#333">2</text>
  <circle cx="240" cy="90" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="240" y="95" text-anchor="middle" fill="#333">3</text>
  <circle cx="40" cy="155" r="16" fill="#ffebee" stroke="#f44336" stroke-width="2.5"/>
  <text x="40" y="160" text-anchor="middle" fill="#333">4</text>
  <circle cx="120" cy="155" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="120" y="160" text-anchor="middle" fill="#333">5</text>
  <circle cx="280" cy="155" r="16" fill="#ffebee" stroke="#f44336" stroke-width="2.5"/>
  <text x="280" y="160" text-anchor="middle" fill="#333">6</text>
  <!-- Normal edges -->
  <line x1="160" y1="46" x2="80" y2="74" stroke="#999" stroke-width="1.5"/>
  <line x1="160" y1="46" x2="240" y2="74" stroke="#999" stroke-width="1.5"/>
  <line x1="80" y1="106" x2="120" y2="139" stroke="#999" stroke-width="1.5"/>
  <!-- Diameter path edges in red -->
  <line x1="80" y1="106" x2="40" y2="139" stroke="#f44336" stroke-width="2.5"/>
  <line x1="40" y1="155" x2="80" y2="139" stroke="#f44336" stroke-width="2.5"/>
  <line x1="80" y1="74" x2="160" y2="46" stroke="#f44336" stroke-width="2.5"/>
  <line x1="160" y1="46" x2="240" y2="74" stroke="#f44336" stroke-width="2.5"/>
  <line x1="240" y1="106" x2="280" y2="139" stroke="#f44336" stroke-width="2.5"/>
  <!-- Label -->
  <text x="160" y="192" text-anchor="middle" fill="#f44336" font-size="11">지름: 노드 4 → 6 (붉은 경로)</text>
</svg>
</div>`;

    case 341: // MST (프림)
      return `<div align="center">
<svg width="320" height="210" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Graph with MST edges in blue -->
  <circle cx="160" cy="30" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="160" y="35" text-anchor="middle" fill="#333">A</text>
  <circle cx="60" cy="110" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="60" y="115" text-anchor="middle" fill="#333">B</text>
  <circle cx="260" cy="110" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="260" y="115" text-anchor="middle" fill="#333">C</text>
  <circle cx="110" cy="185" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="110" y="190" text-anchor="middle" fill="#333">D</text>
  <circle cx="210" cy="185" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="210" y="190" text-anchor="middle" fill="#333">E</text>
  <!-- Non-MST edges -->
  <line x1="160" y1="46" x2="60" y2="94" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4,3"/>
  <line x1="60" y1="110" x2="210" y2="185" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4,3"/>
  <line x1="260" y1="110" x2="110" y2="185" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- MST edges in blue -->
  <line x1="160" y1="46" x2="260" y2="94" stroke="#2196f3" stroke-width="2.5"/>
  <line x1="60" y1="94" x2="110" y2="169" stroke="#2196f3" stroke-width="2.5"/>
  <line x1="110" y1="185" x2="210" y2="185" stroke="#2196f3" stroke-width="2.5"/>
  <line x1="210" y1="169" x2="260" y2="126" stroke="#2196f3" stroke-width="2.5"/>
  <!-- Edge weights -->
  <text x="218" y="68" fill="#2196f3" font-size="11">1</text>
  <text x="72" y="138" fill="#2196f3" font-size="11">2</text>
  <text x="155" y="182" fill="#2196f3" font-size="11">3</text>
  <text x="240" y="155" fill="#2196f3" font-size="11">2</text>
  <text x="160" y="205" text-anchor="middle" fill="#333" font-size="11">파란 선: MST 간선 (프림 알고리즘)</text>
</svg>
</div>`;

    case 342: // 이중 연결 요소
      return `<div align="center">
<svg width="320" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Graph with articulation point in yellow -->
  <circle cx="80" cy="100" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="80" y="105" text-anchor="middle" fill="#333">1</text>
  <circle cx="160" cy="50" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="160" y="55" text-anchor="middle" fill="#333">2</text>
  <circle cx="160" cy="150" r="16" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="160" y="155" text-anchor="middle" fill="#333">3</text>
  <!-- Articulation point in yellow -->
  <circle cx="240" cy="100" r="16" fill="#fff9c4" stroke="#ffc107" stroke-width="2.5"/>
  <text x="240" y="105" text-anchor="middle" fill="#333">4</text>
  <circle cx="300" cy="60" r="16" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="300" y="65" text-anchor="middle" fill="#333">5</text>
  <circle cx="300" cy="140" r="16" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="300" y="145" text-anchor="middle" fill="#333">6</text>
  <!-- Edges -->
  <line x1="96" y1="90" x2="144" y2="62" stroke="#2196f3" stroke-width="1.5"/>
  <line x1="96" y1="110" x2="144" y2="138" stroke="#2196f3" stroke-width="1.5"/>
  <line x1="160" y1="66" x2="160" y2="134" stroke="#2196f3" stroke-width="1.5"/>
  <line x1="176" y1="56" x2="224" y2="90" stroke="#2196f3" stroke-width="1.5"/>
  <line x1="176" y1="144" x2="224" y2="110" stroke="#2196f3" stroke-width="1.5"/>
  <line x1="256" y1="90" x2="284" y2="72" stroke="#4caf50" stroke-width="1.5"/>
  <line x1="256" y1="110" x2="284" y2="128" stroke="#4caf50" stroke-width="1.5"/>
  <text x="160" y="192" text-anchor="middle" fill="#ffc107" font-size="11">노드 4: 단절점 (Articulation Point)</text>
</svg>
</div>`;

    case 343: // SCC
      return `<div align="center">
<svg width="320" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Directed graph with two SCC groups -->
  <!-- SCC 1 (blue) -->
  <ellipse cx="100" cy="80" rx="70" ry="45" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5" stroke-dasharray="5,3"/>
  <circle cx="60" cy="80" r="15" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="60" y="85" text-anchor="middle" fill="#333">1</text>
  <circle cx="140" cy="55" r="15" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="140" y="60" text-anchor="middle" fill="#333">2</text>
  <circle cx="140" cy="105" r="15" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="140" y="110" text-anchor="middle" fill="#333">3</text>
  <!-- SCC 2 (green) -->
  <ellipse cx="240" cy="130" rx="65" ry="45" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5" stroke-dasharray="5,3"/>
  <circle cx="210" cy="110" r="15" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <text x="210" y="115" text-anchor="middle" fill="#333">4</text>
  <circle cx="270" cy="110" r="15" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <text x="270" y="115" text-anchor="middle" fill="#333">5</text>
  <circle cx="240" cy="155" r="15" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <text x="240" y="160" text-anchor="middle" fill="#333">6</text>
  <!-- Arrows within SCC1 -->
  <line x1="75" y1="73" x2="125" y2="60" stroke="#2196f3" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="140" y1="70" x2="140" y2="90" stroke="#2196f3" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="125" y1="110" x2="75" y2="88" stroke="#2196f3" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Arrow between SCCs -->
  <line x1="155" y1="80" x2="195" y2="108" stroke="#f44336" stroke-width="2" marker-end="url(#arr2)"/>
  <!-- Arrows within SCC2 -->
  <line x1="225" y1="113" x2="255" y2="113" stroke="#4caf50" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="265" y1="124" x2="250" y2="142" stroke="#4caf50" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="225" y1="155" x2="207" y2="124" stroke="#4caf50" stroke-width="1.5" marker-end="url(#arr)"/>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#666"/>
    </marker>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#f44336"/>
    </marker>
  </defs>
  <text x="160" y="196" text-anchor="middle" fill="#333" font-size="11">파란 SCC / 초록 SCC — 빨간 화살: SCC 간 간선</text>
</svg>
</div>`;

    case 347: // LCA
      return `<div align="center">
<svg width="300" height="210" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Tree with LCA marked -->
  <circle cx="150" cy="28" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="33" text-anchor="middle" fill="#333">1</text>
  <circle cx="80" cy="88" r="15" fill="#fff9c4" stroke="#ffc107" stroke-width="2.5"/>
  <text x="80" y="93" text-anchor="middle" fill="#333">2</text>
  <circle cx="220" cy="88" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="220" y="93" text-anchor="middle" fill="#333">3</text>
  <circle cx="40" cy="155" r="15" fill="#ffebee" stroke="#f44336" stroke-width="2.5"/>
  <text x="40" y="160" text-anchor="middle" fill="#f44336">4</text>
  <circle cx="110" cy="155" r="15" fill="#ffebee" stroke="#f44336" stroke-width="2.5"/>
  <text x="110" y="160" text-anchor="middle" fill="#f44336">5</text>
  <circle cx="190" cy="155" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="190" y="160" text-anchor="middle" fill="#333">6</text>
  <circle cx="260" cy="155" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="260" y="160" text-anchor="middle" fill="#333">7</text>
  <!-- Edges -->
  <line x1="150" y1="43" x2="80" y2="73" stroke="#999" stroke-width="1.5"/>
  <line x1="150" y1="43" x2="220" y2="73" stroke="#999" stroke-width="1.5"/>
  <line x1="80" y1="103" x2="40" y2="140" stroke="#f44336" stroke-width="2"/>
  <line x1="80" y1="103" x2="110" y2="140" stroke="#f44336" stroke-width="2"/>
  <line x1="220" y1="103" x2="190" y2="140" stroke="#999" stroke-width="1.5"/>
  <line x1="220" y1="103" x2="260" y2="140" stroke="#999" stroke-width="1.5"/>
  <text x="80" y="78" text-anchor="middle" fill="#ffc107" font-size="11" font-weight="bold">LCA</text>
  <text x="150" y="200" text-anchor="middle" fill="#333" font-size="11">LCA(4,5) = 2 (노란 노드)</text>
</svg>
</div>`;

    case 351: // 스택 수열
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Stack push/pop operations -->
  <!-- Input sequence -->
  <text x="10" y="20" fill="#333" font-size="11" font-weight="bold">입력: 1 2 3 4 5</text>
  <text x="10" y="40" fill="#333" font-size="11" font-weight="bold">목표: 3 1 4 2 5</text>
  <!-- Stack visualization -->
  <rect x="110" y="50" width="80" height="130" fill="none" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="44" text-anchor="middle" fill="#2196f3" font-size="11" font-weight="bold">Stack</text>
  <!-- Stack elements -->
  <rect x="112" y="138" width="76" height="28" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="150" y="157" text-anchor="middle" fill="#333">1</text>
  <rect x="112" y="108" width="76" height="28" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="150" y="127" text-anchor="middle" fill="#333">2</text>
  <rect x="112" y="78" width="76" height="28" fill="#bbdefb" stroke="#2196f3" stroke-width="1.5"/>
  <text x="150" y="97" text-anchor="middle" fill="#333" font-weight="bold">3</text>
  <!-- Push arrow -->
  <text x="218" y="90" fill="#4caf50" font-size="11">← push</text>
  <text x="218" y="110" fill="#f44336" font-size="11">← pop 3</text>
  <!-- Operations list -->
  <text x="10" y="90" fill="#4caf50" font-size="11">push 1,2,3</text>
  <text x="10" y="110" fill="#f44336" font-size="11">pop → 3 ✓</text>
  <text x="10" y="130" fill="#f44336" font-size="11">pop → 2 ✗</text>
  <text x="10" y="150" fill="#f44336" font-size="11">pop → 1 ✓</text>
  <text x="150" y="196" text-anchor="middle" fill="#333" font-size="11">push/pop으로 목표 수열 생성</text>
</svg>
</div>`;

    case 353: // 오큰수 (NGE)
      return `<div align="center">
<svg width="300" height="190" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Array with arrows to next greater element -->
  <text x="150" y="18" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">Next Greater Element</text>
  <!-- Array boxes -->
  <rect x="20" y="30" width="40" height="40" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="40" y="56" text-anchor="middle" fill="#333" font-size="14">3</text>
  <rect x="65" y="30" width="40" height="40" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="85" y="56" text-anchor="middle" fill="#333" font-size="14">5</text>
  <rect x="110" y="30" width="40" height="40" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="130" y="56" text-anchor="middle" fill="#333" font-size="14">2</text>
  <rect x="155" y="30" width="40" height="40" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="175" y="56" text-anchor="middle" fill="#333" font-size="14">7</text>
  <rect x="200" y="30" width="40" height="40" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="220" y="56" text-anchor="middle" fill="#333" font-size="14">4</text>
  <rect x="245" y="30" width="40" height="40" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="265" y="56" text-anchor="middle" fill="#333" font-size="14">1</text>
  <!-- Arrows: next greater -->
  <!-- 3 → 5 -->
  <path d="M40,30 Q62,10 85,30" fill="none" stroke="#f44336" stroke-width="1.5" marker-end="url(#a)"/>
  <!-- 2 → 7 -->
  <path d="M130,30 Q152,8 175,30" fill="none" stroke="#f44336" stroke-width="1.5" marker-end="url(#a)"/>
  <!-- 5,4 → 7 -->
  <path d="M85,30 Q130,5 175,30" fill="none" stroke="#f44336" stroke-width="1.5" stroke-dasharray="4,2" marker-end="url(#a)"/>
  <path d="M220,30 Q240,8 260,30" fill="none" stroke="#999" stroke-width="1.5" marker-end="url(#a)"/>
  <!-- NGE results -->
  <text x="40" y="95" text-anchor="middle" fill="#2196f3" font-size="11">→5</text>
  <text x="85" y="95" text-anchor="middle" fill="#2196f3" font-size="11">→7</text>
  <text x="130" y="95" text-anchor="middle" fill="#2196f3" font-size="11">→7</text>
  <text x="175" y="95" text-anchor="middle" fill="#2196f3" font-size="11">→-1</text>
  <text x="220" y="95" text-anchor="middle" fill="#2196f3" font-size="11">→-1</text>
  <text x="265" y="95" text-anchor="middle" fill="#2196f3" font-size="11">→-1</text>
  <text x="150" y="120" text-anchor="middle" fill="#333" font-size="11">결과: 5 7 7 -1 -1 -1</text>
  <defs>
    <marker id="a" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto">
      <path d="M0,0 L0,5 L7,2.5 z" fill="#f44336"/>
    </marker>
  </defs>
  <text x="150" y="145" text-anchor="middle" fill="#333" font-size="11">스택으로 O(N) 해결</text>
</svg>
</div>`;

    case 355: // 히스토그램
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Histogram with max rectangle -->
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">히스토그램 최대 직사각형</text>
  <!-- Bars: heights 2,1,5,6,2,3 (×20px) -->
  <rect x="20" y="120" width="34" height="40" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="37" y="115" text-anchor="middle" fill="#333" font-size="10">2</text>
  <rect x="58" y="140" width="34" height="20" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="75" y="135" text-anchor="middle" fill="#333" font-size="10">1</text>
  <rect x="96" y="60" width="34" height="100" fill="#bbdefb" stroke="#2196f3" stroke-width="1"/>
  <text x="113" y="55" text-anchor="middle" fill="#333" font-size="10">5</text>
  <rect x="134" y="40" width="34" height="120" fill="#bbdefb" stroke="#2196f3" stroke-width="1"/>
  <text x="151" y="35" text-anchor="middle" fill="#333" font-size="10">6</text>
  <rect x="172" y="120" width="34" height="40" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="189" y="115" text-anchor="middle" fill="#333" font-size="10">2</text>
  <rect x="210" y="100" width="34" height="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="1"/>
  <text x="227" y="95" text-anchor="middle" fill="#333" font-size="10">3</text>
  <!-- Max rectangle outline (height=5, width=2 = area 10) -->
  <rect x="96" y="60" width="72" height="100" fill="none" stroke="#f44336" stroke-width="2.5" stroke-dasharray="5,3"/>
  <text x="132" y="175" text-anchor="middle" fill="#f44336" font-size="11">최대 넓이: 10 (빨간 테두리)</text>
  <line x1="20" y1="160" x2="250" y2="160" stroke="#666" stroke-width="1.5"/>
</svg>
</div>`;

    case 357: // 요세푸스
      return `<div align="center">
<svg width="300" height="210" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Circle of people with elimination -->
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">요세푸스 문제 (N=7, K=3)</text>
  <!-- Nodes in circle -->
  <circle cx="150" cy="110" r="75" fill="none" stroke="#ccc" stroke-width="1"/>
  <!-- People positions: 7 around circle -->
  <circle cx="150" cy="35" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="40" text-anchor="middle" fill="#333">1</text>
  <circle cx="207" cy="57" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="207" y="62" text-anchor="middle" fill="#333">2</text>
  <circle cx="225" cy="110" r="14" fill="#ffebee" stroke="#f44336" stroke-width="2.5"/>
  <text x="225" y="115" text-anchor="middle" fill="#f44336">3</text>
  <text x="243" y="104" fill="#f44336" font-size="10">①</text>
  <circle cx="207" cy="163" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="207" y="168" text-anchor="middle" fill="#333">4</text>
  <circle cx="150" cy="185" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="190" text-anchor="middle" fill="#333">5</text>
  <circle cx="93" cy="163" r="14" fill="#ffebee" stroke="#f44336" stroke-width="2.5"/>
  <text x="93" y="168" text-anchor="middle" fill="#f44336">6</text>
  <text x="72" y="157" fill="#f44336" font-size="10">②</text>
  <circle cx="75" cy="110" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="75" y="115" text-anchor="middle" fill="#333">7</text>
  <text x="150" y="206" text-anchor="middle" fill="#333" font-size="11">제거 순서: 3, 6, 2, 7, 5, 1, 4</text>
</svg>
</div>`;

    case 360: // 슬라이딩 윈도우 최솟값
      return `<div align="center">
<svg width="300" height="175" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <!-- Array with sliding window -->
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">슬라이딩 윈도우 최솟값 (K=3)</text>
  <!-- Array boxes -->
  <rect x="20" y="30" width="36" height="36" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="38" y="54" text-anchor="middle" fill="#333" font-size="14">1</text>
  <rect x="60" y="30" width="36" height="36" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="78" y="54" text-anchor="middle" fill="#333" font-size="14">3</text>
  <rect x="100" y="30" width="36" height="36" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="118" y="54" text-anchor="middle" fill="#2196f3" font-size="14" font-weight="bold">-1</text>
  <rect x="140" y="30" width="36" height="36" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="158" y="54" text-anchor="middle" fill="#333" font-size="14">5</text>
  <rect x="180" y="30" width="36" height="36" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="198" y="54" text-anchor="middle" fill="#333" font-size="14">3</text>
  <rect x="220" y="30" width="36" height="36" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="238" y="54" text-anchor="middle" fill="#333" font-size="14">6</text>
  <!-- Window bracket -->
  <rect x="57" y="26" width="123" height="44" fill="none" stroke="#f44336" stroke-width="2.5" rx="3"/>
  <text x="118" y="20" text-anchor="middle" fill="#f44336" font-size="10">윈도우</text>
  <!-- Deque visualization -->
  <text x="20" y="96" fill="#333" font-size="11" font-weight="bold">Deque (인덱스):</text>
  <rect x="20" y="104" width="36" height="26" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="38" y="122" text-anchor="middle" fill="#333">2</text>
  <rect x="60" y="104" width="36" height="26" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="78" y="122" text-anchor="middle" fill="#333">3</text>
  <text x="20" y="152" fill="#333" font-size="11">최솟값: arr[2] = -1</text>
  <text x="150" y="170" text-anchor="middle" fill="#333" font-size="11">단조 덱으로 O(N) 해결</text>
</svg>
</div>`;

    case 361: // 슬라이딩 윈도우 최댓값
      return `<div align="center">
<svg width="300" height="175" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">슬라이딩 윈도우 최댓값 (K=3)</text>
  <!-- Array boxes -->
  <rect x="20" y="30" width="36" height="36" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="38" y="54" text-anchor="middle" fill="#333" font-size="14">1</text>
  <rect x="60" y="30" width="36" height="36" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="78" y="54" text-anchor="middle" fill="#333" font-size="14">3</text>
  <rect x="100" y="30" width="36" height="36" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="118" y="54" text-anchor="middle" fill="#333" font-size="14">-1</text>
  <rect x="140" y="30" width="36" height="36" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="158" y="54" text-anchor="middle" fill="#2196f3" font-size="14" font-weight="bold">5</text>
  <rect x="180" y="30" width="36" height="36" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="198" y="54" text-anchor="middle" fill="#333" font-size="14">3</text>
  <rect x="220" y="30" width="36" height="36" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="238" y="54" text-anchor="middle" fill="#333" font-size="14">6</text>
  <!-- Window bracket -->
  <rect x="57" y="26" width="123" height="44" fill="none" stroke="#f44336" stroke-width="2.5" rx="3"/>
  <text x="118" y="20" text-anchor="middle" fill="#f44336" font-size="10">윈도우</text>
  <!-- Deque visualization -->
  <text x="20" y="96" fill="#333" font-size="11" font-weight="bold">Deque (인덱스, 내림차순):</text>
  <rect x="20" y="104" width="36" height="26" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="38" y="122" text-anchor="middle" fill="#333">3</text>
  <rect x="60" y="104" width="36" height="26" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="78" y="122" text-anchor="middle" fill="#333">1</text>
  <text x="20" y="152" fill="#333" font-size="11">최댓값: arr[3] = 5</text>
  <text x="150" y="170" text-anchor="middle" fill="#333" font-size="11">단조 덱으로 O(N) 해결</text>
</svg>
</div>`;

    case 362: // 후위 표기식 변환
      return `<div align="center">
<svg width="300" height="180" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">중위 → 후위 표기식 변환</text>
  <!-- Infix expression -->
  <text x="20" y="42" fill="#333" font-size="11" font-weight="bold">중위:</text>
  <rect x="65" y="28" width="30" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="80" y="45" text-anchor="middle" fill="#333">A</text>
  <rect x="99" y="28" width="30" height="24" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="114" y="45" text-anchor="middle" fill="#333">+</text>
  <rect x="133" y="28" width="30" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="148" y="45" text-anchor="middle" fill="#333">B</text>
  <rect x="167" y="28" width="30" height="24" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="182" y="45" text-anchor="middle" fill="#333">*</text>
  <rect x="201" y="28" width="30" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="216" y="45" text-anchor="middle" fill="#333">C</text>
  <!-- Arrow -->
  <text x="150" y="80" text-anchor="middle" fill="#4caf50" font-size="22">↓</text>
  <!-- Postfix expression -->
  <text x="20" y="115" fill="#333" font-size="11" font-weight="bold">후위:</text>
  <rect x="65" y="100" width="30" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="80" y="117" text-anchor="middle" fill="#333">A</text>
  <rect x="99" y="100" width="30" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="114" y="117" text-anchor="middle" fill="#333">B</text>
  <rect x="133" y="100" width="30" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="148" y="117" text-anchor="middle" fill="#333">C</text>
  <rect x="167" y="100" width="30" height="24" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="182" y="117" text-anchor="middle" fill="#333">*</text>
  <rect x="201" y="100" width="30" height="24" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5"/>
  <text x="216" y="117" text-anchor="middle" fill="#333">+</text>
  <!-- Stack label -->
  <text x="20" y="148" fill="#333" font-size="11">연산자 스택으로 우선순위 처리</text>
  <text x="20" y="165" fill="#2196f3" font-size="11">* 먼저 출력 후 + 출력</text>
</svg>
</div>`;

    case 363: // 최대 힙
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">최대 힙 (Max Heap)</text>
  <!-- Heap tree -->
  <circle cx="150" cy="45" r="18" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="51" text-anchor="middle" fill="#333" font-size="14" font-weight="bold">9</text>
  <circle cx="80" cy="105" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="80" y="111" text-anchor="middle" fill="#333" font-size="14">7</text>
  <circle cx="220" cy="105" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="220" y="111" text-anchor="middle" fill="#333" font-size="14">6</text>
  <circle cx="40" cy="165" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="40" y="171" text-anchor="middle" fill="#333" font-size="14">5</text>
  <circle cx="120" cy="165" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="120" y="171" text-anchor="middle" fill="#333" font-size="14">3</text>
  <circle cx="180" cy="165" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="180" y="171" text-anchor="middle" fill="#333" font-size="14">4</text>
  <circle cx="260" cy="165" r="18" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="260" y="171" text-anchor="middle" fill="#333" font-size="14">1</text>
  <!-- Edges -->
  <line x1="150" y1="63" x2="80" y2="87" stroke="#999" stroke-width="1.5"/>
  <line x1="150" y1="63" x2="220" y2="87" stroke="#999" stroke-width="1.5"/>
  <line x1="80" y1="123" x2="40" y2="147" stroke="#999" stroke-width="1.5"/>
  <line x1="80" y1="123" x2="120" y2="147" stroke="#999" stroke-width="1.5"/>
  <line x1="220" y1="123" x2="180" y2="147" stroke="#999" stroke-width="1.5"/>
  <line x1="220" y1="123" x2="260" y2="147" stroke="#999" stroke-width="1.5"/>
  <text x="150" y="196" text-anchor="middle" fill="#333" font-size="11">부모 ≥ 자식 (완전 이진트리)</text>
</svg>
</div>`;

    case 367: // 중앙값 구하기
      return `<div align="center">
<svg width="300" height="195" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">두 힙으로 중앙값 유지</text>
  <!-- Left max-heap -->
  <rect x="20" y="30" width="120" height="80" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5" rx="5"/>
  <text x="80" y="50" text-anchor="middle" fill="#2196f3" font-size="11" font-weight="bold">최대 힙 (하위)</text>
  <circle cx="80" cy="75" r="14" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="80" y="80" text-anchor="middle" fill="#333">3</text>
  <circle cx="50" cy="100" r="12" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="50" y="104" text-anchor="middle" fill="#333">1</text>
  <circle cx="108" cy="100" r="12" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="108" y="104" text-anchor="middle" fill="#333">2</text>
  <!-- Right min-heap -->
  <rect x="160" y="30" width="120" height="80" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5" rx="5"/>
  <text x="220" y="50" text-anchor="middle" fill="#4caf50" font-size="11" font-weight="bold">최소 힙 (상위)</text>
  <circle cx="220" cy="75" r="14" fill="#c8e6c9" stroke="#4caf50" stroke-width="2"/>
  <text x="220" y="80" text-anchor="middle" fill="#333">5</text>
  <circle cx="190" cy="100" r="12" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5"/>
  <text x="190" y="104" text-anchor="middle" fill="#333">7</text>
  <circle cx="250" cy="100" r="12" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5"/>
  <text x="250" y="104" text-anchor="middle" fill="#333">9</text>
  <!-- Median -->
  <text x="150" y="140" text-anchor="middle" fill="#f44336" font-size="13" font-weight="bold">중앙값 = 3</text>
  <text x="150" y="158" text-anchor="middle" fill="#333" font-size="11">(최대 힙의 루트)</text>
  <text x="150" y="178" text-anchor="middle" fill="#333" font-size="11">두 힙 크기 차 ≤ 1 유지</text>
</svg>
</div>`;

    case 371: // 집합의 표현
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">Union-Find (집합의 표현)</text>
  <!-- Before union -->
  <text x="70" y="40" text-anchor="middle" fill="#333" font-size="11">Union 전</text>
  <circle cx="30" cy="70" r="13" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="30" y="75" text-anchor="middle" fill="#333">1</text>
  <circle cx="65" cy="70" r="13" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="65" y="75" text-anchor="middle" fill="#333">2</text>
  <circle cx="100" cy="70" r="13" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="100" y="75" text-anchor="middle" fill="#333">3</text>
  <circle cx="135" cy="70" r="13" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="135" y="75" text-anchor="middle" fill="#333">4</text>
  <!-- Arrow -->
  <text x="180" y="75" fill="#4caf50" font-size="18" font-weight="bold">→</text>
  <!-- After union -->
  <text x="248" y="40" text-anchor="middle" fill="#333" font-size="11">Union(1,3) 후</text>
  <circle cx="215" cy="100" r="13" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="215" y="105" text-anchor="middle" fill="#333">1</text>
  <circle cx="215" cy="65" r="13" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="215" y="70" text-anchor="middle" fill="#333">2</text>
  <circle cx="255" cy="100" r="13" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="255" y="105" text-anchor="middle" fill="#333">3</text>
  <circle cx="255" cy="65" r="13" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="255" y="70" text-anchor="middle" fill="#333">4</text>
  <!-- Parent arrows after -->
  <line x1="215" y1="87" x2="215" y2="78" stroke="#2196f3" stroke-width="1.5" marker-end="url(#ua)"/>
  <line x1="255" y1="87" x2="230" y2="100" stroke="#2196f3" stroke-width="1.5" marker-end="url(#ua)"/>
  <defs>
    <marker id="ua" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto">
      <path d="M0,0 L0,5 L7,2.5 z" fill="#2196f3"/>
    </marker>
  </defs>
  <text x="150" y="150" text-anchor="middle" fill="#333" font-size="11">경로 압축 + 랭크로 O(α(N))</text>
  <text x="150" y="168" text-anchor="middle" fill="#333" font-size="11">Find: 루트 찾기, Union: 루트 연결</text>
</svg>
</div>`;

    case 375: // 네트워크 연결 (Union-Find)
      return `<div align="center">
<svg width="300" height="195" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">네트워크 연결 (Union-Find)</text>
  <!-- Nodes -->
  <circle cx="150" cy="55" r="15" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="60" text-anchor="middle" fill="#333">1</text>
  <circle cx="60" cy="115" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="60" y="120" text-anchor="middle" fill="#333">2</text>
  <circle cx="240" cy="115" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="240" y="120" text-anchor="middle" fill="#333">3</text>
  <circle cx="100" cy="175" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="100" y="180" text-anchor="middle" fill="#333">4</text>
  <circle cx="200" cy="175" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="200" y="180" text-anchor="middle" fill="#333">5</text>
  <!-- Edges with costs -->
  <line x1="150" y1="70" x2="60" y2="100" stroke="#2196f3" stroke-width="2"/>
  <text x="95" y="82" fill="#333" font-size="10">1</text>
  <line x1="150" y1="70" x2="240" y2="100" stroke="#2196f3" stroke-width="2"/>
  <text x="205" y="82" fill="#333" font-size="10">2</text>
  <line x1="60" y1="130" x2="100" y2="160" stroke="#4caf50" stroke-width="2.5"/>
  <text x="70" y="153" fill="#4caf50" font-size="10">3</text>
  <line x1="240" y1="130" x2="200" y2="160" stroke="#4caf50" stroke-width="2.5"/>
  <text x="228" y="153" fill="#4caf50" font-size="10">2</text>
  <line x1="100" y1="175" x2="200" y2="175" stroke="#f44336" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="150" y="170" text-anchor="middle" fill="#f44336" font-size="10">사이클</text>
  <text x="150" y="200" text-anchor="middle" fill="#333" font-size="11">모든 노드 연결 최소 비용</text>
</svg>
</div>`;

    case 376: // 크루스칼
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">크루스칼 알고리즘 (MST)</text>
  <circle cx="150" cy="45" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="50" text-anchor="middle" fill="#333">A</text>
  <circle cx="60" cy="110" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="60" y="115" text-anchor="middle" fill="#333">B</text>
  <circle cx="240" cy="110" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="240" y="115" text-anchor="middle" fill="#333">C</text>
  <circle cx="100" cy="175" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="100" y="180" text-anchor="middle" fill="#333">D</text>
  <circle cx="200" cy="175" r="15" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="200" y="180" text-anchor="middle" fill="#333">E</text>
  <!-- Non-MST edges (dashed) -->
  <line x1="150" y1="60" x2="60" y2="95" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="95" y="73" fill="#999" font-size="10">4</text>
  <line x1="60" y1="110" x2="200" y2="175" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="120" y="155" fill="#999" font-size="10">5</text>
  <!-- MST edges (solid blue, selected) -->
  <line x1="150" y1="60" x2="240" y2="95" stroke="#2196f3" stroke-width="2.5"/>
  <text x="205" y="72" fill="#2196f3" font-size="10">1</text>
  <line x1="60" y1="95" x2="100" y2="160" stroke="#2196f3" stroke-width="2.5"/>
  <text x="68" y="135" fill="#2196f3" font-size="10">2</text>
  <line x1="100" y1="175" x2="200" y2="175" stroke="#2196f3" stroke-width="2.5"/>
  <text x="150" y="172" text-anchor="middle" fill="#2196f3" font-size="10">2</text>
  <line x1="200" y1="160" x2="240" y2="125" stroke="#2196f3" stroke-width="2.5"/>
  <text x="228" y="148" fill="#2196f3" font-size="10">3</text>
  <text x="150" y="198" text-anchor="middle" fill="#333" font-size="11">간선 정렬 후 사이클 없이 추가</text>
</svg>
</div>`;

    case 378: // 구간 합 (세그먼트 트리)
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">세그먼트 트리 (구간 합)</text>
  <!-- Array -->
  <text x="10" y="38" fill="#333" font-size="10">배열: [1, 3, 5, 7, 9, 11]</text>
  <!-- Segment tree nodes -->
  <!-- Root -->
  <rect x="120" y="46" width="60" height="24" fill="#bbdefb" stroke="#2196f3" stroke-width="2" rx="3"/>
  <text x="150" y="63" text-anchor="middle" fill="#333" font-size="11">36 [0,5]</text>
  <!-- Level 2 -->
  <rect x="55" y="88" width="56" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <text x="83" y="105" text-anchor="middle" fill="#333" font-size="11">9 [0,2]</text>
  <rect x="189" y="88" width="56" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <text x="217" y="105" text-anchor="middle" fill="#333" font-size="11">27 [3,5]</text>
  <!-- Level 3 -->
  <rect x="20" y="132" width="40" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1" rx="2"/>
  <text x="40" y="148" text-anchor="middle" fill="#333" font-size="10">4[0,1]</text>
  <rect x="80" y="132" width="34" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1" rx="2"/>
  <text x="97" y="148" text-anchor="middle" fill="#333" font-size="10">5[2]</text>
  <rect x="150" y="132" width="40" height="22" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5" rx="2"/>
  <text x="170" y="148" text-anchor="middle" fill="#333" font-size="10">16[3,4]</text>
  <rect x="210" y="132" width="34" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1" rx="2"/>
  <text x="227" y="148" text-anchor="middle" fill="#333" font-size="10">11[5]</text>
  <!-- Edges -->
  <line x1="150" y1="70" x2="100" y2="88" stroke="#999" stroke-width="1.5"/>
  <line x1="150" y1="70" x2="207" y2="88" stroke="#999" stroke-width="1.5"/>
  <line x1="90" y1="112" x2="55" y2="132" stroke="#999" stroke-width="1.5"/>
  <line x1="90" y1="112" x2="95" y2="132" stroke="#999" stroke-width="1.5"/>
  <line x1="215" y1="112" x2="175" y2="132" stroke="#ffc107" stroke-width="1.5"/>
  <line x1="220" y1="112" x2="225" y2="132" stroke="#999" stroke-width="1.5"/>
  <text x="150" y="180" text-anchor="middle" fill="#333" font-size="11">query(3,4) = 16, 업데이트 O(log N)</text>
</svg>
</div>`;

    case 381: // 펜윅 트리
      return `<div align="center">
<svg width="300" height="190" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">펜윅 트리 (BIT) - 커버 범위</text>
  <!-- Array indices 1-8 -->
  <text x="10" y="40" fill="#333" font-size="10">인덱스:</text>
  <rect x="50" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="64" y="42" text-anchor="middle" fill="#333" font-size="11">1</text>
  <rect x="82" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="96" y="42" text-anchor="middle" fill="#333" font-size="11">2</text>
  <rect x="114" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="128" y="42" text-anchor="middle" fill="#333" font-size="11">3</text>
  <rect x="146" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="160" y="42" text-anchor="middle" fill="#333" font-size="11">4</text>
  <rect x="178" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="192" y="42" text-anchor="middle" fill="#333" font-size="11">5</text>
  <rect x="210" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="224" y="42" text-anchor="middle" fill="#333" font-size="11">6</text>
  <rect x="242" y="26" width="28" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="256" y="42" text-anchor="middle" fill="#333" font-size="11">7</text>
  <!-- BIT coverage brackets -->
  <line x1="64" y1="52" x2="64" y2="68" stroke="#4caf50" stroke-width="1.5"/>
  <line x1="64" y1="68" x2="64" y2="68" stroke="#4caf50" stroke-width="1.5"/>
  <text x="64" y="82" text-anchor="middle" fill="#4caf50" font-size="10">[1]</text>
  <line x1="82" y1="52" x2="82" y2="60" stroke="#2196f3" stroke-width="2"/>
  <line x1="82" y1="60" x2="110" y2="60" stroke="#2196f3" stroke-width="2"/>
  <line x1="110" y1="60" x2="110" y2="52" stroke="#2196f3" stroke-width="2"/>
  <text x="96" y="76" text-anchor="middle" fill="#2196f3" font-size="10">[1,2]</text>
  <line x1="128" y1="52" x2="128" y2="68" stroke="#4caf50" stroke-width="1.5"/>
  <text x="128" y="82" text-anchor="middle" fill="#4caf50" font-size="10">[3]</text>
  <line x1="146" y1="52" x2="146" y2="52" stroke="#f44336" stroke-width="2"/>
  <line x1="50" y1="52" x2="50" y2="96" stroke="#f44336" stroke-width="2"/>
  <line x1="50" y1="96" x2="174" y2="96" stroke="#f44336" stroke-width="2"/>
  <line x1="174" y1="96" x2="174" y2="52" stroke="#f44336" stroke-width="2"/>
  <text x="112" y="112" text-anchor="middle" fill="#f44336" font-size="10">[1,2,3,4]</text>
  <line x1="192" y1="52" x2="192" y2="68" stroke="#4caf50" stroke-width="1.5"/>
  <text x="192" y="82" text-anchor="middle" fill="#4caf50" font-size="10">[5]</text>
  <line x1="210" y1="52" x2="210" y2="60" stroke="#2196f3" stroke-width="2"/>
  <line x1="210" y1="60" x2="238" y2="60" stroke="#2196f3" stroke-width="2"/>
  <line x1="238" y1="60" x2="238" y2="52" stroke="#2196f3" stroke-width="2"/>
  <text x="224" y="76" text-anchor="middle" fill="#2196f3" font-size="10">[5,6]</text>
  <text x="150" y="145" text-anchor="middle" fill="#333" font-size="11">BIT[i] = lowbit(i) 개 원소의 합</text>
  <text x="150" y="163" text-anchor="middle" fill="#333" font-size="11">갱신/쿼리 모두 O(log N)</text>
</svg>
</div>`;

    case 384: // K번째 수 (세그먼트 트리)
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">K번째 수 (Order-Statistic 세그먼트 트리)</text>
  <!-- Segment tree showing counts -->
  <rect x="115" y="30" width="70" height="24" fill="#bbdefb" stroke="#2196f3" stroke-width="2" rx="3"/>
  <text x="150" y="47" text-anchor="middle" fill="#333" font-size="11">cnt=6 [1,8]</text>
  <rect x="55" y="72" width="66" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <text x="88" y="89" text-anchor="middle" fill="#333" font-size="11">cnt=4 [1,4]</text>
  <rect x="179" y="72" width="66" height="24" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5" rx="3"/>
  <text x="212" y="89" text-anchor="middle" fill="#333" font-size="11">cnt=2 [5,8]</text>
  <rect x="20" y="114" width="58" height="22" fill="#fff9c4" stroke="#ffc107" stroke-width="1.5" rx="2"/>
  <text x="49" y="130" text-anchor="middle" fill="#333" font-size="10">cnt=3 [1,2]</text>
  <rect x="90" y="114" width="58" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1" rx="2"/>
  <text x="119" y="130" text-anchor="middle" fill="#333" font-size="10">cnt=1 [3,4]</text>
  <!-- Edges -->
  <line x1="150" y1="54" x2="100" y2="72" stroke="#999" stroke-width="1.5"/>
  <line x1="150" y1="54" x2="210" y2="72" stroke="#999" stroke-width="1.5"/>
  <line x1="90" y1="96" x2="60" y2="114" stroke="#ffc107" stroke-width="2"/>
  <line x1="90" y1="96" x2="118" y2="114" stroke="#999" stroke-width="1.5"/>
  <!-- K=3 path -->
  <text x="30" y="155" fill="#ffc107" font-size="11">← K=3 탐색</text>
  <text x="150" y="175" text-anchor="middle" fill="#333" font-size="11">왼쪽 cnt ≥ K → 왼쪽으로</text>
  <text x="150" y="193" text-anchor="middle" fill="#333" font-size="11">아니면 K -= cnt_left, 오른쪽</text>
</svg>
</div>`;

    case 387: // KMP 문자열 검색
      return `<div align="center">
<svg width="300" height="185" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">KMP 문자열 검색</text>
  <!-- Text string -->
  <text x="10" y="38" fill="#333" font-size="11">텍스트:</text>
  <rect x="70" y="24" width="22" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="81" y="40" text-anchor="middle" fill="#333">A</text>
  <rect x="94" y="24" width="22" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="105" y="40" text-anchor="middle" fill="#333">B</text>
  <rect x="118" y="24" width="22" height="22" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="129" y="40" text-anchor="middle" fill="#2196f3">A</text>
  <rect x="142" y="24" width="22" height="22" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="153" y="40" text-anchor="middle" fill="#2196f3">B</text>
  <rect x="166" y="24" width="22" height="22" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="177" y="40" text-anchor="middle" fill="#2196f3">A</text>
  <rect x="190" y="24" width="22" height="22" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="201" y="40" text-anchor="middle" fill="#2196f3">B</text>
  <rect x="214" y="24" width="22" height="22" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="225" y="40" text-anchor="middle" fill="#333">C</text>
  <rect x="238" y="24" width="22" height="22" fill="#f5f5f5" stroke="#999" stroke-width="1"/>
  <text x="249" y="40" text-anchor="middle" fill="#333">D</text>
  <!-- Pattern -->
  <text x="10" y="78" fill="#333" font-size="11">패턴:</text>
  <rect x="118" y="62" width="22" height="22" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="129" y="78" text-anchor="middle" fill="#4caf50">A</text>
  <rect x="142" y="62" width="22" height="22" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="153" y="78" text-anchor="middle" fill="#4caf50">B</text>
  <rect x="166" y="62" width="22" height="22" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="177" y="78" text-anchor="middle" fill="#4caf50">A</text>
  <rect x="190" y="62" width="22" height="22" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="201" y="78" text-anchor="middle" fill="#4caf50">B</text>
  <rect x="214" y="62" width="22" height="22" fill="#e8f5e9" stroke="#4caf50" stroke-width="2"/>
  <text x="225" y="78" text-anchor="middle" fill="#4caf50">C</text>
  <!-- Failure function -->
  <text x="10" y="110" fill="#333" font-size="11">실패 함수:</text>
  <text x="70" y="110" fill="#2196f3" font-size="11">[ 0, 0, 1, 2, 0 ]</text>
  <!-- Match result -->
  <rect x="118" y="124" width="120" height="24" fill="none" stroke="#f44336" stroke-width="2" stroke-dasharray="5,3"/>
  <text x="178" y="141" text-anchor="middle" fill="#f44336" font-size="11">매치 위치: index 2</text>
  <text x="150" y="175" text-anchor="middle" fill="#333" font-size="11">실패 함수로 불필요한 비교 건너뜀</text>
</svg>
</div>`;

    case 390: // 트라이
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">트라이 (Trie) — "car", "cat", "cab", "cut"</text>
  <!-- Root -->
  <circle cx="150" cy="40" r="14" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="45" text-anchor="middle" fill="#333" font-size="11">root</text>
  <!-- 'c' node -->
  <circle cx="150" cy="95" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="150" y="100" text-anchor="middle" fill="#333">c</text>
  <line x1="150" y1="54" x2="150" y2="81" stroke="#999" stroke-width="1.5"/>
  <!-- 'a' and 'u' -->
  <circle cx="90" cy="148" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="90" y="153" text-anchor="middle" fill="#333">a</text>
  <circle cx="210" cy="148" r="14" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <text x="210" y="153" text-anchor="middle" fill="#333">u</text>
  <line x1="142" y1="109" x2="98" y2="134" stroke="#999" stroke-width="1.5"/>
  <line x1="158" y1="109" x2="202" y2="134" stroke="#999" stroke-width="1.5"/>
  <!-- 'r','t','b' under 'a'; 't' under 'u' -->
  <circle cx="45" cy="192" r="12" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5"/>
  <text x="45" y="197" text-anchor="middle" fill="#333" font-size="11">r</text>
  <circle cx="90" cy="192" r="12" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5"/>
  <text x="90" y="197" text-anchor="middle" fill="#333" font-size="11">t</text>
  <circle cx="135" cy="192" r="12" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5"/>
  <text x="135" y="197" text-anchor="middle" fill="#333" font-size="11">b</text>
  <circle cx="210" cy="192" r="12" fill="#e8f5e9" stroke="#4caf50" stroke-width="1.5"/>
  <text x="210" y="197" text-anchor="middle" fill="#333" font-size="11">t</text>
  <line x1="82" y1="162" x2="53" y2="180" stroke="#999" stroke-width="1.5"/>
  <line x1="90" y1="162" x2="90" y2="180" stroke="#999" stroke-width="1.5"/>
  <line x1="98" y1="162" x2="127" y2="180" stroke="#999" stroke-width="1.5"/>
  <line x1="210" y1="162" x2="210" y2="180" stroke="#999" stroke-width="1.5"/>
</svg>
</div>`;

    case 395: // Z 알고리즘
      return `<div align="center">
<svg width="300" height="185" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">Z 알고리즘</text>
  <!-- String chars -->
  <text x="10" y="40" fill="#333" font-size="11">문자열: a a b a a b c</text>
  <!-- Boxes -->
  <rect x="40" y="48" width="26" height="26" fill="#bbdefb" stroke="#2196f3" stroke-width="2"/>
  <text x="53" y="66" text-anchor="middle" fill="#333">a</text>
  <rect x="70" y="48" width="26" height="26" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="83" y="66" text-anchor="middle" fill="#333">a</text>
  <rect x="100" y="48" width="26" height="26" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="113" y="66" text-anchor="middle" fill="#333">b</text>
  <rect x="130" y="48" width="26" height="26" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="143" y="66" text-anchor="middle" fill="#333">a</text>
  <rect x="160" y="48" width="26" height="26" fill="#e3f2fd" stroke="#2196f3" stroke-width="1.5"/>
  <text x="173" y="66" text-anchor="middle" fill="#333">a</text>
  <rect x="190" y="48" width="26" height="26" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="203" y="66" text-anchor="middle" fill="#333">b</text>
  <rect x="220" y="48" width="26" height="26" fill="#f5f5f5" stroke="#999" stroke-width="1.5"/>
  <text x="233" y="66" text-anchor="middle" fill="#333">c</text>
  <!-- Z array values -->
  <text x="10" y="102" fill="#333" font-size="11">Z 배열:</text>
  <text x="53" y="102" text-anchor="middle" fill="#999" font-size="11">-</text>
  <text x="83" y="102" text-anchor="middle" fill="#4caf50" font-size="11" font-weight="bold">1</text>
  <text x="113" y="102" text-anchor="middle" fill="#333" font-size="11">0</text>
  <text x="143" y="102" text-anchor="middle" fill="#f44336" font-size="11" font-weight="bold">3</text>
  <text x="173" y="102" text-anchor="middle" fill="#4caf50" font-size="11" font-weight="bold">1</text>
  <text x="203" y="102" text-anchor="middle" fill="#333" font-size="11">0</text>
  <text x="233" y="102" text-anchor="middle" fill="#333" font-size="11">0</text>
  <!-- Bracket for Z[3]=3 match -->
  <line x1="130" y1="48" x2="130" y2="44" stroke="#f44336" stroke-width="1.5"/>
  <line x1="130" y1="44" x2="216" y2="44" stroke="#f44336" stroke-width="1.5"/>
  <line x1="216" y1="44" x2="216" y2="48" stroke="#f44336" stroke-width="1.5"/>
  <text x="173" y="40" text-anchor="middle" fill="#f44336" font-size="10">Z[3]=3 (prefix 3개 일치)</text>
  <text x="150" y="128" text-anchor="middle" fill="#333" font-size="11">Z[i] = S[i..]와 S의 최장 공통 접두사 길이</text>
  <text x="150" y="148" text-anchor="middle" fill="#333" font-size="11">Z-box로 O(N) 계산</text>
</svg>
</div>`;

    case 400: // 평면 스위핑
      return `<div align="center">
<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg" style="font-family:sans-serif;font-size:12px">
  <text x="150" y="16" text-anchor="middle" fill="#333" font-size="11" font-weight="bold">평면 스위핑 (Sweep Line)</text>
  <!-- Coordinate system -->
  <line x1="30" y1="170" x2="280" y2="170" stroke="#666" stroke-width="1.5"/>
  <line x1="30" y1="30" x2="30" y2="170" stroke="#666" stroke-width="1.5"/>
  <text x="285" y="174" fill="#333" font-size="10">x</text>
  <text x="25" y="26" fill="#333" font-size="10">y</text>
  <!-- Horizontal segments -->
  <line x1="50" y1="80" x2="150" y2="80" stroke="#2196f3" stroke-width="3"/>
  <circle cx="50" cy="80" r="3" fill="#2196f3"/>
  <circle cx="150" cy="80" r="3" fill="#2196f3"/>
  <line x1="90" y1="130" x2="220" y2="130" stroke="#2196f3" stroke-width="3"/>
  <circle cx="90" cy="130" r="3" fill="#2196f3"/>
  <circle cx="220" cy="130" r="3" fill="#2196f3"/>
  <!-- Vertical segment -->
  <line x1="120" y1="60" x2="120" y2="150" stroke="#4caf50" stroke-width="3"/>
  <circle cx="120" cy="60" r="3" fill="#4caf50"/>
  <circle cx="120" cy="150" r="3" fill="#4caf50"/>
  <!-- Sweep line -->
  <line x1="120" y1="30" x2="120" y2="170" stroke="#f44336" stroke-width="2" stroke-dasharray="5,3"/>
  <text x="124" y="46" fill="#f44336" font-size="11">스윕 선</text>
  <!-- Intersection points -->
  <circle cx="120" cy="80" r="5" fill="#f44336"/>
  <circle cx="120" cy="130" r="5" fill="#f44336"/>
  <text x="128" y="84" fill="#f44336" font-size="10">교점</text>
  <text x="128" y="134" fill="#f44336" font-size="10">교점</text>
  <text x="150" y="190" text-anchor="middle" fill="#333" font-size="11">이벤트 정렬 후 활성 선분 관리</text>
</svg>
</div>`;

    default:
      return null;
  }
}

function insertSvg(description, svg) {
  // Insert before ## 입력
  const marker = '## 입력';
  const idx = description.indexOf(marker);
  if (idx === -1) {
    // Try alternate forms
    const markers = ['### 입력', '## Input', '**입력**'];
    for (const m of markers) {
      const i = description.indexOf(m);
      if (i !== -1) {
        return description.slice(0, i) + svg + '\n\n' + description.slice(i);
      }
    }
    // Append at end if no marker found
    return description + '\n\n' + svg;
  }
  return description.slice(0, idx) + svg + '\n\n' + description.slice(idx);
}

async function main() {
  console.log('Fetching problems from pages 4 and 5...');

  const problems = [];
  for (const page of [4, 5]) {
    const data = await fetchProblems(page);
    problems.push(...data.data);
    await sleep(400);
  }

  console.log(`Loaded ${problems.length} problems total`);

  // Build map by sequenceNumber
  const bySeq = new Map(problems.map(p => [p.sequenceNumber, p]));

  const targets = [
    340, 341, 342, 343, 347, 351, 353, 355, 357, 360, 361, 362,
    363, 367, 371, 375, 376, 378, 381, 384, 387, 390, 395, 400
  ];

  let updated = 0;
  let skipped = 0;
  let missing = 0;
  let count = 0;

  for (const seq of targets) {
    const problem = bySeq.get(seq);
    if (!problem) {
      console.log(`  MISSING: seq ${seq} not found in fetched pages`);
      missing++;
      continue;
    }

    const { id, title, description } = problem;

    // Check if SVG already present
    if (description.includes('<svg')) {
      console.log(`  SKIP: seq ${seq} "${title}" already has SVG`);
      skipped++;
      count++;
      if (count % 10 === 0) await sleep(2000);
      else await sleep(400);
      continue;
    }

    const svg = getSvg(seq, title);
    if (!svg) {
      console.log(`  NO SVG DEFINED: seq ${seq} "${title}"`);
      missing++;
      continue;
    }

    const newDescription = insertSvg(description, svg);

    try {
      await patchProblem(id, newDescription);
      console.log(`  OK: seq ${seq} "${title}" — SVG inserted`);
      updated++;
    } catch (err) {
      console.error(`  ERROR: seq ${seq} "${title}" — ${err.message}`);
    }

    count++;
    if (count % 10 === 0) await sleep(2000);
    else await sleep(400);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (had SVG): ${skipped}, Missing: ${missing}`);
}

main().catch(console.error);
