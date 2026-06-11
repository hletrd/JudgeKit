# 보안 리뷰 — 공격자 관점 — 2026-05-21

리뷰 시점: 2026-05-21
대상 사용처: 채용 코딩 평가, 학생 시험, 프로그래밍 대회
리뷰 방식: 어제(2026-05-18), 그제(2026-05-17) 리뷰 대비 delta. 코드 변경이 많아서 "닫혔다고 주장하는 fix"의 우회 경로와 새로 생긴 공격면을 우선 들여다봤어요.

---

## 0. 어제 / 그제 must-fix 추적

| ID | 어제(05-18) 상태 | 오늘(05-21) 상태 | 확인 근거 |
|---|---|---|---|
| **C-1** resetPassword가 세션 미무효화 | 미해결 | ✅ **닫힘** | `src/lib/email/index.ts:189` `tokenInvalidatedAt: now` |
| **C-2** 채용 후보자 만료 후 password 로그인 가능 | 미해결 | ✅ **조건부 닫힘** | `src/lib/recruiting/access.ts:136-162` + `src/lib/auth/config.ts:315-323`. 단 `lateDeadline=null && deadline=null` 케이스는 여전히 무기한 로그인 가능 (라인 153-156) — SEC-21-1 참조 |
| **H-1 / H-2** playground/compiler 이메일 게이팅 + 일일 quota | 미해결 | ✅ **닫힘 (escape 있음)** | `src/lib/security/sandbox-gate.ts` — `SANDBOX_ALLOW_UNVERIFIED_EMAIL` 환경변수로 전체 우회. SEC-21-2 참조 |
| **H-3** CSP `'unsafe-inline'` | 미해결 | ✅ **닫힘 (matcher 누락)** | `src/proxy.ts:392-411` nonce CSP 주입. matcher에 빠진 라우트는 strict 정적 fallback. SEC-21-3 참조 |
| **H-4** Rust 사이드카 fail-open | 미해결 | ✅ **닫힘 (NODE_ENV 의존)** | `rate-limiter-rs/src/main.rs:399`, `code-similarity-rs/src/main.rs:182`. NODE_ENV가 사이드카 컨테이너에 propagate 안 되면 우회. SEC-21-4 참조 |
| **H-5** IP 스푸핑 (XFF 1-element fallback) | 미해결 | ✅ **닫힘 (X-Real-IP 잔존)** | `src/lib/security/ip.ts:67-78`. X-Real-IP 경로는 여전히 모든 클라이언트 신뢰. SEC-21-5 참조 |
| **H-6** Forgot-password 이메일 case-insensitive | 미해결 | ✅ **닫힘** | `src/lib/email/index.ts:50` `lower(email)` |
| **L-1** 비밀번호 8자 → 12자 | 미해결 | ✅ **닫힘 (override 가능)** | `src/lib/security/password.ts:11`. system_settings.min_password_length로 4까지 내릴 수 있음. SEC-21-6 참조 |
| **M-8** Anti-cheat heartbeat Origin 검증 | 미해결 | ✅ **닫힘 (production-only)** | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79`. NODE_ENV !== "production"이면 우회. SEC-21-7 참조 |
| **IDOR /submissions** | 어제 fix | ✅ 회귀 없음 | 어제 확인분 유지 |
| **accepted-solutions IDOR** | 어제 fix | ✅ 회귀 없음 | 어제 확인분 유지 |
| **M-1 / M-3** judgeClaimToken 평문 + 회전 | 미해결 | ❌ **여전히 미해결** | `src/app/api/v1/judge/poll/route.ts:89,154` 평문 비교. 명시적 deferred. |
| **M-2** 후보자 username brute-force | 미해결 | ⚠️ **C-2 부분 해결로 완화** | C-2 보조 의존 |
| **M-4** Forgot-password rate-limit 키 32-bit prefix | 미해결 | ❌ **여전히 미해결** | `src/app/api/v1/auth/reset-password/route.ts:23` |
| **M-5** 채용 감사 로그 8-hex prefix | 의도된 trade-off | 무변동 | |
| **M-6** Backup endpoint timing oracle | 미해결 | ❌ **여전히 미해결** | `src/app/api/v1/admin/backup/route.ts:59-66` |
| **M-7** Stored XSS 잠재 표면 | 미해결 | ⚠️ **CSP 강화로 영향 축소** | matcher 누락 라우트에서는 H-3 효력 없음 |
| **L-3** 100mb body cap | 미해결 | 무변동 | |
| **L-4** Forgot-password 503 enumeration | 미해결 | ❌ **여전히 미해결** | |
| **L-5** LRU heartbeat dedup multi-instance | 부분 해결(shared coord) | ⚠️ 공유 코디네이션 미구성 환경에선 잔존 | |
| **L-7** judgeStatusReport compileOutput cap | 미해결 | ❌ **여전히 미해결** | |
| **SEC-NEW-3** DB 비밀번호 노출 후 로테이션 | 미확인 | ❌ **확인 불가** (운영 외부 액션) |

요약: 발표된 must-fix 10선 가운데 **C-1, H-6, L-1**은 깔끔히 닫혔어요. **H-1, H-2, H-3, H-4, H-5, M-8, C-2**는 닫혔는데 escape hatch / matcher 누락 / production-only 가드 같은 회피 경로가 함께 들어왔어요. 아래에서 각각 다룹니다. **M-1, M-3, M-4, M-6, L-3, L-4, L-7**은 여전히 열려 있고요.

---

## 1. 오늘 도입된 새 공격면 (CRITICAL / HIGH)

### SEC-21-2. 🔴 `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1` 전역 무력화 (HIGH)

**위치**: `src/lib/security/sandbox-gate.ts:7-14, 39`

```ts
const ALLOW_UNVERIFIED_EMAIL = (() => {
  const raw = process.env.SANDBOX_ALLOW_UNVERIFIED_EMAIL ?? "";
  return raw === "1" || raw.toLowerCase() === "true";
})();
...
if (!ALLOW_UNVERIFIED_EMAIL) {
  // ... DB lookup + verified check
}
const quota = await consumeUserDailyQuota(userId, endpoint, maxPerDay);
```

**문제 1 (의도된 escape)**: `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1`이면 이메일 인증 게이트가 통째로 사라지고 일일 quota만 남아요. 200/day playground × N계정. 어제 닫혔다고 분류된 H-1/H-2의 "공개 회원가입 → playground 즉시 접근" 시나리오가 환경변수 하나로 부활.

**문제 2 (캡쳐된 환경변수)**: `ALLOW_UNVERIFIED_EMAIL`이 모듈 import 시점에 **한 번** 평가됩니다 (Node `import` cache). 운영 중 변경하려면 서버 재시작 필요. 거꾸로 말하면 잘못 켰을 때 식별이 어렵고, 사이드카 fail-open과 똑같이 `NODE_ENV !== production` 가드도 없어요. SMTP 미설정 lab 운영자가 한 번 켜 두고 잊으면 운영 전환 후에도 그대로 남습니다.

**문제 3 (Quota 분산 공격)**: `consumeUserDailyQuota`는 성공/실패 무관하게 attempts++. 한 계정의 quota는 빠르게 소진되지만 **N 계정으로 분산**하면 quota는 사실상 무용. 공개 회원가입이 자동화 + hCaptcha만 통과하면 그대로 fleet.

**공격 체인**:
1. 운영자가 SMTP 미설정 환경에서 `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1` 설정.
2. 공개 회원가입(disposable email)으로 N개 계정 자동 생성.
3. 각 계정마다 일일 200 playground 실행 + 500 compiler 실행 = 700 docker spawn/day/account.
4. CPU/디스크 마이닝, log-flood, similarity 서비스 DoS.

**Fix 권장**:
- escape hatch를 prod 빌드에서 명시적 deny. 빌드 시 `NEXT_PUBLIC_BUILD_PROFILE=prod`이면 무시 + warn log.
- escape를 켰을 때 quota를 1/10로 자동 축소 (운영자가 위험을 명시적으로 받아들였다는 신호).
- quota 카운트를 성공 응답에서만 증가하도록 변경. 또는 별도 "실패 카운터"로 1m당 캡.

---

### SEC-21-3. 🔴 proxy.ts matcher 누락 라우트 → 정적 strict CSP → 페이지 BROKEN 가능 (HIGH)

**위치**: `src/proxy.ts:392-411`, `next.config.ts:152-180`

**Matcher 포함**: `/`, `/dashboard/*`, `/practice/*`, `/playground/*`, `/contests/*`, `/community/*`, `/rankings/*`, `/submissions/*`, `/languages/*`, `/users/*`, `/problem-sets/*`, `/api/v1/*`, `/login`, `/signup`, `/change-password`, `/recruit/*`.

**Matcher 누락 (실제 존재하는 인증 페이지)**:
- `/forgot-password` — `src/app/(auth)/forgot-password/page.tsx`
- `/reset-password` — `src/app/(auth)/reset-password/page.tsx`
- `/verify-email` — `src/app/(auth)/verify-email/page.tsx`
- `/og/*`, `/sitemap.xml`, `/robots.txt`, `/api/health`, `/api/metrics`, `/api/internal/cleanup`
- `/api/auth/*` (의도적, NextAuth callback URL 보존)

**오늘 변경된 정적 fallback CSP** (next.config.ts:170):
```
script-src 'self'    ← nonce 없음, unsafe-inline 없음
```

**공격면**:
1. **가용성 공격(self-DoS)**: `/forgot-password`, `/reset-password`, `/verify-email`은 nonce 없는 strict CSP만 받습니다. Next.js 16은 RSC 스트리밍을 위해 inline script chunk(`__next_f`, hydration data 등)를 사용해요. 운영에서 이 페이지가 console에 "blocked by CSP"를 쏟아내고 hydration이 깨지면 로그인 복구 흐름 자체가 불통. 채용 시즌 중 마비. 주석(`next.config.ts:157-160`)이 "loud fail"이 의도라고 하는데, **하필 비밀번호 복구 페이지가 그 fail에 걸립니다**. 사용자에겐 silent 깨짐(혹은 form 작동 안 됨).
2. **부분 가시 공격**: `/api/auth/*`는 matcher에서 제외되어 NextAuth callback URL이 정적 CSP를 그대로 받습니다. NextAuth는 server-side redirect 위주라 영향 작지만, signOut 같은 inline-script 경로에서 깨짐.
3. **운영 검증**: prod 배포 후 `curl -i https://host/forgot-password | grep -i content-security`로 헤더 확인.

**Fix 권장**:
- matcher에 `/forgot-password`, `/reset-password`, `/verify-email` 추가. 한 줄짜리 수정.
- 동시에 e2e에 "비밀번호 복구 페이지가 nonce CSP를 받는다" 단언 추가. 회귀 방지.

---

### SEC-21-4. 🟠 사이드카 fail-closed가 `NODE_ENV=production` 환경변수에만 의존 (MEDIUM-HIGH)

**위치**: `rate-limiter-rs/src/main.rs:393-405`, `code-similarity-rs/src/main.rs:176-189`

```rust
let is_production = std::env::var("NODE_ENV")
    .map(|v| v == "production")
    .unwrap_or(false);
if is_production && !allow_unauth {
    tracing::error!("...Refusing to start...");
    std::process::exit(1);
}
```

**문제**: 사이드카 Rust 컨테이너는 별도 docker container. NODE_ENV는 일반적으로 Node.js 앱 컨테이너에만 전달되지, **Rust 컨테이너에 자동으로 propagate되지 않아요**. docker-compose.yml의 rate-limiter-rs / code-similarity-rs 서비스 블록에 `environment: NODE_ENV: production`을 명시적으로 넣어야 하는데, 그 명시가 누락되면 `is_production=false` → fail-open. 환경변수 누설로 운영 fail-closed가 깨집니다.

게다가 `NODE_ENV`라는 이름 자체가 Node.js 컨텍스트 컨벤션. Rust 사이드카가 이 변수를 부팅 게이트로 쓰는 건 인지 부조화 — 운영자가 사이드카 환경변수를 정리할 때 "Node 변수는 사이드카에서 빼도 되지"라고 판단할 위험.

**Fail-open 실제 트리거**:
1. docker-compose.yml에서 사이드카 서비스 블록에 `NODE_ENV` 미전달.
2. `RATE_LIMITER_AUTH_TOKEN` / `CODE_SIMILARITY_AUTH_TOKEN` 미설정.
3. 결과: 사이드카가 부팅 성공 + warn 로그 남기고 인증 없이 동작.

**공격 시나리오 (사이드카 도달 가정)**: 잘못된 포트 publish, host network 사용 컨테이너, 또는 샌드박스 탈출로 docker bridge 접근. `/reset` 호출로 본인 IP 차단 해제 → unlimited brute-force. `/check`를 위조 키로 호출해 다른 사용자 quota 소진 (DoS).

**검증**:
```bash
docker exec rate-limiter-rs env | grep -E 'NODE_ENV|AUTH_TOKEN'
docker logs rate-limiter-rs 2>&1 | grep -i 'AUTH_TOKEN is not set'
```

**Fix 권장**:
- env var 대신 build profile (`cargo build --release --features prod`) 또는 default deny (env 미설정 시 무조건 exit).
- 변수 이름을 `SIDECAR_DEPLOYMENT_MODE=production` 같은 사이드카 전용으로 분리.
- compose 파일 CI lint: `grep -q 'NODE_ENV: production' docker-compose.yml`로 enforce.
- 사이드카 `/health` 엔드포인트가 auth mode 반환 → 앱 측 startup check가 unauth mode 감지 시 alert.

---

### SEC-21-5. 🟠 IP 스푸핑: XFF 닫힘, X-Real-IP 잔존 (MEDIUM)

**위치**: `src/lib/security/ip.ts:43-92`

XFF hop 검증은 잘 들어갔어요. 그러나 X-Real-IP 폴백 경로가 그대로:
```ts
const realIp = headers.get("x-real-ip")?.trim();
if (realIp && isValidIp(realIp)) {
  return realIp;
}
```

**문제**: X-Real-IP는 클라이언트가 직접 설정 가능. Nginx가 `proxy_set_header X-Real-IP $remote_addr`로 덮어쓰기한다면 안전. 그런데:
1. Cloudflare를 reverse proxy로 쓰는 운영자가 X-Real-IP를 별도 처리하지 않으면 클라이언트가 보낸 값 그대로 통과 (Cloudflare는 CF-Connecting-IP를 권위적으로 세팅).
2. AWS ALB는 X-Real-IP 안 씀. ALB → app 사이에 ALB가 XFF만 추가하고 X-Real-IP는 그대로 전달. 그럼 client가 XFF 안 보내고 X-Real-IP만 보내면 우회.
3. 도커 내부 sidecar 통신에서 nginx 거치지 않으면 X-Real-IP는 무방비.

**공격**:
```http
GET /api/v1/auth/forgot-password
X-Real-IP: 8.8.8.8
(no X-Forwarded-For)
```
→ rate-limit 키가 `8.8.8.8`로 기록되어 본인 IP 차단 우회. forgot-password / login brute-force 가능.

**검증**: 운영 nginx 설정에 `proxy_set_header X-Real-IP $remote_addr;`가 모든 location에 있는지. 또는 application-level에서 X-Real-IP를 무시하고 XFF만 보도록.

**Fix 권장**: X-Real-IP 폴백을 default off로. 운영자가 `TRUST_X_REAL_IP=1` 명시적 opt-in. 또는 X-Real-IP를 아예 사용하지 말 것.

---

### SEC-21-6. 🟠 비밀번호 12자 floor가 system_settings로 4까지 다운그레이드 가능 (MEDIUM)

**위치**: `src/lib/security/password.ts:11`, `src/lib/validators/system-settings.ts`

```ts
export const FIXED_MIN_PASSWORD_LENGTH = 12;
// 그러나 운영자는 system_settings.min_password_length로 4..128 override 가능
```

**문제**: L-1을 12자로 올렸지만 admin이 UI에서 4까지 내릴 수 있어요. 채용 평가 운영자가 "후보자가 password를 자주 까먹는다"는 이유로 6~8자로 내리면 C-2 + M-2 + 약한 비밀번호 조합이 재현. 잔존 후보자 계정 brute-force가 다시 실현 가능.

**공격**: 침해된 admin 또는 misconfiguration → min_length 4 설정 → 다음 가입자부터 4자 비밀번호 OK. 기존 사용자는 영향 없으나, 채용은 항상 신규 가입자 위주.

**Fix 권장**: validator의 lower bound를 8로 올리고, 4를 허용하려면 별도 explicit env override 필요. 또는 floor를 4 → 10으로.

---

### SEC-21-7. 🟠 Anti-cheat Origin 검증이 `NODE_ENV === "production"`에서만 동작 (MEDIUM)

**위치**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:63-79`

```ts
if (process.env.NODE_ENV === "production") {
  const originHeader = req.headers.get("origin")?.trim();
  if (!originHeader) return apiError("forbidden", 403);
  // ... host equality check
}
```

**문제**:
1. **NODE_ENV 누락 → 우회**: 사이드카와 동일 패턴. NODE_ENV가 명시적으로 "production"이 아니면 origin 검증을 통째 skip → curl로 heartbeat 위조 가능. compose / k8s manifest에서 NODE_ENV가 빠지면 즉각 우회. 운영 진단 흐름에서 환경변수가 노출되면 잘못 설정한 호스트 식별 가능.
2. **Origin 검증만 있고 sec-fetch-site 검증 없음**: Origin 헤더는 사용자가 마음대로 설정 가능 (브라우저는 자동, curl은 수동). `Origin: https://canonical-host` 헤더 한 줄만 추가하면 통과. 그제 M-8 권장사항이었던 "세션 쿠키의 uaHash에 바인드"는 도입 안 됨.
3. **Heartbeat 위조 탐지 불가**: Origin은 attacker-supplied. 서버는 "Origin이 맞으면 정상"으로 인식 → curl 스크립트가 시험 시간 내내 30초 heartbeat을 보내며 친구가 별도 머신에서 실제 풀이.

**공격 체인**:
1. 후보자가 시험 응시 (브라우저 정상 로그인).
2. JWT 쿠키 + assignmentId 추출.
3. 친구 머신에서 동일 JWT로 시험 풀이.
4. 본인 머신에서 30초마다 curl heartbeat:
   ```bash
   curl -X POST https://host/api/v1/contests/$ID/anti-cheat \
     -H "Cookie: next-auth.session-token=..." \
     -H "X-Requested-With: XMLHttpRequest" \
     -H "Origin: https://host" \
     -H "Content-Type: application/json" \
     -d '{"eventType":"heartbeat"}'
   ```
5. 강사 대시보드엔 "활성 응시 중"으로 표시.

**Fix 권장 (그제 M-8 그대로)**:
- 서버 발행 challenge를 사인하는 WebCrypto 흐름. 페이지 로드 시 server가 ephemeral key를 cookie/sessionStorage로 발급, heartbeat은 timestamp + nonce를 sign.
- 또는 JWT의 `uaHash`를 heartbeat 검증 시 확인. curl이 정확한 UA를 흉내내야만 통과 — 약하지만 1bit 추가.
- NODE_ENV !== production 가드 제거. dev에서도 origin 검증을 켜고, 테스트는 `Origin` 헤더 설정으로 통과.

---

### SEC-21-8. 🔴 recruiting-invitations/bulk가 contest 소유권 검증 누락 (HIGH, NEW)

**위치**: `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts:13-126`

```ts
export const POST = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  schema: bulkCreateRecruitingInvitationsSchema,
  handler: async (req, { user, params, body }) => {
    const { assignmentId } = params;
    // ... emails dedup check
    // ... transaction creates invitations
    // canManageContest 검사 없음
  },
});
```

같은 디렉터리의 단건 route는 `canManageContest`로 가드:
```ts
// src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts:42
const assignment = await getContestAssignment(assignmentId);
if (!assignment) return apiError("notFound", 404, "Assignment");
if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);
```

stats, [invitationId] 자매 route도 모두 `canManageContest`/`getAuthorizedInvitation`로 묶여 있어요. bulk만 누락.

**문제**: `recruiting.manage_invitations` capability를 가진 instructor A가 instructor B의 contest에 후보자 초대 일괄 발급 가능. 후보자는 A 명의로 토큰을 받지만 redeem 시 B의 contest에 enrollment 생성 → B의 contest 데이터 오염, A의 가짜 후보자가 B의 채점 환경 차지.

**공격 체인**:
1. instructor A (custom role + `recruiting.manage_invitations`)가 `POST /api/v1/contests/{B의 assignmentId}/recruiting-invitations/bulk` 호출.
2. 100명 가짜 후보자 일괄 발급.
3. B의 채용 contest에 100명 + B의 dashboard에 신규 invitation 알림. A는 토큰 100개 보유.
4. A가 토큰 외부 유포 → 부정 응시자 → B의 채용 신뢰도 파괴.
5. 또는 단순히 B의 candidate slot/budget 소진 (license 모델 적용 시).

**검증 가능**: 단건 route의 commit 0be5ebe5에서 capability 기반 게이팅으로 옮길 때 bulk는 `canManageContest`가 누락된 채로 통과. 단위 테스트가 "권한 있는 사용자만 호출 가능"으로만 검증 → cross-tenant 케이스 미커버.

**Fix (3줄)**:
```ts
const assignment = await getContestAssignment(assignmentId);
if (!assignment) return apiError("notFound", 404, "Assignment");
if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);
```

---

### SEC-21-9. 🟠 contests/quick-create가 problem 가시성 검증 누락 (MEDIUM-HIGH, NEW)

**위치**: `src/app/api/v1/contests/quick-create/route.ts:54-61`

```ts
const existingProblems = await db
  .select({ id: problems.id })
  .from(problems)
  .where(inArray(problems.id, body.problemIds));
if (existingProblems.length !== body.problemIds.length) {
  return apiError("invalidProblemIds", 400);
}
```

**문제**: 단순히 problem 존재 여부만 검사. **visibility / authorId / accessibleProblemIds** 검증 없음. `contests.create` capability를 가진 instructor A가 instructor B의 private problem ID를 알면(URL leak, browser history, social engineering) 그 problem을 본인 contest에 넣고 풀이/test case 정당하게 노출 가능.

**공격 체인**:
1. A가 어떤 경로로 B의 private problem ID(`pid_xxxxx`)를 획득.
2. A가 quick-create로 본인 contest에 `problemIds: ["pid_xxxxx"]` 포함.
3. A가 contest를 만들었으니 본인 명의 contest의 problem statement, test cases, accepted solutions에 합법 접근 (`canAccessProblem`은 contest 소유자에게 항상 true).
4. B의 지적자산 누출.

**Fix**:
```ts
const accessibleIds = await getAccessibleProblemIds(
  user.id, user.role,
  existingProblems.map(p => ({ id: p.id, visibility: p.visibility ?? "private", authorId: p.authorId }))
);
if (accessibleIds.size !== body.problemIds.length) {
  return apiError("problemAccessDenied", 403);
}
```

---

### SEC-21-1. 🟠 C-2 fix의 logical gap — deadline 없는 invitation은 무한 활성 (MEDIUM)

**위치**: `src/lib/recruiting/access.ts:151-160`

```ts
for (const row of rows) {
  const cutoff = row.lateDeadline ?? row.deadline;
  if (!cutoff) {
    // No deadline = open-ended, treat as active.
    return false;
  }
  if (new Date(cutoff).getTime() > now) {
    return false;
  }
}
return true;
```

**문제**: assignment의 `lateDeadline`과 `deadline`이 둘 다 null이면 "open-ended"로 간주 → 후보자가 영원히 로그인 가능. `recruiting-invitations.ts:687`에서 후보자 contest access token expiry를 `assignment.deadline`로 설정하는데, **deadline 자체가 null이면 token도 무기한**.

**공격면**: 운영자가 무기한 contest를 만든 경우(drafting, ongoing internal sandbox 등), 후보자가 redeem하면 그 user 계정이 platform 전체에 영구 누적. C-2의 본래 의도("후보자 평가 끝나면 로그인 차단")가 깨짐.

**Fix**: deadline이 null인 contest에 후보자 invitation 발급 자체를 금지하거나, isStaleRecruitingCandidate를 "deadline 미설정 시도 redeem 후 7일이 지나면 stale"로 정의.

---

## 2. 어제·그제 미해결 — 오늘 우선순위 재조정

### M-1 / M-3 (judgeClaimToken 평문 + 회전 안 됨) — 명시적 deferred

**위치**: `src/app/api/v1/judge/poll/route.ts:89,154`

```ts
.where(
  and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
);
```

prod에서 worker fleet이 신뢰 가능하다는 가정에 의존. 운영 conversation log에 `JUDGE_AUTH_TOKEN`이 grep되면 (SEC-NEW-3 위험과 직결) 단일 토큰으로 임의 verdict 위조 가능. 작업량 작음 (`hashToken` 적용 + poll 시 회전) — 채용 운영 전 마무리 권장.

### M-4 (forgot-password 토큰 8자 키스페이스)

**위치**: `src/app/api/v1/auth/reset-password/route.ts:23`

H-5가 닫혀서 IP 우회로 limiter 우회 가능성은 줄었지만, 키 자체의 32-bit 좁음 + 65k 토큰에서 birthday collision은 동일. 운영 규모가 작아 즉시 위협은 아니지만, 채용 평가가 본격화되면 collision으로 다른 사용자의 reset 요청이 차단되는 가용성 이슈.

### M-6 (admin/backup timing oracle)

**위치**: `src/app/api/v1/admin/backup/route.ts:59-66`

null passwordHash 분기에서 dummy Argon2 verify 부재. admin/super_admin 권한 가정이지만, custom role + `system.backup` capability 부여 시 미검증. 운영자가 password 없이 SSO/Magic Link로만 로그인하는 admin 케이스에서 항상 403 즉시 반환 → timing 오라클로 그 사실 노출.

### L-7 (judgeStatusReport.compileOutput cap 미검증)

**위치**: `src/lib/validators/api.ts:27`

침해된 worker가 multi-MB compile output을 DB에 채워 디스크 abuse. 256KB cap 권장.

---

## 3. 엔드포인트 sweep — IDOR / CSRF / authz

### 3.1 contest 디렉터리 (`src/app/api/v1/contests/[assignmentId]/**`)

| 라우트 | 권한 검증 | 비고 |
|---|---|---|
| `anti-cheat` POST/GET | enrollment OR access_token / canManageContest | OK, Origin 검증 NODE_ENV-gated (SEC-21-7) |
| `access-code` GET/POST/DELETE | `canManageContest` | OK |
| `analytics` | `canManageContest` | OK |
| `announcements`, `clarifications` | `canManageContest` 또는 enrolled user | OK |
| `code-snapshots/[userId]` GET | `canViewAssignmentSubmissions` | OK |
| `export` | `canManageContest` | OK |
| `invite` | `canManageContest` | OK |
| `leaderboard` | enrollment check | OK |
| `participants` | `canManageContest` | OK |
| `participant-timeline/[userId]` | `canViewAssignmentSubmissions` | OK |
| `recruiting-invitations/route.ts` | `canManageContest` | OK |
| `recruiting-invitations/bulk/route.ts` | 🔴 **누락 (SEC-21-8)** | |
| `recruiting-invitations/stats` | `canManageContest` | OK |
| `recruiting-invitations/[invitationId]` | `getAuthorizedInvitation` | OK |
| `similarity-check` | `canManageContest` | OK |
| `stats` | `canManageContest` | OK |

`/api/v1/contests/quick-create`와 `/api/v1/contests/join`은 capability만 검증. quick-create는 problem 가시성 미검증 (SEC-21-9). join은 recruiting candidate 차단 + access code redeem 흐름 → OK.

### 3.2 submissions 디렉터리

| 라우트 | 권한 검증 |
|---|---|
| `submissions/route.ts` | `getSubmissionScope` (어제 fix 유지) — OK |
| `submissions/[id]` GET | `canAccessSubmission` — OK |
| `submissions/[id]/queue-status` | `canAccessSubmission` — OK |
| `submissions/[id]/events` (SSE) | `canAccessSubmission` + 30s re-auth check — OK |
| `submissions/[id]/comments` | 권한 검증 적절 |
| `submissions/[id]/rejudge` | admin/instructor only — OK |

### 3.3 problems 디렉터리

| 라우트 | 권한 |
|---|---|
| `problems/[id]/accepted-solutions` | `assignmentId IS NULL` 필터 (어제 fix) — OK |
| `problems/[id]/export` | `canManageProblem` |
| `problems/import` | `problems.create` capability + author-id 검증 별도 검토 권장 |

### 3.4 admin 디렉터리

- `admin/backup` — `system.backup` cap + password re-auth. timing oracle (M-6).
- `admin/restore` — `system.backup` cap + DDL — 침해된 admin이 임의 SQL 주입 가능한지 별도 검토 권장.
- `admin/migrate/*` — admin.
- `admin/submissions/export` — admin/instructor — 대량 데이터 rate-limit 재확인.

### 3.5 files 디렉터리

- `/api/v1/files` GET — `files.upload` 보유 시 자기 업로드만, `files.manage`면 전체. OK.
- `/api/v1/files/[id]` GET — `canAccessFile` (uploadedBy, 또는 problem 접근권). OK.
- DELETE — 동일 + CSRF (`csrfForbidden`). OK.

### 3.6 community 디렉터리

변경 적음. 어제 이전 베이스라인 신뢰.

### 3.7 plugins/chat-widget

`test-connection`: API 키를 DB에서 가져옴, URL은 hardcoded, model은 strict regex → SSRF 안전. OK.

`chat`: 메시지 50개, content 10000자 cap. 정상.

### 3.8 CSRF 일반

`src/lib/security/csrf.ts:30-74`:
- X-Requested-With 헤더 필수.
- sec-fetch-site 검증 (있을 때).
- Origin 헤더는 **있을 때만** 검증.

**약점**: Origin 헤더 없는 요청은 X-Requested-With만 통과하면 OK. 브라우저에서 cross-origin fetch 시 X-Requested-With를 붙이면 preflight 발생 → CORS 헤더 없으면 차단. 그래서 web context에서는 안전. 그러나 non-browser client (curl, 모바일 앱)에서는 X-Requested-With 추가가 trivial. SEC-21-7과 동일한 이슈.

전반적으로 OK 수준이지만, sensitive 액션(잔존 후보자 password 변경 등)에는 sec-fetch-site=same-origin을 strict하게 요구하는 게 안전합니다.

### 3.9 SSRF 표면

`fetch(`를 호출하는 API 라우트는 `plugins/chat-widget/test-connection`만. URL hardcoded, model regex 검증. SSRF 없음.

---

## 4. 샌드박스 / RCE 표면 — 변경 없는 항목

오늘 변경은 H-1/H-2 게이팅 도입. 컨테이너 / seccomp / language config layer는 손대지 않음. 그제 리뷰의 hot list 유효:

1. 컴파일 단계 tmpfs 실행 권한 + admin-controlled compile 명령어 (L-2).
2. `needs_exec_tmp` 언어들(.NET/Mono/pwsh) — run-phase에도 exec tmpfs.
3. `JUDGE_DISABLE_CUSTOM_SECCOMP=1`, `JUDGE_ALLOW_DEFAULT_COMPILE_SECCOMP=1` escape hatches — runtime assertion 권장 (still missing).
4. binfmt qemu 신뢰 표면 (어제 SEC-NEW-1).
5. moonbit 등 amd64-only 이미지 qemu 실행면 (어제 SEC-NEW-2).

---

## 5. Anti-cheat false-positive abuse — NEW 검토

**시나리오**: 어태커가 victim 계정으로 anti-cheat event를 위조 → victim의 DQ.

**현재 코드 (`/api/v1/contests/[assignmentId]/anti-cheat`)**:
- 이벤트는 인증된 사용자 본인으로만 기록 (`userId: user.id`).
- victim의 JWT를 얻으면 victim 명의 anti-cheat event 기록 가능.
- 강사 대시보드는 이벤트 가공 없이 ip/userAgent 표시.

**공격 가능 패턴**:
1. 어태커가 victim의 JWT 획득 (XSS, browser developer tools share, 동거인 PC, 공용 단말).
2. 어태커가 자기 머신에서 victim JWT로 30초마다 `tab_switch`, `paste` 등 다발 발생.
3. 강사가 victim의 anti-cheat 로그를 보고 부정행위 판정 → 자동/수동 DQ.
4. victim은 회수 어려움 — 본인은 결백한데 본인 계정에서 발생한 이벤트.

**완화**: JWT의 `uaHash` (`config.ts:419-423`)가 다르면 audit `suspicious_ua_mismatch` 기록 (proxy.ts:330-343) — 그러나 hard reject 안 함. anti-cheat 이벤트와 `suspicious_ua_mismatch`를 cross-correlation 자동화하면 false-positive 방지 가능.

**Fix 권장**:
- anti-cheat event 기록 시 JWT의 uaHash와 현재 UA를 비교 → 불일치면 이벤트에 `uaMismatch: true` 플래그.
- 강사 UI에서 uaMismatch 이벤트는 DQ 자동화에서 제외, 또는 강사에게 별도 색상으로 표시.

---

## 6. Recruiting 토큰 — 단일 사용 / 만료 / 재사용

**위치**: `src/lib/assignments/recruiting-invitations.ts`

**확인 결과**:
- 토큰 redeem 시 atomic SQL claim with `status = 'pending'` 가드 → 단일 사용 enforce. OK.
- `expiresAt > NOW()` SQL-level 가드 (`recruiting-invitations.ts:703`). OK.
- failed redeem 시도 counter (`incrementFailedRedeemAttempt`) → brute-force 차단. OK.
- 토큰 해시 저장 (`hashToken`). OK.

**미흡한 부분**:
- `expiresAt: null` invitation을 허용 (`createRecruitingInvitation`의 params type에 `expiresAt?: Date | null`). 운영자가 expiry 미설정하면 토큰 무기한. SEC-21-1과 연결.
- redeem 후 access token (`contestAccessTokens.expiresAt`)이 `assignment.deadline`에 묶임. deadline이 null이면 token 무기한.

**권장**: invitation 생성 시 expiresAt이 null이면 명시적 "no-expiry" 플래그를 요구하거나, default 90일 expiry 강제.

---

## 7. Time-of-check vs time-of-use — rate-limit quota

`consumeUserDailyQuota` 흐름:
1. `fetchRateLimitEntry` 호출 (`src/lib/security/rate-limit-core.ts:29`, `SELECT FOR UPDATE` 사용).
2. Transaction으로 attempts 증가.
3. Return된 후 호출자가 sandbox 실행.

`fetchRateLimitEntry`가 `FOR UPDATE` lock을 잡으므로 동시 호출은 직렬화됩니다. TOCTOU 안전.

다만 sidecar fast-path는 별도 in-memory counter이고 DB는 source of truth. sidecar가 일시적으로 응답 느릴 때 race window에서 DB가 권위 결정 — 정상.

quota 카운터가 **실패 응답에서도 증가**하는 점은 SEC-21-2의 분산 공격 우회 가능성과 함께 평가.

---

## 8. Threat model 정렬 — 3가지 사용처

### 8.1 채용 평가 (Recruiting)

- **C-1, C-2, H-1, H-2, H-6**: 닫힘 (단 escape hatches 존재).
- **C-2 logical gap (SEC-21-1)**: deadline 미설정 invitation 무기한 활성 — 채용 운영 전 닫아야 합니다.
- **SEC-21-8 (bulk IDOR)**: 채용 신뢰도 직격탄. 즉시 fix 필요.
- **SEC-21-2 (sandbox escape)**: SMTP 없는 lab에서 켜져 있으면 fleet abuse → 채용 환경 cost 상승.
- **SEC-21-7 (anti-cheat 우회)**: 채용 평가의 핵심. NODE_ENV 가드는 약함. WebCrypto challenge가 필요해요.

채용 운영 전 must-fix: SEC-21-1, SEC-21-2 (escape 차단), SEC-21-8, SEC-21-7, M-1/M-3.

### 8.2 학생 시험 (Exam)

- **anti-cheat 위조 (Section 5)**: 학생의 DQ는 학사 분쟁으로 직결. `uaMismatch` 플래그 도입 권장.
- **L-1 override (SEC-21-6)**: 학생 비밀번호가 약할 때 동료 계정 탈취 → 부정 응시.
- **CSP matcher 누락 (SEC-21-3)**: forgot-password 깨지면 시험 직전 복구 흐름 마비.
- **claim token (M-1/M-3)**: 학생 채점 결과 위조 시 학적 시스템 신뢰 붕괴.

학생 시험 운영 전 must-fix: Section 5 fix, SEC-21-3, M-1/M-3.

### 8.3 프로그래밍 대회 (Contest)

- **SEC-21-9 (quick-create problem 가시성)**: 다른 출제자의 비공개 problem이 본인 contest에 노출. 출제 IP 보호 핵심.
- **anti-cheat 우회 (SEC-21-7)**: 대회 경쟁 무결성 직격.
- **M-1/M-3**: 침해된 worker가 임의 verdict 위조 → 순위 조작.
- **rate-limit 사이드카 (SEC-21-4)**: 대회 중 abuse로 채점 큐 마비.

대회 운영 전 must-fix: SEC-21-9, SEC-21-7, M-1/M-3, SEC-21-4 (env 정합성 점검).

---

## 9. 종합 must-fix 12선 (2026-05-21 기준)

오늘 새로 발견된 이슈를 어제 must-fix 10선에 통합:

1. **SEC-21-8**: recruiting-invitations/bulk에 `canManageContest` 추가 (3줄).
2. **SEC-21-9**: contests/quick-create에 `getAccessibleProblemIds` 검증 추가.
3. **SEC-21-1**: invitation `expiresAt: null` 금지 또는 default 90일.
4. **SEC-21-2**: sandbox-gate escape를 prod 빌드에서 차단 + quota 1/10.
5. **SEC-21-3**: proxy.ts matcher에 forgot/reset/verify 페이지 추가.
6. **SEC-21-4**: 사이드카 부팅 게이트를 NODE_ENV 의존에서 build profile / explicit env로 전환.
7. **SEC-21-5**: X-Real-IP 폴백 default off.
8. **SEC-21-6**: min_password_length validator lower bound를 8 또는 10으로.
9. **SEC-21-7**: anti-cheat heartbeat을 uaHash 또는 WebCrypto challenge에 바인드. NODE_ENV 가드 제거.
10. **M-1 / M-3**: judgeClaimToken 해시 + 회전 (작업량 작음).
11. **Section 5**: anti-cheat event에 `uaMismatch` 플래그 추가.
12. **SEC-NEW-3 후속**: DB 비밀번호 로테이션 실제 수행 여부 확인. 운영 conversation log 노출 보안 정책 문서화.

---

## 10. 잘 된 부분 / 변경 없는 강점

- 인증: Argon2id + rehash, dummy 해시(타이밍 균일화), JWT freshness, 워커 토큰 해시 저장, recruiting 토큰 해시 저장 + atomic redemption.
- IDOR 방어: `canAccessSubmission`, `canAccessProblem`, `getAccessibleProblemIds`, `canManageContest` 등 정합. 단건 recruiting-invitations / submissions 일관 적용.
- CSRF: `X-Requested-With` + Origin + Sec-Fetch-Site (Origin은 optional 약점 잔존).
- 파일 업로드: magic-byte 검증, zip-bomb 압축 해제 크기 cap, sharp로 이미지 정규화, CSP `default-src 'none'` 응답.
- 샌드박스 기본: cap-drop=ALL, no-new-privileges, --read-only, tmpfs noexec(대부분 언어), network=none, pids-limit=128, user=nobody, mem+swap 일치, custom seccomp.
- SQL: `sql.raw`는 모듈 상수에만 사용 + regex assertion. 사용자 입력은 모두 parameterized.
- 시크릿: `.env*` 적절히 gitignore. 부팅 시 placeholder/짧은 토큰 거부. 민감 컬럼 AES-256-GCM(`enc:` versioned prefix).
- Rate-limit: `SELECT FOR UPDATE`로 TOCTOU 안전. DB-time 일관 사용으로 clock skew 회피.

오늘 작업의 의도는 좋아요. 다만 모든 fix에 "escape hatch" 또는 "production-only 가드" 또는 "matcher 등록 누락"이 같이 들어와서, **운영자가 실수로 비프로덕션 환경처럼 만들면 fix 전체가 무력화되는 패턴**이 반복됩니다. 환경변수 misconfiguration 한 줄이 보안 layer 5개를 깨뜨릴 수 있어요. 다음 cycle에서 "NODE_ENV 의존 → build profile / explicit deny 의존"으로 전환하는 게 핵심 작업입니다.

채용 / 시험 / 대회 본격 운영 전 반드시 닫아야 할 항목:
- SEC-21-8 (3줄 fix, 즉시).
- SEC-21-9 (수십 줄, 즉시).
- SEC-21-1 (10줄, 정책 결정 동반).
- SEC-21-7 (WebCrypto challenge, 1~2일 작업).
- M-1 / M-3 (반나절 작업, 명시적 deferred 상태).
