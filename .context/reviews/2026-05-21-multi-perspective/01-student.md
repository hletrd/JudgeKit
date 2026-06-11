# 학생 관점 리뷰 - 2026-05-21

전일(`../2026-05-18-multi-perspective/01-student.md`), 전전일(`../2026-05-17-multi-perspective/01-student.md`) 리뷰 이후 델타. 오늘 들어온 fix들 중 학생 UX에 직접 닿는 것들을 먼저 짚고, 그 fix들이 만들어낸 새로운 문제와 여전히 비어 있는 자리를 정리해요. 시험·과제 시나리오 중심으로 보고, 강사 시점은 02-instructor.md에 따로 정리해요.

## 한눈에 보는 델타

오늘 들어간 fix 중 학생 측에 닿은 것:

| 영역 | 어제까지 | 오늘 |
|---|---|---|
| `/submissions` 목록 IDOR | 비스태프가 다른 학생 메타데이터 조회 가능 | 본인 + 공개 문제 스코프로 제한 (재확인) |
| Frozen leaderboard 자동 해제 | 마감 후에도 frozen 상태 유지 | 마감 시각 지나면 자동 unfreeze (운영 fix, 학생 화면 즉시 영향) |
| Practice 태그 필터 | drizzle 별칭 충돌로 0건 반환 | `inArray` 경로로 정상 동작 |
| Workspace 제출 라우팅 | 활성 과제 1개일 때도 수동 선택 강요 | snapshot+제출 양쪽에서 자동 귀속 |
| Sandbox endpoint email-verified 게이트 + 일일 200/500 쿼터 | 부재 | playground/compiler에 적용. **단, 학생 측 i18n·UX 완성도 부족 (아래 [#1](#1-sandbox-게이트-에러가-원시-영문-키-그대로-노출-high) 참고)** |
| 12자 패스워드 정책 | 8자 | 12자 (단, **zod schema·input attribute·signup 폼 힌트가 모순적, [#5](#5-회원가입-폼의-패스워드-안내가-12자-정책과-어긋남-med) 참고**) |
| `사용자명` → `아이디` 용어 정규화 | 혼재 | 로그인/가입은 다 `아이디`. **검색 placeholder·익명 설명은 `사용자 이름` 잔존, [#4](#4-한국어-placeholder의-사용자-이름-잔존-low) 참고** |
| 로케일 쿠키 SEO 라우트 존중 | 일부 라우트에서 영문 fallback | 쿠키 우선 (재확인) |
| 문제 디스플레이 카드 보더 클리핑 | 시각적 결함 | fix 적용 (재확인) |
| Anti-cheat heartbeat Origin 검증 | 부재 | 적용 (학생 측 동작 동일) |

진척이 있어요. 그런데 sandbox fix와 12자 패스워드 fix처럼 백엔드 정책만 들어가고 학생 측 UI/메시지 fix가 한 박자 늦는 패턴이 또 보여요.

## 여전히 남은 이슈 (어제 이전부터)

### 🔴 서버 측 드래프트 복원 부재 (High, 3일째 그대로)

`code_snapshots` 테이블에는 매 키 입력 기록이 적재돼요. `src/components/problem/problem-submission-form.tsx:118-160`:
- POST 재시도가 exponential backoff (1s, 2s, 4s) + max 3회로 설계돼 있고
- network failure가 silent drop 되지 않도록 보강됨

그런데 `src/app/api/v1/code-snapshots/route.ts`는 POST만 있어요. GET이 없음. 학생이 다른 디바이스로 로그인했을 때 본인의 마지막 snapshot을 가져올 통로가 0.

**현실 시나리오**:
- 시험 중 노트북 배터리 사망 → 휴대폰으로 같은 시험 페이지 진입 → `useSourceDraft` 훅(`src/hooks/use-source-draft.ts`)이 localStorage 기반이라 다른 디바이스에선 빈 상태 → 처음부터 다시 작성.
- 브라우저 시크릿 모드로 시험 중 → 탭 사고로 닫힘 → 모든 코드 분실. localStorage 자체가 시크릿 세션 종료와 함께 날아감.
- 학교 공용 PC에서 시험 → 학생이 시험 후 브라우저 데이터 삭제하면 다시 들어가도 history 0.

**안전망 부재의 비대칭성**: anti-cheat 로깅(`code_snapshots` POST)은 매분 돌면서 학생 코드를 다 적재하는데, 정작 학생 본인이 그 데이터를 복원할 권리는 없어요. "학생을 감시하는 데는 쓰지만 학생을 보호하는 데는 안 쓴다"는 비대칭이 운영 측에서 보면 사소해 보여도, 시험 분실 사고 한 번 터지면 신뢰 회복이 거의 불가능해요.

**Fix 위치**:
- `GET /api/v1/code-snapshots?problemId&assignmentId` 추가, 본인 최신 1건 반환
- `problem-submission-form.tsx`의 `useSourceDraft` 초기화 시점에 localStorage와 서버 snapshot을 비교, `updatedAt`이 더 최신인 쪽 사용
- 시각적 표시: "다른 디바이스에서 N분 전 작성하던 코드를 가져왔어요" 토스트

### 🟡 hidden·non-WA 케이스에서 출력 단서 부재 (Med, 그대로)

`src/app/(public)/submissions/[id]/page.tsx:150-154`:
```ts
const expectedOutput =
  showDetailedResults && isVisible && result.status === "wrong_answer"
    ? (result.testCase?.expectedOutput ?? null)
    : null;
```

조건 세 개를 모두 충족해야 expected를 보여줘요. 그리고 `page.tsx:146-148`:
```ts
} else if (!showRuntimeErrors && result.status === "runtime_error") {
  actualOutput = null;
}
```
`showRuntimeErrors=false`면 RE 케이스의 actualOutput도 통째로 가림.

**시나리오**:
- TLE 받음 → result panel에 시간만 표시 → 무한 루프 위치 가늠 불가
- MLE 받음 → 메모리만 표시 → 어디서 누수인지 0
- 가시 샘플 케이스인데 verdict가 RE인 경우 → expected 표시 0 → 본인 코드를 머릿속에서 다시 돌려 봐야 함

`src/components/submissions/_components/submission-result-panel.tsx:90-102`은 `result.status === "runtime_error" && result.actualOutput`이 둘 다 truthy일 때만 stderr block을 렌더해요. `runtimeErrorType`(`page.tsx:185`)이 있으니 "어떤 종류의 RE인지"(signal 11 / div0 / OOM)는 알릴 수 있는데, 학생용 inline 표시가 빠져 있음.

### 🟡 "실패한 케이스만 보기" 필터 부재 (Med, 그대로)

`submission-result-panel.tsx:76-114`:
```tsx
{sortedResults.map((result, index) => (
  <React.Fragment key={result.id}>
    <TableRow>...</TableRow>
    {showRuntimeErrors && result.status === "runtime_error" && ...}
    {result.status === "wrong_answer" && result.testCase?.expectedOutput != null && ...}
  </React.Fragment>
))}
```

모든 결과를 일렬로 렌더. 100개 테스트면 100줄. 모바일에선 사실상 못 봄. `failedOnly`, `실패만`, `failed.*filter` 같은 키워드를 `src/` 전체에서 grep해도 매치 0.

Codeforces·Baekjoon 류 표준 UX:
- 좁은 색띠 시각화(■■■□■■■): 한 화면에 100케이스 다 보임
- "Failed only" 토글
- 케이스 인덱스 클릭으로 expand

지금은 stride 없는 long table만 있음.

### 🟡 학생 측 재채점·이의 제기 흐름 부재 (Med, 그대로)

`submissions.rejudge` capability는 강사·관리자만(`messages/ko.json:695-697`, `src/components/submissions/submission-detail-client.tsx:72`의 `canRejudge`). 학생이 "이거 채점 이상해요"라고 알릴 입구가 0:
- "이의 제기" 버튼 없음
- 댓글 시스템은 있지만(`comment-section.tsx`) ticket 모델이 아니라 강사가 상태 추적 못함
- 강사가 메신저로 받아서 수동 rejudge 돌리는 구조 그대로

검색: `이의\|이의제기\|appeal` → 매치 0. 시험 끝나고 "내 답안이 이상하게 0점이에요" 상황이 항상 일어나는데, 공식 통로가 없으면 강사 워크로드만 늘어요.

### 🟡 일반 과제(시험 아닌) 마감 카운트다운 부재 (Med, 그대로)

`CountdownTimer`는 `examMode === "scheduled"` 또는 `"windowed"`일 때만 노출돼요:
- `src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx:181-201`
- `src/app/(public)/practice/problems/[id]/page.tsx:489-501`

`examMode IS NULL`이면서 `deadline != null`인 일반 과제는 `assignmentTable.deadline` 텍스트만 떠 있고 남은 시간 시각화 없음. 학생이 23:59:59에 submit 누르는 순간 `assignmentClosed`(`messages/ko.json:467`)로 튕겨요. 그 메시지는 "지각 제출 가능 기간"인지조차 안 알려 줘요:

```json
"assignmentClosed": "이 과제는 이미 마감됐어요.",
```

학생 입장에선 "lateDeadline이 있는데 그것까지 끝난 건지, 그냥 deadline만 끝난 건지" 구분 불가. `assignment.lateDeadline`이 살아 있는 경우는 "아직 지각 제출 가능해요" 같은 안내가 따로 떠야 해요.

### 🟡 모바일 키보드 보조 바 부재 (Med, mobile-only 학생에겐 High, 그대로)

`useIsMobile` 훅은 존재하고(`src/hooks/use-mobile.ts`), `public-quick-submit.tsx:47, 77`에서 Sheet 레이아웃 분기 용도로만 쓰여요. 정작 모바일에서 CodeMirror 안에 들어왔을 때 Tab·`{`·`}`·`[`·`]`·`;` 같은 키를 노출하는 keyboard helper bar가 없어요.

`src/components/code/code-editor.tsx`와 `code-surface.tsx`에 mobile·tablet 관련 코드 0. grep `mobile-keyboard\|kbd-bar` → 매치 0.

시험을 휴대폰으로 봐야 하는 학생은 거의 없겠지만, 시험 도중 노트북 사망 → 휴대폰 fallback 시나리오에선 사실상 코드 작성 불가능. 그리고 모바일 OS에선 `;`를 long-press로 호출해야 해서 입력 속도가 1/3 수준. 디바이스 백업 계획이 깨지면 시험 자체가 끝나요.

### 🟡 채점 시스템 헬스를 학생에게 노출하지 않음 (Med, 그대로)

`LiveSubmissionStatus`에 `liveUpdatesDelayed` 표시는 있어요 (`src/components/submissions/_components/live-submission-status.tsx:86-93`):
```tsx
{pollingError ? (
  <div aria-live="polite" className="flex items-center gap-2 text-amber-600">
    <p>{liveUpdatesDelayedLabel}</p>
    <Button variant="outline" size="xs" onClick={onRetry}>{retryLabel}</Button>
  </div>
) : null}
```

이건 본인 폴링이 끊긴 신호일 뿐, 워커 전체가 dead 상태인지는 못 잡아요. `useSubmissionPolling`(`src/hooks/use-submission-polling.ts:282-309`):
```ts
delayMs = Math.min(delayMs * 2, 30000);
scheduleRefresh();
```
30초 backoff cap만 걸고 영원히 재시도. "이 제출이 N분째 pending인데 시스템이 죽었을 수도 있다"는 신호를 학생에게 줄 방법이 없어요. 14h silent fail 사고가 다시 터지면 학생 입장에선 똑같이 모르고 시험이 끝나요.

판단 가능한 단서:
- `submission.submittedAt`이 N분 이상 지났는데도 status가 `pending`/`queued`/`judging`이면 stall 추정 가능
- 백엔드에 `/api/v1/system/judge-health` 같은 엔드포인트 추가 시 학생 측에서 배너 표시 가능

### 🟡 시험 응시 화면에서 본인 다른 제출 진입 동선 약함 (Low, 그대로)

`otherSubmissions`(`submissions/[id]/page.tsx:107-131`)는 상세 페이지에 들어가야 보여요. 에디터 진입 전 "이 문제에 내가 5번 시도했고 best가 80점" 같은 요약 카드가 없어요. 시험 중 "내가 이 문제 어디까지 했더라"를 확인하려면 별도 탭을 열어야 함.

## 오늘 새로 짚는 학생 측 이슈

### 1. Sandbox 게이트 에러가 원시 영문 키 그대로 노출 (High)

오늘 들어간 보안 fix(`src/lib/security/sandbox-gate.ts`)는 학생 사용 빈도가 높은 playground·compiler에 직접 영향이 있어요. 이메일 미인증이거나 일일 200(playground)/500(compiler)개 초과 시 학생이 보는 메시지가 깨져요.

**경로 1: 이메일 미인증**
`src/lib/security/sandbox-gate.ts:59-67`:
```ts
if (!isStaff && !row?.emailVerified) {
  return NextResponse.json(
    {
      error: "emailVerificationRequired",
      message: "Verify your email before using the sandbox. Check your inbox for the verification link.",
    },
    { status: 403 },
  );
}
```
- `error` 필드는 `emailVerificationRequired` (영문 키)
- `message` 필드는 영문 평문

**경로 2: 일일 쿼터 초과**
`src/lib/security/api-rate-limit.ts:264-276`:
```ts
return NextResponse.json(
  { error: "dailyQuotaExceeded" },
  {
    status: 429,
    headers: {
      "Retry-After": String(Math.ceil(windowMs / 1000)),
      ...
    },
  },
);
```

**i18n 누락 확인**:
- `grep "emailVerificationRequired" messages/ko.json` → 0
- `grep "dailyQuotaExceeded" messages/ko.json` → 0
- `grep "emailVerificationRequired" src/components/` → 0
- `grep "dailyQuotaExceeded" src/components/` → 0

**UI 노출 경로**:

`src/components/problem/problem-submission-form.tsx:187-204`:
```ts
const legacyErrorMap: Record<string, string> = {
  Unauthorized: "submissionErrors.unauthorized",
  ...
  "Internal server error": "submissionErrors.submissionCreateFailed",
};
const translationKey = legacyErrorMap[error] ?? `submissionErrors.${error}`;
try {
  return t(translationKey as never);
} catch {
  return tCommon("error");
}
```
- `dailyQuotaExceeded`는 매핑에도 없고 `submissionErrors.dailyQuotaExceeded` 키도 ko.json에 없음
- 결과: `t()` throw → catch → `tCommon("error")` → 일반 "오류가 발생했어요" 노출
- 학생은 "왜 막혔는지" 단서 0

`src/components/code/compiler-client.tsx:267-275`:
```ts
const { ok, data } = await parseApiResponse<{ error?: string; message?: string; data?: unknown }>(res, { data: null });
if (!ok) {
  const rawError = data.error || data.message || t("requestFailed");
  const errorMessage = String(rawError);
  setActiveTestCase({ ..., error: errorMessage });
  ...
}
```
- `data.error`를 그대로 setState
- compiler 페이지에서는 사용자가 영문 키 `dailyQuotaExceeded` 그대로 봄
- 또는 영문 message `Verify your email before using the sandbox.` 그대로 봄

**현실 시나리오**:
- 강사가 "이 문제 compiler에서 30번 정도 돌려 보세요"라고 시킨 수업이 한국어 학생 30명한테 동시 적용
- 학생 한 명이 잘못 짠 코드로 무한 루프 100번 → 일일 limit 가까워짐 → "dailyQuotaExceeded" 영문 키 노출
- 또는 신규 가입 학생이 이메일 인증 안 한 채로 playground 진입 → 영문 message 노출

**Fix 위치**:
1. `messages/ko.json`의 `problems.submissionErrors`에 `emailVerificationRequired`, `dailyQuotaExceeded` 추가. 메시지는 해요체로.
2. `messages/ko.json`의 `compiler` 스코프에도 같은 키 추가. compiler-client는 다른 t namespace를 사용함.
3. `problem-submission-form.tsx:188-196`의 `legacyErrorMap`에 추가.
4. `compiler-client.tsx`는 raw error string을 그대로 박지 말고 `t()` 폴백 경로로 전환. 또는 `compiler-client.tsx`에 별도의 `translateCompilerError` 매퍼 도입.
5. sandbox-gate는 `message` 필드를 안 쓰는 게 깔끔. 에러 코드만 보내고 클라이언트가 번역.

### 2. 일일 쿼터 `Retry-After` 헤더 무시 (Med)

`consumeUserDailyQuota`가 친절하게 `Retry-After: 86400` 헤더를 보내 줘요(`api-rate-limit.ts:269-273`):
```ts
headers: {
  "Retry-After": String(Math.ceil(windowMs / 1000)),
  "X-RateLimit-Limit": String(maxPerDay),
  "X-RateLimit-Remaining": "0",
  "X-RateLimit-Reset": String(Math.ceil((now + windowMs) / 1000)),
},
```

그런데 compiler-client(`src/components/code/compiler-client.tsx`)도 submission-form(`src/components/problem/problem-submission-form.tsx`)도 이 헤더를 안 읽음. 학생은 "X시간 뒤에 다시 시도해 주세요"라는 정보를 못 받고 무한 재시도. UX 측면에서는 헤더를 읽어 "내일 0시 이후 다시 시도해 주세요" 같은 toast가 떠야 적절해요.

### 3. 한국어 말투 - 해요체 정규화 미완 (Low)

전체 `messages/ko.json`에 `합니다/입니다/됩니다/있습니다/없습니다` 75건. 학생 화면에 닿는 사례:

- `messages/ko.json:115` `passwordTooShort: "비밀번호는 12자 이상이어야 해요."` - 해요체 OK
- `messages/ko.json:1122` 동일 키 `"비밀번호는 12자 이상이어야 합니다"` - 합쇼체
- `messages/ko.json:1117` `"usernameAndNameRequired": "아이디와 이름은 필수입니다"`
- `messages/ko.json:1118` `"usernameInUse": "이미 사용 중인 아이디입니다"`

이 합쇼체 메시지들은 `dashboard.userManagement` 스코프라 학생 진입 가능성은 낮지만, `change-password` 폼이나 `/profile/security` 류에서 같은 키를 cross-reference 하면 학생 화면에도 노출돼요. 일관성 측면에서 한 번에 통일하는 게 좋아요.

추가 사례:
- `messages/ko.json:1198` `"description": "최근 로그인 기록입니다."` - 학생 본인 보안 페이지에서 노출 가능
- `messages/ko.json:1454-1456` `"mustBeInteger": "값은 정수여야 합니다"` 등 - 시스템 설정 admin이지만 학생 form validation에도 일부 재사용

오늘 자체 검증해 보면, 학생 fullflow에 닿는 합쇼체 비중은 약 5~10건 수준. 우선순위 낮음.

### 4. 한국어 placeholder의 `사용자 이름` 잔존 (Low)

`messages/ko.json`:
- `:634` `"searchPlaceholder": "문제 제목 또는 사용자 이름으로 검색"` - `/problems` 검색
- `:1183` `"searchPlaceholder": "사용자 이름 또는 문제 제목으로 검색"` - 별개 위치
- `:1866` `"acceptedSolutionsAnonymousDesc": "코드는 공유하되 사용자 이름은 숨기고 익명으로 표시합니다."`

오늘 들어간 "사용자명 → 아이디" 정규화 작업이 로그인/가입까지만 닿고 검색 placeholder는 못 잡았어요. 학생이 "내 아이디로 검색하면 되겠지" 했다가 placeholder 텍스트는 "사용자 이름"이라 살짝 혼동. UI 용어 일관성 깨짐.

### 5. 회원가입 폼의 패스워드 안내가 12자 정책과 어긋남 (Med)

런타임 검증: `src/lib/security/password.ts:11` `FIXED_MIN_PASSWORD_LENGTH = 12`. 12자 미만이면 `passwordTooShort` 반환.

zod schema: `src/lib/validators/public-signup.ts:11`:
```ts
password: z.string().min(8, "passwordTooShort").max(256, "passwordTooLong"),
```
**`min(8)`로 그대로 남아 있음.** 12자 정책 fix가 schema까지 도달 못함.

회원가입 폼: `src/app/(auth)/signup/signup-form.tsx:182-193`:
```tsx
<Input
  id="password"
  name="password"
  type="password"
  autoComplete="new-password"
  required
  value={passwordValue}
  onChange={(e) => setPasswordValue(e.target.value)}
/>
```
- `minLength` 속성 없음 → 브라우저 네이티브 검증 안 걸림
- placeholder/help 텍스트 없음 → 학생은 12자 정책 모름

**결과 흐름**:
1. 학생 8~11자 입력 → 클라이언트 검증 통과
2. server action 호출 → zod schema(`min(8)`) 통과
3. `validateAndHashPassword` 도달 → `getPasswordValidationError`(`min 12`) 실패
4. `passwordTooShort` 에러 반환 → 폼에 메시지 표시
5. 학생: "어? 8자 넘었는데 왜 거부야?"

`messages/ko.json:115`의 `passwordTooShort` 메시지는 "비밀번호는 12자 이상이어야 해요."라고 12자를 명시. 그런데 이 메시지는 거부된 *후에* 보이고, *전에* 학생에게 12자 정책을 안 알려 줌.

**Fix**:
- `validators/public-signup.ts:11`을 `min(12)`로 변경
- `signup-form.tsx`의 password input에 `minLength={12}` 속성 추가
- placeholder 또는 help 텍스트로 "12자 이상" 명시

### 6. 4초 confirm window가 시험 종료 직전에 양날의 검 (Med)

`problem-submission-form.tsx:257-351`은 ⌘/Ctrl+Enter 사고로 contest attempt를 소진하는 걸 막으려 4초 confirm window를 둬요:
```ts
const SUBMIT_CONFIRM_DELAY_MS = 4000;
...
pendingToastIdRef.current = toast(t("submissionConfirming"), {
  description: t("submissionCancelHint"),
  action: { label: tCommon("cancel"), onClick: () => cancelPendingSubmit() },
  duration: SUBMIT_CONFIRM_DELAY_MS,
});
pendingSubmitTimerRef.current = setTimeout(() => {
  void executeSubmit();
}, SUBMIT_CONFIRM_DELAY_MS);
```

일상 시나리오에선 좋아요. 그런데 시험 종료 5초 전 submit:
- timer 만료 1초 전에 실제 POST
- 그 사이 cancelable 토스트가 떠 있음
- 학생이 cancel 오타로 누르면 시험 끝

`submissionConfirming: "4초 뒤에 제출해요"` 토스트 텍스트(`messages/ko.json:356`)는 정적. 카운트가 갱신되지 않아서 "이미 갔나? 안 갔나?" 헷갈림.

**Fix 옵션**:
- 마감 30초 이내(`assignment.deadline - now < 30000`)에는 confirm window를 0으로 short-circuit
- 또는 토스트 description에 카운트 갱신 추가 ("3초 뒤에 제출해요", "2초 뒤에...")
- 또는 시각적 progress bar로 시간이 흐르는 걸 명시

### 7. anti-cheat privacy notice가 sessionStorage 기반 → 재로그인·재오픈마다 뜸 (Low)

`src/components/exam/anti-cheat-monitor.tsx:39-45`:
```ts
const [showPrivacyNotice, setShowPrivacyNotice] = useState(() => {
  try {
    return sessionStorage.getItem(`judgekit_anticheat_notice_${assignmentId}`) !== "accepted";
  } catch {
    return true;
  }
});
```

`sessionStorage`는 탭 닫으면 사라져요. 시험 도중 탭 한 번 닫고 다시 열면(브라우저 크래시 후 복구 포함) 다시 dialog가 떠요. assignmentId당 한 번 accept로 끝내려면 localStorage가 맞아요.

추가 우려: dialog가 `disablePointerDismissal`인데(`anti-cheat-monitor.tsx:307`), 학생이 키보드만으로 닫을 수 있는지 확인 필요. focus-trap 작동 검증 안 됨.

### 8. anti-cheat warning toast 누적 (Low)

`anti-cheat-monitor.tsx:50, 215-218`:
```ts
const TAB_SWITCH_GRACE_MS = 3000;
...
tabSwitchGraceTimerRef.current = setTimeout(() => {
  void reportEventRef.current("tab_switch");
  toast.warning(resolvedWarningMessage);
}, TAB_SWITCH_GRACE_MS);
```

3초 grace는 좋은 fix. 그런데 학생이 알림 잠시 보고 돌아왔다가 또 잠깐 보고 돌아오는 식으로 빠르게 반복하면 toast가 매번 새로 쌓여요. `MIN_INTERVAL_MS = 1000`(line 47)으로 동일 eventType은 1초 내 중복 방지하지만, 사용자에게 뜨는 toast 자체는 별개. 시각적으로 시끄럽고, 의도적 부정행위와 단순 실수를 학생 시각에서 구분하지 않아요.

### 9. submission 폴링이 영원히 재시도, max-stuck 알림 없음 (Med)

`use-submission-polling.ts:282-309`의 backoff:
```ts
delayMs = Math.min(delayMs * 2, 30000);
scheduleRefresh();
```
- 초기 3초, 실패 시 두 배씩
- 30초 캡
- active status일 동안 영원히 재시도

"이 제출이 5분째 pending인데 운영팀에 알리시거나 새로고침해 주세요" 같은 종착 안내가 없어요. 시험 종료가 다가오는데 본인 제출이 채점 안 되는 상황에서 학생은 무력해요.

**Fix 패턴**: `submission.submittedAt`이 N분 이상 지났고 status가 active이면 별도 stall banner 노출. N은 5분 정도가 적절.

### 10. /api/v1/time 동기화 실패 시 silent (Low)

`countdown-timer.tsx:82-105`의 `syncTime`:
```ts
.catch(() => {
  // keep existing offset on error
});
```
처음 mount 때 sync 실패해도 조용히 넘어가요. 학생 NTP가 안 맞춰진 컴퓨터(예: VMware 게스트, BIOS 시간 어긋난 노트북)로 시험 보면 본인 시계 기준으로 카운트다운이 돌고, 서버랑 5분씩 어긋날 수 있어요. 카운트다운에는 "5분 남았어요" 뜨는데 실제로는 이미 마감.

**Fix**: 첫 sync 실패 시 학생에게 warning toast "시간 동기화에 실패했어요. 새로고침해 주세요" 정도는 표시.

### 11. `submissionConfirming` 토스트 description이 정적 (Low)

`messages/ko.json:356-357`:
```json
"submissionConfirming": "4초 뒤에 제출해요",
"submissionCancelHint": "'취소'를 누르면 멈추고, '제출'을 다시 누르면 바로 보내요."
```

4초 동안 description은 그대로 "4초 뒤에 제출해요". 학생이 토스트 본 시점이 5초 전인지 1초 전인지 알 수 없음. 시각적 progress 표시 또는 카운트 갱신 필요.

### 12. `assignmentClosed` 메시지가 lateDeadline 정보 없음 (Low)

`messages/ko.json:467`:
```json
"assignmentClosed": "이 과제는 이미 마감됐어요.",
```

`assignments` 스키마에 `lateDeadline`이 존재(`assignments/[assignmentId]/page.tsx:127-128`)하는데, 마감 후 사용자가 보는 메시지는 그냥 "마감됐어요" 한 줄. 지각 제출 가능 기간이 남아 있는지, 끝났는지 안내가 0. 학생 흐름:
- 23:59 deadline 지났는데 lateDeadline=다음날 23:59 → 페널티 받고도 제출 가능
- 메시지는 "마감됐어요"만 → 학생은 "그럼 끝났구나" 포기

API와 메시지가 따로 놀고 있어요. `assignmentClosed`인 경우와 `assignmentExpiredEvenForLateSubmission`인 경우를 구분해야 정상.

## Top 5 - 학생 입장에서 실제 시험 망치는 시나리오

1. **시험 중 디바이스 교체 → 코드 분실** (3일째 같은 자리). `code_snapshots` GET API 부재. 시험 분실 한 번이면 신뢰 끝.
2. **워커가 OOM·dead → 14h pending → silent fail**. 학생 측에 stall 신호 0. 시험 종료 후 "내 제출은 어디 갔어요?" 질문 폭주. submission 폴링이 영원히 재시도하는 구조.
3. **`emailVerificationRequired`/`dailyQuotaExceeded` 영어 키 그대로 노출**. 오늘 들어간 보안 fix의 부작용. 강사 콜백 폭주 예상. 한 줄 i18n 추가로 해결 가능.
4. **회원가입 패스워드 8자/12자 모순**. 학생이 시험 직전 가입할 때 거부됨 → 시험 시작 지연.
5. **시험 마감 직전 4초 confirm window**. cancel 오타 시 제출 분실. 마감 임박 시 short-circuit 필요.

## 시험 도중 학생을 실제로 짜증 나게 할 버그 후보

이건 시험을 *망치진* 않지만 학생을 짜증 나게 할 항목들:

- **TLE 케이스에서 출력 0줄** → "내 무한 루프 어디예요?" 디버깅 불가. (`submissions/[id]/page.tsx:150-154`)
- **100케이스 문제에서 fail 한 개를 찾으려고 100줄 스크롤** → 모바일에선 사실상 못 봄. (`submission-result-panel.tsx:76-114`)
- **Anti-cheat privacy notice가 매 탭 재오픈 시 떠서 시험 흐름 끊김.** (`anti-cheat-monitor.tsx:39-45` sessionStorage 사용)
- **일반 과제에서 11:58 PM에 마감 카운트다운 없이 23:59:59에 `assignmentClosed`**. (`practice/problems/[id]/page.tsx:489-501` examMode 분기)
- **본인 stale 시계 → countdown drift 5분**. NTP 안 맞춘 학생 PC에서 sync 실패 silent. (`countdown-timer.tsx:98-100`)
- **재채점 요청 통로 0** → 카톡으로 강사한테 직접 문의해야 함.
- **anti-cheat toast 누적** → 시험 후반엔 화면 절반이 토스트로 도배.

## "Polished enough"로 보이는 항목

블로커는 아니지만 잘 만든 부분도 기록해요. 다음 사이클에서 시간 낭비하지 않게:

- **`useSubmissionPolling`의 SSE→fetch fallback이 깨끗** (`hooks/use-submission-polling.ts:151-209`). EventSource 실패 시 fetch polling으로 graceful degradation. SSE timeout/error 모두 적절히 처리됨.
- **Submit confirm window 4초 + cancel 토스트** (`problem-submission-form.tsx:257-351`)는 일반적인 OJ보다 친절. (단, 마감 임박 시 시나리오는 [#6](#6-4초-confirm-window가-시험-종료-직전에-양날의-검-med) 참고)
- **`CountdownTimer`가 visibilitychange 기반 server-time resync + 누적 threshold 토스트 suppression** (`countdown-timer.tsx:170-200`). 학생이 백그라운드로 5분 두고 돌아와도 토스트 5개 한꺼번에 안 뜨고 가장 긴급한 것만 노출.
- **`<html lang>` 주입이 layout에 적용됨** (`src/app/layout.tsx:100`). 어제 짚은 접근성 항목 일부 해소.
- **`SkipToContent` layout마다 박혀 있음**: `(public)/layout.tsx:37`, `(dashboard)/layout.tsx:53`, `(auth)/layout.tsx:23`, `app/page.tsx:88`, `app/not-found.tsx:45`. 어제 짚은 skip-link 부재가 해결됨.
- **익명 accepted-solutions 정책** (`messages/ko.json:1866`)이 보안적으로 깔끔. 학습용 코드 공유는 가능하면서 사용자 추적은 차단.
- **`shortcutsHelp.tsx`의 `?` 키 핸들러** - 어제 안내 패널 부재 이슈가 사실은 이미 구현돼 있었음. `code/shortcuts-help.tsx:30-48`이 `?` 키 누르면 dialog 띄움.
- **Anti-cheat 3초 grace + 1초 dedup** (`anti-cheat-monitor.tsx:50, 215-218`, `MIN_INTERVAL_MS = 1000`). false positive 줄이는 합리적 디자인. (단, toast 누적은 [#8](#8-anti-cheat-warning-toast-누적-low) 참고)
- **재제출 시 localStorage 드래프트 복원** (`submission-detail-client.tsx:83-96`). 학생이 "재시도" 누르면 이전 코드가 자동으로 에디터에 채워짐. 디바이스 동일 시나리오에선 잘 동작.
- **IDOR fix 회귀 방지 측면** - `/submissions` 목록(`page.tsx:179-198`)과 상세(`[id]/page.tsx:80-98`) 양쪽에 동일한 visibility 정책이 일관되게 적용. 한쪽만 막은 상태가 아님.
- **Workspace 자동 라우팅이 snapshot + 제출 양쪽에 일관 적용** (`code-snapshots/route.ts:33-48`, `submissions/route.ts` 동일 로직).

이런 부분은 fix list에서 빼도 돼요.

## 검증·테스트 측면

- `tests/e2e/student-*.spec.ts` 류 시나리오가 있긴 한데 `code-snapshots GET` 경로가 미구현이라 "디바이스 교체 후 복원" 시나리오 자체가 e2e로 짤 수 없음.
- `dailyQuotaExceeded`/`emailVerificationRequired` i18n 누락은 unit test로 가드하기 어려운 영역. `messages/ko.json`과 server-side error enum을 묶어서 컴파일타임에 누락을 잡는 lint rule이 있으면 좋아요. 예: `sandbox-gate.ts`의 가능한 error 키들을 `as const` 배열로 export하고, `messages/ko.json` parse 후 모든 키 존재 검증하는 unit test.
- 회원가입 폼 8/12자 모순은 `tests/unit/validators/public-signup.test.ts` 같은 곳에서 회귀 테스트가 잡았어야 했는데, schema와 runtime 정책이 분리돼 있어서 못 잡힘. 두 곳에 같은 상수(`FIXED_MIN_PASSWORD_LENGTH`)를 참조하도록 통일.
- mobile 시나리오는 `mobile-layout.spec.ts` 가 있는 걸로 보였는데 키보드 helper bar 자체가 미구현이라 검증할 게 없음.
- `code-snapshots POST` 재시도 backoff는 잘 짜여 있지만(`problem-submission-form.tsx:131-149`), POST가 영원히 실패할 때 학생에게 "오프라인입니다" 같은 알림이 없음. 회귀 테스트 항목.

## Show-stopper 후보 정리

| 순위 | 항목 | 이유 |
|---|---|---|
| 1 | 서버 드래프트 복원 | 3일째 그대로. 시험 분실 한 번이면 신뢰 끝. |
| 2 | Sandbox 게이트 에러 i18n 누락 | 오늘 들어간 fix의 직접 부작용. ko.json 한 줄 추가로 해결. 우선순위 높임. |
| 3 | 회원가입 패스워드 8/12자 모순 | 시험 직전 가입 학생이 막힘. 신뢰성 측면에서 표면적 결함. |
| 4 | submission 폴링 stall 신호 부재 | 14h silent fail 재발 시 학생 무력. |
| 5 | 시험 마감 직전 confirm window short-circuit | 단발성 영향이지만 발생하면 학생 한 명 시험 끝. |

## 마무리

세 번째 사이클이라 패턴이 보여요. 보안·운영 fix는 빠르게 들어가는데, 그 fix가 만들어 내는 학생 측 UI 메시지·동선 fix가 한 박자 늦어요. sandbox-gate가 대표적. 다음 사이클에선 "보안 fix 들어갈 때 i18n 키 누락 자동 검사" 같은 lint나 codegen을 묶으면 이 패턴이 줄어들 거예요.

특별히 짚고 싶은 건 두 가지:

1. **드래프트 복원**. 3일째 같은 자리. 이건 단순 기능 부재가 아니라 anti-cheat 비대칭성 이슈예요. 학생 데이터를 감시용으로는 적재하면서 학생 보호용으로는 안 쓰는 구조가 PIPA·신뢰 측면에서 모두 약점. 한 번 사고 나면 회복 비용이 너무 큼.

2. **sandbox-gate i18n**. 보안적으로 들어간 fix는 잘 짜여 있는데(staff bypass, escape hatch env, daily quota 분리), 정작 학생에게 보이는 메시지가 영문 키 그대로면 fix의 의미가 절반. 다음 cycle에서 1순위로 손볼 만해요.
