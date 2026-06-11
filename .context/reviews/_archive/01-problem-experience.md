# 01. 문제 열람 & 제출 경험 (v3 — 정정판)

## 문제 카탈로그 (`/practice`) — ★★★★☆

### 실제로 있는 기능들 (v2가 놓친 것)

**통합 검색이 있다.** `practice/page.tsx:163`에서 제목, 문제 내용(description), 문제 번호 모두 검색된다. 검색 결과에 "matched by title", "matched by content" 등 매치 종류 표시도 된다. v2가 "제목만 검색된다"고 한 것은 **사실과 다르다**.

**태그 필터가 있다.** `practice/page.tsx:157-164`에서 SQL EXISTS 쿼리로 태그 기반 필터링.

**난이도 범위 필터가 있다!** `difficulty-range-filter.tsx` — min/max 듀얼 셀렉트 컴포넌트. "난이도 3~7만 보기"가 가능하다. v2가 "범위 필터가 없다"고 한 것은 **사실과 다르다**.

**정렬이 4가지.** 번호순(기본), 난이도 오름/내림차순, 정답률순, 최신순.

**Solved/Attempted/Untried 구분 + 필터.** 상태 표시뿐 아니라 상태로 필터링도 가능하다. "안 푼 문제만 보기"가 된다. v2가 "필터가 명확하지 않다"고 했으나 실제로 작동한다.

**문제집(Problem Sets)이 있다!** `/practice/sets/`에 전체 시스템이 구현되어 있다. 목록, 상세, 대시보드에서 CRUD 관리. v2가 "문제집 기능이 없다"고 한 것은 **사실과 다르다**.

**정답률 색상 코딩, 난이도 뱃지 컬러 코딩** 모두 잘 되어 있다.

### BOJ와의 비교

| 기능 | BOJ | JudgeKit | 판정 |
|------|-----|----------|------|
| 문제 검색 | 통합 | 통합(번호+제목+내용) | **동급** |
| 알고리즘 분류 필터 | O | O (태그) | 동급 |
| 난이도 필터 | solved.ac 필요 | **내장** (범위 필터) | **JudgeKit 우세** |
| 난이도 정렬 | solved.ac 필요 | **내장** | **JudgeKit 우세** |
| Solved/Unsolved | O | O (필터 포함) | 동급 |
| 정답률 표시 | O | O (색상 코딩) | 동급 |
| 문제집 | O (solved.ac) | **O (내장)** | **v2 정정: JudgeKit에도 있음** |

---

## 문제 상세 페이지 (`/practice/problems/[id]`) — ★★★★☆

### 실제로 있는 기능들 (v2가 놓친 것)

**5개 탭이 다 있다.**
1. **문제** — 마크다운 렌더링, 구조화된 입출력 파싱, 수식(KaTeX), 코드 하이라이팅
2. **에디토리얼** — 관리자/강사 작성 해설
3. **맞은 사람 코드(Accepted Solutions)** — 최신/최단/최빠른 정렬, 언어 필터, 페이지네이션, 익명 옵션, 코드 뷰어
4. **내 제출** — 이 문제에 대한 제출 내역
5. **토론** — Questions/Solutions 분리, 투표

**문제 통계 패널.** 총 제출 수, 정답 수, 정답률, unique solver 수.

**유사 문제 추천.** 태그 교집합 기반. BOJ에도 없는 기능.

**문제 네비게이션.** 이전/다음 문제 sequence 기반 이동 + 키보드 N/P.

**Quick Submit(인라인 제출)이 있다!** `public-quick-submit.tsx` — "Submit Solution" 버튼 클릭 시 Dialog(데스크탑)/Sheet(모바일)로 즉시 제출 가능. 제출 후 submission 페이지로 리다이렉트. v2가 "P0 CRITICAL: 인라인 코드 제출이 없다"고 한 것은 **가장 큰 사실 오류**였다.

### 여전히 아쉬운 점

**1. 입출력 포맷의 구조적 구분이 약하다** (MEDIUM)
구조화된 파서(`problem-statement.ts`)가 "입력"/"출력"/"예제 입력"/"예제 출력"을 감지하지만, 이것은 마크다운 헤딩 기반이다. 문제 작성자가 제대로 포맷하지 않으면 작동하지 않는다. BOJ는 입력/출력/예제가 별도 스키마 필드다.

**2. 난이도 표시가 직관적이지 않다** (LOW)
0-10 소수점 → 티어 매핑은 있으나, 티어 이름(Bronze/Silver/Gold 등)이 리스트에서 바로 보이지 않고 숫자가 먼저 보인다.

---

## 코드 에디터 & 제출 — ★★★★☆ (v2에서 ★★★☆☆ 상향)

### 실제로 있는 기능들 (v2가 놓친 것)

**Ctrl+Enter / Cmd+Enter 제출 단축키** — 구현됨 (`code-editor.tsx:68-72`).

**전체화면 모드** — F11 토글, Esc로 복귀 (`code-editor.tsx:33-47`).

**언어별 템플릿 코드가 있다!** `code-templates.ts`에서 17개 언어 기본 템플릿 제공:
- C++: `#include <bits/stdc++.h>` + `ios_base::sync_with_stdio(false); cin.tie(nullptr)`
- Python/PyPy: `import sys; input = sys.stdin.readline` + `def main()`
- Java: `BufferedReader` + `StringTokenizer`
- Rust: `BufRead` + `BufWriter`
- Go: `bufio.NewReader` + `bufio.NewWriter` + `defer writer.Flush()`
- 기타 C, Kotlin, C#, Ruby, Swift, JS, TS, Pascal, PHP

**스마트 템플릿 교체.** `isTemplateLike()` 함수가 현재 코드가 템플릿과 동일한지 검사. 언어 변경 시 기존 코드가 템플릿이면 새 언어의 템플릿으로 자동 교체. 사용자가 작성한 코드는 보존.

v2가 "언어별 템플릿 코드가 없다. 매번 `#include <bits/stdc++.h>`를 쳐야 한다"고 한 것은 **사실과 다르다**.

**파일 업로드 제출이 있다.** `problem-submission-form.tsx`에 파일 업로드 버튼. 로컬 IDE에서 작성한 코드를 바로 로드.

**커스텀 stdin + Run 버튼이 있다.** 접히는 stdin 섹션 + "Run" 버튼으로 에디터에서 직접 실행. "Submit"은 전체 채점.

**상세 에러 피드백 설정이 있다.** `showDetailedResults`, `showRuntimeErrors`, `showCompileOutput` — 문제별 3개 토글. 제출 상세에서:
- WA: 실패한 테스트케이스 인덱스 표시
- TLE: 실행 시간 vs 시간 제한 비교 표시
- RE: 런타임 에러 종류 구분 (Segfault, Division by Zero, Stack Overflow 등)
- CE: 컴파일 에러 메시지 표시

v2가 "WA에서 어떤 케이스에서 틀렸는지 모름", "TLE에서 실제 시간 안 보여줌", "RE 종류 구분 안 함"이라고 한 것은 **사실과 다르다**. `showDetailedResults=true`(기본값)일 때 이 정보가 모두 표시된다.

### 여전히 아쉬운 점

**1. 사용자 커스텀 템플릿 저장이 없다** (P3)
기본 템플릿은 있지만, 사용자가 자신만의 템플릿을 저장하는 기능은 없다. BOJ의 "내 코드" 프리셋 같은 것.

**2. 자동완성/스니펫이 없다** (LOW)
CodeMirror 기반이지만 코드 스니펫 자동완성은 없다. `fori` → `for(int i=0; i<n; i++)` 같은 것. 경쟁 프로그래밍에서는 유용하지만 필수는 아니다.

---

## 플레이그라운드 (`/playground`) — ★★★★☆

### 장점
- **124개 언어 변형** 지원. BOJ(~60)의 2배.
- 언어 카테고리 분류 (C/C++, Python, JVM, Functional 등)
- 컴파일러 페이지에서 멀티 테스트케이스 탭 지원 (`compiler-client.tsx`)
- stdin 섹션 접기/펼치기
- Ctrl+Enter 실행, 출력 자동 스크롤

### 아쉬운 점
- 코드 저장/공유 URL 기능 없음
- 플레이그라운드에서는 멀티 테스트케이스가 불분명 (컴파일러 페이지에는 있음)

---

## 요약: v2 대비 정정 사항

| 항목 | v2 평가 | v3 정정 |
|------|---------|---------|
| 검색 | "제목만 (HIGH)" | **통합 (번호+제목+내용)** |
| 난이도 범위 필터 | "없다 (MEDIUM)" | **있다** |
| 안 푼 문제 필터 | "명확하지 않다" | **된다** |
| 문제집 | "없다 (MEDIUM)" | **있다 (전체 시스템)** |
| 인라인 제출 | "없음 (P0 CRITICAL)" | **있다 (Quick Submit)** |
| 템플릿 코드 | "미구현 (P1)" | **17개 언어 템플릿 + 스마트 교체** |
| 파일 업로드 | "불분명 (MEDIUM)" | **있다** |
| 커스텀 stdin | "불분명 (MEDIUM)" | **있다 (Run 버튼)** |
| 상세 에러 피드백 | "미구현 (P1)" | **있다 (문제별 3개 토글)** |
| 예제 복사 | "없다 (MEDIUM)" | **있다 (코드 블록 복사 버튼)** |
