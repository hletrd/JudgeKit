# 학생 관점 리뷰 — 2026-05-18

전일 리뷰(`../2026-05-17-multi-perspective/01-student.md`) 이후 델타. 어제 짚은 이슈 대부분은 그대로 남았고, 오늘 새로 발견한 게 일부 더해졌어요.

## 어제 → 오늘 fix 추적

| 어제 짚은 이슈 | 오늘 상태 |
|---|---|
| 학생이 다른 학생 제출 메타데이터를 `/submissions` 목록에서 볼 수 있음 | ✅ 오늘 fix (non-staff scope: own OR public-problem 만) |
| 공개 문제 `accepted-solutions`로 대회 제출 코드 누수 | ✅ 오늘 fix (`assignmentId IS NULL` 필터) |
| 일반 제출 → 단일 활성 과제 자동 라우팅 안 됨 | ✅ 오늘 fix |
| 리더보드에서 totalScore=0 행 이름 셀만 검정 | ✅ 오늘 fix |
| 문제 디스플레이 카드 상단 패딩 과다 | ✅ 오늘 fix |

## 여전히 남은 이슈 (어제와 동일)

### 🔴 서버 측 드래프트 복원 부재 (High)
`code_snapshots`는 쓰기만 있고 학생 화면 읽기 API 없음. 시험 중 노트북·브라우저 사고 한 번에 작업 분실.

### 🟡 hidden·non-WA 케이스 피드백 부족 (Med)
TLE/MLE/RE 시 출력 자체가 안 보임.

### 🟡 "실패 케이스만 보기" 필터 / Codeforces 스타일 스트라이프 (Med)
100케이스 펼치는 현재 UI는 모바일에서 못 씀.

### 🟡 재채점·이의 제기 학생 흐름 (Med)
"이 채점 이상해요" 티켓 모델 없음.

### 🟡 일반 과제 마감 카운트다운 (Med)
windowed exam 외엔 카운트다운 부재.

### 🟡 모바일 사용성 (Med, mobile-only 학생엔 High)
모바일 키보드 보조 바, 분할 레이아웃 미지원. `mobile-layout.spec.ts`는 있지만 인터랙션 검증은 부족.

### 🟡 접근성 (Med, ADA/PIPA 리스크)
skip-link, focus-trap, `<html lang>` 누락은 그대로.

## 오늘 새로 본 학생 측 이슈

### 🟡 자기 제출 ↔ 동일 문제 다른 사람의 공개 AC 코드 비교 학습 흐름 부재 (Low)
practice 문제의 `accepted-solutions` 탭이 학습용으로 유용한데, 권한 없는 사용자에겐 안 보임 (좋은 보안 결정). 대신 "내 AC vs 짧은 AC", "내 시간 vs 최고 기록" 같은 익명 비교 학습 위젯이 있으면 좋겠어요.

### 🟢 채점 결과 폴링이 가끔 끊김 (Low, 운영 측면)
오늘 14h silent fail 사고로 보면, 학생이 "내 제출이 채점 안 됨"을 인지할 채널이 약해요. judge end-to-end health 모니터링이 학생 측 UI에도 반영되면 좋겠음 — "지금 채점 시스템에 문제가 있어요" 배너 등.

## Show-stopper 후보 (어제와 동일)

- **서버 드래프트 복원** — 시험 중 한 번이라도 분실 사고 나면 신뢰 회복 어려움.

## 검증 측면

- 단위/컴포넌트 테스트가 오늘 추가 fix들에 대해 회귀 방지 잘 되고 있음 (2,429 + 221 통과).
- e2e `student-submission-flow.spec.ts`가 제출 흐름 cover.
- **공개 페이지 전체 크롤 테스트** 부재 — 오늘 fix한 `/submissions` 스코프 같은 게 회귀해도 자동 검출 안 됨. 따로 spec 추가가 좋음 (Option B 작업으로 추가 예정).
