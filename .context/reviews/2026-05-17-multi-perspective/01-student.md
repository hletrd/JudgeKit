# 학생 관점 리뷰 — 과제·시험을 받는 입장

리뷰 시점: 2026-05-17
대상 사용처: 정규 수업 과제, 정기 시험, 모의 대회 참여

## 잘 돌아가는 부분

- 제출 흐름은 PG advisory lock으로 동시 제출을 막아서 중복이나 경쟁 조건이 거의 없음 (`src/app/api/v1/submissions/route.ts:292`).
- 그룹 등록이 바뀌어도 본인의 과거 제출 이력은 그대로 보존됨 (`src/app/api/v1/submissions/route.ts:42-46`).
- 소스 코드 초안이 `(user, problem)` 단위로 `localStorage`에 7일간 자동 저장됨 (`src/hooks/use-source-draft.ts:8`).
- 가시 테스트 케이스에 한해 unified diff가 실제로 렌더링됨 (`src/components/submissions/output-diff-view.tsx`).

여기까지는 진짜 잘 만들었어요.

## 미흡하거나 빠진 기능

### 🔴 서버 측 드래프트 복원이 없음 (High)
`code_snapshots` 테이블은 매 키 입력마다 글자 수까지 기록하는데(`src/lib/db/schema.pg.ts:989-1014`), 정작 학생 화면에서 다시 읽어오는 API가 없어요. `POST /api/v1/code-snapshots`만 있고 `GET`은 빠져 있음(`src/app/api/v1/code-snapshots/route.ts`).
- **시나리오**: 시험 중 노트북 뚜껑이 닫히거나 브라우저가 죽으면, 다른 기기에서 로그인해도 작성 중이던 코드가 통째로 사라져요. localStorage에만 있기 때문.
- **수정**: `GET /api/v1/code-snapshots?problemId&assignmentId`로 본인 최신 스냅샷 반환. `problem-submission-form.tsx` mount 시 localStorage와 비교해 최신본을 띄우면 돼요.

### 🟡 hidden·non-WA 케이스 피드백 부족 (Med)
diff는 `status === "wrong_answer"` **이고** `testCase.isVisible`일 때만 그려져요(`src/app/(public)/submissions/[id]/page.tsx:152-154`). TLE·MLE·RE는 출력이 전혀 안 보이고, `showRuntimeErrors=false`면 `actualOutput`까지 null 처리.
- **시나리오**: TLE 났는데 어디서 무한 루프인지 가늠할 단서가 0. 가시 샘플에서도 출력 비교가 불가능.
- **수정**: `showRuntimeErrors=true`면 truncated stderr/stdout 노출. 가시 샘플은 verdict 무관하게 항상 side-by-side로 보여주기.

### 🟡 "실패한 케이스만 보기" 필터 없음 (Med)
제출 상세는 100개 테스트면 100줄을 그대로 펼쳐요. 모바일에서 못 써요. Codeforces처럼 빨강/초록 스트라이프 + "Failed only" 필터가 필요해요.

### 🟡 학생이 재채점·이의 제기 요청할 방법이 없음 (Med)
`submissions.rejudge`는 학생 권한 밖이고, 따로 "이 채점 이상해요" 티켓을 띄울 흐름이 없어요. 강사가 일일이 메신저로 받게 됩니다.
- **수정**: 제출 단위 경량 스레드(상태: open/resolved)와 강사 알림.

### 🟡 일반 과제 페이지에 마감 카운트다운이 안 보임 (Med)
`personalDeadline`은 windowed exam에서만 노출(`schema.pg.ts:371-392`). 일반 과제는 23:59:59에 제출 누르면 그 자리에서 `assignmentClosed`로 튕겨요.
- **수정**: `deadline != null`인 모든 과제에 카운트다운, 마감 30초 전 경고 배너.

### 🟡 모바일 사용성 매우 약함 (Med, 모바일만 쓰는 학생에겐 High)
CodeMirror 에디터는 모바일 키보드 보조 바(Tab, `{}`, 괄호) 없이 그대로 노출. 문제 설명과 에디터가 양분 레이아웃이라 좁은 화면에서는 모두 잘려요.
- **수정**: 모바일 전용 탭 레이아웃 + 코딩 도우미 바.

### 🟡 접근성 미흡 (Med, ADA/PIPA 리스크)
- skip-link 안 보임
- 다이얼로그 focus-trap 미흡
- 페이지별 `<html lang>` 주입 흔적 없음
- 에디터는 `aria-label`/`aria-readonly`만 설정(`src/components/code/code-surface.tsx:273-275`)

axe-core로 한 번 훑고 fix 필요해요.

### 🟢 "이 문제에 내 다른 제출" 표시가 에디터 진입 전에 없음 (Low)
`otherSubmissions`는 최대 20건, 상세에서만 노출(`page.tsx:108-131`). 에디터에서 "지난번 어떻게 풀었더라" 하려면 다른 탭을 열어야 함.

### 🟢 BOM·NUL 등 인코딩 처리 미검증 (Low)
size check(`route.ts:211`)는 있지만 BOM 제거나 NUL 거부가 없어요. 대부분 언어에선 무해하지만 latin1 가정 언어는 깨질 수 있음.

## 사용처별 영향

| 사용처 | 영향 | 비고 |
|---|---|---|
| 정규 과제 | 보통 | 카운트다운, 재채점 요청 흐름 필요 |
| 정기 시험 | **위험** | 서버 측 드래프트 복원 빠짐 → 분실 사고 발생 가능 |
| 대회 참가 | 보통 | 모바일 미지원, hidden 케이스 피드백 부족 |

## Show-stopper 후보

- **서버 드래프트 복원**. 시험에서 작업 분실 사고가 한 번이라도 나면 신뢰 회복이 어려워요.

## 작은 개선 묶음

- 같은 문제 본인 제출끼리 diff 비교(학습용으로 유용).
- 제출 상세에 "이 문제 모범 풀이 / 해설 펼치기" — 채점 이후 학습 동기 부여.
- 키보드 단축키 안내 패널(`?` 키).
