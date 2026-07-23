#!/usr/bin/env node
// Korean naturalization pass 2 - pages 1 & 2

const JUDGE_BASE = (process.env.JUDGE_BASE_URL || 'https://oj.auraedu.me').replace(/\/$/, '');
const JUDGE_KEY = process.env.JUDGE_API_KEY;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
const ANTHROPIC_BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const MODEL = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || 'claude-opus-4-5';

if (!JUDGE_KEY) { console.error('Need JUDGE_API_KEY'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Need ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN'); process.exit(1); }
console.log(`Base: ${ANTHROPIC_BASE}  Model: ${MODEL}`);

// Already patched in previous run (sequence numbers)
const ALREADY_DONE = new Set([540, 538, 536, 534, 533, 531]);

const SYSTEM_PROMPT = `당신은 한국어 알고리즘 문제 편집자다. 주어진 문제 설명을 개선하여 그대로 반환하라.

## 한국어 스타일 규칙 (하다체 통일)
- 종결어미: 동사 -ㄴ다/-는다, 형용사 -다, 명령/요구 -하라/-구하라/-출력하라
- "~하는 프로그램을 작성하시오" → "~구하라" 또는 "~출력하라"
- em dash(—), en dash(–), 가운뎃점(·) → 쉼표 또는 "및"
- "활용하다" → "쓰다", "수행하다" → "하다", "존재하다" → "있다"
- "다양한", "핵심적인", "혁신적인" 등 과장 형용사 삭제
- 이중 피동 제거: "보여지다" → "보이다", "만들어지게 되다" → "만들다"

## 내용 보강 규칙
- 문제 설명이 너무 짧으면(1-2문장) 정확히 무엇을 해야 하는지 더 상세히 설명한다
- 입력 형식: 몇 번째 줄에 무엇이 어떤 형식으로 오는지 정확히 명시
- 출력 형식: 구분자, 정밀도, 줄 수 등 명확히
- 제한(constraint) 섹션에 모든 변수 범위가 있는지 확인하고 누락 시 추가
- 엣지 케이스 명시 (N=0일 때, 같은 값일 때 등)
- 수학/알고리즘 개념이 비자명하면 한 줄 보충 설명 추가

## 형식 유지 (필수)
- 마크다운 구조(###, ##) 유지
- 입출력 예시 블록 내용 변경 금지
- 수식, 변수명 그대로 유지

개선된 문제 설명 텍스트만 반환하라. 다른 설명이나 감싸는 텍스트 없이 문제 설명 마크다운만 출력하라.`;

async function callClaude(title, description) {
  const body = {
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `문제 제목: ${title}\n\n현재 설명:\n${description}`
    }]
  };

  const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();
  return text;
}

async function fetchProblems(page) {
  const res = await fetch(`${JUDGE_BASE}/api/v1/problems?page=${page}&limit=50`, {
    headers: { 'Authorization': `Bearer ${JUDGE_KEY}` }
  });
  if (!res.ok) throw new Error(`Fetch page ${page} failed: ${res.status}`);
  return (await res.json()).data;
}

async function patchProblem(id, description) {
  const res = await fetch(`${JUDGE_BASE}/api/v1/problems/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${JUDGE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description })
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Fetching pages 1 and 2...');
  const [page1, page2] = await Promise.all([fetchProblems(1), fetchProblems(2)]);
  const problems = [...page1, ...page2];
  console.log(`Total: ${problems.length} problems`);

  let patched = 0, skipped = 0, alreadyDone = 0, errors = 0;

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];

    if (ALREADY_DONE.has(p.sequenceNumber)) {
      console.log(`[${i+1}/100] #${p.sequenceNumber} ${p.title} -- already done, skip`);
      alreadyDone++;
      continue;
    }

    process.stdout.write(`[${i+1}/100] #${p.sequenceNumber} ${p.title} ... `);

    try {
      const improved = await callClaude(p.title, p.description);

      if (improved.trim() === p.description.trim()) {
        console.log('no change');
        skipped++;
      } else {
        await patchProblem(p.id, improved);
        console.log('PATCHED');
        patched++;
      }
    } catch (e) {
      console.log(`ERROR: ${e.message.slice(0, 150)}`);
      errors++;
    }

    if ((i + 1) % 10 === 0 && i + 1 < problems.length) {
      await sleep(2000);
    } else {
      await sleep(400);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Patched:     ${patched}`);
  console.log(`No change:   ${skipped}`);
  console.log(`Pre-done:    ${alreadyDone}`);
  console.log(`Errors:      ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
