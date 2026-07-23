#!/usr/bin/env node
// ESM script: fetch current descriptions, prepend SVG diagrams, PATCH back

const API_BASE = (process.env.JUDGE_BASE_URL || 'https://oj.auraedu.me').replace(/\/$/, '');
const API_KEY = process.env.JUDGE_API_KEY;

if (!API_KEY) {
  console.error('Need JUDGE_API_KEY');
  process.exit(1);
}

async function getDescription(id) {
  const res = await fetch(`${API_BASE}/api/v1/problems/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const json = await res.json();
  return json.data;
}

async function patchDescription(id, description) {
  const res = await fetch(`${API_BASE}/api/v1/problems/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });
  const json = await res.json();
  return res.status;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// SVG builders
// ---------------------------------------------------------------------------

function svgWrap(width, height, inner) {
  return `\n<div align="center">\n<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;font-size:13px">\n${inner}\n</svg>\n</div>\n`;
}

// 정수 삼각형 (id: 0X0SXMV_2uXPkURNTl_sE)
const svg_정수삼각형 = svgWrap(220, 150, `
  <!-- triangle numbers with best-path highlighted -->
  <text x="110" y="22" text-anchor="middle" fill="#1565c0" font-weight="bold" font-size="15">7</text>
  <text x="80" y="52" text-anchor="middle" fill="#333">3</text>
  <text x="140" y="52" text-anchor="middle" fill="#1565c0" font-weight="bold">8</text>
  <text x="50" y="82" text-anchor="middle" fill="#333">8</text>
  <text x="110" y="82" text-anchor="middle" fill="#1565c0" font-weight="bold">1</text>
  <text x="170" y="82" text-anchor="middle" fill="#333">0</text>
  <text x="20" y="112" text-anchor="middle" fill="#333">2</text>
  <text x="80" y="112" text-anchor="middle" fill="#1565c0" font-weight="bold">7</text>
  <text x="140" y="112" text-anchor="middle" fill="#333">4</text>
  <text x="200" y="112" text-anchor="middle" fill="#333">4</text>
  <!-- path lines 7→8→1→7 -->
  <line x1="110" y1="27" x2="140" y2="42" stroke="#1565c0" stroke-width="2" opacity="0.6"/>
  <line x1="140" y1="57" x2="110" y2="72" stroke="#1565c0" stroke-width="2" opacity="0.6"/>
  <line x1="110" y1="87" x2="80" y2="102" stroke="#1565c0" stroke-width="2" opacity="0.6"/>
  <text x="110" y="138" text-anchor="middle" fill="#555" font-size="11">최대 합 = 7+8+1+7 = 23</text>
`);

// RGB거리 (id: Q5MtLkpPTD4ofiXQ96eAh)
const svg_RGB거리 = svgWrap(300, 110, `
  <!-- 5 houses with R/G/B colors, adjacent different -->
  ${[0,1,2,3,4].map((i) => {
    const x = 20 + i * 54;
    const colors = ['#ef5350','#66bb6a','#42a5f5','#ef5350','#66bb6a'];
    const labels = ['R','G','B','R','G'];
    return `<rect x="${x}" y="20" width="40" height="50" rx="4" fill="${colors[i]}" opacity="0.85"/>
  <text x="${x+20}" y="51" text-anchor="middle" fill="white" font-weight="bold" font-size="16">${labels[i]}</text>
  <text x="${x+20}" y="88" text-anchor="middle" fill="#333" font-size="11">집 ${i+1}</text>`;
  }).join('\n')}
  <text x="150" y="108" text-anchor="middle" fill="#555" font-size="11">인접한 집은 서로 다른 색</text>
`);

// 스티커 (id: OO9uG4R3_2tsoZ0ukaPqS)
const svg_스티커 = svgWrap(320, 110, `
  <!-- 2×7 sticker grid, highlight one selection pattern -->
  ${[0,1,2,3,4,5,6].map((c) => {
    const vals = [[6,3,2,5,4,5,3],[3,6,7,2,8,1,3]];
    // highlight pattern: row0 cols 0,2,4,6 and row1 col ... show via color
    const hiR0 = [0,2,5].includes(c);
    const hiR1 = [1,3,4,6].includes(c);
    return [0,1].map((r) => {
      const x = 10 + c * 43;
      const y = 10 + r * 42;
      const hi = (r === 0 && hiR0) || (r === 1 && hiR1);
      return `<rect x="${x}" y="${y}" width="36" height="34" rx="3" fill="${hi ? '#e3f2fd' : '#f5f5f5'}" stroke="#bbb" stroke-width="1"/>
  <text x="${x+18}" y="${y+22}" text-anchor="middle" fill="${hi ? '#1565c0' : '#555'}" font-weight="${hi ? 'bold' : 'normal'}">${vals[r][c]}</text>`;
    }).join('\n');
  }).join('\n')}
  <text x="160" y="103" text-anchor="middle" fill="#555" font-size="11">2×N 스티커 — 인접 행·열 동시 선택 불가</text>
`);

// 0-1 배낭 문제 (id: nKyt4xMjHKFPGRxwr4lkl)
const svg_배낭 = svgWrap(300, 140, `
  <!-- items table + knapsack icon -->
  <!-- header -->
  <rect x="10" y="10" width="70" height="24" fill="#1565c0" rx="2"/>
  <rect x="80" y="10" width="70" height="24" fill="#1565c0" rx="2"/>
  <rect x="150" y="10" width="70" height="24" fill="#1565c0" rx="2"/>
  <text x="45" y="27" text-anchor="middle" fill="white" font-size="12">아이템</text>
  <text x="115" y="27" text-anchor="middle" fill="white" font-size="12">무게</text>
  <text x="185" y="27" text-anchor="middle" fill="white" font-size="12">가치</text>
  ${[[1,2,6],[2,3,9],[3,4,5],[4,5,12]].map(([item,w,v],i) => {
    const y = 34 + i * 24;
    const bg = i % 2 === 0 ? '#f5f5f5' : '#e3f2fd';
    return `<rect x="10" y="${y}" width="70" height="24" fill="${bg}"/>
  <rect x="80" y="${y}" width="70" height="24" fill="${bg}"/>
  <rect x="150" y="${y}" width="70" height="24" fill="${bg}"/>
  <text x="45" y="${y+16}" text-anchor="middle" fill="#333">${item}</text>
  <text x="115" y="${y+16}" text-anchor="middle" fill="#333">${w}</text>
  <text x="185" y="${y+16}" text-anchor="middle" fill="#333">${v}</text>`;
  }).join('\n')}
  <!-- knapsack symbol -->
  <rect x="235" y="30" width="55" height="65" rx="8" fill="#fff9c4" stroke="#f9a825" stroke-width="2"/>
  <text x="262" y="60" text-anchor="middle" fill="#f57f17" font-size="20">W≤7</text>
  <text x="262" y="82" text-anchor="middle" fill="#555" font-size="11">용량 W</text>
  <text x="150" y="134" text-anchor="middle" fill="#555" font-size="11">각 아이템은 넣거나(1) 빼거나(0)</text>
`);

// 가장 큰 정사각형 (id: s4Djk1DWX1KhERSiBcvai)
const svg_정사각형 = svgWrap(200, 180, `
  <!-- 4×5 binary grid with largest square highlighted -->
  ${(() => {
    const grid = [
      [1,0,1,1,0],
      [1,1,1,1,1],
      [0,1,1,1,0],
      [1,1,1,1,1],
    ];
    // 3×3 square at row1,col1
    let out = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const x = 10 + c * 36;
        const y = 10 + r * 36;
        const inSquare = r >= 1 && r <= 3 && c >= 1 && c <= 3;
        const fill = grid[r][c] === 0 ? '#fff' : (inSquare ? '#e3f2fd' : '#f5f5f5');
        const stroke = inSquare ? '#1565c0' : '#bbb';
        const sw = inSquare ? '2' : '1';
        out += `<rect x="${x}" y="${y}" width="30" height="30" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="2"/>
  <text x="${x+15}" y="${y+20}" text-anchor="middle" fill="${grid[r][c] === 0 ? '#ccc' : '#333'}">${grid[r][c]}</text>\n`;
      }
    }
    out += `<text x="100" y="168" text-anchor="middle" fill="#1565c0" font-size="11">3×3 최대 정사각형</text>`;
    return out;
  })()}
`);

// 최소 경로 합 그리드 (id: 5T9bdE-WfLE4bPoF5_J7F)
const svg_최소경로합 = svgWrap(200, 180, `
  <!-- 4×4 grid with minimum path highlighted -->
  ${(() => {
    const grid = [[1,3,1,2],[2,1,3,1],[4,2,1,3],[3,1,2,1]];
    const path = [[0,0],[0,1],[1,1],[2,1],[2,2],[3,2],[3,3]]; // one optimal path
    const pathSet = new Set(path.map(([r,c]) => `${r},${c}`));
    let out = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = 10 + c * 44;
        const y = 10 + r * 40;
        const inPath = pathSet.has(`${r},${c}`);
        out += `<rect x="${x}" y="${y}" width="38" height="34" fill="${inPath ? '#e3f2fd' : '#f5f5f5'}" stroke="${inPath ? '#1565c0' : '#bbb'}" stroke-width="${inPath ? 2 : 1}" rx="2"/>
  <text x="${x+19}" y="${y+22}" text-anchor="middle" fill="${inPath ? '#1565c0' : '#555'}" font-weight="${inPath ? 'bold' : 'normal'}">${grid[r][c]}</text>\n`;
      }
    }
    // draw arrows along path
    for (let i = 0; i < path.length - 1; i++) {
      const [r1,c1] = path[i], [r2,c2] = path[i+1];
      const x1 = 10 + c1*44 + 19, y1 = 10 + r1*40 + 17;
      const x2 = 10 + c2*44 + 19, y2 = 10 + r2*40 + 17;
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1565c0" stroke-width="1.5" opacity="0.5" marker-end="url(#arr)"/>\n`;
    }
    out += `<text x="100" y="172" text-anchor="middle" fill="#555" font-size="11">좌상→우하 최소 경로</text>`;
    return out;
  })()}
`);

// 금광 문제 (id: IL5uFtXtr6151OtILsulv)
const svg_금광 = svgWrap(240, 160, `
  <!-- 4×4 gold mine grid, movement arrows right/right-up/right-down -->
  ${(() => {
    const grid = [[1,3,3,2],[2,1,4,1],[0,6,4,7],[4,2,2,0]];
    let out = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = 10 + c * 54;
        const y = 10 + r * 36;
        out += `<rect x="${x}" y="${y}" width="46" height="30" fill="#fff9c4" stroke="#f9a825" stroke-width="1" rx="3"/>
  <text x="${x+23}" y="${y+20}" text-anchor="middle" fill="#333">${grid[r][c]}</text>\n`;
      }
    }
    // show movement arrows from col 0 to col 1 (right, right-up, right-down)
    const cx0 = 10 + 0*54 + 23, cy1 = 10 + 1*36 + 15;
    out += `<line x1="${cx0}" y1="${cy1}" x2="${10+1*54+5}" y2="${10+0*36+15}" stroke="#1565c0" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
    out += `<line x1="${cx0}" y1="${cy1}" x2="${10+1*54+5}" y2="${10+1*36+15}" stroke="#1565c0" stroke-width="1.5" opacity="0.9"/>`;
    out += `<line x1="${cx0}" y1="${cy1}" x2="${10+1*54+5}" y2="${10+2*36+15}" stroke="#1565c0" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>`;
    out += `<text x="120" y="152" text-anchor="middle" fill="#555" font-size="11">오른쪽·오른쪽 위·오른쪽 아래로 이동</text>`;
    return out;
  })()}
`);

// LCS (id: AGmM_hHGFp6_sWrphE1h0)
const svg_LCS = svgWrap(280, 180, `
  <!-- LCS DP table for ABCB vs BCB -->
  ${(() => {
    const A = ['', 'A','B','C','B'];
    const B = ['', 'B','C','B'];
    const dp = [[0,0,0,0],[0,0,0,0],[0,1,1,1],[0,1,2,2],[0,1,2,3]];
    let out = '';
    const cw = 46, ch = 36;
    for (let r = 0; r <= 4; r++) {
      for (let c = 0; c <= 3; c++) {
        const x = 10 + c * cw;
        const y = 10 + r * ch;
        const isHeader = r === 0 || c === 0;
        const val = isHeader ? (r === 0 ? (c === 0 ? '' : B[c]) : (c === 0 ? A[r] : '')) : dp[r][c];
        const hi = !isHeader && dp[r][c] > dp[r-1][c] && dp[r][c] > dp[r][c-1];
        out += `<rect x="${x}" y="${y}" width="${cw-2}" height="${ch-2}" fill="${isHeader ? '#1565c0' : (hi ? '#e3f2fd' : '#f5f5f5')}" stroke="#bbb" stroke-width="0.5" rx="2"/>
  <text x="${x+(cw-2)/2}" y="${y+(ch-2)/2+5}" text-anchor="middle" fill="${isHeader ? 'white' : (hi ? '#1565c0' : '#555')}" font-weight="${hi ? 'bold' : 'normal'}">${val}</text>\n`;
      }
    }
    out += `<text x="104" y="174" text-anchor="middle" fill="#555" font-size="11">LCS("ABCB","BCB") = 3 ("BCB")</text>`;
    return out;
  })()}
`);

// 편집 거리 (id: 3CQuXovkhQYDAVGCjr8An)
const svg_편집거리 = svgWrap(280, 180, `
  <!-- Edit distance DP table for "kitten" vs "sitting" — use short example "abc" vs "ac" -->
  ${(() => {
    const s1 = ['','a','b','c'];
    const s2 = ['','a','c'];
    const dp = [[0,1,2,3],[1,0,1,2],[2,1,1,2],[3,2,2,2]]; // reversed for "ac" vs "abc"
    // Actually let's do s1=abc (rows), s2=ac (cols)
    let out = '';
    const cw = 58, ch = 36;
    for (let r = 0; r <= 3; r++) {
      for (let c = 0; c <= 3; c++) {
        const x = 14 + c * cw;
        const y = 10 + r * ch;
        const isHeader = r === 0 || c === 0;
        const val = isHeader ? (r === 0 ? (c === 0 ? '' : s1[c]) : (c === 0 ? s2[r] : '')) : dp[r][c];
        out += `<rect x="${x}" y="${y}" width="${cw-2}" height="${ch-2}" fill="${isHeader ? '#37474f' : '#f5f5f5'}" stroke="#bbb" stroke-width="0.5" rx="2"/>
  <text x="${x+(cw-2)/2}" y="${y+(ch-2)/2+5}" text-anchor="middle" fill="${isHeader ? 'white' : '#555'}">${val}</text>\n`;
      }
    }
    out += `<text x="130" y="148" text-anchor="middle" fill="#555" font-size="11">"abc" → "ac" 편집 거리 = ${dp[3][3]}</text>`;
    out += `<text x="130" y="165" text-anchor="middle" fill="#888" font-size="10">삽입·삭제·교체 각 비용 1</text>`;
    return out;
  })()}
`);

// 타일 채우기 (id: kgSnSywnRNZdwuQOI9zTt)
const svg_타일채우기 = svgWrap(300, 130, `
  <!-- 2×6 grid showing tile placement options -->
  <!-- label -->
  <text x="150" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">2×N 타일 채우기 방법</text>
  <!-- Option A: all vertical -->
  ${[0,1,2].map((i) => `
  <rect x="${10+i*36}" y="22" width="30" height="70" rx="3" fill="#e3f2fd" stroke="#1565c0" stroke-width="1.5"/>
  <text x="${10+i*36+15}" y="62" text-anchor="middle" fill="#1565c0" font-size="18">▮</text>`).join('')}
  <text x="64" y="108" text-anchor="middle" fill="#555" font-size="10">세로×3</text>
  <!-- divider -->
  <line x1="125" y1="20" x2="125" y2="100" stroke="#ccc" stroke-width="1"/>
  <!-- Option B: mixed vertical + horizontal pair -->
  <rect x="134" y="22" width="30" height="70" rx="3" fill="#e3f2fd" stroke="#1565c0" stroke-width="1.5"/>
  <rect x="170" y="22" width="66" height="32" rx="3" fill="#fff9c4" stroke="#f9a825" stroke-width="1.5"/>
  <rect x="170" y="60" width="66" height="32" rx="3" fill="#fff9c4" stroke="#f9a825" stroke-width="1.5"/>
  <text x="149" y="108" text-anchor="middle" fill="#555" font-size="10">세로+가로쌍</text>
  <text x="203" y="56" text-anchor="middle" fill="#f57f17" font-size="11">가로</text>
  <text x="203" y="80" text-anchor="middle" fill="#f57f17" font-size="11">가로</text>
  <!-- dp relation note -->
  <text x="150" y="122" text-anchor="middle" fill="#555" font-size="11">dp[n] = dp[n-1] + dp[n-2]</text>
`);

// 회의실 배정 (id: P5wQQP6nhVoMpzXLmRIt0)
const svg_회의실 = svgWrap(320, 160, `
  <!-- timeline of meetings, greedy selection highlighted -->
  <text x="160" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">회의 시간 타임라인</text>
  <!-- axis -->
  <line x1="20" y1="140" x2="300" y2="140" stroke="#333" stroke-width="1.5"/>
  ${[0,2,4,6,8,10].map((t) => `<line x1="${20+t*28}" y1="138" x2="${20+t*28}" y2="143" stroke="#333" stroke-width="1"/>
  <text x="${20+t*28}" y="155" text-anchor="middle" fill="#555" font-size="10">${t}</text>`).join('')}
  <!-- meetings: [1,4] [3,5] [0,6] [5,7] [3,8] [5,9] [6,10] [8,11] -->
  ${[
    {s:1,e:4,sel:true,y:30},
    {s:3,e:5,sel:false,y:50},
    {s:0,e:6,sel:false,y:70},
    {s:5,e:7,sel:true,y:30},
    {s:3,e:8,sel:false,y:90},
    {s:5,e:9,sel:false,y:110},
    {s:6,e:10,sel:false,y:50},
    {s:8,e:11,sel:true,y:30},
  ].map(({s,e,sel,y}) => {
    const x1 = 20 + s*28, x2 = 20 + e*28;
    return `<rect x="${x1}" y="${y}" width="${x2-x1}" height="14" rx="3" fill="${sel ? '#1565c0' : '#e0e0e0'}" opacity="${sel ? 0.9 : 0.6}"/>
  <text x="${(x1+x2)/2}" y="${y+10}" text-anchor="middle" fill="${sel ? 'white' : '#555'}" font-size="9">${s}~${e}</text>`;
  }).join('')}
  <text x="160" y="17" text-anchor="middle" fill="#1565c0" font-size="9">■ 선택된 회의</text>
`);

// 나무 자르기 / 랜선 자르기 binary search (ids: 1JDGBXvfd9FcuagCWSt9Z, LdgscZkndlvk5h_J_Ib5N)
const svg_이분탐색나무 = svgWrap(300, 150, `
  <!-- binary search visualization on answer space -->
  <text x="150" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">이분 탐색 (정답 탐색)</text>
  <!-- number line 0..20 -->
  <line x1="20" y1="80" x2="280" y2="80" stroke="#333" stroke-width="1.5"/>
  ${[0,5,10,15,20].map((v) => `<line x1="${20+v*13}" y1="78" x2="${20+v*13}" y2="84" stroke="#555" stroke-width="1"/>
  <text x="${20+v*13}" y="96" text-anchor="middle" fill="#555" font-size="10">${v}</text>`).join('')}
  <!-- lo, hi, mid markers -->
  <text x="20" y="68" text-anchor="middle" fill="#1565c0" font-size="11" font-weight="bold">lo</text>
  <line x1="20" y1="72" x2="20" y2="80" stroke="#1565c0" stroke-width="2"/>
  <text x="280" y="68" text-anchor="middle" fill="#e53935" font-size="11" font-weight="bold">hi</text>
  <line x1="280" y1="72" x2="280" y2="80" stroke="#e53935" stroke-width="2"/>
  <text x="150" y="55" text-anchor="middle" fill="#388e3c" font-size="11" font-weight="bold">mid</text>
  <line x1="150" y1="60" x2="150" y2="80" stroke="#388e3c" stroke-width="2"/>
  <circle cx="150" cy="80" r="5" fill="#388e3c"/>
  <!-- condition labels -->
  <text x="85" y="118" text-anchor="middle" fill="#1565c0" font-size="10">mid 너무 크다 → hi=mid</text>
  <text x="215" y="118" text-anchor="middle" fill="#e53935" font-size="10">mid 충분 → lo=mid+1</text>
  <text x="150" y="138" text-anchor="middle" fill="#555" font-size="11">조건 만족하는 최대 mid 탐색</text>
`);

const svg_이분탐색랜선 = svgWrap(300, 150, `
  <!-- cable cutting binary search -->
  <text x="150" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">랜선 자르기 이분 탐색</text>
  <!-- 3 cables of different lengths -->
  ${[[802,30],[743,55],[457,80]].map(([len,y],i) => {
    const w = Math.round(len / 4);
    return `<rect x="20" y="${y}" width="${w}" height="16" rx="3" fill="#e3f2fd" stroke="#1565c0" stroke-width="1"/>
  <text x="${20+w+6}" y="${y+12}" fill="#333" font-size="10">${len}cm</text>`;
  }).join('')}
  <text x="150" y="115" text-anchor="middle" fill="#555" font-size="11">mid 길이로 자르면 몇 개?</text>
  <text x="150" y="132" text-anchor="middle" fill="#555" font-size="11">개수 ≥ K → 길이 늘려봄 (lo=mid+1)</text>
  <text x="150" y="147" text-anchor="middle" fill="#555" font-size="11">개수 &lt; K → 길이 줄임 (hi=mid-1)</text>
`);

// 공유기 설치 (id: eZmoThkFJXtXTbWgqn1aq)
const svg_공유기 = svgWrap(300, 130, `
  <!-- houses on number line, routers placed -->
  <text x="150" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">공유기 설치 — 최대 간격 이분 탐색</text>
  <line x1="20" y1="75" x2="280" y2="75" stroke="#555" stroke-width="1.5"/>
  <!-- house positions: 1,2,4,8,9 -->
  ${[1,2,4,8,9].map((pos) => {
    const x = 20 + (pos-1)*29;
    return `<rect x="${x-12}" y="55" width="24" height="20" rx="3" fill="#f5f5f5" stroke="#bbb"/>
  <text x="${x}" y="69" text-anchor="middle" fill="#555" font-size="10">${pos}</text>`;
  }).join('')}
  <!-- routers at 1, 4, 9 (D=3 apart) -->
  ${[1,4,9].map((pos) => {
    const x = 20 + (pos-1)*29;
    return `<circle cx="${x}" cy="75" r="7" fill="#1565c0" opacity="0.85"/>
  <text x="${x}" y="79" text-anchor="middle" fill="white" font-size="9">R</text>`;
  }).join('')}
  <!-- distance arrows -->
  <line x1="20" y1="90" x2="${20+3*29}" y2="90" stroke="#1565c0" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="${20+1.5*29}" y="103" text-anchor="middle" fill="#1565c0" font-size="10">D=3</text>
  <line x1="${20+3*29}" y1="90" x2="${20+8*29}" y2="90" stroke="#1565c0" stroke-width="1" stroke-dasharray="3,2"/>
  <text x="${20+5.5*29}" y="103" text-anchor="middle" fill="#1565c0" font-size="10">D=5</text>
  <text x="150" y="122" text-anchor="middle" fill="#555" font-size="11">인접 공유기 간격 최솟값을 최대화</text>
`);

// 가장 가까운 두 점 (id: 7Ln_LMoNmodIdS5NRaOW_)
const svg_가까운두점 = svgWrap(260, 200, `
  <!-- scatter plot with closest pair highlighted -->
  <text x="130" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">가장 가까운 두 점</text>
  <!-- axes -->
  <line x1="30" y1="170" x2="240" y2="170" stroke="#aaa" stroke-width="1"/>
  <line x1="30" y1="170" x2="30" y2="20" stroke="#aaa" stroke-width="1"/>
  <!-- points -->
  ${[
    {x:60,y:140,label:'A'},{x:100,y:80,label:'B'},{x:115,y:90,label:'C'},
    {x:160,y:130,label:'D'},{x:190,y:50,label:'E'},{x:70,y:50,label:'F'},
  ].map(({x,y,label}) => {
    const closest = label === 'B' || label === 'C';
    return `<circle cx="${x}" cy="${y}" r="5" fill="${closest ? '#e53935' : '#1565c0'}" opacity="0.8"/>
  <text x="${x+8}" y="${y-4}" fill="${closest ? '#e53935' : '#555'}" font-size="10">${label}</text>`;
  }).join('')}
  <!-- line between B and C -->
  <line x1="100" y1="80" x2="115" y2="90" stroke="#e53935" stroke-width="2"/>
  <text x="107" y="72" text-anchor="middle" fill="#e53935" font-size="10" font-weight="bold">최소 거리</text>
  <!-- divide line -->
  <line x1="135" y1="20" x2="135" y2="170" stroke="#888" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="135" y="185" text-anchor="middle" fill="#888" font-size="10">분할선</text>
`);

// N-Queen (id: NTIQiQQeWZuuSDiW_hRgm)
const svg_NQueen = svgWrap(220, 220, `
  <!-- 5×5 board with one valid queen placement -->
  <text x="110" y="14" text-anchor="middle" fill="#333" font-size="12" font-weight="bold">N-Queen (N=5)</text>
  ${(() => {
    // one valid solution for 5-queen: cols = [1,3,0,2,4] (0-indexed)
    const queens = [1,3,0,2,4];
    let out = '';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const x = 10 + c * 40;
        const y = 20 + r * 38;
        const isQueen = queens[r] === c;
        const isDark = (r + c) % 2 === 1;
        out += `<rect x="${x}" y="${y}" width="36" height="34" fill="${isQueen ? '#e3f2fd' : (isDark ? '#e0e0e0' : '#f5f5f5')}" stroke="${isQueen ? '#1565c0' : '#bbb'}" stroke-width="${isQueen ? 2 : 0.5}"/>`;
        if (isQueen) {
          out += `<text x="${x+18}" y="${y+24}" text-anchor="middle" fill="#1565c0" font-size="20">♛</text>`;
        }
      }
    }
    out += `<text x="110" y="215" text-anchor="middle" fill="#555" font-size="10">같은 행·열·대각선 배치 금지</text>`;
    return out;
  })()}
`);

// ---------------------------------------------------------------------------
// Problem map: id → { title, svgBlock, placement }
// placement: 'prepend' = add SVG before the first ## section
// ---------------------------------------------------------------------------

const PROBLEMS = [
  { id: '0X0SXMV_2uXPkURNTl_sE', title: '정수 삼각형',       svg: svg_정수삼각형 },
  { id: 'Q5MtLkpPTD4ofiXQ96eAh', title: 'RGB거리',           svg: svg_RGB거리 },
  { id: 'OO9uG4R3_2tsoZ0ukaPqS', title: '스티커',             svg: svg_스티커 },
  { id: 'nKyt4xMjHKFPGRxwr4lkl', title: '0-1 배낭 문제',     svg: svg_배낭 },
  { id: 's4Djk1DWX1KhERSiBcvai', title: '가장 큰 정사각형',   svg: svg_정사각형 },
  { id: '5T9bdE-WfLE4bPoF5_J7F', title: '최소 경로 합 (그리드)', svg: svg_최소경로합 },
  { id: 'IL5uFtXtr6151OtILsulv', title: '금광 문제',          svg: svg_금광 },
  { id: 'AGmM_hHGFp6_sWrphE1h0', title: 'LCS',               svg: svg_LCS },
  { id: '3CQuXovkhQYDAVGCjr8An', title: '편집 거리',          svg: svg_편집거리 },
  { id: 'kgSnSywnRNZdwuQOI9zTt', title: '타일 채우기 (2×N)', svg: svg_타일채우기 },
  { id: 'P5wQQP6nhVoMpzXLmRIt0', title: '회의실 배정',        svg: svg_회의실 },
  { id: '1JDGBXvfd9FcuagCWSt9Z', title: '나무 자르기',        svg: svg_이분탐색나무 },
  { id: 'LdgscZkndlvk5h_J_Ib5N', title: '랜선 자르기',       svg: svg_이분탐색랜선 },
  { id: 'eZmoThkFJXtXTbWgqn1aq', title: '공유기 설치',        svg: svg_공유기 },
  { id: '7Ln_LMoNmodIdS5NRaOW_', title: '가장 가까운 두 점', svg: svg_가까운두점 },
  { id: 'NTIQiQQeWZuuSDiW_hRgm', title: 'N-Queen',           svg: svg_NQueen },
];

function insertSvgAfterIntro(description, svgBlock) {
  // Insert SVG after the first paragraph (before first ## heading)
  const firstHeading = description.indexOf('\n## ');
  if (firstHeading === -1) {
    return description + '\n' + svgBlock;
  }
  return description.slice(0, firstHeading) + '\n' + svgBlock + description.slice(firstHeading);
}

async function main() {
  console.log(`Processing ${PROBLEMS.length} problems...\n`);

  for (const { id, title, svg } of PROBLEMS) {
    process.stdout.write(`[${title}] fetching... `);
    const problem = await getDescription(id);
    const currentDesc = problem.description;

    // Skip if SVG already embedded
    if (currentDesc.includes('<svg')) {
      console.log('already has SVG, skipping.');
      continue;
    }

    const newDesc = insertSvgAfterIntro(currentDesc, svg);
    process.stdout.write('patching... ');
    const status = await patchDescription(id, newDesc);
    console.log(`status ${status}`);

    // Rate limit: 500ms between patches
    await sleep(500);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
