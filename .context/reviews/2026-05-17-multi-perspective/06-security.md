# 보안 리뷰 — 공격자 관점

리뷰 시점: 2026-05-17
대상 사용처: 채용 코딩 평가(상금/합격 관련), 학생 시험, 프로그래밍 대회(부정행위 인센티브 큼)

전반 평가: 의외로 방어적인 코드베이스예요. atomic SQL claim, custom seccomp, magic-byte 검증, 토큰 해시 저장, 캐퍼빌리티 세분화 등이 잘 깔려 있어요. 그러나 (1) 비밀번호 reset 후 세션 무효화, (2) playground/compiler 남용, (3) CSP 약점, (4) 사이드카 옵셔널 인증, (5) IP 스푸핑, (6) 컴플라이언스에 약점이 있어요.

---

## CRITICAL

### C-1. 비밀번호 reset이 기존 세션을 무효화하지 않음
**위치**: `src/lib/email/index.ts:124-194` `resetPassword()`; `src/app/api/v1/auth/reset-password/route.ts`
**문제**: `resetPassword`는 `users.passwordHash`, `mustChangePassword`, `updatedAt`를 업데이트하지만 `tokenInvalidatedAt`을 세팅하지 않아요. 비교: `src/lib/actions/change-password.ts:80-82`와 `src/lib/actions/user-management.ts:122,324`는 `tokenInvalidatedAt`을 세팅. JWT 콜백(`src/lib/auth/config.ts:423-429`)은 `tokenInvalidatedAt`이 세팅됐을 때만 토큰을 무효 처리.
**공격**: 후보자 JWT가 탈취된 상태(XSS, 공용 PC, 개발자 도구 카피). 피해자는 "비밀번호 잊음"으로 복구 → 그들의 쿠키는 회전하지만 **공격자의 JWT는 만료 전까지 유효**(`getSessionMaxAgeSeconds()`). 공격자 계속 제출 가능.
**수정**: `resetPassword` 트랜잭션 안에서 `tokenInvalidatedAt: now`를 같이 set. 인세션 변경 흐름과 동일하게.

### C-2. 채용 후보자 계정이 만료 후에도 password 로그인 가능
**위치**: `src/lib/assignments/recruiting-invitations.ts:638-671`
**문제**: 후보자 초대 redeem 시 후보자가 고른 비밀번호로 사용자 레코드 생성(`isActive=true, mustChangePassword=false`). 마감 후에도 `/login`에서 username(10-char nanoid) + password로 로그인 가능.
**공격**: 후보자가 10-char username을 알아낸다(스코어보드/리뷰 참조에서 노출). 약한 비밀번호와 결합되면 잔존 계정 탈취 → 다른 평가에서 platform 계정처럼 동작. 채용 시 후보자가 플랫폼에 영구 누적 계정을 가지는 자체가 문제.
**수정**: (a) 마감 후 자동 비활성화(cron sweep), (b) 토큰 전용 인증으로 바인딩(`passwordHash=null`), 또는 (c) `mustChangePassword=true` + 동의 요구.

---

## HIGH

### H-1. Playground/compiler가 모든 인증 사용자에게 열려 있음 — Docker 남용
**위치**: `src/app/api/v1/playground/run/route.ts:28-29`, `src/app/api/v1/compiler/run/route.ts:35-36`
**문제**: 권한은 `content.submit_solutions`(기본 student도 보유). Rate limit은 라우트당 글로벌 단일 키. 공개 회원가입이 켜져 있으면 IP당 10 회/60s로 계정 무한 생성 가능. 각 컨테이너는 256MB/1CPU로 cap되지만 계정당/IP당 일일 ceiling 없음.
**공격**: 잔여 프록시 + 공개 회원가입으로 1k 계정 생성 → 각 5 jobs/min 돌림. CPU/disk 무한 소비. 학생이 Python long loop으로 30s마다 한 슬롯 점유 가능.
**수정**: 사용자당 일일 Docker 호출 예산(예: student 200/day, unverified 더 낮게). 이메일 인증 전엔 `content.submit_solutions` 미부여.

### H-2. 공개 회원가입이 이메일 인증 없이 활성 계정 발급
**위치**: `src/lib/actions/public-signup.ts:138-147`
**문제**: 인서트 시 `isActive: true, mustChangePassword: false`. 이메일 verification 흐름 존재하지만(`/api/v1/auth/verify-email`) 권한 게이팅 없음.
**공격**: 일회용 이메일로 계정 무제한 생성 → 즉시 playground/compiler 접근. H-1과 결합하면 남용 파이프라인 완성.
**수정**: `publicSignupEnabled=true`일 때 이메일 인증 전엔 Docker 관련 캐퍼빌리티 차단. 기본 hCaptcha on.

### H-3. 정적 CSP가 `'unsafe-inline'` script 허용
**위치**: `next.config.ts:159-171`
**문제**: 프로덕션 CSP가 `script-src 'self' 'unsafe-inline'`. 주석에 Next.js streaming inline 때문이라 명시. stored-XSS 방어가 전적으로 DOMPurify / `react-markdown skipHtml`에 의존. 마크다운 플러그인 추가나 DOMPurify allowlist regression 시 즉시 RCE-on-browser.
**공격**: 문제 markdown에 stored XSS → 강사 열람 시 토큰 탈취 → 강사 권한 takeover.
**수정**: middleware 기반 nonce CSP로 이행. `src/proxy.ts`가 이미 dev에 있음 — prod로 확장. RSC nonce 도입.

### H-4. 사이드카(`code-similarity-rs`, `rate-limiter-rs`)가 토큰 미설정 시 fail-open
**위치**: `code-similarity-rs/src/main.rs:45-50,46-67`; `rate-limiter-rs/src/main.rs:380-389`
**문제**: 두 Rust 사이드카가 `*_AUTH_TOKEN` 환경변수 미설정 시 경고만 찍고 모든 요청 수락. compose 기본은 내부 docker 네트워크지만 prod 잘못 배포(포트 노출) 또는 sandbox escape로 docker bridge에 도달한 공격자가 인증 없이 호출 가능.
**공격**: rate-limiter `/reset` 위조로 본인 IP 차단 해제. similarity 서비스에 큰 페이로드 DoS.
**수정**: 프로덕션 빌드에선 토큰 미설정 시 시작 거부(fail-closed). 기본 바인드를 localhost/docker internal로.

### H-5. `X-Forwarded-For` 1-element 케이스에서 IP 스푸핑
**위치**: `src/lib/security/ip.ts:39-67`
**문제**: `TRUSTED_PROXY_HOPS=1` 기본. `parts[parts.length - (hops+1)]` 인덱싱이 XFF 헤더에 한 element만 있을 때 그 element(즉 클라이언트 claim)를 그대로 반환. Nginx가 `set_real_ip_from` 없이 `X-Forwarded-For`를 append하면 어태커는 임의 IP를 claim 가능.
**공격**: `X-Forwarded-For: 8.8.8.8` 헤더 → rate limit, audit log, 워커 IP allowlist 모두 우회.
**수정**: hop count 미달 시 raw client IP로 폴백(절대 client-supplied 신뢰 X). 또는 `X-Real-IP`(Nginx `ngx_http_realip_module`이 권위적으로 세팅)로 전환. Nginx config requirement 문서화.

### H-6. Forgot-password 이메일 조회가 case-sensitive
**위치**: `src/lib/email/index.ts:44-46`
**문제**: `where: eq(users.email, email)`. sign-in은 `lower(email) = lower(...)`(`config.ts:283`)로 비교. 일관성 없음.
**공격**: 피해자가 `Alice@example.com`로 가입. 어태커가 `alice@example.com`로 reset 요청 → 인서트 시 케이싱에 따라 매치 안 되어 reset 못 받음. 또한 매치 vs 미스 시 코드 경로 차이로 timing-based 사용자 enumeration 가능.
**수정**: 이메일은 모든 비교 지점에서 lowercase 정규화 + insert 시 `lower(email)`에 unique index.

---

## MEDIUM

### M-1. Submission `judgeClaimToken`이 평문 저장 + 인프로그레스 업데이트 시 회전 안 됨
**위치**: `src/app/api/v1/judge/poll/route.ts:88-94`
**문제**: 인프로그레스 상태 업데이트의 유일 체크가 `where id=? AND judgeClaimToken=?`. `judgeWorkerId`가 비어 있는 행에서는 shared `JUDGE_AUTH_TOKEN`이 폴백. claim token은 `submissions.judgeClaimToken`에 평문 저장.
**공격**: shared `JUDGE_AUTH_TOKEN` 유출 + claim token 알면 임의 제출 verdict 위조(`accepted`, score=100).
**수정**: `judgeClaimToken` 해시 저장(워커의 `secretTokenHash`처럼). poll에서 worker별 인증 강제 + shared-token 폴백 제거. 인프로그레스 업데이트마다 토큰 회전.

### M-2. 후보자 username brute-force surface
위 C-2 참조. username 10-char nanoid (62-bit)는 임의 추측은 어렵지만 감사 로그·스코어보드·리뷰 참조에서 노출되므로 brute force는 leaked username 기반으로 약한 비밀번호 시도. L-1과 결합.

### M-3. Judge claim token이 in-progress 업데이트 후 클리어 안 됨
**위치**: `src/app/api/v1/judge/poll/route.ts:82-90`
**문제**: 인프로그레스 상태 업데이트로 토큰을 회전하지 않음. 같은 토큰이 terminal POST까지 재사용 가능.
**공격**: 워커가 `judging` 보고 후 크래시 → 다른 워커가 reclaim. 첫 워커의 토큰이 여전히 valid이고, 누군가 그것 + shared `JUDGE_AUTH_TOKEN` 가지면 in-progress 결과 덮어쓰기.
**수정**: 인프로그레스 업데이트마다 토큰 회전, 또는 monotonic sequence number 도입.

### M-4. Forgot-password rate-limit 키가 raw 토큰 앞 8자만 사용
**위치**: `src/app/api/v1/auth/reset-password/route.ts:23`
**문제**: `reset_password:token:${token.slice(0, 8)}`. 약 32-bit 키스페이스. 65k 토큰에서 birthday paradox로 충돌. IP 기반 limiter가 함께 적용되긴 하지만 H-5(IP 스푸핑)로 IP 우회 시 단일 방어막.
**수정**: 전체 토큰 해시를 키로. 또는 토큰 검증 후 userId를 키로.

### M-5. 채용 감사 로그에서 8-hex 해시 prefix만 기록
**위치**: `src/lib/auth/recruiting-token.ts:34-37`
**문제**: 감사 이벤트 `attemptedIdentifier`가 `recruit:<8-hex>` 형태. 32-bit 오라클. 코멘트는 "correlation, NOT for security"로 명시되어 있어 의도된 트레이드 오프.
**위험**: 작음 — 다른 감사 슬라이스와 cross-correlation 가능.

### M-6. Backup 엔드포인트 비밀번호 검증 timing
**위치**: `src/app/api/v1/admin/backup/route.ts:48-60`
**문제**: `dbUser?.passwordHash`가 null이면 즉시 403, 아니면 Argon2id 검증. "패스워드 미설정 사용자" vs "잘못된 비밀번호" 시간 차이.
**위험**: 작음 (admin role 이미 필요).
**수정**: missing-hash 분기에서 dummy Argon2 verify 실행(login 흐름이 이미 그렇게).

### M-7. Stored XSS 표면 — markdown 컴포넌트 swap 시 regression 위험
**위치**: `src/components/problem-description.tsx:60-117`
**문제**: 설명이 "legacy HTML처럼 보이면" DOMPurify로 sanitize 후 `dangerouslySetInnerHTML`. `LEGACY_HTML_ALLOWED_TAGS`에 `<img>` 포함. `afterSanitizeAttributes` 훅이 non-root src 제거하지만 `onerror` 같은 핸들러는 DOMPurify 기본이 막음. 현 시점 안전.
**위험**: 미래 PR에서 `target`/`href` 인젝션이 추가되면 즉시 RCE-on-browser(H-3 CSP unsafe-inline 때문).
**수정**: `LEGACY_HTML_ALLOWED_ATTR` 더 좁히고, DOMPurify 설정 핀 CI 테스트 추가.

### M-8. Anti-cheat heartbeat은 클라이언트 발행 — curl 우회 가능
**위치**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:84-118`, `src/lib/assignments/submissions.ts:298-310`
**문제**: 제출이 30초 heartbeat을 요구하지만, scripted submitter가 curl로 heartbeat과 제출을 둘 다 보내면 통과. 브라우저 fingerprint나 무결성 증명 없음.
**공격**: 후보자가 50줄 스크립트로 브라우저 탭(decoy) + curl(친구 머신) 동시 실행. 시험을 둘이 나눠 풀면서 anti-cheat 대시보드엔 "present" 표시.
**수정**: (a) `Origin` 헤더 요구, (b) heartbeat을 세션 쿠키의 `uaHash`에 바인드, (c) 서버 발행 challenge를 WebCrypto로 서명 요구.

### M-9. API key prefix `Bearer jk_` 감지로 timing-based 포맷 enumeration
**위치**: `src/lib/api/auth.ts:64-70`
**문제**: `jk_` prefix면 DB 조회 후 JWT 경로로 폴백. prefix 일치 시 DB 쿼리 발생 → timing 차이.
**위험**: 작음 (API 키 포맷은 이미 공개).

### M-10. Code-similarity 클라이언트가 사이드카 다운 시 fail-open
**위치**: `src/lib/assignments/code-similarity-client.ts:58-62`
**문제**: null 반환 → TS 구현으로 폴백. 가용성엔 좋지만, Rust 사이드카 DoS 시 모든 similarity 체크가 Node로 옮겨가 성능 저하 → cascading degradation.
**수정**: circuit breaker + 운영자 알림.

### M-11. Forgot-password 라우트 body size cap 부재
**위치**: `src/app/api/v1/auth/forgot-password/route.ts:11-14`
**문제**: `await req.json()`이 Next.js 전역 100MB 제한만 적용. JSON 엔드포인트엔 과함.
**수정**: zod 스키마 적용 전 stream-length precheck.

---

## LOW / INFO

### L-1. 비밀번호 정책 8자 최소, 복잡도 없음
**위치**: `src/lib/security/password.ts:1-21`
**위험**: `12345678` 통과. C-2 + M-2와 결합하면 잔존 후보자 계정 brute force 용이.
**수정**: zxcvbn 스코어, 또는 12자 최소.

### L-2. `validateShellCommand`이 admin curated language config를 신뢰
**위치**: `src/lib/compiler/execute.ts:170-244`; `judge-worker-rs/src/runner.rs:116-167`
**위험**: `&&`, `;` 허용. 컴파일 단계 tmpfs는 실행 권한이 있음 — 침해된 admin 또는 language_configs 행이 컴파일 단계 RCE.
**수정**: `validateShellCommandStrict`을 모든 경로에서 기본화.

### L-3. `proxyClientMaxBodySize: "100mb"`
모든 라우트 100MB POST 허용. 이미지 업로드 외 JSON 라우트(코멘트, 클래리피케이션 등)는 사실상 cap 없음.

### L-4. Forgot-password가 SMTP 미설정 시 503 반환 → enumeration
**위치**: `src/app/api/v1/auth/forgot-password/route.ts:38-40`
**수정**: 항상 200 + success:true. 내부 로그만 남기기.

### L-5. LRU 캐시 기반 heartbeat dedup이 멀티 인스턴스에서 부정확
**위치**: `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
관리자 리뷰의 멀티 인스턴스 제약과 연결됨.

### L-7. `judgeStatusReportSchema.compileOutput` 길이 cap 미검증
**위치**: `src/lib/validators/api.ts:27`
침해된 worker가 multi-MB 출력으로 DB 비대화 유발 가능.
**수정**: 256KB cap.

### L-9. JWT가 UA-hash 포함하지만 IP 바인드는 없음
모바일 로밍 호환을 위한 의도적 트레이드오프.

### L-10. Worker heartbeat이 동료 worker의 상태를 mutate
**위치**: `src/app/api/v1/judge/heartbeat/route.ts`
빠르게 heartbeat하는 worker가 동료의 staleness를 가릴 수 있음. 대체로 무해.

---

## 채용용 must-fix 10선

1. **C-1**: `resetPassword`에서 `tokenInvalidatedAt` 세팅 (1줄).
2. **C-2 / M-2**: 후보자 계정 마감 후 잠금 또는 토큰 전용 인증으로 바인드.
3. **H-1 / H-2**: playground/compiler에 이메일 인증 게이팅, 일일 사용자별 quota.
4. **H-3**: middleware nonce 기반 CSP, `'unsafe-inline'` 제거.
5. **H-4**: 사이드카 토큰 미설정 시 시작 거부 (prod 빌드).
6. **H-5**: `extractClientIp` 폴백 fix + Nginx `real_ip` 설정 문서화.
7. **H-6**: 이메일 정규화 일관화.
8. **M-1 / M-3**: `judgeClaimToken` 해시 + 회전, shared-token poll fallback 제거.
9. **L-1**: 채용/시험 사용자에 한해 비밀번호 12자 이상 또는 zxcvbn.
10. **M-8**: anti-cheat heartbeat을 세션 `uaHash`에 바인드 + `Origin` 헤더 검증.

---

## 샌드박스 탈출 hot list

1. **컴파일 단계 tmpfs 실행 권한 + admin이 통제하는 컴파일 명령어**. 침해된 language_configs(또는 L-2의 `&&`/`;` 허용)로 `/tmp/payload` 실행 가능. 런타임 tmpfs는 대부분 noexec.
2. **`needs_exec_tmp` 언어들(.NET/Mono/pwsh)**은 run-phase에도 실행 가능 tmpfs. 커스텀 seccomp가 유일한 커널 공격면 가드.
3. **Seccomp escape hatches**: `JUDGE_DISABLE_CUSTOM_SECCOMP=1`, `JUDGE_ALLOW_DEFAULT_COMPILE_SECCOMP=1` 환경변수 — 프로덕션에서 실수 set 시 보안 저하. 런타임 assertion 권장.
4. **컴파일된 바이너리 캐시(미존재)**: 향후 도입 시 cross-tenant leak 주의. 현 시점 매 제출마다 fresh `mkdtemp`.
5. **Worker admin endpoints의 Dockerfile path 처리**(`runner.rs`): `validate_admin_image_tag`와 `validate_dockerfile_path_for_build`가 path traversal 방어. 정기 검토 필요.

---

## 컴플라이언스 갭 (GDPR / PIPA)

1. **self-service 데이터 export 부재**. GDPR Art. 15/20, PIPA 열람권 위반 소지.
2. **self-service erasure 부재**. 후보자가 응시 후 본인 데이터 삭제 요청 흐름 없음. GDPR Art. 17.
3. **보존 기간 미문서화**. `antiCheatEvents: 180 days`만 보임. 제출 코드는 무기한? 채용 6개월 권고.
4. **anti-cheat 모니터링 동의 흐름**이 sessionStorage 플래그 기반. 서버 측 기록 없음. PIPA 민감 모니터링 명시 동의 위반 소지.
5. **감사 로그 보존 미문서화**. `audit_events`에 IP/UA/details 등 PII.
6. **백업 파일에 `passwordHash`, `tokenHash` 포함** — chain of custody가 운영자 책임.
7. **위반 통보 절차 미문서화**.
8. **국외 이전 평가 미문서화**: 배포가 EU·한국 외 인프라 사용 시 SCC/PIPA equivalence 평가 필요.

---

## 견고하게 잘 된 부분 (간략)

- **인증**: Argon2id + rehash, dummy 해시(타이밍 균일화), JWT freshness, 워커 토큰 해시 저장, recruiting 토큰 해시 저장, atomic redemption.
- **IDOR 방어**: `canAccessSubmission`, `canAccessProblem`, `getAccessibleProblemIds` 등 정합.
- **CSRF**: `X-Requested-With` + Origin + Sec-Fetch-Site.
- **파일 업로드**: magic-byte 검증, zip-bomb 압축 해제 크기 cap, sharp로 이미지 정규화, CSP `default-src 'none'` 응답.
- **샌드박스 기본**: cap-drop=ALL, no-new-privileges, --read-only, tmpfs noexec(대부분 언어), network=none, pids-limit=128, user=nobody, mem+swap 일치, custom seccomp.
- **SQL**: `sql.raw`는 모듈 상수에만 사용 + regex assertion. 사용자 입력은 모두 parameterized.
- **시크릿**: `.env*` 적절히 gitignore. 부팅 시 placeholder/짧은 토큰 거부. 민감 컬럼 AES-256-GCM(`enc:` versioned prefix).

전반적으로 보안 인식이 잘 깔린 코드베이스. 위 high-leverage fixes(C-1, H-1/H-2/H-3)는 며칠 단위 작업으로 가능. **채용/대회 stakes가 본격적으로 걸리기 전에 끝내는 게 좋아요.**
