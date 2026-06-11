# 조교(TA) 관점 리뷰 / 2026-05-21

## 핵심 결론

이 코드베이스에는 "조교"라 부를 수 있는 권한 표면이 **두 개** 있어요. 둘 다 일상 대화에선 "TA"라 부르겠지만 시스템 동작이 전혀 달라요:

1. **글로벌 역할 `users.role='assistant'`**: `roles` 테이블 + `DEFAULT_ROLE_CAPABILITIES` (src/lib/capabilities/defaults.ts:15-34)
2. **그룹 내 직책 `group_instructors.role='ta'`**: 그룹별 임명 (src/lib/db/schema.pg.ts:226-248)

설계 의도는 명백히 1번이 자격(역할), 2번이 배치(직책)인 것 같은데, 실제 라우트 게이트가 2번만 보거나, 둘 다 안 보고 `co_instructor`/owner만 허용하는 식이 섞여 있어서 capability set이 죽은 코드가 돼버렸어요.

핵심 발견 세 가지:

- **글로벌 `assistant` 역할 + 그룹 미배정 사람**은 사실상 student 수준. capability list에 `anti_cheat.view_events`, `submissions.rejudge`, `submissions.comment`, `anti_cheat.run_similarity`가 다 적혀 있어도 라우트가 안 봄. 그냥 휴면 상태인 placeholder 역할이에요. (src/lib/capabilities/defaults.ts:15-34 vs src/lib/assignments/management.ts:72-86)
- **글로벌 역할 student인데 그룹에서 `ta` 직책으로 임명된 사람**이 실질적 운영 모델로 보임. 그러면 submission 보기·코멘트·rejudge는 동작. 그러나 anti-cheat·similarity·participant-timeline·exam-sessions·overrides·clarifications 답변은 다 막힘.
- **다리 함수가 빠져 있어요.** `canManageContest`(src/lib/assignments/contests.ts:205-215)가 ta 직책을 인식 못 함. 이게 모든 contest 관리 라우트의 단일 게이트라서, ta가 라이브 시험 운영에 거의 아무 것도 못 함.

오늘 들어온 sandbox-gate.ts staff 분류는 1번 모델(글로벌 assistant)에만 도움이 되는데, 정작 그 역할이 보고 싶은 화면들은 다른 게이트가 다 막아요. 그래서 staff 분류 이득이 거의 없어요.

## 어제 → 오늘 델타

| 항목 | 2026-05-18 상태 | 2026-05-21 상태 |
|------|----------------|----------------|
| 단건 rejudge 그룹 스코프 명시 재확인 | 미흡 (`canAccessSubmission`만) | 미흡 (변함 없음). src/app/api/v1/submissions/[id]/rejudge/route.ts:33 |
| `/dashboard/ta` 트리아지 페이지 | 없음 | 여전히 없음 |
| `problems.draft` 캐퍼빌리티 | 없음 | 여전히 없음 |
| 라이브 감독 UI | 없음 | 여전히 없음 |
| audit-logs TA 가시성 | 0건 | 0건 (`system.audit_logs` cap 부재 + owner-scope 쿼리). src/app/api/v1/admin/audit-logs/route.ts:73-130 |
| 조교 그룹 across 통합 뷰 | 없음 | 여전히 없음 |
| sandbox-gate staff 분류 | 해당 없음 | **신규**: assistant도 staff로 인정, 이메일 verify 우회 (src/lib/security/sandbox-gate.ts:54-58) |
| anti-cheat heartbeat Origin 검사 | 미적용 | **신규**: production에서 Origin 헤더 강제 (src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79). 조교 워크플로에는 무영향 |
| 단건/벌크 rejudge 권한 비대칭 | 단건 `canAccessSubmission`만, 벌크 `getSubmissionReviewGroupIds` 명시 | 그대로 |
| 채용 후보자 로그인 차단 시점 | 검토 안 됨 | **신규**: 시험 deadline 이후 로그인 차단 (commit d677e96a). TA가 채용 시험 사후 검토할 때 후보자 본인 인터뷰가 불가능해진 영향. 후보자에게 결과를 보여줘야 할 시점에 후보자가 못 들어옴 |

새 변경 중 조교 워크플로에 직접 의미 있는 건 sandbox-gate 하나, 추가로 채용 후보자 로그인 차단이 간접 영향을 줘요. 안티치트 Origin 강화는 조교 측 영향 없음.

### 어제 권장 항목 처리 상태

- 단건 rejudge 라우트 그룹 스코프 보강 → **미수정**
- `/dashboard/ta` 트리아지 페이지 → **미구현**
- `problems.draft` 캐퍼빌리티 → **미신설**
- 라이브 시험 감독 UI → **미구현**

전부 미처리. 9개 커밋 모두 보안 fix·운영 안정성·a11y·테스트 쪽이었어서 TA 운영 UX 진척은 0이에요.

## 권한 맵: 글로벌 `assistant` vs 그룹 `ta` 직책

### 글로벌 `assistant` capability set (src/lib/capabilities/defaults.ts:15-34)

```
content.submit_solutions     ← student 상속
content.view_own_submissions ← student 상속
submissions.view_source
submissions.comment
submissions.rejudge
assignments.view_status
problems.view_all
anti_cheat.view_events
anti_cheat.run_similarity
files.upload
```

코멘트(line 17-21)에 적힌 의도가 명확: "`submissions.view_all`은 일부러 뺐다, group-scope filter at getSubmissionReviewGroupIds가 담당 그룹으로 제한한다."

### 그룹 `ta` 직책 (src/lib/db/schema.pg.ts:226-248)

```
id, group_id, user_id, role  -- role: "co_instructor" | "ta"
```

`role`이 `"ta"`인 행을 추가하면 그 그룹에 한해 ta 권한 부여. 글로벌 user role과는 완전히 독립적인 축.

### 라우트 게이트 매트릭스

다음 표는 라우트가 무엇을 보는지 적은 거예요. "G" = 글로벌 cap 검사, "M" = `canManageContest` 또는 `canManageGroupResourcesAsync`, "S" = `canViewAssignmentSubmissions` (= `hasGroupInstructorRole`).

| 라우트 | 게이트 | 글로벌 assistant 통과? | ta 직책 통과? |
|--------|--------|----------------------|--------------|
| `GET /api/v1/submissions/[id]` | S | ❌ | ✅ |
| `POST /api/v1/submissions/[id]/rejudge` | S | ❌ | ✅ (src:33) |
| `POST /api/v1/admin/submissions/rejudge` (bulk) | G+S 명시 | ❌ (`__no_access__` 더미) | ✅ (src:25-31) |
| `POST /api/v1/submissions/[id]/comments` | G+S | ❌ | ✅ |
| `GET /api/v1/submissions/[id]/events` (SSE) | S | ❌ | ✅ |
| `GET /api/v1/contests/[assignmentId]/anti-cheat` | M | ❌ | ❌ (src:176-180) |
| `POST /api/v1/contests/[assignmentId]/similarity-check` | M | ❌ | ❌ (src:21-25) |
| `GET /api/v1/contests/[assignmentId]/participant-timeline/[userId]` | G(`contests.view_analytics`)+S | ❌ | ❌ (cap 부족, src:8) |
| `GET /api/v1/contests/[assignmentId]/code-snapshots/[userId]` | G(`contests.view_analytics`)+S | ❌ | ❌ |
| `GET /api/v1/contests/[assignmentId]/leaderboard` | M (instructor view) | ❌ | ❌ (익명화 뷰만, src:35) |
| `GET /api/v1/contests/[assignmentId]/stats` | M | ❌ | ❌ |
| `GET /api/v1/contests/[assignmentId]/analytics` | M | ❌ | ❌ |
| `GET /api/v1/contests/[assignmentId]/participants` | M | ❌ | ❌ (src:26) |
| `GET /api/v1/contests/[assignmentId]/clarifications` | 모든 enrolled | ✅ (view) | ✅ (view) |
| `PATCH /api/v1/contests/[assignmentId]/clarifications/[clarificationId]` | M (answer) | ❌ | ❌ |
| `POST /api/v1/contests/[assignmentId]/announcements` | M | ❌ | ❌ |
| `POST /api/v1/contests/[assignmentId]/access-code` | M | ❌ | ❌ |
| `POST /api/v1/contests/[assignmentId]/invite` | M | ❌ | ❌ |
| `POST /api/v1/contests/[assignmentId]/recruiting-invitations` | M | ❌ | ❌ |
| `GET /api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions` | M | ❌ | ❌ (src:20-26) |
| `GET /api/v1/groups/[id]/assignments/[assignmentId]/exam-session` (자기 외 userId) | M or `contests.view_analytics` | ❌ | ❌ (src:114-122) |
| `POST /api/v1/groups/[id]/assignments/[assignmentId]/overrides` (점수 override) | M | ❌ | ❌ (src:47-53) |
| `POST /api/v1/problems` (출제) | G(`problems.create`) | ❌ | ❌ |
| `PATCH /api/v1/problems/[id]` (편집) | G(`problems.edit`)+author | ❌ | ❌ |
| `GET /api/v1/admin/audit-logs` | G(`system.audit_logs`) | ❌ | ❌ |
| Admin dashboard `/dashboard/admin` | ADMIN_NAV_GROUPS cap match | ❌ (모든 항목 매치 0) → `/dashboard` redirect (page.tsx:32-34) | ❌ |

ta 직책으로 통과되는 라우트가 정확히 5개. 나머지는 다 막힘. submission 조회·rejudge·코멘트가 끝.

### ta 직책이 사실상 죽어 있는 영역

세 함수가 핵심 게이트인데, ta를 인식하는 곳은 한 군데뿐:

```
src/lib/assignments/management.ts:120-122
  export async function isGroupTA(groupId, userId)
```

`isGroupTA` 호출처는 같은 파일 `canManageGroupMembersAsync` 하나 (line 112). 즉 ta 직책은 **그룹 멤버 관리에만 영향**을 줘요. 그 외 운영 라우트는 ta를 무시.

`canManageGroupResourcesAsync` (line 72-86):

```
if (canManageGroupResources(...)) return true;     // owner
if (caps.has("groups.view_all")) return true;       // admin
if (groupId) {
  const assignedRole = await getGroupInstructorAssignmentRole(groupId, userId);
  if (assignedRole === "co_instructor") return true;
}
return false;
```

ta는 빈 케이스. 즉 anti-cheat·similarity·overrides·exam-sessions·announcements·access-code·invite·recruiting-invitations 라우트 다 거절. 이게 모든 게 막히는 단일 지점.

`hasGroupInstructorRole` (line 128-131)는 정반대. owner면 true, 그 외엔 `getGroupInstructorAssignmentRole`이 non-null이면 true. ta도 통과. 이 함수는 `canViewAssignmentSubmissions` 안에서만 쓰여요.

요약: **ta가 submission은 보지만 contest 관리 동작은 못 함.** 의도였는지 누락이었는지 모호.

## 시나리오별 분석

### 시나리오 1: "내 제출이 타임아웃 났어요" 학생 메일

조교가 그룹 `ta` 직책으로 등록된 경우:

1. TA는 `/groups/[id]/assignments/[assignmentId]` 페이지에서 학생 row 클릭 → submission 페이지 진입 가능 (canViewAssignmentSubmissions 통과)
2. `Re-judge` 버튼 누르기 → src/app/api/v1/submissions/[id]/rejudge/route.ts:14-34 통과
3. audit log에 `submission.rejudged` 남음 (line 98-115)
4. 시험 종료된 후라면 `contestFinished: true` warning이 audit details에 들어감 (line 86-95, 112)

여기까진 깔끔.

문제 1: **학생이 username만 줬을 때 그 학생을 어느 그룹·과제에서 찾을지 모름.** 글로벌 user 검색 UI는 admin 전용. TA는 자기 담당 그룹 다 돌면서 찾아야 함. `/dashboard/ta`나 `/students?username=...` 같은 cross-group lookup 없음.

문제 2: **타임아웃 원인 분석 못 함.** 워커 로그는 `system.settings` cap 전용 (admin-nav.ts:65). submission detail에 표시되는 wall-clock vs CPU time 정보는 보이지만 (`executionTimeMs`, src/app/api/v1/submissions/[id]/route.ts:30-37), 워커 OS 측 reason은 못 봄. TA가 "워커 문제인지 학생 코드 문제인지" 판단 불가.

조교가 글로벌 `assistant` 역할인데 그룹 미배정이면 1번부터 막힘. 학생에게 "강사님 부르세요" 답변 외 못 함.

### 시나리오 2: 라이브 시험 감독 (가장 큰 격차)

TA가 그룹 `ta`로 등록 + contest manage 페이지 접근:

- `/contests/manage/[assignmentId]` 진입은 됨 (src/app/(public)/contests/manage/[assignmentId]/page.tsx:149-157의 `canViewBoard`만 통과)
- 그러나 `canManage`는 false (line 163-168) → 다음 탭들이 useless:
  - **Overview 탭**: AccessCodeManager·InviteParticipants 자체는 렌더링됨 (line 434-435). 내부 API call이 다 403. 빈 화면.
  - **Submissions 탭**: StatusBoard 보임, `canManageOverrides=false` 전달 (line 469). 점수 조정 버튼 안 뜸.
  - **Leaderboard 탭**: `<LeaderboardTable canViewStudentDetails />` (line 519). 그러나 API 측에서 `isInstructorView = canManageContest(...)`가 false (src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts:35) → username 익명화된 응답 (line 81-84). TA가 "지금 1등 누구냐"를 못 봄. canViewStudentDetails prop은 무시됨.
  - **Analytics 탭**: AnalyticsCharts API가 stats route 호출. 거기서도 `canManageContest` 거절. 빈 차트.
  - **Anti-Cheat 탭**: 조건부 렌더링 (line 528-531). 화면엔 뜸. fetch는 거절. 빈 dashboard.
  - **Candidates·Invitations 탭**: `canManage`가 false라 아예 안 보임 (line 535-546).

즉 TA는 contest manage 페이지에 들어갈 수는 있는데 **모든 탭이 깡통**이에요. UX 측면에서 정말 나빠요. 차라리 페이지 진입을 막거나, ta는 read-only로 데이터를 보여주는 게 나아요.

특히 anti-cheat 탭이 빈 화면이라는 게 치명적. 시험 중 부정행위 의심 신호(예: 학생 5명의 tab_switch가 동시 폭주)를 TA가 못 봄. 강사 한 명이 화면 응시하는 모델로 회귀.

### 시나리오 3: 클래리피케이션

`/api/v1/contests/[assignmentId]/clarifications` GET은 enrolled user면 다 봄 (src:39-58). TA도 자기 담당 그룹이면 enrollment 없이도 ta 직책으로 통과는 되는지 확인:

```
src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:24-30
  const hasAccess = await rawQueryOne(
    `SELECT 1 FROM enrollments WHERE group_id = @groupId AND user_id = @userId
     UNION ALL
     SELECT 1 FROM contest_access_tokens WHERE assignment_id = ... LIMIT 1`,
    ...
```

엔롤먼트 또는 access token 검사. ta 직책은 enrollment 자동 부여 안 되므로 → **TA가 enrolled 안 된 그룹에서는 clarification 목록조차 못 봄.** 강사 owner는 enrollment 없어도 `canManage`로 통과(line 19-22). ta는 양쪽 다 막힘.

POST(질문 작성)는 학생용. PATCH(답변)는 `canManageContest` 필요 → ta 거절.

알림 채널은? `grep -rn "notif" src/app/api/v1/contests/[assignmentId]/clarifications` 결과 0건. 새 질문이 등록돼도 강사·TA에게 이메일·푸시·badge count 알림 없음. 강사가 페이지 새로고침해야 보임. **시험 중 학생 질문이 그냥 쌓여요.** 이건 운영 사고.

### 시나리오 4: 표절 검토

조교가 코드 유사도 검토 흐름:

```
src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:21-25
  const canManage = await canManageContest(user, assignment);
  if (!canManage) {
    return apiError("forbidden", 403);
  }
```

ta·글로벌 assistant 둘 다 거절. 강사·admin만 실행 가능.

설사 강사가 실행해서 결과를 봐도, **"검토 완료" 마킹 기능 부재**:

- src/lib/assignments/code-similarity.ts에 `reviewed`·`dismissed`·`reviewer_id` 같은 컬럼 검색 결과 0건
- 매 실행마다 같은 페어가 다시 떠요. 검토 피로 누적.
- "이 페어는 정답 패턴이라 무효 판정"이라는 의사결정이 시스템에 안 남음. 강사가 노트앱에 적어 관리할 가능성 큼.

그리고 capability는 `anti_cheat.run_similarity`로 assistant에 있는데(defaults.ts:31) 라우트는 cap 무시. 다시 죽은 cap.

### 시나리오 5: 시험 출제 보조

TA가 문제 초안 만들어서 강사 승인받는 흐름:

- `problems.create`·`problems.edit` cap은 instructor 이상만 (defaults.ts:40-41)
- assistant cap에 `problems.view_all`만 있음
- DB schema에 `problems.draft`·`problems.status='pending'` 같은 워크플로 컬럼 없음 (src/lib/db/schema.pg.ts의 problems 테이블)
- 결과: TA가 합법 경로로 문제를 작성할 수 없음

실무에선 어떻게 될까? 강사 계정 공유, Google Docs로 작성 후 강사가 복사, "강사 시간이 비면" 같은 핸드오프. 사고 위험 큼.

### 시나리오 6: 채용 평가에서 리크루터 역할의 TA

이번 환경의 사용자는 채용에 이걸 쓰고 싶어 함(컨텍스트). 그러면 "리크루터"가 TA와 비슷한 위치에서 후보자를 모니터링하는 시나리오:

- `recruiting.manage_invitations` cap은 instructor 이상 (defaults.ts:72). assistant·student 없음.
- 리크루터를 별도 역할로 만들려면 instructor로 등록해야 함. 그러면 그룹 owner/공동강사 권한이 함께 들어옴 → 너무 큼.
- 후보자 시험을 "라이브로 어깨너머 보기"(shadow/spectate) 기능 부재. `recruiter-candidates-panel.tsx` 검색 결과 0건.
- 후보자 시험 후 결과 검토는 `/contests/manage/[assignmentId]/students/[userId]` 페이지에서 가능. 다만 `contests.view_analytics` cap 필요.
- 오늘 들어온 변경: 후보자 시험 deadline 이후 로그인 차단 (commit d677e96a). 리크루터가 후보자와 결과 리뷰 인터뷰할 때 후보자가 로그인 못 함. **인터뷰 흐름이 막혔어요.** 후보자 측에 결과 PDF·스크린샷을 다른 채널로 전달해야 함.

리크루터를 TA-수준 권한으로 묶고 싶다면 capability map 재설계 필요.

### 시나리오 7: TA가 학생을 그룹에 추가/제거

`canManageGroupMembersAsync`(src/lib/assignments/management.ts:93-113)는 ta 직책이고 + `groups.manage_members` cap이 있으면 허용. 그런데 글로벌 assistant cap에 `groups.manage_members` 없음 (defaults.ts:15-34). 따라서 ta는 학생 추가/제거 못함. 강사 의존.

운영 모델 가정상 합리적. 다만 "이 학생 시험 자격 박탈해주세요" 같은 즉시 처리가 강사 부재시 막힘.

## 워크플로 갭 정리

| 작업 | TA(ta 직책) | 글로벌 assistant 단독 | 에스컬레이션 |
|------|------------|---------------------|------------|
| 자기 그룹 submission 보기 | ✅ | ❌ | 없음 / 강사 |
| 단건 rejudge | ✅ | ❌ | 없음 / 강사 |
| 벌크 rejudge (max 50건) | ✅ | ❌ | 없음 / 강사 |
| Submission 코멘트 | ✅ | ❌ | 없음 / 강사 |
| 점수 override | ❌ | ❌ | 강사 |
| Clarification 답변 | ❌ | ❌ | 강사 |
| Clarification 보기 | ❌ (enrollment 부재) | ❌ | 강사 |
| Announcement 작성 | ❌ | ❌ | 강사 |
| Anti-cheat 이벤트 보기 | ❌ | ❌ | 강사 |
| 유사도 검사 실행 | ❌ | ❌ | 강사 |
| 유사도 결과 검토 마킹 | (기능 자체 없음) | (기능 자체 없음) | 강사도 못함 |
| 참여자 타임라인 | ❌ | ❌ | 강사 |
| 코드 스냅샷 라이브 보기 | ❌ | ❌ | 강사 |
| Leaderboard 실명 보기 | ❌ (익명화) | ❌ | 강사 |
| Test case 추가/편집 | ❌ | ❌ | 강사 |
| 시험 세션 목록 | ❌ | ❌ | 강사 |
| 시험 세션 강제 시작·종료 | ❌ | ❌ | 강사 |
| Access code 발급 | ❌ | ❌ | 강사 |
| 학생 초대 | ❌ | ❌ | 강사 |
| Recruiting 초대 발송 | ❌ | ❌ | 강사 |
| 그룹 across 학생 username 검색 | ❌ (UI 부재) | ❌ | 강사도 같은 처지 |
| 본인 audit 히스토리 조회 | ❌ (cap 부족) | ❌ | admin |

22개 작업 중 ta 직책 TA가 자력 처리 가능한 건 4개. 18개가 강사·admin 에스컬레이션. **운영 부담의 80% 이상이 강사에게 몰려요.**

## 라이브 감독 알림 라우팅

조사 결과 알림 인프라 자체가 매우 빈약:

- `src/lib/email/index.ts`: `notifySiteEvent` 함수 하나. SMTP 미구성 시 silent skip. 사용처는 시스템 이벤트(error reporter 류)에 한정.
- 인앱 알림 시스템 없음 (`notifications` 테이블 검색 결과 0)
- 푸시 알림 없음
- 클래리피케이션·anti-cheat 이벤트·rejudge 큐 backlog 모두 강사·TA에게 어떤 푸시도 없음

결과:

- **TA에게 "당신 그룹에 새 질문 3건"이 도달하는 채널 없음.** 페이지 새로고침 또는 폴링 의존.
- **시험 중 anti-cheat 폭주 임계 트리거 없음.** 학생 한 명이 tab_switch 30회 발생해도 시스템이 강사에게 알리지 않음. 강사가 anti-cheat 탭을 응시해야 보임.
- 라이브 감독은 항상 사람이 모니터에 붙어 있어야 함. TA 위임도 안 됨 (위 참고).

## 감사 로그 관점

조교 행동 감사 트레일:

| 행동 | 로깅 여부 | 위치 |
|------|---------|------|
| 단건 rejudge | ✅ `submission.rejudged` | src/app/api/v1/submissions/[id]/rejudge/route.ts:98-115 |
| 벌크 rejudge | ✅ | src/app/api/v1/admin/submissions/rejudge/route.ts |
| 코멘트 작성 | ✅ | src/app/api/v1/submissions/[id]/comments/route.ts |
| 시험 세션 시작 (본인) | ✅ `exam_session.started` | src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts:59-68 |
| 점수 override | ✅ (단, TA 실행 자체 차단) | overrides/route.ts:122-129 |
| 학생 코드 열람 | ❌ (안 남김) | 없음 |
| Anti-cheat 화면 열람 | ❌ (애초에 접근 차단) | 없음 |
| 유사도 검사 실행 | ❌ (애초에 차단) | 없음 |

기록 자체는 양호. 다만 두 가지 갭:

1. **TA가 자기 행동 이력을 조회 못 함.** `/dashboard/admin/audit-logs`는 `system.audit_logs` cap 필요(admin-nav.ts:56). TA 보유 cap 아님. 우회 경로 부재. "내가 어제 어떤 학생 rejudge 했더라" 확인 불가.
2. **Instructor scoping이 owner-only.** audit-logs/route.ts:74에서 `eq(g.instructorId, ctx.user.id)`. 같은 그룹에 ta로 등록된 TA의 row는 owner가 아니라서 audit-logs 쿼리 결과 빈 배열. 강사조차 자기 그룹 ta가 한 행동을 audit-logs 페이지에서 모아 보기 불편.

### 우발적 파괴 위험

- **단건 rejudge가 즉시 transactional delete.** rejudge/route.ts:37-53에서 `submissionResults` 행 전체 삭제 후 status를 pending으로 리셋. 되돌릴 수 없음. 워커 OOM·언어 버전 변경 등으로 재채점 결과가 달라질 가능성 있음. 단, 원본 sourceCode·timestamp는 보존됨.
- **벌크 rejudge 최대 50건.** confirm 다이얼로그 한 단계로 50건 일괄. 시험 종료 후 실수 클릭이면 leaderboard cache 무효화되어 학생 화면이 잠시 튐 (rejudge/route.ts:57-64).
- **시험 종료 후 rejudge 차단 없음.** TA가 시험 종료 후에도 rejudge 가능. audit warning만 추가될 뿐(line 86-95). "강사 승인 단계" 강제 흐름 부재.
- **Submission DELETE 라우트 부재.** src/app/api/v1/submissions/[id]/route.ts에 GET만 존재. DELETE method 없음. **TA가 submission을 영구 삭제할 길은 없어요. 좋아요.**
- **그룹·과제 DELETE는 instructor cap 필요.** TA 접근 불가. 좋아요.

종합: TA가 실수로 데이터 영구 삭제할 수 있는 경로는 없어요. 가장 위험한 건 rejudge로 결과 흔드는 것, 그것도 audit에 남음. **destructive 측면은 잘 막혀 있어요.**

## 다중 클래스 TA

백엔드:

- `group_instructors` 테이블이 `(groupId, userId)` 유니크 인덱스 (src/lib/db/schema.pg.ts:244). 한 사람을 여러 그룹에 등록 가능.
- `getAssignedTeachingGroupIds` (src/lib/assignments/management.ts:47-66)이 OR 쿼리로 모든 그룹 ID 모아 반환. 다중 그룹 TA 잘 지원.
- 벌크 rejudge에서 `getSubmissionReviewGroupIds`(src/lib/assignments/submissions.ts:177-191)가 위 함수 호출 → 여러 그룹 across submission 일괄 rejudge 가능.

UI:

- `/dashboard/ta` 또는 `/dashboard/my-assignments` 같은 TA 통합 진입점 부재.
- 매번 `/groups` 목록 → 그룹별로 들어가서 작업.
- "이번 주 내 담당 그룹 across 미답변 clarification·신규 anti-cheat 알람" 뷰 없음.
- "내 이름 들어간 audit 이벤트" 페이지 없음.

**백엔드는 다중 TA 지원하는데 프론트 통합 화면이 없어서 운영 부담이 큼.** 어제 리뷰 그대로.

## 모순·코드 냄새

1. **caps 부여 vs 라우트 게이트 불일치.** `assistant` 글로벌 역할에 `anti_cheat.view_events`·`anti_cheat.run_similarity` 부여(defaults.ts:30-31)했지만 라우트는 `canManageContest`만 봄. cap 자체가 죽은 키. capability system 도입 의도(검사 표면 단일화)가 무너져 있음.

2. **`isGroupTA` 사용 영역 협소.** src/lib/assignments/management.ts:120 정의, 사용처는 같은 파일 `canManageGroupMembersAsync` 한 곳뿐. anti-cheat·similarity·overrides·exam-sessions 같은 라우트가 활용 안 함.

3. **`canManageContest`가 ta 무시.** src/lib/assignments/contests.ts:205-215는 `canManageGroupResourcesAsync`로 위임. 후자가 ta를 거절(management.ts:84). contest 운영 보조 전부 닫혀 있음.

4. **글로벌 `assistant` role의 의미 모호.** 문서가 없음. 어떤 상황에 글로벌 assistant 부여해야 하는지, 그룹 ta 등록과 어떻게 결합해야 하는지 README/CLAUDE.md에 한 줄도 없음.

5. **leaderboard 페이지의 prop과 API 응답 미스매치.** src/app/(public)/contests/manage/[assignmentId]/page.tsx:519에 `<LeaderboardTable canViewStudentDetails />` (항상 true). 그러나 API 측은 viewer가 `canManageContest`를 통과해야 username 노출(leaderboard/route.ts:35,70-85). TA가 페이지에선 "실명 보기" 의도된 UI인데 데이터는 익명. 컴포넌트 prop과 실제 응답 형태 불일치.

6. **클래리피케이션 GET access 정책 결함.** 라우트가 `canManage` OR (enrollment OR access_token)만 봄. ta 직책 등록은 enrollment 자동 부여 안 됨. ta가 자기 담당 그룹에서 학생 질문 목록조차 못 봄. 이건 명백한 누락.

## Show-stopper

심각도 H: 없음. ta 직책 TA는 채점 보조 핵심 기능(rejudge·코멘트) 동작. 강사 부재 시 학생 응대 일부 가능.

심각도 M (요약):

- **M-1: ta가 anti-cheat 화면 못 봄.** 라이브 감독을 TA에게 위임 못 함. 채용·고밀도 시험에서 강사 한 명이 모두 응시해야 하는 모델로 회귀. (src/lib/assignments/contests.ts:205-215, src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:176-180)
- **M-2: ta가 clarification 답변·열람 모두 차단.** 운영 사고. (src/app/api/v1/contests/[assignmentId]/clarifications/route.ts:24-32, /clarifications/[clarificationId]/route.ts:19)
- **M-3: 알림 채널 부재.** 새 clarification·anti-cheat 폭주·rejudge 백로그 어떤 푸시도 없음. (src/lib/email/index.ts 전체 검토)
- **M-4: 유사도 결과 "검토 완료" 마킹 부재.** 같은 페어 반복 표시. (src/lib/assignments/code-similarity.ts schema 확인)
- **M-5: 글로벌 assistant cap가 죽은 코드.** 라우트가 capability를 보지 않음. capability system 의도와 충돌. (src/lib/capabilities/defaults.ts:15-34 vs 라우트들)

심각도 L:

- **L-1: 단건 rejudge 라우트 그룹 스코프 명시 보강.** 어제와 동일. (src/app/api/v1/submissions/[id]/rejudge/route.ts:33)
- **L-2: `problems.draft` 캐퍼빌리티 + TA 출제 보조 워크플로.**
- **L-3: `/dashboard/ta` 통합 트리아지 페이지.**
- **L-4: TA 본인 audit 히스토리 조회 라우트.**
- **L-5: 시험 종료 후 rejudge 강사 승인 단계.**
- **L-6: leaderboard prop과 응답 미스매치 정리.**
- **L-7: 글로벌 `assistant` 역할의 운용 가이드 문서화.**

## 추천 작업 순서

운영 임팩트 vs 구현 비용으로 정렬:

1. **`canManageContest`·`canManageGroupResourcesAsync`에 ta-read 분기 추가.** 함수 시그니처에 `mode: "read"|"write"` 인자 또는 새 헬퍼 `canViewContestAsStaff` 신설. read는 ta 통과, write는 기존대로. anti-cheat·similarity-check·participants·participant-timeline·code-snapshots·exam-sessions·leaderboard(instructor view)·stats·analytics·clarifications 라우트가 ta에게 풀림. 핵심 한 줄: TA가 라이브 시험을 감독할 수 있게 됨. (1~2시간, 위험 낮음)

2. **클래리피케이션 GET access에 ta 포함.** route.ts:24-30의 enrollment 검사에 `OR EXISTS (SELECT 1 FROM group_instructors WHERE group_id=... AND user_id=...)` 추가. 또는 위 1번 헬퍼 사용. (30분)

3. **클래리피케이션 답변 권한을 ta에게 열기.** `canManageContest` write 게이트를 살짝 풀거나, 새 cap `clarifications.answer`를 ta가 그룹 멤버일 때만 사용 가능하게 분기. (1시간)

4. **`code_similarity_pairs.reviewed_at`·`reviewed_by`·`review_decision` 컬럼 + 마킹 라우트.** 페어 검토 결정의 audit trail 확보. (반나절)

5. **`/dashboard/ta` 통합 페이지.** 내 담당 그룹 미답변 clarification, 최근 anti-cheat top N, 어제·오늘 rejudge 큐. (1일)

6. **알림 인프라.** 최소 클래리피케이션 새 등록 시 그룹 owner + ta에게 in-app badge count 엔드포인트. polling 기반이라도 시작. (1일)

7. **`problems.draft` 캐퍼빌리티 + 워크플로.** draft 상태 컬럼 + 강사 승인 라우트. (1~2일)

8. **TA 본인 audit 조회 라우트.** `/api/v1/users/me/audit-events`. cap 게이트 없이 actor_id=self 필터. (반나절)

9. **시험 종료 후 rejudge 시 강사 승인 강제.** rejudge route에서 deadline 지났으면 confirm token 요구 또는 강사 confirm 라우트로 분리. (1~2시간)

10. **leaderboard prop·응답 일치화.** LeaderboardTable이 isInstructorView를 prop으로 받도록 정리. (1시간)

11. **글로벌 `assistant` 역할의 의미 문서화.** CLAUDE.md 또는 .context 측에 "이 역할은 그룹 ta로 등록되어야 동작한다" 명시. (15분)

## 보안 메모

오늘 들어온 두 변경의 TA 영향:

- **sandbox-gate.ts staff 분류에 assistant 포함** (src/lib/security/sandbox-gate.ts:54-58): TA가 학생 코드 문제를 재현·테스트할 때 이메일 verify 강제로 막히지 않음. 운영 측면에서 합리적. 다만 신뢰 표면 확장. `assistant` 글로벌 역할 부여 시 비밀번호 정책·MFA 강도가 instructor와 동급이 되어야 함. 현재 ROLE_LEVEL (src/lib/security/constants.ts:41)에서 assistant=1, student(0) 바로 위. 가입 흐름의 비밀번호 강도 규칙이 user role과 무관하게 글로벌이라면 큰 격차는 아님. 확인 필요.
- **anti-cheat heartbeat Origin 검사** (src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79): 학생 측 curl 우회 차단. TA는 정상 운영 시 영향 없음.

추가 보안 관점:

- TA의 단건 rejudge가 즉시 transactional delete (rejudge/route.ts:37-53)인데 IDOR 방어는 `canAccessSubmission`만 호출. 어제와 동일하게 명시적 그룹 스코프 재확인 권장. 현재 동작은 정상이지만 그룹 instructor 권한이 사이드도어로 추가될 때 한 번 더 보강 layer가 있으면 안전.
- TA가 학생 sourceCode 열람 가능 (submissions.view_source). audit log에 sourceCode 열람 이벤트 안 남음. "학생 X가 자기 코드 누가 봤냐"에 답변 못 함. 개인정보 측면 권장.

## 보안 메모: 글로벌 assistant 역할의 위치

`assistant`는 ROLE_LEVEL=1로 student 바로 위 (src/lib/security/constants.ts:41, src/lib/capabilities/defaults.ts:114). 회원가입 흐름에서 어떤 사용자가 글로벌 assistant 역할로 처음 생성되는 경로:

- 회원가입 폼은 student로만 만듦 (확인 권장)
- assistant는 admin 또는 super_admin이 명시적으로 부여
- 즉 sandbox-gate staff bypass 새 동작은 admin이 명시 부여한 계정에만 적용

이 구조라면 위험도 낮음. 다만 "assistant 역할 부여하면 sandbox 이메일 verify 우회" 동작이 admin 측에 명시적으로 노출되어 있지 않음. role 관리 페이지 UI에 "이 역할은 sandbox staff bypass 권한이 있어요" 같은 경고 한 줄 추가 권장.

## 종합 권고

- 글로벌 `assistant` 역할의 capability list와 라우트 게이트가 어긋나 있어서 사실상 죽은 역할이 돼 있어요. capability를 정리하거나 라우트를 capability-aware로 바꾸는 결정이 필요.
- 운영에서 효과적인 모델은 "강사 + 그룹 ta 직책 임명" 흐름이에요. ta 직책이 contest 운영 보조에 더 깊이 통과되도록 `canManageContest` 분기가 시급.
- 알림 인프라 부재는 TA 운영뿐 아니라 강사 운영에도 큰 부담을 만들어요. 시급도 같이 올려야 함.
- 채용 평가 맥락에서 리크루터 분리 역할이 필요한데 현재는 instructor에 포함시킬 수밖에 없음. recruiting 전용 capability 묶음을 별도 역할로 추출 권장.
