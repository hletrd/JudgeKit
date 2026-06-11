# 강사 관점 리뷰 — 수업·시험·대회를 운영하는 입장

리뷰 시점: 2026-05-17
대상 사용처: 정규 수업 운영, 중간/기말 시험, 사내 알고리즘 대회

## 잘 돌아가는 부분

- 과제 모델이 풍부함: `startsAt`, `deadline`, `lateDeadline`, `latePenalty`, `examMode`, `scoringModel`, `freezeLeaderboardAt`, `enableAntiCheat`, `anonymousLeaderboard` (`src/lib/db/schema.pg.ts:325-369`).
- 공동 강사·조교 1급 시민(`group_instructors` 테이블, `:226-248`).
- 성적 CSV 내보내기 구현됨(`src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts`).
- 지각 감점이 SQL에서 windowed exam `personalDeadline`까지 고려해서 계산됨(`src/lib/assignments/scoring.ts:142-160`).
- IOI/ICPC 양쪽 채점 모두 구현, ICPC 페널티 수식과 epsilon 기반 동점 처리까지 들어가 있음(`src/lib/assignments/contest-scoring.ts:201-443`).

## 미흡하거나 빠진 기능

### 🔴 개별 학생 마감 연장(편의 제공)이 없음 (High)
`src/lib/assignments`에 `extension|grantedDeadline` 검색 결과 0건. `assignment_extensions` 테이블도 없음. 진단서가 있거나 공식 결석이 있는 학생에게 과제 마감을 따로 줄 방법이 없어요. windowed exam은 `examDurationMinutes`만 있고 per-student override 없음.
- **수정**: `assignment_user_extensions(assignmentId, userId, deadline, lateDeadline)` 추가하고 `validateAssignmentSubmission`과 점수 CASE에서 참조.
- 학교 운영에서는 사실상 반드시 필요. DB 직접 수정으로 우회하는 건 운영자 입장에서 지속 가능하지 않음.

### 🔴 CSV 로스터 임포트가 없음 (High)
`src/app/api/v1/groups/[id]/members/bulk/route.ts`는 JSON `{userIds, usernames}`만 받음. email/name/student-id 컬럼이 있는 학생 명단을 직접 못 올림.
- **수정**: CSV 인제스트 엔드포인트 추가 → 계정 자동 생성(`users/bulk`) → 그룹 등록. 200명 클래스 한 번에 처리.
- 현재 운영자가 매 학기 별도 스크립트로 해야 하는 상태.

### 🔴 테스트 케이스가 첫 제출 이후 잠김 + 잠금 해제 권한이 `problems.delete` (Med-High)
`src/app/api/v1/problems/[id]/route.ts:87, :100-102`. 일반 강사 권한으로는 버그 있는 테스트 케이스를 못 고침. `allowLockedTestCases: true`는 all-or-nothing이라 일부 케이스만 수정도 불가능.
- **수정**: `problems.edit`에도 잠금 해제 허용 + 케이스별 수정 + 강제 재채점 prompt.

### 🟡 LMS(Canvas/Blackboard) 연동이 0 (Med-High)
전체 코드에서 `Canvas|Blackboard|LMS|LTI` 검색 0건. CSV는 `assignment-{title}-grades.csv`로 plain 출력.
- 한국 대학에서 e-class/LearnUs 가져가서 처리 가능하긴 한데, 컬럼 매핑이 수동.
- **수정**: Canvas-호환 CSV 토글(`"SIS User ID"` 컬럼 등) + 중장기적으로 LTI 1.3 grade passback.

### 🟡 그룹 전체 공지·이메일 발송 없음 (Med)
discussion thread는 있어도 그룹 단위 공지 → 등록 학생 메일 발송 흐름이 없음. `contestAnnouncements`는 대회 한정.
- **수정**: 그룹 announcement + 옵션 이메일 발송. nodemailer가 이미 deps에 있어서 추가만 하면 됨.

### 🟡 표절 검사가 트리아지 워크플로 없음 (Med)
`src/lib/assignments/code-similarity.ts`가 결과를 `antiCheatEvents` 행으로 기록(`:421`)하기는 함. 그런데 페어별로 false positive 표시, 강사 메모, 플래그 목록 CSV 내보내기 같은 검토 UI가 없음.
- **수정**: `code_similarity_reviews(pairId, status, note, reviewerId)` + 트리아지 테이블.

### 🟡 Bulk rejudge 50건 캡 (Med)
`src/app/api/v1/admin/submissions/rejudge/route.ts:14`. 300명 수업에서 테스트 케이스 고친 뒤 재채점하려면 6번 끊어서 눌러야 함.
- **수정**: `POST /assignments/[id]/rejudge` 추가, 백그라운드 처리 + 진행률 표시.

### 🟡 부분 채점(서브태스크), Special Judge, Interactive 문제 미지원 (Med-High)
- 서브태스크: 검색 0건.
- Special judge / checker: 검색 0건.
- Interactive: 검색 0건.
- `comparisonMode`는 worker(`judge-worker-rs/src/executor.rs:545`)에서 `exact`와 `float`만 처리.
- README는 "IOI scoring"이라고 명시하는데 IOI 표준 subtask 채점이 사실상 안 됨.
- **수정**: 서브태스크 그룹(`min` over group), 업로드 checker 바이너리 지원, interactive 모드(stdin/stdout 페어링).

### 🟡 과제 draft/preview 상태 없음 (Low-Med)
`visibility`는 `private|unlisted|public`인데 별도 publish 단계가 없음. 오타 있는 채로 바로 학생에게 노출됨.
- **수정**: `status = draft | published`를 visibility와 분리.

### 🟡 타임존이 시스템 전역 (Med)
`systemSettings.timeZone`은 전역(`:538`). 다국적 클래스에서 "마감은 23:59 Pacific" 같은 설정이 어려움. 학생은 항상 플랫폼 TZ로 마감을 봄.
- **수정**: 과제 또는 사용자 단위 TZ.

### 🟡 강사용 감사 로그 범위에 공동 강사 활동 누락 (Med)
`src/app/api/v1/admin/audit-logs/route.ts:73-148`의 `problemIds` 쿼리가 `eq(p.authorId, ctx.user.id)`(`:101`)로 잡힘. 공동 강사가 같은 문제를 편집해도 원 작성자의 감사 로그에 안 잡힘.

### 🟡 자동 채점 정확도 검증 도구가 없음 (Med, 대회 운영에 특히 중요)
강사가 새 문제 만들 때 본인 정답 코드로 시간/메모리 한계를 검증할 빌트인 도구가 없음. 외부 stress-test 스크립트(`stress-tests.mjs` 등) 의존.
- **수정**: 문제 편집 화면에 "정답 코드 업로드 → 모든 케이스 검증" 버튼.

### 🟢 문제 풀이 통계(어느 케이스에서 가장 많이 막혔는지) 누락 (Low)
contest analytics는 있지만 일반 과제용 per-test failure rate 통계가 없음. 강사 입장에서 "5번 케이스 잘못된 거 아냐?" 의심이 가도 시각화로 확인 안 됨.

## 대회 운영 관점 추가 이슈

### 🔴 Frozen leaderboard 자동 해제 없음 (High)
`src/lib/assignments/leaderboard.ts:57` — `freezeAt`이 지나면 학생 화면이 동결, 상한이 없음. 한 번 동결되면 그 화면이 영구로 박힘.
- **수정**: `freezeUntil` 필드 또는 `deadline + N분`에서 자동 해제.

### 🟡 클래리피케이션 푸시·알림 없음 (Med)
`isPublic=true` 답변(`:737`)도 SSE 없이 폴링. 학생들이 새로고침해야 봄.

### 🟡 ICPC 동점 처리 비표준 (Low, 문서화 필요)
`contest-scoring.ts:413-417`이 "earliest last AC"로 동점 처리. ICPC 공식은 lexicographic submission-time sequence. 코드포스 변형은 맞지만 어디까지나 변형. 문서화 권장.

### 🟢 첫 풀이 풍선·알림 피드 없음 (Low)
`firstAcAt`는 저장하지만 라이브 알림 채널이 없음.

### 🟡 시험/대회/팀 콘테스트 anti-cheat 프로파일 미분리 (Med)
같은 anti-cheat 모델이 적용되는데 ICPC 팀 대회는 IP·blur 이벤트가 정상 동작이라 false positive 폭주.
- **수정**: `assignment.antiCheatProfile = exam | contest | none`.

## 사용처별 영향

| 사용처 | 영향 |
|---|---|
| 정규 수업 | **위험** — CSV import, deadline extension 없음 |
| 시험 | 보통 — extension 빠지면 운영 부담 |
| 대회 | **위험** — frozen leaderboard 버그, subtask 미지원 |

## 추천 작업 순서 (강사 입장)

1. **개별 학생 마감 연장** — 학사 운영에 즉시 필요.
2. **CSV 로스터 임포트** — 학기 시작마다 손이 가는 부분.
3. **frozen leaderboard 자동 해제** — 다음 대회 전에 무조건.
4. **테스트 케이스 잠금 해제 권한 완화** — 문제 만든 강사가 직접 고칠 수 있게.
5. **bulk rejudge 캡 제거 / 과제 단위 rejudge**.
6. **서브태스크·special judge** — IOI 운영 광고하려면 필수.
7. **표절 트리아지 UI** — 점차 손 갈수록 필요.
