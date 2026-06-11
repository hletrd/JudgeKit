# 후보자(Job Applicant) 관점 리뷰 — 2026-05-21

리뷰 시점: 2026-05-21
대상 사용처: 외부 후보자 대상 코딩 평가(채용용)
관점 전제: 한 번뿐인 응시 윈도우, 후보자는 긴장 상태. 사소한 UX 결함도 전부 증폭됨.

---

## 0. 어제·그저께 → 오늘 fix 추적

| 일자 | 이슈 | 오늘 상태 |
|---|---|---|
| 05-17 | 시스템 체크 페이지 부재 | ❌ 그대로. 후보자가 시작 누르면 곧장 시험 시작 |
| 05-17 | 서버 측 드래프트 복원 부재 | ❌ 그대로. `/api/v1/code-snapshots`는 POST만, GET 없음 (src/app/api/v1/code-snapshots/route.ts 전체) |
| 05-17 | Heartbeat freshness 90초 | ❌ 그대로. `ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS` 동일 |
| 05-17 | Anti-cheat tab_switch debounce | 🟡 부분 fix. `TAB_SWITCH_GRACE_MS = 3000` 추가됐어요 (src/components/exam/anti-cheat-monitor.tsx:50). 다만 `blur` 이벤트는 여전히 즉시 보고 (line 230-232) |
| 05-17 | 모바일 코드 작성 불가 | ❌ 그대로 |
| 05-17 | 결과 가시성 사전 안내 부재 | 🟡 부분. `showResultsToCandidate` 토글이 결과 페이지에서 안내됨 (recruit/[token]/results/page.tsx:169-182). 시작 전 화면은 여전히 침묵 |
| 05-17 | 후보자 본인 인증 약함(토큰 공유) | ❌ 그대로 |
| 05-17 | 후보자 계정 평생 살아남음 | ✅ **C-2 fix 됨**. `isStaleRecruitingCandidate`가 모든 invitation 윈도우 만료 시 `/login`을 차단 (src/lib/auth/config.ts:315-323, src/lib/recruiting/access.ts:136-162). 다만 새 failure mode를 만들었어요 → 아래 1.1 |
| 05-17 | 접근성 미흡 | ❌ 그대로 |
| 05-17 | 제출 영수증 부재 | ❌ 그대로 |
| 05-17 | 비밀번호 정책 8자 | 🟡 **서버는 12자로 강화됨** (src/lib/security/password.ts:11 `FIXED_MIN_PASSWORD_LENGTH = 12`). 다만 후보자 시작 폼은 여전히 `MIN_PASSWORD_LENGTH = 8`을 검증 (src/app/(auth)/recruit/[token]/recruit-start-form.tsx:20). **클라이언트/서버 불일치 → 후보자 패닉 (아래 1.2)** |
| 05-17 | 후보자 username brute-force surface | ❌ 그대로 |
| 05-18 | 채점 시스템 장애 시 후보자 알림 | ❌ 그대로 |
| 05-18 | 모바일 ARM64에서 niche 언어 안내 | ❌ 그대로 |
| 05-18 | GDPR/PIPA 데이터 보호 알림 | 🟡 부분. `recruit.privacy.*` 키 추가됨 (messages/ko.json:2756-2802). 응시 시작 화면 진입 동선은 여전히 빈약 |
| 05-21 | H-1/H-2 sandbox gate(이메일 인증 + 일일 200회) | 🆕 **후보자 BLOCK 가능 (아래 1.3)** |
| 05-21 | C-1 password reset 세션 무효화 | ✅ 후보자 계정 위생에는 좋음. `resetRecruitingInvitationAccountPassword`가 세션 즉시 삭제 (src/lib/assignments/recruiting-invitations.ts:419-435) |
| 05-21 | Anti-cheat heartbeat Origin 검증 | 🟡 후보자 UX 영향 미미. 다만 Origin 누락 브라우저(일부 임베디드 웹뷰)에선 403 (src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79) |

---

## 1. Top 5 후보자 UX 리스크 — 채용 브랜드 직접 손상

### 🔴 1.1 (NEW) C-2 fix로 마감 후 로그인 차단 — 이유 설명 없음

**시나리오**: 후보자가 시험 끝난 다음 날 결과를 확인하러 `/login`에 채용 이메일과 비밀번호로 접속. 자기 결과를 보려는 정상적인 행동이에요.

**현재 동작**: src/lib/auth/config.ts:315-323
```
if (await isStaleRecruitingCandidate(user.id)) {
  recordLoginEvent({ outcome: "invalid_credentials", ... });
  return null;
}
```
- 후보자는 `invalidCredentials` 에러를 받아요 → messages/ko.json:101 `"아이디나 비밀번호가 맞지 않아요"`
- 본인은 비밀번호를 정확히 입력했다고 확신함 → "내가 잘못 친 건가? 내 계정이 해킹됐나?" 패닉
- 비밀번호 reset 시도 → reset 메일은 가지만 reset 후에도 동일하게 `isStaleRecruitingCandidate`로 차단됨
- 결과 확인은 `/recruit/{token}/results` 경로로만 가능 (results/page.tsx:101-117)

**문제**: 후보자가 그 경로를 알 도리가 없어요. 이메일에 안내가 와야 하는데 안 와요. 채용 담당자한테 문의 → 담당자도 헷갈림.

**HR-안전한 fix**:
- C-2 차단 시 별도 outcome (`recruiting_window_closed`)을 기록하고 로그인 화면에 "이 평가의 본인 결과 확인은 [채용용 링크]에서 가능해요" 안내
- 마감 후 후보자에게 `recruit.resultsTitle` 페이지 링크가 포함된 이메일 발송 (현재 부재)
- 또는 `/login` 시 후보자 username 입력 시 "이 계정은 채용 평가 전용이에요. {token}-result-link로 결과를 확인하세요"

### 🔴 1.2 (NEW, 직접 차단) 비밀번호 최소 길이 클라이언트/서버 불일치

**파일**: src/app/(auth)/recruit/[token]/recruit-start-form.tsx:20
```
const MIN_PASSWORD_LENGTH = 8;
```
**서버**: src/lib/security/password.ts:11 `FIXED_MIN_PASSWORD_LENGTH = 12`

**시나리오**:
1. 후보자가 응시 시작 폼에서 10자 비밀번호 입력
2. 클라이언트 validate 통과 (8자 이상)
3. `signIn("credentials", { recruitToken, recruitAccountPassword: "10charpass" })`
4. 서버 `redeemRecruitingToken`가 `getPasswordValidationError` 호출 → `passwordTooShort` 반환 (src/lib/assignments/recruiting-invitations.ts:650-659)
5. `authorizeRecruitingToken`가 `null` 반환 → next-auth가 `result.error` 세팅
6. recruit-start-form.tsx:86-87:
   ```
   if (result?.error || !result?.ok) {
     setError(t("startFailed"));
   }
   ```
7. 후보자가 보는 것: messages/ko.json:2743 `"시작하지 못했어요. 다시 시도해 주세요."`
8. 같은 비밀번호로 재시도 → 동일 실패 → invitation의 `failedRedeemAttempts` 카운터 증가
9. **5회 실패 시 토큰 잠금** (`MAX_FAILED_REDEEM_ATTEMPTS = 5`, src/lib/assignments/recruiting-invitations.ts:49)

**아니, 잠깐**: `incrementFailedRedeemAttempt`는 `passwordValidationError` 케이스에서는 호출되지 않아요 (src/lib/assignments/recruiting-invitations.ts:650-660 코멘트 참조 — "Do NOT increment the brute-force counter for password FORMAT validation errors"). 그래서 잠금까진 안 가요. 다행이에요.

다만 후보자는 "시작하지 못했어요"만 보고 영문 모르고 응시 시간을 날려요. 패닉. 채용 담당자한테 문의 → 응시 시간 시계는 계속 가요.

**fix**:
- `MIN_PASSWORD_LENGTH = 12`로 클라이언트도 통일
- 또는 `validateStartInput`에서 서버 `FIXED_MIN_PASSWORD_LENGTH`를 export해서 single source of truth로
- recruit-start-form.tsx의 `result?.error`에서 에러 코드를 보고 `passwordTooShort` 등 구체 메시지를 분기

### 🔴 1.3 (NEW, 직접 차단) H-1/H-2 sandbox gate가 후보자한테 의미 없는 영문 에러 노출

**플로우**:
1. 후보자가 시험 들어가기 전 `/playground` (또는 `/practice/problems/[id]` 안의 컴파일러 UI)에서 워밍업
2. POST `/api/v1/playground/run` 호출
3. src/app/api/v1/playground/run/route.ts:37-43에서 `gateSandboxEndpoint` 호출
4. src/lib/security/sandbox-gate.ts:39-68에서 `users.emailVerified IS NULL` 검사
5. 후보자는 redeem 시 `emailVerified`가 절대 set 되지 않음 (`redeemRecruitingToken`이 `email: invitation.candidateEmail`만 set, emailVerified 안 건드림 — src/lib/assignments/recruiting-invitations.ts:662-671)
6. 응답:
   ```json
   {"error": "emailVerificationRequired",
    "message": "Verify your email before using the sandbox. Check your inbox for the verification link."}
   ```
   (sandbox-gate.ts:60-67, **영문 하드코딩**)
7. 후보자는 verification 이메일을 받은 적이 없어요. 워밍업 못 함.

**더 큰 문제**: 후보자가 실제로 `effectivePlatformMode = "recruiting"`라서 `restrictStandaloneCompiler = true`이고 playground는 어차피 막혀야 해요 (`getPlatformModePolicy` — src/lib/platform-mode.ts:19-21). 그런데 sandbox-gate가 line 38-43에 먼저 있고 platform-mode 체크가 line 45-50에 있어서 **순서가 거꾸로**예요. 후보자한텐 `emailVerificationRequired`라는 misleading 에러가 노출돼요. 본인은 평가 모드라 컴파일러를 못 쓰는 거지 이메일 인증 문제가 아니에요.

**fix**:
1. playground/run/route.ts에서 platform-mode 체크를 sandbox-gate보다 **먼저** 호출
2. sandbox-gate가 호출되는 케이스 자체를 비-recruiting 사용자로 좁히기
3. 또는 후보자한텐 sandbox-gate 자체를 bypass (어차피 platform-mode가 막음)

### 🔴 1.4 결과·점수가 시험 도중 모두 숨겨짐 — 후보자가 자기 코드 동작 확인 불가

**파일**: src/lib/submissions/visibility.ts:88-101
```
hideResults = !(assignmentRow?.showResultsToCandidate ?? false);
```

**default**: src/lib/db/schema.pg.ts:348 `showResultsToCandidate.default(false)`

**시나리오**:
- 후보자가 코드 제출 → `submissions.results` 채워짐 → SSE로 후보자에게 전달
- `sanitizeSubmissionForViewer`는 본인 제출이라도 (`isOwner = true`) `hideResults = true`면:
  - `results = []`
  - `compileOutput = null`
  - `executionTimeMs = null`, `memoryUsedKb = null`
  - `score = null`
  - `failedTestCaseIndex = null`
  - `runtimeErrorType = null`
- 후보자가 보는 것: 상태 badge(예: "accepted"/"wrong_answer")만 보이고 나머지 black box

**문제**: 후보자가 자기 제출이 컴파일 됐는지조차 모름. 컴파일 에러 났는데 status="compile_error" 뱃지만 보고 왜 에러인지 모름. 똑같은 잘못된 코드를 5번 제출하면서 시간 낭비.

**판단**: 이건 의도된 동작일 수 있어요 (recruiter가 후보자를 black box에 두고 싶을 수 있음). 그래도 **default가 false**라서 95%의 평가에서 후보자가 깜깜이로 응시해요. 합리적인 default는 시험 도중에는 본인 결과를 보여주고, 후보자 평가지에서 hideScores만 토글할 수 있게 분리하는 거예요.

**구체 fix 제안**:
- `assignments.showOwnResultsDuringExam` 새 컬럼 (default true)
- `showResultsToCandidate`는 마감 후 결과 페이지에만 적용
- `hideScoresFromCandidates`는 점수만 숨기고 verdict는 보여주기

### 🔴 1.5 후보자가 응시 도중 페이지 새로고침하면 작성 코드 사라짐

**상태**: 어제와 동일. `/api/v1/code-snapshots`는 POST만 받고 GET 없음 (src/app/api/v1/code-snapshots/route.ts).

**시나리오** (오늘도 그대로):
- 후보자가 30분간 코드 작성
- 마우스가 `contextmenu` 트리거 → anti-cheat 경고 toast 떠서 새로고침 누름 → 코드 통째로 사라짐
- 응시 시계는 계속 감
- 후보자 본인 잘못이 아니라 시스템 안내 부족

**fix**: 이전 리뷰와 동일 — `GET /api/v1/code-snapshots?problemId&assignmentId`로 본인 최근 snapshot 복원.

---

## 2. 후보자가 영문 모르고 헤매는 엣지 케이스

### 2.1 토큰 잠금(`tokenLocked`) 에러 → `startFailed`로 뭉뚱그려짐

**파일**: src/app/(auth)/recruit/[token]/recruit-start-form.tsx:86-87

5회 비밀번호 오타 누적 시 `redeemRecruitingToken`이 `error: "tokenLocked"` 반환. messages/ko.json:2748-2749에 `tokenLocked: "잠긴 링크"`, `tokenLockedDescription: "여러 번 시도가 실패해서 링크가 잠겼어요. 담당자에게 새 링크를 받아 주세요."` 좋은 메시지가 있어요. 그런데 폼이 그걸 출력 안 함. `t("startFailed")`로 끝.

**fix**: 폼에서 `result.error` 코드 분기 (다만 next-auth가 `result.error`에 구체 코드를 안 넣음. authorize가 `null` 반환하면 무조건 "Configuration" 또는 "CredentialsSignin". 즉 폼은 fail의 이유를 알 길이 없어요.)

근본 fix는 `authorizeRecruitingToken`이 `null` 대신 throw하면서 에러 코드 전달, 또는 별도 endpoint `/api/v1/recruiting/start-validate`로 사전 검증해서 구체 에러를 받기.

### 2.2 `accountPasswordResetRequired` 안내가 폼에 없음

**파일**: src/app/(auth)/recruit/[token]/page.tsx:264-268

관리자가 후보자 비밀번호를 reset 했을 때, page.tsx에서 amber 배너로 알려요. 좋아요. 다만:
- 이미 redeem된 토큰이고 비밀번호가 안 맞으면 `accountPasswordIncorrect`이 떨어지고 → 폼은 `startFailed`로 통합
- 후보자가 "내 비밀번호 맞는 거 같은데?" 의심 → "관리자가 reset 했을까?" 생각 못 함

### 2.3 `assignmentClosed` 에러도 마찬가지

`redeemRecruitingToken`이 `error: "assignmentClosed"` 반환. 후보자가 받는 메시지: "시작하지 못했어요. 다시 시도해 주세요." 시간 지나서 마감된 거면 다시 시도해도 똑같이 실패. 후보자는 "내 인터넷이 이상한가?"로 오해.

### 2.4 시험 시간 만료 시 후보자 화면 처리

**파일**: src/app/(public)/contests/[id]/page.tsx:298-302
```
{isExamExpired && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center space-y-2 dark:border-red-900 dark:bg-red-950">
    <p className="font-medium text-red-600 dark:text-red-400">{tGroups("examTimeExpired")}</p>
  </div>
)}
```
- 빨간 박스 한 줄만 떠요. "examTimeExpired" 텍스트 외에 다음 안내 없음
- 결과가 언제 공개되는지, 어디로 가서 봐야 하는지, 담당자 연락처가 어디인지 없음
- 후보자는 응시 끝났는데 뭘 해야 할지 몰라요

### 2.5 마감 후 `/recruit/{token}/results` 진입했는데 `showResultsToCandidate=false`

**파일**: src/app/(auth)/recruit/[token]/results/page.tsx:169-182
- "결과 공개 전이에요" 또는 "이 평가는 채용 담당자가 응시자에게 결과를 공개하지 않도록 설정했어요"라고 안내
- 다만 후보자한텐 "내가 떨어진 건가?" 신호로 받아들여질 수 있음
- 일부 회사는 "30일 안에 결과 안내드릴게요" 같은 예상 시점을 안내해야 함

### 2.6 후보자가 다른 기기에서 본인 token URL을 다시 열면

- page.tsx:134-138: `resumeWithCurrentSession = session?.user?.id === invitation.userId`
- 다른 기기에선 session이 없거나 다른 유저 → `resumeWithCurrentSession = false`
- → 비밀번호 입력 폼이 다시 뜸
- 후보자가 비밀번호를 까먹었으면 → 5번 틀려서 tokenLocked
- self-service 비밀번호 reset 없음. 담당자가 RPC로 reset해야 함 (`resetRecruitingInvitationAccountPassword` admin API)

### 2.7 후보자 브라우저 뒤로가기/앞으로가기

- 응시 중 `/contests/{id}` 페이지에서 뒤로가기 → `/recruit/{token}` 으로 돌아감
- 그 페이지가 다시 마운트되면 `RecruitStartForm`에서 또 "평가 계속하기" 버튼이 뜸 → 누르면 `router.push('/contests/{id}')`
- 큰 문제는 없지만 후보자가 "어, 내가 응시 다시 시작해야 하나?" 혼란

### 2.8 anti-cheat의 `blur` 이벤트가 그대로 즉시 전송됨

**파일**: src/components/exam/anti-cheat-monitor.tsx:230-232
```
function handleBlur() {
  void reportEventRef.current("blur");
}
```
- `tab_switch`는 3초 grace 있는데 `blur`는 grace 없음
- 시험 중 토스트 알림, 시스템 팝업, 외부 키보드 USB 끊김 등 윈도우 포커스 빠지는 이벤트 전부 즉시 신호
- 후보자가 한 번도 화면에서 눈을 떼지 않고 응시해도 OS 알림 한 번이면 `blur` 1건 기록
- 검토 보조용이라 곧장 부정행위로 매기진 않지만, **누적되면 인상이 안 좋아짐**

### 2.9 Origin 헤더 누락 시 anti-cheat 거부

**파일**: src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79
- `process.env.NODE_ENV === "production"`에서 Origin 헤더 검증
- 일부 임베디드 웹뷰, 일부 모바일 브라우저, privacy-strict 브라우저는 Origin 헤더를 누락
- 후보자가 시험 도중 anti-cheat 이벤트를 한 번도 못 보냄 → 운영자 입장에선 "이 후보자 의심스러운데?"
- 후보자 입장에선 영문 모름

**fix**: Origin 누락 시 `Referer`로 fallback (현재 fallback 없음)

---

## 3. 오늘 보안 fix가 만든 새 failure mode

### 3.1 C-2 (마감 후 로그인 차단) → 결과 확인 동선 단절

위 1.1 참조. 가장 큰 문제예요.

### 3.2 H-1/H-2 (sandbox gate) → 후보자한테 부적절한 영문 에러

위 1.3 참조.

### 3.3 C-1 (password reset 시 세션 무효화) → 시험 도중 reset 사고

- 관리자가 다른 후보자(동명이인 등) reset할 의도로 잘못 클릭 → `resetRecruitingInvitationAccountPassword` (src/lib/assignments/recruiting-invitations.ts:387-436)가 다음을 수행:
  - `users.passwordHash`를 랜덤 hex로 무효화
  - `users.tokenInvalidatedAt = now` 
  - `sessions` 테이블에서 해당 유저 모든 row 삭제
  - `recruitingInvitations.metadata._sys.accountPasswordResetRequired = "true"`
- 후보자 입장: 응시 중인데 갑자기 다음 페이지 요청 시 `jwt callback`에서 token이 invalidated 됐다고 판정 → `clearAuthToken(token)` → 강제 로그아웃 (src/lib/auth/config.ts:434-445)
- 응시 화면이 갑자기 `/login`으로 리다이렉트, 응시 시계는 계속 감
- 후보자가 다시 `/recruit/{token}`로 가서 새 비밀번호를 만들어야 응시 재개

**완화책 부재**: undo 기능 없음. audit log에 기록되긴 하지만 후보자 시간은 못 돌려줘요.

### 3.4 Anti-cheat heartbeat Origin 검증 → 모바일/임베디드 후보자 누락

위 2.9 참조.

---

## 4. 후보자가 악용 가능한 취약점

후보자 본인 token으로 로그인한 상태(role = "student", isRecruitingCandidate = true)에서 시도 가능한 공격.

### 4.1 자기 점수·verdict 조작 — 불가

- POST `/api/v1/submissions/[id]/rejudge`: `auth.capabilities = ["submissions.rejudge"]` 필요. student 캡abilities 미포함 (src/lib/capabilities/defaults.ts:10-13). **403**.
- DELETE submissions: 엔드포인트 자체가 없음 (src/app/api/v1/submissions/[id]/route.ts에 GET만 export). **불가**.
- 직접 `submissions.score` 수정: 그런 endpoint 없음. **불가**.

### 4.2 시간 연장 — 불가

- `examSessions.personalDeadline`을 수정하는 후보자-콜 endpoint 없음
- 후보자가 자기 contestAccessToken을 갱신 가능한 API 없음
- POST /api/v1/submissions가 `personalDeadline < NOW()` 시 `examTimeExpired` 반환 (src/app/api/v1/submissions/route.ts:343-356). DB time이라 클라이언트 시계 조작 불가
- **다만 한 가지 흥미로운 점**: contest의 `deadline` 자체는 assignment.deadline. 후보자가 `assignments` 업데이트 endpoint를 호출할 capability 없음. 안전.

### 4.3 익명 dummy 계정 생성 — 일부 가능

- 후보자는 일반 signup endpoint `/api/v1/auth/...`를 호출 가능 (해당 경로가 있다면)
- `/signup` 페이지 자체는 admin 설정에 따름 (`emailVerificationRequired`로 게이트)
- 후보자가 signup해서 학생 계정을 또 만들면 그 학생 계정으로 다른 contest 들어갈 수 있을까? 
- → 그 contest가 enrollment 필요한 private contest면 못 들어감. public contest면 들어가지만 같은 후보자가 본인 다른 계정으로 contest 풀어보는 건 다른 contest일 뿐.
- 직접 후보자 계정 익명성에 영향 없음.

### 4.4 anti-cheat 우회 — 부분 가능

**우회 가능한 부분**:
- 후보자가 `localStorage`에서 `judgekit_anticheat_notice_${assignmentId}`를 미리 set해두면 privacy notice가 안 뜸. 별 의미 없음 (어차피 이벤트는 다 보냄).
- POST `/api/v1/contests/[assignmentId]/anti-cheat`에 fake `eventType: "heartbeat"`을 60초마다 cron으로 보내면 본인이 자리에 없어도 heartbeat이 살아 있는 것처럼 보임. **이 우회 가능**.
- Origin 헤더 검증이 있어서 (route.ts:63-79) curl로 직접 호출하려면 Origin 헤더를 위조해야 하지만 그건 사소함

**우회 불가능한 부분**:
- `blur`, `tab_switch`, `copy`, `paste`, `contextmenu`는 후보자 본인이 발생시킨 이벤트라 봇이 위조해도 의미 없음 (검토자 입장에선 "안 한 거"보다 "한 게 0건"이 더 정상)
- IP 변경 자동 감지: 클라이언트가 위조 불가
- 코드 유사도: 채점 후 운영자가 돌리는 거라 후보자가 끼어들 길 없음

### 4.5 자기 anti-cheat 플래그 삭제 — 불가

- DELETE anti-cheat 이벤트 endpoint 없음 (route.ts에 GET, POST만)
- 후보자는 `db.delete(antiCheatEvents)` 콜할 capability 없음

### 4.6 다른 후보자 코드·점수 노출 시도

**IDOR로 시도**:
- GET `/api/v1/submissions/[id]` — 후보자가 `id`를 추측해서 다른 사람 submission ID로 시도
  - `canAccessSubmission(submission, user.id, user.role)` 호출 (src/app/api/v1/submissions/[id]/route.ts:42-46)
  - submission.userId !== user.id면 student 캡abilities는 `submissions.view_all` 없으므로 false
  - `canViewAssignmentSubmissions`로 fallback → student는 instructor 관계 없으므로 false
  - **403**. 안전.
- GET `/api/v1/contests/[assignmentId]/leaderboard` — 다른 후보자 명단 조회
  - leaderboard/route.ts:37-39: `if (recruitingAccess.isRecruitingCandidate && !isInstructorView) return apiError("forbidden", 403);`
  - **명시적 403**. 안전.
- GET `/api/v1/contests/[assignmentId]/participants` — 참가자 목록
  - participants/route.ts:26: `if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);`
  - **403**. 안전.
- GET `/api/v1/contests/[assignmentId]/anti-cheat` — 본인 외 anti-cheat 이벤트
  - anti-cheat/route.ts:166-180: `if (!canView) return apiError("forbidden", 403);` (canView = canManageContest)
  - **403**. 안전.
- GET `/api/v1/contests/[assignmentId]/participant-timeline/[userId]` — 다른 사람 타임라인
  - participant-timeline route.ts:8: `auth.capabilities = ["contests.view_analytics"]`. student 미포함.
  - **403**. 안전.

**SSE channel**:
- GET `/api/v1/submissions/[id]/events` — 후보자가 다른 submission ID로 SSE 구독 시도
  - submissions/[id]/events/route.ts:334-342: `if (!hasAccess) ... return forbidden();`
  - **403**. 안전.

**Cross-batch leak**:
- 다른 recruiting batch의 candidate가 같은 assignment에 invited 되지 않으면 `recruitingAccess.assignmentIds`에 안 들어감
- `canAccessProblem`가 problemIds 화이트리스트로 제한 (src/lib/auth/permissions.ts:115-118)
- 다른 batch problem ID로 접근 시도 → **거부**
- 다만 한 가지 케이스: 두 회사가 같은 JudgeKit 인스턴스를 공유하고 같은 problem ID(예: 라이브러리 problem)를 양 회사 평가에 둘 다 attach 했으면, 한쪽 candidate가 다른쪽 candidate의 submission ID를 추측 시도 가능. 다만 submission ID는 nanoid라 추측 불가. **safe**.

### 4.7 채점기 우회 — 후보자 입장에선 무의미

- 본인이 채점기를 우회해서 자기 점수를 임의로 올리는 endpoint 없음
- judge worker가 polling으로 가져가는 구조 (src/app/api/v1/judge/* 는 worker auth)

### 4.8 자신의 제출 재제출 — 가능, 의도된 동작

- POST `/api/v1/submissions`로 같은 problem 여러 번 제출 가능
- `assignments.maxAttempts` 같은 칼럼이 있어 limit 가능. 다만 default가 unlimited (확인 필요)
- "최고 점수 반영" (recruit.noteSubmissions, messages/ko.json:2732)이라 의도된 동작

### 4.9 csrf 우회 시도

- 모든 POST는 `validateCsrf` 거침. Origin/Referer 둘 다 누락 시만 통과(curl 등). Origin이 다른 도메인이면 403. **안전 수준 적당**.

### 4.10 후보자 token URL 공유로 대리 응시 — 가능

- 후보자 본인이 친구한테 token URL + 비밀번호 알려주면 친구가 응시 가능
- IP 추적, anti-cheat heartbeat 등으로 사후 검토는 되지만 차단은 안 됨
- 이건 산업 표준 한계. 신분증 업로드, 웹캠 keepalive가 필요한 영역

### 4.11 결과 페이지 IDOR 시도

- GET `/recruit/{otherToken}/results` — 다른 토큰의 결과 페이지
- results/page.tsx:105: `if (!session?.user?.id || session.user.id !== invitation.userId)` → 본인 아니면 차단
- results/page.tsx:124-128: 추가로 `recruitingAccess.assignmentIds.includes(invitation.assignmentId)` 검증
- **2중 게이트로 안전**.

**결론**: 후보자 권한으로 실질적 권한 상승·정보 노출 가능한 endpoint는 없어요. anti-cheat heartbeat 위조가 유일한 우회 표면.

---

## 5. 후보자에게 노출되면 안 되는 정보가 새는 곳

### 5.1 다른 후보자 명단·이름·이메일·점수 — leak 없음

- 위 4.6에 정리. recruiting candidate는 leaderboard·participants·anti-cheat·timeline endpoint에서 명시적 403.
- 안전.

### 5.2 다른 batch problem·테스트 케이스·해설 — leak 없음

- canAccessProblem이 `recruitingAccess.problemIds` 화이트리스트로 제한 (permissions.ts:115-118)
- 같은 instance에 학원/대학·다른 회사 problem이 있어도 후보자가 못 봄
- 다만 **하나의 conditional**: `problem.visibility === "public"`라도 recruiting candidate 분기가 먼저 체크돼서 public problem도 못 봐요 (line 116-118이 line 128 `if (problem.visibility === "public") return true;`보다 먼저). 이건 의도된 거. 안전.

### 5.3 채점 로직·실행 로그·내부 ID — 일부 leak

**채점 로직**: 후보자한텐 노출 안 됨.

**실행 로그**: 
- `submissions.compileOutput`은 `showCompileOutput`이 problem 단위로 토글됨 (default true). 본인 제출이면 보임.
- runtime error는 `showRuntimeErrors` 토글. default true.
- **문제**: recruiter 측 problem 설정 default가 후보자한테 fix하지 않음. 후보자가 본인 코드 디버그 가능 ↔ recruiter는 "안 보여주고 싶음". 이건 의도된 토글 영역이라 leak은 아님.

**내부 ID**:
- submission ID는 nanoid, 추측 불가
- assignment ID는 token redeem 후 후보자 본인이 가짐 (`/contests/{id}`). 다른 후보자 assignmentId는 자기 problemIds로 노출 안 됨.
- groupId가 `contest.groupName`으로 노출됨 (page.tsx:241). 후보자가 회사 내부 그룹명을 알게 될 수 있음.

### 5.4 DB 컬럼명·스택 트레이스·디버그 토큰·DSN — leak 점검

- Next.js 에러 페이지: production에선 generic. Dev 모드 노출은 운영자 책임.
- apiError 응답은 `{error: "code", message?: string}` 패턴. 스택 트레이스 누락. 안전.
- DSN: env 검증이 `getValidatedAuthSecret`, `validateAuthUrl` 등에서 fail fast. 후보자한테 노출되는 경로 없음.

### 5.5 HR 노트·평가자 코멘트·합격/불합격 라벨

- `submissionComments`: 후보자는 본인 submission의 comment를 GET 가능 (submissions/[id]/comments/route.ts:13-42, `canAccessSubmission` 통과)
- **leak**: instructor가 후보자 submission에 코멘트를 달면 후보자가 그 코멘트를 시험 중에 SSE 또는 GET으로 볼 수 있어요. 운영자가 "이 친구 잘 푸네"라는 코멘트를 후보자가 직접 봄.
- 코멘트 작성자 이름·role 노출 (`author: { columns: { name: true, role: true } }`)
- HR 노트 등 라벨 필드 없음

**구체 fix**: 후보자 평가 진행 중 코멘트는 `isInternal` 플래그로 후보자 노출 차단

### 5.6 같은 인프라에서 학생과 후보자 데이터 cross-view

- 학생이 후보자 데이터 보기: `canAccessProblem`에서 학생은 본인 enrollment·public·author 경로만. 후보자 problem(visibility=private이 일반적)는 학생한테 안 보임.
- 후보자가 학생 데이터 보기: 위 5.1, 5.2.
- 안전 수준 적정.

### 5.7 error message·404·redirect·timing channel로 enumeration

**Token enumeration**:
- POST `/api/v1/recruiting/validate` — invalid token vs revoked vs expired vs assignment-closed 전부 동일하게 `{valid: false}` 반환 (validate/route.ts:58-77). **enumeration 불가**.
- GET `/recruit/{token}` page — invalid/revoked는 `invalidToken` 카드, expired는 `expired` 카드, contest closed는 `contestClosed` 카드. **이 차이로 enumeration 가능**.
  - 다만 rate limit 30/min/IP (page.tsx:86-92). 1000 tokens 추측에 33분 걸림. 약함.
  - tokenHash는 SHA256이라 prefix collision도 32 bytes random이면 사실상 불가.

**Email enumeration**:
- `/login` invalid_credentials는 user/email 누설 안 함 (DUMMY_PASSWORD_HASH로 timing constant)
- 다만 C-2 fix는 stale recruiting candidate일 때 invalid_credentials를 반환. 이게 일반 invalid_credentials와 timing 차이 발생할 수 있음 (DB 추가 쿼리). 측정 가능한지는 의문이지만 이상적이진 않음.

**Timing**:
- `redeemRecruitingToken`에서 password verification 한 번 → timing 평탄
- 다만 token이 redeemed/pending/revoked에 따라 분기 경로가 다르므로 미세한 timing 차이 가능

### 5.8 HTML 소스 노출 데이터

**Next.js __next_data**:
- recruit/[token]/page.tsx는 server component. props 직렬화로 클라이언트에 `invitation` 일부가 흘러갈 위험.
- 자세히 보면 page.tsx에서 사용한 invitation 필드는 candidateName(welcome 텍스트에), candidateEmail(누설 안 함). `RecruitStartForm` props는 `token`, `assignmentId`, `isReentry`, `resumeWithCurrentSession`, `requiresAccountPassword`, `assessmentTitle`, `examDurationMinutes`. 다른 후보자 정보 leak 없음.
- **다만**: `token`을 client component에 prop으로 그대로 넘김 (recruit-start-form.tsx:31). HTML 소스에 토큰이 박혀요. 후보자가 본인 PC에서 view source하면 자기 토큰이 보임. 토큰 자체는 자기 거라 큰 문제는 아니지만, 캐시·로그·스크린 공유 시 노출.

### 5.9 WebSocket·SSE·polling 응답

- `/api/v1/submissions/[id]/events` (SSE): 본인 submission만 구독 가능. 30s마다 re-auth check.
- `/api/v1/contests/[assignmentId]/clarifications`: 본인 + public 답변만. 안전.
- 다만 SSE 응답에 `sanitizeSubmissionForViewer`가 적용되긴 하는데, `assignmentVisibility`를 안 넘겨서 (events/route.ts:410, `caps` 만 넘김) hidden DB query가 트리거됨 — 후보자가 마감 전 본인 submission을 보면 또 sanitizer가 `showResultsToCandidate=false`로 처리해서 결과 비표시. cross-leak은 아니지만 성능 N+1 위험.

### 5.10 contestAccessTokens redeemedIp 노출

- recruit/[token]/results/page.tsx는 ipAddress를 노출하지 않음. 안전.
- /contests/[id] 페이지도 본인 IP 노출 안 함.
- `getRecruitingInvitations` (recruiting-invitations.ts:264)는 `ipAddress`를 SELECT하지만 GET endpoint에 `recruiting.manage_invitations` 캡abilities 필요 → 후보자 차단.

### 5.11 anti-cheat heartbeat 응답에서 leak

- POST /api/v1/contests/[assignmentId]/anti-cheat 응답: `{logged: true|false}` 단순. 안전.

---

## 6. 후보자 UX 추가 발견 사항

### 6.1 bilingual support — 일관성 흔들림

- 후보자는 redeem 시 `preferredLanguage` 안 받음 (recruit-start-form.tsx, page.tsx). 시스템 default locale 또는 cookie에 따름.
- 후보자가 영문 환경에서 URL 클릭 → 영문 페이지 → 시험 들어가니 `/contests/{id}`가 cookie LOCALE_COOKIE_NAME이 안 set돼서 default(ko) 노출 가능
- 후보자가 "갑자기 한국어가 나오네?" 패닉
- recruit page는 `getLocale()`을 호출하지만 invitation 자체에 candidate locale 저장 안 함

**fix**: invitation metadata에 `_sys.candidateLocale` 저장하고 redeem 시 cookie set

### 6.2 mobile usability — 접근 자체가 어려움

- recruit/[token]/page.tsx는 `max-w-lg` Card 디자인. 모바일에서 카드는 보이지만:
- `/contests/{id}` 응시 화면은 CodeMirror·문제 설명·테스트 결과 패널이 desktop layout
- 후보자가 모바일에서 "접근 가능 확인용"으로 열어보면 응시 시 시계가 가버릴 위험
- 모바일 디텍션 후 "데스크톱에서 응시해 주세요" 사전 안내 없음

### 6.3 accessibility

- recruit/[token]/page.tsx의 AlertDialog 시작 확인 다이얼로그: shadcn/ui 기반이라 focus trap, ARIA는 적정
- 다만 amber/sky/emerald 박스의 색만으로 정보 전달하는 패턴이 많아 색약 후보자한테 약함
- skip-link, h1 계층 등 점검 안 됨

### 6.4 결과 페이지 진입 동선

- 마감 후 후보자가 `/recruit/{token}/results`를 어떻게 알까요?
- 응시 시작 화면에 결과 페이지 안내 없음
- 응시 완료 후 자동 리다이렉트 없음 (contests/{id}에서 `examTimeExpired` 화면에 머무름)
- 후보자에게 발송되는 이메일이 없으니 본인이 token URL 다시 클릭해서 들어가야 함

### 6.5 제출 영수증 부재

- 응시 완료 후 PDF, 이메일 영수증 없음
- 일부 회사는 법적 증빙용으로 요구
- submission ID는 nanoid 21자라 후보자가 "내 응시번호 XYZ"로 문의 가능하긴 함

### 6.6 후보자 검토 안내 텍스트(reviewNoticeAiUndetectable)

- messages/ko.json:2822: "참고: 코드 유사도 검사는 이 플랫폼 안의 제출끼리 구조적 유사성만 비교해요. 그 자체로 AI가 만든 코드를 식별하지는 않아요."
- 후보자한테는 "이 회사는 내 AI 도구 사용을 정확히 탐지 못 한다"는 신호로 읽힐 수 있음
- 운영 의도와 후보자 해석이 어긋남

---

## 7. 시나리오 — 가상 후보자 입장 walk-through

### 시나리오 A: 정상 응시

1. 후보자가 이메일로 받은 token URL 클릭
2. `/recruit/{token}` 페이지: 회사 로고·평가명·문제 수·언어 목록·시간 안내·"중요 안내" amber 박스·"검토 안내" sky 박스. **여기까진 깔끔**.
3. 비밀번호 만들기 (10자 입력 시 1.2의 실패. **12자 이상이면 통과**).
4. "지금 시작" 누름 → AlertDialog로 확인 → 다시 누름
5. `/contests/{id}` 진입. anti-cheat privacy notice dialog (anti-cheat-monitor.tsx:39-45) 노출.
6. "확인했어요" 누르고 시험 시작.
7. 코드 작성 중 OS 알림 한 번 → `blur` 이벤트 기록 (2.8).
8. 코드 제출 → 결과가 status badge만 보이고 details black box (1.4). 컴파일 됐는지조차 모름.
9. 마감 임박. 후보자 코드 디버그 못 함. 패닉 제출.
10. 시간 만료. `examTimeExpired` 빨간 박스만 보임. 다음 안내 없음 (2.4).
11. 다음 날 후보자가 `/login`으로 결과 보러 옴 → invalidCredentials. 패닉 (1.1).

### 시나리오 B: 후보자가 무선 wifi 약함

1. 코드 작성 중 heartbeat 5분 끊김.
2. 다시 연결. heartbeat 회복.
3. 95초 ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS 초과 상태에서 제출 시도 시:
   - validateAssignmentSubmission에서 `antiCheatHeartbeatRequired` 에러 (src/lib/assignments/submissions.ts heartbeat check, messages/ko.json:482 안내)
   - 후보자가 새로고침 → 코드 사라짐 (1.5)

### 시나리오 C: 모바일로 응시 접근 확인

1. 후보자가 직장에서 폰으로 token URL 클릭 (괜찮나 확인용)
2. 페이지가 모바일에서 그럭저럭 보임 → "괜찮네, 집 가서 데스크톱으로 해야지"
3. **이때 시작 버튼 누르면 시계 시작** (windowed exam). 후보자가 잠시 화면 보다가 친구한테 전화 받으러 자리 비움 → 모바일 background → blur 이벤트 ×N → tab_switch 이벤트
4. 집에 와서 데스크톱으로 응시 시작 → "어, 이미 시작했네?" → 시간이 줄어있음

### 시나리오 D: 후보자 비밀번호 reset 요청 시

1. 후보자가 비밀번호 까먹음. /login에서 forgot-password 시도.
2. forgot-password가 stale candidate한테 reset 메일을 보낼지, 아니면 차단할지 점검 필요. 현재 `isStaleRecruitingCandidate` 체크는 `/login`의 authorize에만 있음. forgot-password는 별도.
3. 후보자가 reset 받아서 새 비밀번호로 login 시도 → 또 `isStaleRecruitingCandidate`로 차단. 후보자는 "reset이 안 먹혔다"고 오해.

---

## 8. 추천 작업 순서 (priority)

1. **클라이언트 비밀번호 길이 12자 통일** (1줄 수정, 즉시) — 1.2
2. **C-2 차단 시 안내 메시지 분기** — `recruit.staleAccountNotice` 키 추가, login form이 outcome 별로 메시지 분기 — 1.1
3. **playground 게이트 순서 swap** — platform-mode 체크가 sandbox-gate보다 먼저 — 1.3
4. **시험 도중 본인 결과 표시 default 변경** — `showOwnResultsDuringExam` 추가 또는 default true로 — 1.4
5. **서버 측 드래프트 복원 endpoint** — `/api/v1/code-snapshots GET` — 1.5
6. **시험 시간 만료 화면에 결과 동선 안내** — `/recruit/{token}/results` 링크 + 결과 공개 일정 — 2.4
7. **anti-cheat blur grace 추가** — tab_switch와 동일하게 3초 grace — 2.8
8. **submissionComments에 isInternal 플래그** — 후보자 차단 — 5.5
9. **응시 완료 후 후보자 이메일 발송** — submission summary + 결과 페이지 링크 (제출 영수증 겸 결과 동선)
10. (장기) 모바일 사전 안내, 신분증 업로드, 시스템 체크 페이지

---

## 9. Show-stopper 후보

- **1.1 (C-2 후 로그인 동선 단절)** + **1.2 (비밀번호 클라/서버 불일치)** 조합. 이 둘 중 하나만 발생해도 후보자는 "이 회사 시스템 망가졌네" 인상. 채용 브랜드 직접 손상.
- **1.4 (본인 결과 black box)** — 채용 평가의 핵심 UX. recruiter는 컨트롤하고 싶지만 default가 가혹.
- **1.5 (드래프트 분실)** — 발생 빈도는 낮지만 발생 시 후보자가 즉시 응시 포기

---

## 10. 보안 리뷰 연동

- C-1 (password reset 시 세션 invalidate): 채용 환경에선 ✅. 시험 도중 운영자 실수 reset 시 후보자 강제 로그아웃은 부작용 (3.3).
- C-2 (stale candidate 차단): 운영 데이터 잔존 방지엔 ✅. 결과 확인 동선 단절은 미해결 (1.1).
- H-1/H-2 (sandbox gate): 비-staff 200/day, email verified 필요. 후보자한텐 부적절한 에러 노출 (1.3).
- H-3 (CSP static fallback `script-src 'self'`): proxy.ts가 nonce를 정상 주입하는 한 후보자 영향 없음. proxy.ts가 실패한 라우트가 있으면 hydration 깨짐. 후보자가 응시 못 함.
- H-5 (`X-Forwarded-For` 1-element 케이스): 후보자 IP 신뢰성 약함. anti-cheat IP 변경 신호의 신뢰도가 떨어짐.

---

## 11. 검증 — 새 테스트 요구사항

`tests/e2e/recruiting-invitation.spec.ts`(137줄)는 현재 cross-batch problem 격리만 검증. 다음 시나리오 미커버:

- 마감 후 `/login`으로 candidate 로그인 시도 → 401 (C-2)
- 마감 후 `/recruit/{token}/results` 접근 → 본인 결과 표시 (showResultsToCandidate=true 케이스)
- 비밀번호 8자 입력 시 server 12자 enforce
- 후보자가 playground 호출 → 403 (recruiting platform mode)
- 후보자가 다른 후보자 submission GET → 403
- 후보자가 leaderboard GET → 403
- 후보자가 anti-cheat heartbeat 정상 전송 → 200

C-2 fix는 unit 또는 integration 레벨에서 `isStaleRecruitingCandidate` 진실표 검증 + auth config 통합 테스트 필요.

---

## 12. 후보자 권한 endpoint 매트릭스 (실 호출 시뮬레이션)

후보자 token으로 인증된 상태(`role = "student"`, `isRecruitingCandidate = true`)에서 각 endpoint 호출 시 예상 결과. 모든 결과는 코드 확인 기반.

### 12.1 본인 정보 / 일반 호출

| Method | Endpoint | 예상 응답 | 비고 |
|---|---|---|---|
| GET | `/api/v1/users/{self}` | 200 | 본인 정보. src/app/api/v1/users/[id]/route.ts:270-285 (`isSelf` 통과) |
| GET | `/api/v1/users/{other}` | 403 | `users.view` 캡abilities 없음 (line 274-277) |
| PATCH | `/api/v1/users/{self}` (`{name, className}`) | 200 | 본인 프로필 수정 가능. username/email 변경은 403. line 296-311 |
| DELETE | `/api/v1/users/{self}` | 403 | `users.delete` 없음 (line 412-413) |
| GET | `/api/v1/users` (list) | 응답 코드 확인 필요. 일반적으로 `users.view`가 필요 → 403 추정 |

### 12.2 제출 / 채점 관련

| Method | Endpoint | 예상 응답 | 비고 |
|---|---|---|---|
| GET | `/api/v1/submissions?problemId=...` | 200, **본인 제출만** | route.ts:46 `userFilter = eq(submissions.userId, user.id)` |
| POST | `/api/v1/submissions` (assignmentId = 본인 평가) | 201 | 정상 |
| POST | `/api/v1/submissions` (assignmentId = 다른 평가) | 403 | `canAccessProblem`에서 problemIds 화이트리스트 (permissions.ts:115-118) |
| GET | `/api/v1/submissions/{ownId}` | 200 sanitized | `canAccessSubmission` 본인 통과. visibility 적용 |
| GET | `/api/v1/submissions/{otherId}` | 403 | submissions/[id]/route.ts:42-50 |
| POST | `/api/v1/submissions/{ownId}/rejudge` | 403 | `submissions.rejudge` 캡abilities 없음 (rejudge/route.ts:15) |
| GET | `/api/v1/submissions/{ownId}/comments` | 200 | `canAccessSubmission` 본인 통과. **운영자 코멘트도 보임** (5.5 leak 후보) |
| POST | `/api/v1/submissions/{ownId}/comments` | 403 | `submissions.comment` 캡abilities 없음 |
| GET | `/api/v1/submissions/{ownId}/events` (SSE) | 200 | 본인 제출 진행 상태 스트리밍 |
| GET | `/api/v1/submissions/{otherId}/events` | 403 | events/route.ts:334-342 |
| GET | `/api/v1/submissions/{ownId}/queue-status` | 응답 코드 확인 필요. 본인 제출이면 200 추정 |

### 12.3 콘테스트 / 평가

| Method | Endpoint | 예상 응답 | 비고 |
|---|---|---|---|
| GET | `/api/v1/contests/{assigned}/leaderboard` | **403** | `isRecruitingCandidate && !isInstructorView → forbidden` (leaderboard/route.ts:37-39) |
| GET | `/api/v1/contests/{assigned}/participants` | **403** | `canManageContest` 필요 (participants/route.ts:26) |
| GET | `/api/v1/contests/{assigned}/anti-cheat` | **403** | `canManageContest` 필요 (anti-cheat/route.ts:178) |
| POST | `/api/v1/contests/{assigned}/anti-cheat` | 200 (정상 신호) / 403 (Origin 없음) | 후보자 본인 이벤트 기록 정상 |
| GET | `/api/v1/contests/{assigned}/clarifications` | 200, **본인 + 공개 답변** | route.ts:55 필터링 |
| POST | `/api/v1/contests/{assigned}/clarifications` | 200 | 본인 질문 작성 정상 |
| GET | `/api/v1/contests/{assigned}/announcements` | 응답 코드 확인 필요. enrollment 통과면 200 추정 |
| GET | `/api/v1/contests/{assigned}/analytics` | **403** | `contests.view_analytics` 캡abilities 없음 |
| GET | `/api/v1/contests/{assigned}/stats` | 응답 코드 확인 필요. 일반적으로 instructor 전용 → 403 추정 |
| GET | `/api/v1/contests/{assigned}/export` | **403** | `contests.export` 캡abilities 없음 |
| GET | `/api/v1/contests/{assigned}/recruiting-invitations` | **403** | `recruiting.manage_invitations` 캡abilities 없음 (route.ts:18) |
| GET | `/api/v1/contests/{assigned}/recruiting-invitations/stats` | **403** | 동일 캡abilities 필요 |
| POST | `/api/v1/contests/{assigned}/invite` | **403** | 운영자 전용 |
| GET | `/api/v1/contests/{assigned}/participant-timeline/{anyUserId}` | **403** | `contests.view_analytics` 필요 |
| GET | `/api/v1/contests/{assigned}/code-snapshots/{anyUserId}` | **403** | 운영자 전용 (`canManageContest` 추정) |
| GET | `/api/v1/contests/{assigned}/access-code` | 응답 코드 확인 필요 |
| POST | `/api/v1/contests/quick-create` | **403** | `assignments.create` 캡abilities 없음 |

### 12.4 코드 스냅샷 / 컴파일러

| Method | Endpoint | 예상 응답 | 비고 |
|---|---|---|---|
| POST | `/api/v1/code-snapshots` (자기 problem) | 201 | code-snapshots/route.ts |
| POST | `/api/v1/code-snapshots` (다른 problem) | 403 | `canAccessProblem` 실패 |
| GET | `/api/v1/code-snapshots` | **endpoint 없음** | 1.5 드래프트 복원 부재 원인 |
| POST | `/api/v1/playground/run` | **403** `emailVerificationRequired` 또는 `compilerDisabledInCurrentMode` | 1.3 |
| POST | `/api/v1/compiler/run` | 응답 코드 확인 필요. 동일 게이트 추정 |

### 12.5 인증 / 계정

| Method | Endpoint | 예상 응답 | 비고 |
|---|---|---|---|
| POST | `/api/v1/auth/resend-verification` (body.userId = self) | 200 | resend-verification/route.ts:18 본인만 허용 |
| POST | `/api/v1/auth/resend-verification` (body.userId = other) | 403 | line 18-20 |
| POST | `/api/v1/auth/forgot-password` | 응답 코드 확인 필요. 일반 유저용 |
| POST | `/api/v1/auth/reset-password` | 200 if 본인 토큰 | C-1 fix로 reset 시 세션 무효화 |
| POST | `/api/v1/auth/verify-email` | 200 if 본인 토큰 | 일반 verification |

### 12.6 커뮤니티 / 문제

| Method | Endpoint | 예상 응답 | 비고 |
|---|---|---|---|
| GET | `/api/v1/community/threads` | 200, **본인 problem 한정** | scope 별 problem access 체크 |
| POST | `/api/v1/community/threads` (자기 problem scope) | 200 | `canAccessProblem` 통과 |
| POST | `/api/v1/community/threads` (다른 problem scope) | 403 |
| POST | `/api/v1/community/threads` (editorial scope) | 403 | `community.moderate` 필요 |
| GET | `/api/v1/problems` | 200, **assigned problems만** | `getAccessibleProblemIds` 필터링 (permissions.ts:158-162) |
| GET | `/api/v1/problems/{assigned}` | 200 | canAccessProblem 통과 |
| GET | `/api/v1/problems/{public_unassigned}` | **403** | recruiting candidate는 public도 차단 (permissions.ts:115-118이 line 128보다 먼저) |

### 12.7 admin / files / groups

| Method | Endpoint | 예상 응답 |
|---|---|---|
| `*` | `/api/v1/admin/**` | 403 (캡abilities 없음) |
| POST | `/api/v1/files` | 403 (`files.upload` 캡abilities 없음) |
| GET | `/api/v1/groups` | 응답 코드 확인 필요. 본인 enrollment만 노출 추정 |
| GET | `/api/v1/groups/{enrolled}` | 200, 본인 enrollment 그룹 |
| GET | `/api/v1/groups/{not enrolled}` | 403 (`canAccessGroup` 실패) |

### 12.8 매트릭스 요약

- **권한 상승 가능 endpoint: 없음**. 후보자가 student role + isRecruitingCandidate로 호출 가능한 모든 endpoint는 본인 데이터에만 접근. cross-batch leak 확인된 곳 없음.
- **misleading 에러 노출**: `/api/v1/playground/run`이 후보자한테 `emailVerificationRequired` 영문 메시지 노출 (1.3).
- **submissionComments에 운영자 코멘트 노출**: 5.5에서 지적. instructor가 후보자 코드에 코멘트 달면 그게 후보자한테 노출.

---

## 13. 추가 공격 시나리오 — 후보자가 시도해볼 만한 것

### 13.1 시험 중 본인 점수 미리 알기 (의도된 black box 우회)

- 위 1.4에서 본인 결과가 sanitize됨. 우회 시도:
- POST `/api/v1/submissions`로 같은 코드를 여러 problem에 동시 제출 → 어느 problem에 score=null이 떨어지는지 timing 측정
- 의미 있는 정보는 거의 안 새고, 후보자 시간만 낭비. **non-issue**.

### 13.2 본인 problem 풀이 시간 측정 우회

- examSession.personalDeadline은 DB time이라 클라이언트 시계 조작 불가
- `/api/v1/time` 같은 server time endpoint를 호출해서 본인 마감까지 정확한 시간 계산은 가능
- 그건 의도된 동작 (Countdown timer)

### 13.3 다른 후보자 username 얻기

- leaderboard 403, participants 403
- 본인의 `/api/v1/contests/{id}/clarifications`에서 본인 외 답변은 instructor가 작성한 공개 답변만 보임. 다른 후보자 username 미노출.
- audit_log 노출 endpoint 없음. **enumeration 불가**.

### 13.4 anti-cheat 신호 cover-up

- DELETE 없음. POST는 추가만. 후보자가 본인 anti-cheat 이벤트 삭제 불가.
- 다만 본인 heartbeat을 cron으로 끊김 없이 보내서 자리 비움을 가리는 건 가능 (4.4)

### 13.5 본인 응시 시간 연장 시도

- POST `/api/v1/examSessions/...` 같은 endpoint 부재
- `examSessions.personalDeadline` 수정 후보자 endpoint 없음
- 후보자가 `startsAt` 이전에 응시 시작했다가 다시 시작 시도 → 두 번째 시작은 무시됨 (이미 examSession 존재)
- **연장 불가**.

### 13.6 본인 redeem 정보 변경 (이름·이메일 등)

- PATCH `/api/v1/users/{self}` → name, className 변경 가능
- username·email은 admin-only (route.ts:305-311)
- 평가 진행 도중 후보자가 이름을 "John Doe"로 바꾸면 audit log에 "John Doe"로 찍힘. recruiter가 헷갈릴 수 있지만 audit log에 변경 기록은 남음 (`recordAuditEvent`)
- **misuse 약함**.

### 13.7 본인 invitation 재사용 (다른 친구 redeem 시도)

- token이 redeemed 상태면 다음 호출자는 `accountPasswordRequired` 또는 `accountPasswordIncorrect`
- 친구가 같은 비밀번호 모르면 5회 실패 후 tokenLocked
- 친구가 비밀번호 알면 본인 행세 가능 (4.10)

### 13.8 본인 token URL 외부 공유 후 합격 정보 leak

- 마감 후 다른 사람이 token URL을 열면:
  - 본인 세션 없으면 `claimed` 카드 → "이 초대 링크는 이미 사용됐어요"
  - 본인 비밀번호 모르면 들어가지 못함
  - `/recruit/{token}/results`도 본인 session.user.id === invitation.userId 검증 (results/page.tsx:105)
- **leak 없음**.

### 13.9 본인 SSE 연결로 채점기 상태 추정

- `/api/v1/submissions/{ownId}/events`는 본인 제출만. queue depth 누설 없음
- 다른 후보자 채점 timing 추정 불가

### 13.10 csrf+session-fixation 콤보

- 후보자가 다른 후보자한테 fake recruit link를 보내서 자기 token을 redeem하게 유도
- 그쪽이 자기 비밀번호로 redeem하면 본인 user record가 사라지고 그쪽 user가 생성됨
- 다만 invitation은 attacker가 보낸 token일 뿐이고 attacker 토큰의 비밀번호를 attacker가 모르면 본인 행세 못 함
- **realistic threat 낮음**.

### 13.11 본인 anti-cheat heartbeat fake

- 위 4.4에서 다룸. 본인이 자리에 없어도 heartbeat을 봇으로 보내서 자리 있는 척 가능.
- 한 가지 새 차원: Origin 검증이 추가됐어요 (오늘 fix). 봇이 `Origin: https://judgekit.example.com` 헤더를 위조하면 통과. 검증 자체가 봇 차단엔 약함.

---

## 14. 후보자 단계별 timeline — 정확한 file:line 호출 추적

후보자가 token URL 클릭 후부터 응시 완료까지 모든 핵심 분기점.

### Step 1: 이메일 → token URL 클릭

후보자가 받는 이메일 본문 자체는 `sendEmailVerification`이나 별도 invitation 메일 발송 코드 경로를 따름. 본 리뷰 범위 밖이지만, **token이 plaintext로 이메일에 노출**되는 점 유의. 메일 서버나 받는 이의 메일 보관함이 후보자 token을 영구 보관하게 됨.

### Step 2: GET `/recruit/{token}`

`src/app/(auth)/recruit/[token]/page.tsx:70-334`

분기점:
- line 80-92: IP-based rate limit 30/min. 한 IP에서 31번째 클릭은 invalidToken으로 가장 (line 100-109)
- line 94: rateLimited이면 invitation = null
- line 100-109: invitation 없거나 revoked → `t("invalidToken")` 카드
- line 117: `isRedeemed = invitation.status === "redeemed" && invitation.userId`
- line 119-128: redeemed 아닌데 expiresAt 지나면 → `t("expired")` 카드
- line 132-133: `accountPasswordResetRequired` 메타데이터 체크
- line 134-138: `resumeWithCurrentSession` 검사 (현 세션 user == invitation.userId)
- line 158-166: assignment 없음 → invalidToken 카드 (race condition. invitation 있고 assignment 삭제된 경우)
- line 169-199: 재진입 폼. 비밀번호만 입력하면 됨
- line 201-209: assignment 마감 (`deadline < now`) → `t("contestClosed")` 카드
- line 227-333: 초기 진입 폼 (회사 로고, 평가명, 문제 수, 시간, 언어 목록, 중요 안내, 검토 안내, 비밀번호 만들기)

후보자가 보는 페이지 종류:
1. invalidToken 카드 — 회수 / 잘못된 링크 / rate-limited
2. expired 카드 — 만료
3. contestClosed 카드 — 마감
4. 재진입 폼 — redeemed, 비밀번호 알면 진입
5. resumeWithCurrentSession 폼 — 같은 기기에서 응시 중
6. 신규 진입 폼 — 처음 시작

각 분기는 명확하지만 후보자한테 "왜 이 화면이 나왔는지" 설명은 카드 1-2줄 description뿐.

### Step 3: 시작 폼 제출

`src/app/(auth)/recruit/[token]/recruit-start-form.tsx:99-145`

- line 99: `handlePrimaryAction` 호출
- line 102: resumeWithCurrentSession 또는 isReentry면 곧장 executeStart (확인 dialog 스킵)
- line 107: validateStartInput에서 client-side 비밀번호 길이 8자 검증 (line 53). **서버 12자 mismatch 1.2**
- line 111: 신규 진입은 AlertDialog 확인 → executeStart
- line 78: `signOut({ redirect: false })` — 기존 세션 강제 종료
- line 80-84: `signIn("credentials", {recruitToken, recruitAccountPassword})` 호출

### Step 4: `signIn` → `authorize` 콜백

`src/lib/auth/config.ts:203-252` (recruitToken 분기)

- line 209: `/^[-A-Za-z0-9_]{16,128}$/.test` 토큰 형식 검증
- line 218-226: IP rate limit 검사 (`getRateLimitKey("login")`)
- line 228-234: `authorizeRecruitingToken` 호출 → `redeemRecruitingToken` 호출
- line 236-243: 결과 null이면 invalid_credentials 기록. 후보자한텐 `result.error` 떨어지고 `t("startFailed")` 표시.

### Step 5: `redeemRecruitingToken`

`src/lib/assignments/recruiting-invitations.ts:472-751`

분기점:
- line 485-503: tx 안에서 invitation read
- line 512-515: failedAttempts >= 5 → `tokenLocked`
- line 518-608: redeemed인 경우 password verify 분기
  - line 521: passwordResetRequired 체크
  - line 539-565: passwordResetRequired면 새 비밀번호 hash, sessions 삭제
  - line 567-572: 일반 verify. 틀리면 increment & `accountPasswordIncorrect`
  - line 594: assignment 마감이면 `assignmentClosed`
- line 610-611: revoked면 `tokenRevoked`, pending 아니면 `invalidToken`
- line 619-631: assignment 조회. 없음 → `assignmentNotFound`. examMode none → `notAContest`
- line 638-660: 신규 redeem 비밀번호 validation. `passwordTooShort` 등 케이스에선 counter 증가 안 함 (652-658 코멘트)
- line 662-687: user/enrollment/contestAccessToken 생성
- line 690-721: 원자적 claim. 실패면 `alreadyRedeemed`

후보자 입장에서 보는 에러 (`t("startFailed")`로 통합)와 실제 서버 에러의 매핑은 폼이 무시함.

### Step 6: 응시 화면 진입 `/contests/{assignmentId}`

`src/app/(public)/contests/[id]/page.tsx:120-359`

- line 123-128: `userAccess` 결정 (enrolled/managing/null). 후보자는 enrolled
- line 131-134: `getRecruitingAccessContext`로 isRecruitingCandidate 확인
- line 137-140: isUpcoming, isPast 판단
- line 142-167: studentProblemStatuses, mySubmissions(50개), timezone parallel fetch
- line 174-175: `isExamExpired` 판단 (windowed exam + personalDeadline 지남)
- line 215-220: AntiCheatMonitor 마운트
- line 246-258: enableAntiCheat면 amber 안내 박스
- line 260-274: isUpcoming이면 countdown
- line 276-278: scheduled mode 응시 중이면 deadline countdown
- line 280-289: windowed mode 미시작이면 StartExamButton
- line 291-296: windowed mode 응시 중이면 personalDeadline countdown
- line 298-302: isExamExpired면 빨간 박스
- line 304-310: isPast 면 contestClosed 카드
- line 312-389: 응시 진행 중이면 AssignmentOverview, ContestClarifications, (LeaderboardTable 후보자는 안 보임), My Submissions

### Step 7: 코드 작성 / 제출

후보자가 problem 클릭 → `/practice/problems/{id}` 진입. 거기서 CodeMirror 에디터.

POST `/api/v1/submissions`:
- submissions/route.ts:200-427
- line 211: 64KB 초과면 sourceCodeTooLarge
- line 216-238: problem + languageConfig fetch
- line 240-261: assignmentId auto-route (single context면 자동, multi면 409)
- line 263-274: validateAssignmentSubmission (heartbeat freshness, window 등 검증)
- line 276-280: canAccessProblem
- line 296-373: 원자적 tx — rate limit, queue depth, examTimeExpired, insert
- 응답: sanitize 후 데이터 반환. `compileOutput` 등은 problem 설정과 후보자 sanitize에 따름

### Step 8: SSE로 결과 수신

`/api/v1/submissions/{id}/events`:
- 본인 제출이면 OK. sanitizeSubmissionForViewer가 적용됨
- showResultsToCandidate=false이면 (1.4) `results=[]`, `score=null` 등으로 모든 결과 빈 채로 전달
- 후보자가 보는 SSE: status 변화만 (pending → judging → wrong_answer/accepted)

### Step 9: 시험 시간 만료

후보자 personalDeadline 또는 assignment.deadline 지남:
- 클라이언트가 countdown 끝나면 페이지에 isExamExpired 빨간 박스
- 추가 제출 시도 → submissions/route.ts:343-356에서 `examTimeExpired` 403
- 후보자는 자기 자리에서 화면만 보고 있음. 다음 안내 없음 (2.4)

### Step 10: 마감 후 결과 보기

후보자가 `/recruit/{token}/results` 진입:
- results/page.tsx:90-99: invitation.userId 없으면 resultsNotAvailable
- line 104-117: 세션 user.id != invitation.userId면 resultsSignInRequired (담당자가 → 후보자 본인 로그인 요구)
- line 124-139: defense-in-depth recruitingAccess 검증
- line 166-182: 마감 안 됐거나 showResultsToCandidate=false면 resultsNotYet 카드
- line 190-247: best-by-problem 계산
- line 250-349: 결과 카드 렌더 (total score, per-problem breakdown)

후보자가 `/login`으로 가서 본인 계정으로 들어가려고 하면:
- C-2로 차단 (1.1)
- 그래서 후보자는 `/recruit/{token}/results` 경로로만 결과 확인 가능
- 이 경로를 후보자한테 어떻게 알리는지 안내 부재

---

## 15. 구체 fix 제안 — 코드 패치 수준

### 15.1 (1.2) 비밀번호 길이 통일

```typescript
// src/app/(auth)/recruit/[token]/recruit-start-form.tsx:20
- const MIN_PASSWORD_LENGTH = 8;
+ import { FIXED_MIN_PASSWORD_LENGTH } from "@/lib/security/password";
+ const MIN_PASSWORD_LENGTH = FIXED_MIN_PASSWORD_LENGTH;
```

### 15.2 (1.3) playground 게이트 순서 swap

```typescript
// src/app/api/v1/playground/run/route.ts:32-50
- const sandboxGate = await gateSandboxEndpoint({...});
- if (sandboxGate) return sandboxGate;
- const platformMode = await getEffectivePlatformMode({...});
- if (getPlatformModePolicy(platformMode).restrictStandaloneCompiler) {
-   return apiError("compilerDisabledInCurrentMode", 403);
- }
+ const platformMode = await getEffectivePlatformMode({...});
+ if (getPlatformModePolicy(platformMode).restrictStandaloneCompiler) {
+   return apiError("compilerDisabledInCurrentMode", 403);
+ }
+ const sandboxGate = await gateSandboxEndpoint({...});
+ if (sandboxGate) return sandboxGate;
```

### 15.3 (1.1) C-2 차단 시 안내

```typescript
// src/lib/auth/config.ts:315-323
- if (await isStaleRecruitingCandidate(user.id)) {
+ const isStale = await isStaleRecruitingCandidate(user.id);
+ if (isStale) {
   recordLoginEvent({
-    outcome: "invalid_credentials",
+    outcome: "recruiting_window_closed",  // 새 outcome 추가
     ...
   });
   return null;
 }
```

추가로 login form에서 username/email 입력 후 미리 stale인지 알려주는 prefetch endpoint (`/api/v1/auth/check-account-status`).

### 15.4 (1.4) 본인 결과 sanitize 분리

```typescript
// src/lib/db/schema.pg.ts:348-349
  showResultsToCandidate: boolean("show_results_to_candidate").notNull().default(false),
+ showOwnResultsDuringExam: boolean("show_own_results_during_exam").notNull().default(true),
  hideScoresFromCandidates: boolean("hide_scores_from_candidates").notNull().default(false),
```

`sanitizeSubmissionForViewer`에서 `isOwner` && 시험 진행 중이면 `showOwnResultsDuringExam` 적용, 마감 후엔 `showResultsToCandidate` 적용.

### 15.5 (1.5) 드래프트 복원

```typescript
// src/app/api/v1/code-snapshots/route.ts에 GET 추가
export const GET = createApiHandler({
  handler: async (req, { user }) => {
    const problemId = req.nextUrl.searchParams.get("problemId");
    const assignmentId = req.nextUrl.searchParams.get("assignmentId");
    // canAccessProblem 검증 후 본인 최근 snapshot 1건 반환
    const snapshot = await db.query.codeSnapshots.findFirst({
      where: and(
        eq(codeSnapshots.userId, user.id),
        eq(codeSnapshots.problemId, problemId),
        assignmentId ? eq(codeSnapshots.assignmentId, assignmentId) : isNull(codeSnapshots.assignmentId),
      ),
      orderBy: desc(codeSnapshots.createdAt),
    });
    return apiSuccess(snapshot);
  },
});
```

### 15.6 (2.8) blur grace

```typescript
// src/components/exam/anti-cheat-monitor.tsx:230-232
- function handleBlur() {
-   void reportEventRef.current("blur");
- }
+ const blurGraceTimerRef = useRef<...>(null);
+ const BLUR_GRACE_MS = 1500;
+ function handleBlur() {
+   blurGraceTimerRef.current = setTimeout(() => {
+     void reportEventRef.current("blur");
+   }, BLUR_GRACE_MS);
+ }
+ function handleFocus() {
+   if (blurGraceTimerRef.current) {
+     clearTimeout(blurGraceTimerRef.current);
+     blurGraceTimerRef.current = null;
+   }
+ }
+ window.addEventListener("focus", handleFocus);
```

### 15.7 (5.5) submissionComments에 internal flag

```typescript
// schema:
  submissionComments: ...
+ isInternal: boolean("is_internal").notNull().default(false),

// GET endpoint:
  const comments = await db.query.submissionComments.findMany({
    where: eq(submissionComments.submissionId, id),
+   ...(canViewAll ? {} : { where: and(eq(...), eq(submissionComments.isInternal, false)) }),
  });
```

---

## 16. e2e 테스트 시나리오 추가 명세

기존 `tests/e2e/recruiting-invitation.spec.ts`(137줄)에 다음 추가:

### 16.1 마감 후 일반 로그인 차단
```
1. Admin이 recruiting invitation 생성, deadline = 1분 후
2. 후보자가 redeem (정상 진입)
3. 1분 대기 (또는 deadline 강제 조작)
4. 후보자가 /login으로 username/password 시도
5. 응답: invalidCredentials (현재) 또는 recruitingWindowClosed (fix 후)
6. /recruit/{token}/results는 정상 접근 가능
```

### 16.2 비밀번호 12자 enforcement
```
1. 후보자가 /recruit/{token}에 8자 비밀번호 입력
2. 클라이언트 validate 통과 (현재 버그)
3. signIn 호출 → null 반환
4. 폼에 startFailed 표시
5. fix 후: 클라이언트가 12자 미만이면 accountPasswordTooShort 즉시 표시
```

### 16.3 후보자 playground 차단
```
1. 후보자가 redeem 후 contest 진입
2. /playground 또는 POST /api/v1/playground/run 직접 호출
3. 응답: compilerDisabledInCurrentMode (fix 후 순서 변경)
4. 또는 응답: emailVerificationRequired (현재)
```

### 16.4 후보자 cross-batch IDOR
```
1. Admin이 두 회사용 invitation 생성 (각각 다른 assignment)
2. 후보자 A redeem
3. A가 다음 endpoint 호출:
   - GET /api/v1/submissions/{B의_submission_id} → 403
   - GET /api/v1/contests/{B의_assignment}/leaderboard → 403
   - GET /api/v1/contests/{B의_assignment}/participants → 403
   - GET /api/v1/problems/{B에만_있는_problem} → 403
   - POST /api/v1/submissions {problemId: B의_problem} → 403
```

### 16.5 본인 결과 시험 도중 hide
```
1. Admin이 showResultsToCandidate=false (default) 평가 생성
2. 후보자 응시 → 정답 코드 제출 → score=100, status=accepted
3. 후보자가 GET /api/v1/submissions/{id} 호출
4. 응답: results=[], score=null, compileOutput=null (현재)
5. fix 후: showOwnResultsDuringExam=true (new default)면 본인은 모두 보임
```

### 16.6 anti-cheat heartbeat origin 검증
```
1. 후보자 응시 중
2. fake POST /api/v1/contests/{id}/anti-cheat (Origin 헤더 누락)
3. production 모드면 403
4. 정상 브라우저 (Origin 정상)에선 200
```

---

## 17. 한 줄 요약

오늘 fix들(C-1, C-2, H-1/H-2, H-3, anti-cheat Origin)은 보안 측면에선 옳은 방향이지만, 후보자 동선에 **새 단절 지점 3개**(C-2 후 로그인 안내 부재, sandbox-gate 영문 에러, password 길이 클라이언트 미반영)를 만들었어요. 어제 그대로 남은 시스템 체크 페이지·드래프트 복원·결과 동선 부재까지 합치면, 후보자 입장의 안정감은 어제보다 더 떨어졌어요.

권한 측면에선 후보자가 cross-batch / IDOR로 다른 후보자 데이터에 접근할 경로는 확인된 곳 없음(12절 매트릭스). 다만 submissionComments에서 운영자 노트가 후보자에게 노출되는 잠재 leak, anti-cheat heartbeat 위조 가능성, blur 이벤트 false positive 위험 — 이 셋은 보강할 만해요.

채용 환경에 실전 투입 전, 오늘의 보안 fix와 후보자 UX 사이의 메시징 갭을 메우는 일이 우선이에요.
