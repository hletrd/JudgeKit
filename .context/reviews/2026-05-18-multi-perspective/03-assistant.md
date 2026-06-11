# 조교(TA) 관점 리뷰 — 2026-05-18

## 어제 → 오늘 fix 추적

어제 짚은 TA 관련 이슈는 직접 fix된 것 없음. 단, instructor 권한 정리로 TA가 영향받는 부분:
- `submissions.view_all`이 가시 권한에서 제외됨 → TA는 어차피 없는 권한이라 영향 무.
- `/submissions` 목록의 visibility scope 제한 → TA는 그룹 instructor면 staff로 분류되어 view_all 처리. 영향 무.

## 여전히 남은 이슈

### 🟡 단건 재채점 라우트 그룹 스코프 명시적 재확인 부재 (Med, 보안)
`/api/v1/submissions/[id]/rejudge`는 `canAccessSubmission`만 호출. bulk는 `getSubmissionReviewGroupIds`로 명시 체크. 단건 경로에 같은 보강 권장.

### 🟡 TA 트리아지/큐 UI 부재 (Med, UX)
담당 그룹 across 미답변 클래리피케이션·수동 채점 대기 모아 보는 화면 없음. `/dashboard/ta` 같은 게 필요.

### 🟡 문제 초안 작성 권한 부재 (Low)
TA가 warmup 문제 초안 → 강사 검토 흐름 없음. `problems.draft` 캐퍼빌리티 신설 권장.

### 🟡 감사 로그 가시성 (Low)
TA는 그룹 owner 아니라 `audit-logs/route.ts:101` 쿼리에서 결과 0건.

## 오늘 새로 본 TA 측 이슈

### 🟡 시험 감독 모드 부재 (Med-High, 채용 평가에서 더 중요)
시험 중 TA가 화면 공유, 부정행위 신호 라이브 모니터링 같은 "감독" UI 부재. anti-cheat 대시보드는 사후 검토용이고, 라이브 alert·라이브 카메라 뷰 없음. 정통 시험 운영(IRL 감독관 + 온라인 채점)엔 충분하지만, 원격 시험 운영엔 부족.

### 🟡 TA의 그룹 across "내 담당 학생 전체" 뷰 부재 (Low)
한 TA가 여러 그룹의 조교일 때, "이번 주 내 담당 그룹 across 학생 진도" 같은 뷰 없음. 그룹별로 들어가서 봐야 함.

## 보안 메모 (어제 동일)

TA는 중간 권한 역할이라 IDOR/스코프 누수 사고가 일어나기 쉬워요. 오늘 IDOR fix 두 건은 학생 측이지 TA 측은 아니지만, 같은 패턴 점검 필요:
- 단건 라우트 전반(submissions, comments, anti-cheat)에서 그룹 스코프를 호출자 자체에서 한 번 더 확인

## Show-stopper

없음 — 기본 채점 보조 흐름은 충분.

## 추천 작업 순서

1. 단건 재채점 라우트 그룹 스코프 보강 (5~10분 패치)
2. `/dashboard/ta` 트리아지 페이지
3. `problems.draft` 캐퍼빌리티 + 초안 → 승인 흐름
4. (장기) 라이브 시험 감독 UI
