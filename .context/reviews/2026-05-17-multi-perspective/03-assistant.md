# 조교(TA) 관점 리뷰

리뷰 시점: 2026-05-17
대상 사용처: 수업 조교 운영(채점 지원, 1차 분류, 학생 응답)

## 잘 돌아가는 부분

- 조교 role이 1급 시민(`group_instructors.role = "ta"`). 그룹 단위 스코프 필터가 `src/lib/assignments/submissions.ts:154-179` `getSubmissionReviewGroupIds`에서 enforce돼요. 다른 그룹 제출은 못 봅니다.
- `submissions.view_source`, `submissions.comment`, `submissions.rejudge`가 `ASSISTANT_CAPABILITIES`에 포함(`src/lib/capabilities/defaults.ts:15-32`).
- `assignments.view_status`가 들어가서 group-scope 필터 트리거가 정상 동작.
- 의도적으로 `submissions.view_all`이 빠져 있어요 → 다른 그룹 데이터 누수 방지.

핵심 권한 모델 자체는 잘 설계됨.

## 미흡하거나 빠진 기능

### 🟡 단건 재채점 라우트의 그룹 스코프 점검 누락 가능성 (Med, 보안)
`src/app/api/v1/admin/submissions/rejudge/route.ts:25-46`(bulk)는 `getSubmissionReviewGroupIds`로 스코프 체크해요. 그런데 **단건 재채점** `src/app/api/v1/submissions/[id]/rejudge/route.ts:33`이 `canAccessSubmission`만 호출. 디테일 페이지에선 `:88-94`가 추가 스코프 체크를 하긴 하지만, 라우트 자체에서 명시적으로 다시 한 번 확인하는 게 안전.
- **수정**: 단건 라우트에서도 `getSubmissionReviewGroupIds(ctx.user)` 결과로 한 번 더 검증.

### 🟡 조교용 트리아지/큐 UI가 없음 (Med, UX)
- 클래리피케이션 답변은 `src/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]`에서 가능하지만, 본인 담당 그룹들 across 미답변 질문 모아 보는 화면이 없음.
- 수동 채점 대기 제출 모아 보는 큐도 없음.
- **수정**: `/dashboard/ta` 같은 경로에 본인 담당 그룹 전반의 대기 항목 모음.

### 🟡 문제 초안 작성 권한이 없음 (Low, 실무 흐름)
조교는 `problems.create|edit|delete` 권한이 의도적으로 없음. 그러나 실제 운영에서 조교가 워밍업 문제 초안을 만들어 강사 검토 받는 흐름이 흔해요.
- **수정**: `problems.draft` 권한 신설(생성하되 `visibility=private`로만 가능, 강사 승인 후 게시).

### 🟡 감사 로그 가시성 (Low, 부분 작동)
- 강사용 audit-log 뷰가 자기 자원 위주로 잡힘(`src/app/api/v1/admin/audit-logs/route.ts:73-148`). 조교는 그룹 소유자가 아니라 이 경로로는 결과가 비어 있을 가능성.
- 조교에게 본인 담당 그룹의 활동 로그(누가 어느 학생 채점 override 했는지 등)를 보여주는 별도 뷰가 필요할 수 있음.

### 🟢 학생 ↔ 조교 1:1 알림 채널 없음 (Low)
학생이 "이 채점 이상해요" 요청을 보낼 흐름이 없어요(학생 리뷰 참고). 그게 생기면 조교 측 알림/큐도 같이 따라가야 함.

## 사용처별 영향

| 사용처 | 영향 |
|---|---|
| 수업 조교 운영 | 보통 — 권한 모델은 OK, 워크플로 UI가 부족 |
| 시험 감독 조교 | 약함 — 부정행위 신호 트리아지 별도 화면 없음 |
| 대회 조교 | 보통 — 클래리피케이션·재채점은 되지만 흐름이 산만 |

## 추천 작업 순서

1. 단건 재채점 라우트에서 그룹 스코프 명시적 재확인 (5~10분 패치).
2. 본인 담당 그룹 across 트리아지 dashboard.
3. `problems.draft` 권한 + 초안→승인 흐름.
4. 학생 재채점 요청 큐 (학생 리뷰의 후속).

## 보안 메모

조교는 "학생보다는 권한 많고 강사보다는 적은" 중간 역할이라 IDOR/스코프 누수 사고가 일어나기 쉬워요. 단건 라우트 전반(submissions, comments, anti-cheat)에서 그룹 스코프를 두 번 체크하는 패턴 권장.
