# 강사 관점 리뷰 — 2026-05-21

리뷰 시점: 2026-05-21
대상 사용처: 정규 수업 운영, 중간/기말 시험, 사내 알고리즘 대회·코딩 면접

## 오늘 진행된 fix (어제와의 delta)

| 어제까지 짚었던 이슈 | 오늘 상태 |
|---|---|
| Frozen leaderboard가 영원히 안 풀림 | ✅ fix — `lateDeadline`(없으면 `deadline`)까지만 동결, 이후 자동 해제. `src/lib/assignments/leaderboard.ts:62-74` |
| `/submissions` 목록 IDOR(다른 학생 메타데이터 누수) | ✅ fix — non-staff에 problem-visibility scope 적용. `src/app/api/v1/submissions/route.ts:46` |
| `accepted-solutions`가 contest 코드까지 노출 | ✅ fix — `assignmentId IS NULL` 필터로 practice submissions만. `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:41-46` |
| 비공개 대회 URL → 404 | ✅ fix — 인라인 access-code gate |
| 대회 참가자 카드(초대 vs 그룹 멤버 구분) | ✅ fix |
| anti-cheat heartbeat Origin 검증 | ✅ fix — 운영환경에서 cross-origin 위조 차단 |
| 마감 지난 채용 후보자 로그인 | ✅ fix — `isStaleRecruitingCandidate`로 거부. `src/lib/recruiting/access.ts:136-162` |

이 7개는 진짜로 닫혔어요. leaderboard 자동 해제는 시간 anchor를 DB 시간으로 잡았고(`getDbNowMs`), late deadline이 없을 때 fallback도 처리해서 운영자가 신경 안 써도 다음 대회 끝나면 자동으로 풀려요.

다만 그 외에 강사가 매일 막히는 부분 중 어제 추천했던 항목은 **단 하나도** 손대지 않았어요. 오늘 커밋은 전부 보안·인증·이메일·CSP·rate limit 쪽이라, 운영자 관점에서는 "보안은 좋아졌는데 학기 운영은 어제랑 똑같이 막혀 있어요"가 정확한 한 줄 요약이에요.

## 1. Top 5 남은 강사 페인 포인트

### 🔴 #1 — 개별 학생 마감 연장 부재 (어제 그대로, High)

`grep -rn "extension\|extendedDeadline\|userExtension" src/` 결과 0건. `assignment_user_extensions` 같은 테이블도 없고, 마감을 학생별로 따로 줄 수 있는 endpoint(`/api/v1/groups/[id]/assignments/[assignmentId]/extensions` 같은 것)도 없어요. `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`는 **점수 override**(채점 결과 수정)이지 마감 연장이 아니에요. windowed exam의 `personalDeadline`(`src/lib/assignments/scoring.ts:42-44`)은 시험 시간 한정이고 일반 과제에는 안 먹어요.

운영상 의미: 진단서·결석·코로나·장례 등으로 학생 한 명에게 24시간만 더 줘야 할 때, 강사는 다음 셋 중 하나를 해야 해요.
1. 마감을 전체로 연장 → 다른 학생도 다 늦게 내도 되고, 점수 정합성 깨짐
2. 점수 override로 사후 보정 → 학생이 본인 채점 결과를 못 봄, 일관성 없음
3. DB에 직접 SQL 쳐서 해당 학생의 windowed exam session `personal_deadline`만 늘림 → 일반 과제에는 불가, 시험 모드에만 동작

세 가지 다 **운영자가 직접 SQL 떠야 한다**는 점에서 똑같이 망가져 있어요. 한국 대학에서 한 학기에 진단서 한두 명은 무조건 나오는데 이걸 매번 admin DBA에게 부탁해야 한다는 건 운영 불가능 수준이에요.

**필요한 것**:
```sql
CREATE TABLE assignment_user_extensions (
  assignment_id text NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extended_deadline timestamptz,
  extended_late_deadline timestamptz,
  reason text,
  granted_by text REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, user_id)
);
```
그리고 `src/lib/assignments/scoring.ts` 의 `buildIoiLatePenaltyCaseExpr`에서 SQL CASE를 학생별 deadline을 LEFT JOIN해서 COALESCE하는 식으로 고쳐야 해요. `validateAssignmentSubmission`(`src/lib/assignments/submissions.ts:286`)도 마찬가지로 personal extension을 먼저 확인하게 해야 하고요.

### 🔴 #2 — 그룹 단위 CSV 로스터 임포트 부재 (어제 그대로, High)

오늘 코드를 더 자세히 봤는데 미묘한 부분이 있어요. `/api/v1/users/bulk` 엔드포인트는 **있어요**(`src/app/api/v1/users/bulk/route.ts`). admin 대시보드의 bulk-create-dialog.tsx에서 CSV 200행까지 받고요(`bulk-create-dialog.tsx:185-188`). 어제 리뷰에서 "CSV import 없음"으로 분류한 것은 실제로는 절반만 맞아요.

문제는 권한과 워크플로:
- `users.create` capability가 instructor 기본 권한에 **없어요**(`src/lib/capabilities/defaults.ts:36-80`엔 admin에만 있음, `:85`). 그래서 강사는 본인 클래스 명단을 직접 못 올리고 admin한테 부탁해야 해요.
- 그룹 등록(enrollment) 단계가 분리돼 있어요. `/api/v1/groups/[id]/members/bulk`는 `{userIds, usernames}`만 받아서(`src/app/api/v1/groups/[id]/members/bulk/route.ts:34`) CSV의 학번·이름·이메일 컬럼을 직접 못 받아요.
- 즉 "CSV → 계정 자동 생성 → 그룹 등록"이 한 번에 안 되고, admin → instructor 사이에 사람 손이 한 번 더 들어가야 해요.

200명 클래스 학기마다 시나리오:
1. 강사가 학번/이름/이메일 CSV 준비 → admin에게 메일
2. admin이 bulk-create-dialog에서 CSV 업로드 → 계정 생성
3. admin이 username 목록을 강사에게 다시 회신
4. 강사가 그룹 members 화면에서 그 username을 다시 붙여넣고 일괄 등록

4단계, 두 사람, 두 도구. 학기마다 4번(중간고사, 기말고사, 수강 변경 추가, 청강생). 어제 짚은 항목 중에서 **가장 빨리 끝낼 수 있는데 한 줄도 안 손댔어요**.

**필요한 것**: `POST /api/v1/groups/[id]/members/bulk-csv`에 CSV(username/name/email/className/password 컬럼) 받아서 트랜잭션 안에서 (a) 없는 username은 자동 계정 생성, (b) 그룹 enrollment까지 한 방. capability는 `groups.manage_members`(이미 instructor에 있음, `defaults.ts:47`).

### 🔴 #3 — 그레이딩 워크플로의 100명 단위 효율성 (Medium-High)

100명 짜리 수업 학기말에 성적 옮겨 적기를 시뮬레이션해 봤어요.

CSV export는 있어요(`src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts`, MAX_EXPORT_ROWS 캡). 한 과제씩만 받을 수 있어요. 학기에 과제가 10개면 CSV 10번 다운로드, 엑셀에서 VLOOKUP 10번. **과제 여러 개의 합계 점수를 한 번에 export하는 endpoint가 없어요.**

또 score override(`src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts`)는 (학생, 문제) 단위라 학생 1명의 과제 한 개를 +5점 보정하려고 해도 각 문제마다 override를 따로 POST 해야 해요. UI는 score-override-dialog.tsx에서 다이얼로그 하나에 처리하긴 하는데, 학생 50명 × 문제 5개에 일괄로 +2점 같은 작업은 50번 클릭이에요.

진짜 운영 시 그레이딩 시나리오:
- "다들 1번 문제 너무 못 풀었어서 5점씩 줄게요" → 학생 100명에 대해 다이얼로그 100번
- "특정 학생 4명만 plagiarism 확정이라 0점 처리" → override로는 가능, 다만 학생에게 0점 사유가 노출되는 UX 없음
- "전체 학생의 모든 과제 점수를 한 엑셀로 보고 싶어요" → endpoint 없음

**필요한 것**: 
1. 그룹 학기 전체 export endpoint(`GET /api/v1/groups/[id]/grades/export?format=csv`)
2. score override의 bulk endpoint (조건: "문제 X에 모든 학생에 대해 +5", "특정 학생 목록에 일괄 0점")

### 🔴 #4 — 표절 검사 트리아지 워크플로 부재 (어제 그대로, Medium-High)

오늘 `code-similarity-client.ts`와 `anti-cheat-dashboard.tsx`를 자세히 봤어요. 결론은:
- Rust sidecar로 페어 유사도를 뽑아요 (`computeSimilarityRust`, `code-similarity-client.ts:35`)
- 결과는 임시 state에 들어가요 (`setSimilarityPairs`, `anti-cheat-dashboard.tsx:282-285`)
- 화면에는 페어 목록만 표시 (`anti-cheat-dashboard.tsx:374-385`): 학생 이름 두 명, 언어, 유사도 %
- **side-by-side 코드 diff 뷰가 없어요**. `grep -rln "side-by-side\|sideBySide\|diffView" src/`는 `output-diff-view.tsx`(채점 출력 diff)와 `lib/diff.ts`만 매치.
- **false-positive 마킹·검토 status 저장·강사 메모 필드가 없어요**. DB에 `code_similarity_reviews` 테이블 없음.
- 페어 클릭해도 두 학생 제출 코드를 나란히 띄워서 보는 화면이 없음.

운영자 입장에서는 "유사도 92%" 한 줄 보고 어떻게 결정하라는 거예요? 두 코드를 직접 학생 페이지에서 따로 열어서 diff 떠야 해요. 30페어가 나오면 60번 클릭 + 사람 눈으로 diff. 그 와중에 false positive(라이브러리 boilerplate, 흔한 알고리즘 구현)는 매번 다시 봐야 해요. 매학기 다시.

게다가 `similarityComplete` 메시지로 검사 한 번 끝내고 새로고침하면 페어 목록이 날아가요(`useState` 휘발). DB persistence 없음. 

**필요한 것**:
1. 페어 클릭 → 두 학생 제출 코드 side-by-side diff 뷰 (CodeMirror 두 개 + diff highlight)
2. `code_similarity_reviews(pair_id, status enum('pending','confirmed','false_positive','dismissed'), reviewer_id, note, decided_at)` 테이블
3. 학기 단위로 누적, 다음 학기 강사가 "이 페어는 라이브러리 boilerplate라 무시" 같은 메모 남길 수 있게

### 🟡 #5 — 서브태스크/Special Judge/Interactive 부재 (어제 그대로, Medium-High)

오늘 다시 `grep -irn "subtask\|special_judge\|specialjudge\|checker" src/` 했는데 0건이에요(검색 결과의 유일한 매치는 `capabilities/index.ts:24`의 "checker" 모듈 import인데 이건 자동 검사 capability 종류라 채점기 checker가 아님). `comparisonMode`는 여전히 `exact`/`float`만(`src/app/(public)/problems/create/create-problem-form.tsx:45`).

README에 "IOI scoring" 적어 놓고 실제 IOI 채점에 필요한:
- 서브태스크별 group min (한 case라도 틀리면 그 그룹 0점)
- 출력 다중 정답 허용을 위한 spj (예: "최소 비용 신장 트리 가중치는 유일, 트리는 여러 개")
- Interactive(채점기와 표준입출력 페어링)

전부 안 됨. 사내 알고리즘 대회용으로 쓰겠다고 광고하려면 못 광고할 수준이에요. PS 운영자라면 첫 번째 IOI-style 문제 만들려고 들어왔다가 바로 BOJ나 Codeforces로 이동할 거예요.

## 2. SQL/스크립트로 떨어져야 하는 워크플로

운영자가 화면에서 못 끝내고 결국 DB나 사이드 스크립트로 가야 하는 작업들:

| 작업 | 화면 가능? | 우회 방법 |
|---|---|---|
| 학생 1명 마감 24시간 연장 | ❌ | `UPDATE exam_sessions SET personal_deadline = ... WHERE user_id = ...` (windowed exam만), 일반 과제는 우회 불가 |
| 학생 1명 marking 정답 처리(점수만 100) | ✅ (score override) | `score-override-dialog.tsx` |
| 학생 1명 plagiarism 확정 0점 + 사유 노출 | ⚠️ | override는 되는데 사유는 학생에게 안 보여서 별도 communication 필요 |
| 전체 학생 모든 과제 점수 한 엑셀 | ❌ | 과제마다 CSV 10번 + VLOOKUP 또는 직접 SQL JOIN |
| 그룹 전체에 공지 메일 발송 | ❌ | nodemailer는 있지만(`src/lib/email/index.ts`) 강사 발송 UI 없음, 별도 채널 필요 |
| 시험 끝나고 채점 결과 학생에게 일괄 메일 통보 | ❌ | grade-posted notification 없음 (`grep -rln "gradePosted\|grade.posted"` 0건) |
| CSV로 200명 학생 클래스 만들기 | ⚠️ | admin이 계정 만들고 → username 회신 → 강사가 enrollment, 두 단계 |
| 새 test case 추가 후 기존 제출 모두 재채점 | ⚠️ | bulk rejudge 50건 cap(`src/app/api/v1/admin/submissions/rejudge/route.ts:14`), 300명 클래스면 6번 |
| 같은 과제 다른 반(2분반)에 똑같이 복제 | ❌ | duplicate 기능 없음 (`grep -rln "duplicate\|cloneAssignment"` 거의 0건), 매번 손으로 다시 생성 |
| 시험 시작 후 일부 학생만 5분 추가 | ⚠️ | exam_sessions DB 직접 수정만 가능 |
| 시험 일찍 끝내기 (전원 강제 종료) | ❌ | 마감을 앞당기는 PATCH는 가능하지만 진행 중 세션은 personalDeadline 우선이라 종료 안 됨 |
| 다른 강사에게 권한 이양 | ⚠️ | `groupInstructors` 테이블은 있는데 transfer 워크플로 UI 없음, DB 직접 |

여덟 가지나 화면으로 못 끝내요. 정규 수업 한 학기 운영에서 위 시나리오 중 절반은 무조건 발생해요.

## 3. 학생이 보는 것 vs 강사가 의도한 것 — 미스얼라인먼트

### Score override 사유가 학생에게 안 보여요
`src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts:14-19`에서 `reason` 필드를 받기는 해요. 학생 측 제출 페이지(`src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx`)에서 이 reason을 노출하는 코드가 없어요. 강사가 "표절로 인한 감점"이라고 사유를 적어도 학생은 그냥 점수가 바뀐 채로 보여요. 학생 측 컴플레인이 들어왔을 때 "왜 깎였어요?" 응답을 또 따로 해야 해요.

### Frozen leaderboard 학생/강사 view 표시 분리 명확하지 않아요
오늘 fix로 자동 unfreeze는 들어갔는데(`leaderboard.ts:74`), 학생 측 화면에서 "지금 이 순위는 동결된 시점 기준이에요"라는 명시적 배너가 있는지 확인했어요. `frozen: true`가 응답에 포함되지만(`:84`), 화면에서 활용되는지는 LeaderboardTable 컴포넌트 확인이 필요해요. 만약 표시가 잘 안 되면 학생들은 "왜 내 새 제출이 반영 안 되지?"로 혼란.

### 일반 과제와 contest의 시간대 표시 일관성
시간대가 시스템 전역(`systemSettings.timeZone`, `schema.pg.ts:538` 추정). 강사가 "마감 23:59 KST"로 잡았는데 외국 출장 중 학생이 본인 로컬 시간으로 보면서 헷갈리는 케이스가 자주 나와요. 학생 단위 TZ 미지원은 어제와 동일.

### 제출 코드 draft 자동 저장 → 학생만 보고 강사는 모름
서버측에 code snapshot endpoint는 있어요(`/api/v1/code-snapshots`). 하지만 이건 anti-cheat replay용이에요. 학생이 작성 중인 draft를 강사가 확인할 방법은 없어요. "마감 1시간 전인데 학생 X가 코드 한 줄도 안 썼는지 70% 다 썼는지 알고 싶어요" 같은 운영 질문은 답 안 나옴. 학생이 시험 도중 브라우저 크래시 났을 때 강사가 "여기까지는 살아 있어요" 같은 응대도 불가능.

### 그룹 announcement의 부재
discussion thread는 있어요. 하지만 "이 그룹에 등록된 학생들에게 일괄 메일"이 없어요. contest는 `/api/v1/contests/[assignmentId]/announcements`가 있지만 일반 그룹/과제용 announcement는 없음. 학기 중 "다음 주 휴강합니다" 같은 공지를 시스템 안에서 못 보냄.

## 4. Question authoring · 시험·대회 운영 흐름 점검

### 문제 작성 화면 (`src/app/(public)/problems/create/create-problem-form.tsx`)

- 마크다운 preview 탭은 있어요 (`:91, :531`).
- 정답 코드를 업로드해서 "모든 케이스 통과 + 시간/메모리 한계 안에 드는지" 자동 검증하는 빌트인 도구는 없어요. 외부 stress-test 스크립트 의존.
- Test case 잠금은 첫 제출 이후 자동 발동. 우회 권한은 `problems.delete`(`src/app/api/v1/problems/[id]/route.ts:87`). 기본 instructor는 problems.delete 있어서 본인 문제는 고칠 수 있는데, **assistant 권한은 problems.delete 없음**(`capabilities/defaults.ts:15-34`). TA가 잘못된 케이스 발견해도 즉시 못 고침, 강사 호출 대기.
- 케이스별 부분 잠금 해제 없음(`allowLockedTestCases` 전부/전무).
- 문제 publish/draft 분리 없음(`visibility: public|private|hidden`만). "초안 상태로 동료 강사 검토" 같은 흐름 안 됨.

### Contest 생성/시작/정지 (`src/app/api/v1/contests/quick-create/route.ts`)

- quick-create는 있어요. 정상.
- 진행 중 "수동 동결"·"수동 해제" 버튼 없어요. `freezeLeaderboardAt`은 사전 설정 필드만(`src/lib/db/schema.pg.ts:345`). 대회 중간에 "지금부터 동결" 못 누름.
- 대회 종료 후 "복원·연장" 같은 흐름 없음. 강사가 마감을 미루는 PATCH만 가능.
- Late submission policy는 단일 `latePenalty`(`schema.pg.ts:339`)와 `lateDeadline`만. 일/시간 단위 decay(예: 24h당 10%)는 자체 SQL CASE 안에 안 들어가 있어요(`scoring.ts:142-160` 확인, `1.0 - latePenalty/100.0` 단일 적용).

### 시험(Exam) 운영

- windowed exam의 `personalDeadline`은 있는데(`exam_sessions` 테이블) **그룹 단위 시험 시작 시점 일제히 정렬·재시작** 같은 운영자 액션이 없음.
- 시험 도중 일부 학생 추가 시간(예: 장애 학생 30% 연장 룰) → DB 직접.
- 시험 끝나고 anti-cheat heatmap을 강사가 빠르게 훑어볼 dashboard는 `anti-cheat-dashboard.tsx`에 있긴 한데 페어 viewer 없는 문제는 위와 동일.

### Rejudge

- 어제 짚은 50건 cap 그대로 (`rejudge/route.ts:14`).
- assignment 단위 endpoint 없음, problem 단위 endpoint도 없음. test case 한 줄 바꿨을 때 그 problem의 모든 제출 재채점이 한 번에 안 돼요.

## 5. Anti-cheat dashboard 운영 시나리오

"학생 X가 flag 떴어요"가 화면에 떴을 때 강사가 보는 화면을 시나리오 추적해 봤어요.

1. `AntiCheatDashboard`(`src/components/contest/anti-cheat-dashboard.tsx`)에 이벤트 행이 누적됨: paste, blur, tab switch, code_similarity 등 (`:82` 등 색상 매핑).
2. 이벤트 행 클릭 → 펼치면 이벤트 detail JSON 표시 (collapsible).
3. **학생별 timeline 화면으로 점프하는 링크는 있음**: participant-anti-cheat-timeline.tsx. 좋아요.
4. 다만 "이 학생 이벤트가 정상인지 의심인지 표시" 같은 status 컬럼 없어요. 페어와 마찬가지로 review status persistence 없음.
5. anti-cheat 프로파일이 하나뿐(`schema.pg.ts`의 `enableAntiCheat: boolean`). 시험·대회·팀 대회·홈워크가 같은 모델 — 팀 대회는 IP 공유·brower switch가 정상이라 false positive 폭주. `enableAntiCheat`를 enum으로 (exam/contest/team/none) 분리하라는 어제 추천 그대로.

또 하나: similarity check 결과가 anti_cheat_events 테이블에 들어가는데(`code-similarity.ts:421`), 페어 정보(상대 학생)는 details JSON에 묻혀 있어서 dashboard 필터에서 "다른 학생과 코드가 90% 이상 비슷한 학생만 보기" 같은 쿼리가 직관적이지 않아요. 학생 단위 row vs 페어 단위 row가 같은 테이블에 섞여 있는 모델 자체가 어색.

## 6. Multi-section · Cohort · 권한 위임

- `users.className`(`schema.pg.ts:29`)만 단일 텍스트 컬럼. 한 학기에 같은 과목을 2분반·3분반 운영할 때 분반 자체 테이블이 없어요. group을 분반당 하나 만들면 과제도 분반당 따로 복제해야 함. 과제 duplicate 기능 없음 → 매 분반 새로 생성.
- `group_instructors`(`schema.pg.ts:226-248`)로 공동 강사·TA 등록은 가능. 다만 lead instructor의 audit log에 공동 강사 행동이 잡히는지는 어제 짚은 그대로 의심스러움. `src/app/api/v1/admin/audit-logs/route.ts:101` 의 `eq(p.authorId, ctx.user.id)` 한정 쿼리가 그대로면 공동 강사의 문제 수정이 lead에게 안 보임.

## 7. 채점 시스템 가시화 (어제 새로 짚은 부분)

어제 14시간 동안 모든 제출이 compile_error로 잘못 채점된 사고는 운영 측면에서 중요한 시나리오라 한 번 더 짚어요.

오늘 commit `1e56d257`(샌드박스 quota), `f0425266`(heartbeat Origin), `a626988f`(e2e smoke) 등에 e2e smoke가 deploy 파이프라인에 들어간 모양이에요(`9ae0ab3c` 커밋 메시지: "wires the e2e smoke profile into deploy-docker.sh"). 이 부분은 좋아졌어요.

하지만 강사 dashboard 측에서 "최근 1시간 verdict 분포가 정상에서 벗어났어요" 같은 alert는 여전히 없어요. admin 측 worker dashboard(`src/app/(dashboard)/dashboard/admin/workers`)는 워커 슬롯·active task는 보여주는데, 강사 측에서 본인 과제 채점 상태를 보려면 학생 개별 제출 페이지 들어가야 하는 건 그대로.

운영자가 강사에게 미리 "지금 채점기에 문제 있어요"라고 알려줄 채널 없으면 강사는 학생 컴플레인으로 알게 돼요. "왜 제출이 다 compile error지?"가 강사한테 doomscroll로 들어오는 동안 admin은 dashboard 보고 있고, 강사는 admin dashboard 권한 없고, 학생 30명한테 답변하느라 시간 다 날아감.

## 8. 이메일·알림 채널 인벤토리

`grep -rln "nodemailer" src/lib/` 결과 `src/lib/email/`. 메일 인프라는 있어요. 어디서 쓰이나?
- `src/app/api/v1/admin/test-email/route.ts` — admin 측 테스트
- `src/app/api/v1/auth/resend-verification/route.ts` — 인증 메일
- password reset (`src/lib/email/index.ts`)

학생 측 운영 알림 채널 사용처:
- ❌ 과제 마감 24h 전 reminder
- ❌ 채점 결과 게시 알림(grade posted)
- ❌ 대회 시작 알림
- ❌ Clarification 답변 알림 (`isPublic=true`인 답변도 polling)
- ❌ 그룹 일괄 공지
- ❌ Anti-cheat flag → 강사에게 alert
- ❌ Code similarity match → 강사에게 alert

전부 안 보내요. 인프라는 있는데 비즈니스 로직 hookup이 0이에요. nodemailer가 deps에 들어와 있는 이유가 비밀번호 리셋용 한 곳이라는 게 운영자 입장에서는 아까운 상태.

## 9. Late penalty 세분화 부재

`assignments.latePenalty`(double precision)는 단일 비율(`schema.pg.ts:339`). SQL CASE는 `1.0 - latePenalty/100.0`을 단일 적용(`scoring.ts:155`, `:160`).

실제 학사 운영에서 자주 쓰는 정책들:
- 1일당 -10%, 4일 후 0점 — 표현 불가
- 1시간 grace + 이후 -5%/h — 표현 불가
- "주말 동안은 페널티 없음, 평일만 카운트" — 표현 불가
- 첫 24시간 -20%, 이후 -40% (계단형) — 표현 불가

전부 `lateDeadline`(이 시점까지는 latePenalty 적용, 이후는 안 받음) 단일 절단식.

이거 자체는 단순 RDB 모델로 풀 수 있어요. `assignment_late_penalty_tiers(assignment_id, applies_from_minutes, penalty_pct)` 같은 1:N 테이블 추가 + scoring CASE 보강. 그런데 작업이 안 됐어요.

## 10. 새로 본 이슈

### 🟡 Contest 진행 중 score override → leaderboard 캐시 정합성
`contest-scoring.ts`에 `invalidateRankingCache`가 있는데, score override가 일어났을 때 leaderboard 캐시 invalidate가 일어나는지 코드상 확인 필요. `overrides/route.ts:120` 에서 score override insert 후 ranking cache invalidate 안 해요. 학생들이 본 leaderboard가 score override 반영 안 되고 그대로 보일 가능성. 그러면 진행 중 학생 컴플레인.

### 🟡 Score override 권한 누가 받았는지
`canManageGroupResourcesAsync`(`src/lib/assignments/management.ts`)가 통과하면 override 가능. 공동 강사·TA가 다 override 가능한 모델. "TA는 review만, score override는 lead instructor만"이 안 됨. 학사 운영에서 grading authority가 lead에 모이는 학교라면 운영 정책 위반.

### 🟡 Contest export(`/api/v1/contests/[assignmentId]/export/route.ts`)와 그룹 export 분리
대회 export와 일반 그룹 과제 export가 같은 schema인지 확인 안 됨. CSV 컬럼이 다르면 강사가 매번 헷갈리는 부분.

### 🟡 Recruiting candidate stale 처리(오늘 신규 fix) 부수효과
`src/lib/recruiting/access.ts:136-162` `isStaleRecruitingCandidate`는 모든 invitation의 마감이 지났을 때 로그인 거부. 좋은 변경이지만, 합격자 통보 후 "마감 후 코드 다시 한 번 보고 싶어요"는 차단돼요. 사내 코딩 면접에서 면접관 입장에서는 candidate 본인 코드 view 권한과 access window를 분리하면 좋겠어요. 현재 모델은 "마감 = 즉시 영구 lockout".

### 🟡 Quick-create의 problem 수 cap = 50
`src/app/api/v1/contests/quick-create/route.ts:17` — 한 대회에 50문제 cap. 보통 대회는 충분하지만 모의고사 같은 운영 시 100+문제 셋도 종종 있음. 우회 가능(general assignment creation 사용)하지만 quick-create로는 안 됨.

## 11. 우선순위 정리 (오늘 기준)

다음 한 주 안에 손대야 할 것:

1. **개별 학생 마감 연장 테이블·UI·SQL CASE 통합** — 한 학기에 진단서 한두 명은 무조건 나오는데 매번 admin SQL은 운영 불가
2. **그룹 단위 CSV 로스터 임포트** — 200명 클래스 학기 시작 4단계가 1단계로 줄어듦, 작업량 가장 작음
3. **표절 페어 side-by-side diff 뷰 + review status persistence** — anti-cheat dashboard의 가장 큰 hole
4. **bulk rejudge cap 제거 → 과제 단위 rejudge 백그라운드 처리** — 어제 추천 그대로
5. **assignment-scoped 또는 problem-scoped rejudge endpoint** — admin 측 endpoint만 있어서 강사는 admin에게 요청해야

다음 2주 안:

6. 서브태스크/special judge — README의 IOI scoring claim과 실제 capability 갭 해소
7. Score override의 사유(reason)를 학생 측 화면에서 노출 + bulk override endpoint
8. 학생 단위 TZ 또는 과제 단위 TZ
9. 그룹 단위 announcement + 옵션 이메일 발송 (nodemailer는 이미 있음)
10. anti-cheat 프로파일 enum 분리 (exam/contest/team/none)

다음 한 달:

11. Late penalty tiered 모델
12. 채점 verdict 분포 anomaly alert (어제 사고 재발 방지)
13. 학기 단위 grades export endpoint
14. multi-section/cohort 모델 또는 assignment duplicate 기능

## 12. 한 줄 결론

오늘은 보안·인증·이메일 fix가 7개 들어갔고 그 중 frozen leaderboard 자동 해제는 강사 운영에 진짜로 도움이 돼요. 다만 어제까지 우선순위 1·2·3로 짚었던 "개별 학생 마감 연장", "CSV 로스터 임포트", "표절 트리아지 UI" 셋은 전부 그대로예요. 보안 빚은 갚는 중이고 운영 빚은 누적 중이라는 게 솔직한 상태예요. 다음 한 주 안에 위 우선순위 1·2 둘 다 안 들어가면 학기 운영 시즌에 운영자가 결국 DB 콘솔 열어서 직접 UPDATE 치게 돼요.
