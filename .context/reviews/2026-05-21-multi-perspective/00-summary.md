# 종합 요약 — 다관점 리뷰 (2026-05-21)

전번 리뷰 사이클(`../2026-05-18-multi-perspective/`)이 표면에 있었고, 그 뒤로 보안 must-fix 다수가 닫혔어요. 이번 리뷰는 **닫힌 항목의 회귀 여부 검증** + **새 관찰** + **세 가지 사용처(학생 과제·시험, 채용 평가, 프로그래밍 대회)별 운영 가능성**을 다시 가늠한 결과입니다.

## 사용처별 출시 가능 여부 (어제 → 오늘)

| 사용처 | 5/18 | 5/21 | 변동 이유 |
|---|---|---|---|
| 학생 과제 | 조건부 | **조건부 (회귀 1건)** | sandbox-gate i18n 누락 + signup zod 8자/server 12자 불일치 신규 회귀 |
| 학생 정기 시험 | 위험 | 위험 | 서버 측 draft 복원 부재 여전 |
| 프로그래밍 대회 | 조건부 | 조건부 | frozen leaderboard fix 외 진전 없음 |
| 채용 평가 | 위험 | **위험 (UX 후퇴)** | C-2 dead-end UX, H-1/H-2 gate ordering bug, password client/server mismatch — 채용 본격 시작 전 반드시 처리 |
| 다중 인스턴스 HA | 불가 | 불가 | 변동 없음 |

채용 평가 판정이 어제보다 더 나빠진 이유는, 어제 닫은 보안 fix들이 후보자 UX 경로에 새 실패 모드를 만들었기 때문이에요. 보안 코어는 좁아졌으나 후보자가 실제로 마주치는 화면 품질이 떨어졌어요.

## 이번 세션(5/19–5/21) 적용 변경 모음

배포 상태: **세 호스트(auraedu, algo, worv) 모두 HTTP 200, 102/102 judge image, runtime nonce CSP 활성**. 자세한 deploy 결과는 본 사이클 첫 커밋 노트 참조.

### 보안 must-fix (닫힘)
- **C-1**: `resetPassword` 가 `tokenInvalidatedAt: now` 까지 갱신. 비번 리셋 후 기존 JWT 즉시 무효.
- **C-2**: `isStaleRecruitingCandidate` 추가, deadline 지난 후보자 로그인 차단.
- **H-1/H-2**: `/api/v1/playground/run`, `/api/v1/compiler/run` 이메일 verify + 일일 quota (200/500). 운영자 escape: `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1`.
- **H-3**: 정적 CSP fallback 을 runtime 보다 더 엄격하게(`script-src 'self'` only). 잘못 라우팅되면 큰 소리로 깨지도록.
- **H-4**: Rust 사이드카 (`code-similarity-rs`, `rate-limiter-rs`) production 에서 `AUTH_TOKEN` 미설정 시 fail-closed (`std::process::exit(1)`).
- **H-5**: `extractClientIp` 가 hop 수 부족 시 첫 IP fallback 거부. XFF 우회로 rate-limit bypass 차단.
- **H-6**: 비번 리셋 이메일 lookup 을 `lower(email)=lower($1)` 로.
- **L-1**: 패스워드 최소 길이 8 → 12.
- **M-8**: anti-cheat heartbeat 가 production 에서 Origin 헤더 검증.

### IDOR / 라우팅 fix
- `/submissions` non-staff scope (own OR public-problem)
- `accepted-solutions` 에 `assignmentId IS NULL` 필터
- frozen leaderboard 가 deadline 지나면 자동 unfreeze
- 비공개 대회 URL → 인라인 access-code 게이트
- 일반 제출/code-snapshot 가 활성 과제 단일 시 자동 라우팅

### 테스트
- 단위 2,429 통과
- post-deploy `PLAYWRIGHT_PROFILE=smoke` 8개 spec 자동 실행

## 신규 회귀 / 결함 (이번 사이클 리뷰가 새로 발견한 것)

| 영역 | 결함 | 영향 | 발견 관점 | file:line |
|---|---|---|---|---|
| 신규 회귀 | sandbox-gate 가 `emailVerificationRequired`/`dailyQuotaExceeded` raw key 반환, ko.json·legacyErrorMap 미수록 | 학생·후보자 UI 에 영문 키 노출 | student | `src/lib/security/sandbox-gate.ts:60-67` |
| 신규 회귀 | signup zod 는 `min(8)`, 서버는 12자. signup form 에 12자 힌트도 없음 | 학생/후보자 8자 입력 → zod 통과 → runtime 거부 | student, candidate | `src/lib/validators/public-signup.ts:11`, `recruit-start-form.tsx:20` |
| 신규 회귀 | H-1/H-2 gate 가 platform-mode 보다 **먼저** 실행. recruiting 후보자는 `emailVerified` 가 영원히 false 라서 sandbox 영구 차단 | 후보자가 본 시험 직전 워밍업 불가 | candidate | `src/app/api/v1/playground/run/route.ts:32-50` |
| 신규 회귀 | C-2 fix 후 후보자가 deadline 지나서 `/login` 들어가면 `invalidCredentials` 로 안내. `/recruit/{token}/results` 로의 이정표 없음 | "이미 합/불 받았는데 로그인 왜 안 되지?" → HR 문의 폭주 | candidate | `src/lib/auth/config.ts:315-323` |
| 신규 High IDOR | `recruiting-invitations/bulk` 가 sibling 라우트 중 유일하게 `canManageContest` 누락. 다른 강사 contest 에 후보자 초대 가능 | 채용 권한 상승 | security | `recruiting-invitations/bulk/route.ts` |
| 신규 Med-High | `contests/quick-create` 가 문제 visibility 검증 안 함. 다른 강사 비공개 문제 ID 끼워 넣으면 접근 가능 | 비공개 문제 노출 | security | `contests/quick-create/route.ts` |
| 신규 High | `judge-worker-rs` health 핸들러가 docker capability 확인 없이 200 OK 만 반환. 14h silent compile_error 사고의 직접 원인이 그대로 | 동일 사고 재발 가능 | admin | `judge-worker-rs/src/runner.rs:376` |
| 신규 High | `docker-compose.worker.yml:23-31` 에 `POST=0, DELETE=0, ALLOW_*=0` 가 다시 하드코딩되어 있음. 어제 사고 재현 가능 | 다음 deploy 시 워커 lock | admin | `docker-compose.worker.yml:23-31` |
| 신규 Med | C-2 의 `isStaleRecruitingCandidate` 가 deadline·lateDeadline 둘 다 null 인 과제에서 false 반환. 후보자가 영구 로그인 가능 | C-2 우회 | security | `src/lib/recruiting/access.ts` |
| 신규 Med | `system_settings.minPasswordLength` 가 4자까지 override 가능. L-1 의 12자 기본은 운영자 settings UI 에서 무력화 | 정책 일관성 | security | `src/lib/system-settings-config.ts` |
| 신규 Med | sandbox 의 `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1` 이 NODE_ENV 무관, 모듈 import 시 단 한 번 평가. 운영자가 hot-reload 시도해도 효력 없음 | 운영자 hot-swap 함정 | security | `src/lib/security/sandbox-gate.ts:7-14` |
| 신규 Med | proxy.ts matcher 가 `/forgot-password`, `/reset-password`, `/verify-email` 누락. 새 strict static CSP fallback 으로 떨어져 inline RSC script block | 패스워드 리셋 흐름 self-DoS 가능 | security | `src/proxy.ts` matcher |
| 신규 Med | TA(`role='assistant'`) 가 contest manage 페이지 진입은 가능하나 anti-cheat 탭 fetch 가 403. 페이지는 빈 화면 | 라이브 시험 감독 위임 불가 | assistant | `src/lib/assignments/management.ts:72-86`, anti-cheat-flags 라우트 |
| 신규 Med | 점수 override 가 ranking cache invalidate 안 함 | 학생/감독관 본 화면 vs 실제 점수 불일치 | instructor | `src/app/api/v1/.../overrides/route.ts` |
| 신규 Med | `submissionComments` 가 후보자 본인 제출에서 instructor name·role 까지 노출. 평가 코멘트 누수 | 평가자 노트가 후보자 시야에 | candidate | `visibility.ts` 인근 |
| 신규 Med | Rust 사이드카의 fail-closed 가 `NODE_ENV=production` env var 에 의존. Rust 컨테이너에 자동 전파 안 됨. compose 에서 명시 안 하면 dev 모드로 起動 | H-4 우회 잠재 | security | `code-similarity-rs/src/main.rs`, `rate-limiter-rs/src/main.rs` |
| 신규 Low | `Retry-After` 헤더가 학생 UI 에서 무시됨 | 재시도 폭주 | student | submission form |
| 신규 Low | 4초 confirm window 가 마감 직전 양날의 검 | 마감 막바지 제출 불안 | student | submission flow |
| 신규 Low | anti-cheat privacy notice 가 sessionStorage 기반, 탭 재오픈 시마다 뜸 | 시험 중 소음 | student | anti-cheat-monitor |
| 신규 Low | nginx config 가 deploy 마다 전체 overwrite, 운영자 커스텀 silently 소실 | 운영자 cusotmization loss | admin | `deploy-docker.sh:884-1057` |

## 관점별 핵심 발견 (각 리뷰의 헤더만 발췌)

### 학생 — `01-student.md`
- 오늘 fix 한 sandbox-gate 가 한국어/UI 통합 없이 raw key 노출. **이게 가장 큰 신규 회귀**.
- signup 8자/server 12자 불일치 — public-signup zod 도, recruit-start zod 도 동일 문제.
- `/api/v1/code-snapshots` GET API 부재. POST 만 있어 다른 기기에서 드래프트 복원 불가. anti-cheat 가 snapshot 적재는 하지만 학생 보호용으로는 안 씀.
- `Retry-After` 헤더 무시, 4초 confirm window, anti-cheat privacy notice 반복 등 Low 다수.

### 강사 — `02-instructor.md`
- 어제 짚었던 instructor pain (per-student deadline 연장, CSV 로스터 import, 플래지어리즘 트리아지 UI, bulk rejudge >50, subtask/SPJ) **단 한 건도 진전 없음**. 이번 사이클은 보안에만 집중됐어요.
- 점수 override 가 ranking cache 못 무력화. 학생 화면과 실제 점수 불일치.
- `/api/v1/users/bulk` 이 `users.create` 캡만 요구해서 강사 직접 호출 불가. CSV 로스터 임포트가 admin 손 빌려야.
- 강사가 본 score-override `reason` 이 학생 본인 제출 페이지에 노출 안 됨.
- similarity pair 결과가 React state only, 새로고침 시 손실.
- assistant 가 `problems.delete` 없어 본인 그룹 테스트케이스 unlock 도 못 함.

### 조교(TA) — `03-assistant.md`
- TA 권한 표면이 두 개(`role='assistant'` 글로벌 vs `group_instructors.role='ta'`) 인데 동작이 완전히 달라요.
- 글로벌 `assistant` role 의 capability set 이 **사실상 죽은 코드**. contest 관리 라우트는 cap 안 보고 `canManageContest` (owner/view_all/co_instructor) 만 봄.
- TA 직책으로 임명되어도 22개 운영 작업 중 4개만 가능. anti-cheat, similarity, participant timeline, overrides, clarifications, access-code, invite, exam-sessions 다 막힘.
- contest manage 페이지 진입은 가능하나 모든 탭이 빈 화면(주로 anti-cheat) — **라이브 시험 감독 위임 불가**.
- 오늘 sandbox-gate 가 assistant 를 staff 로 분류한 건 적절했어요(이메일 verify 우회).

### 운영자(Admin) — `04-admin.md`
- **#1**: `judge-worker-rs` health 핸들러가 docker capability 안 봐서 14h 사고의 직접 원인이 그대로. 이번 사이클에 안 닫혔어요.
- `docker-compose.worker.yml` 에 `POST=0` 가 하드코딩으로 남아 있어, 다음 deploy 시 워커 lock 재현 가능.
- docker logging size limit 없음. algo 디스크 67%, `RUST_LOG=info` 가 verbose.
- 백업 daily timer + 30일 retention 은 있지만, `verify-db-backup.sh` 가 gzip 검증만, 실제 `pg_restore` 드릴 없음. 3-2-1 위배.
- alerting 채널이 `systemd-cat` 만, webhook/Slack/email 부재.
- post-deploy smoke 의 `E2E_PASSWORD=skip-login` 플레이스홀더가 truthy 라서 로그인 시도 발생, 7건 false-positive 매 deploy 마다 노이즈.
- Rust 사이드카 fail-closed 됐지만 `/metrics` 엔드포인트 없음, 핫패스 가시화 0.
- realtime-coordination 단일 인스턴스 가드가 `scripts/check-high-stakes-runtime.sh` 에 거짓 통과 신호 줌.
- nginx config 매 deploy 완전 overwrite, 운영자 커스텀 silently 소실.

### 채용 후보자 — `05-candidate.md`
- **오늘의 가장 큰 후보자 UX 후퇴**: C-2 fix 가 dead-end 만들고 안내 부재. 후보자가 `/login` 으로 들어오면 `invalidCredentials` 만 보고 panic.
- **H-1/H-2 gate ordering bug**: sandbox-gate 가 platform-mode 보다 먼저 실행되어, 후보자(이메일 verify 없는 계정)가 영문 `emailVerificationRequired` 봄. 후보자가 절대 verify 할 수 없는 계정 타입인데도 verify 하라고 안내함.
- password client/server mismatch — `recruit-start-form.tsx:20` 가 8자, `password.ts:11` 가 12자.
- **공격 표면 매트릭스**(Section 12): 후보자 토큰으로 호출 가능한 모든 엔드포인트 검증. **권한 상승 가능 경로 0건** (recruitingAccess.problemIds whitelist 가 cross-batch leak 차단).
- **노출 정보 검증**(Section 5): cross-candidate leak 0건. 단 `submissionComments` 가 instructor name·role 까지 노출하는 잠재 leak 1건.
- 후보자가 시도할 수 있는 공격: fake heartbeat via cron, token URL share for proxy testing — 둘 다 약한 위협, 대형 침해 없음.
- 서버 측 draft 복원 부재(POST-only), 시스템 체크 페이지 부재, `showResultsToCandidate` 기본 false 가 본인 제출의 verdict 까지 가림.

### 보안 — `06-security.md`
- **모든 listed must-fix 닫힘**. 하지만 **대부분 escape hatch 와 함께 닫혀서 회귀 위험 동반**.
- **SEC-21-2**: `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1` 이 H-1/H-2 전체 우회. 모듈 import 시 단 한 번 평가, NODE_ENV 가드 없음.
- **SEC-21-3**: proxy matcher 가 password reset/verify-email 라우트 누락. 새 strict static CSP 로 떨어져 inline RSC self-DoS 위험.
- **SEC-21-4**: Rust 사이드카 fail-closed 가 `NODE_ENV=production` env var 에 의존, Rust 컨테이너 자동 전파 없음.
- **SEC-21-5**: H-5 는 XFF 만 fix. `X-Real-IP` fallback 은 여전히 client header 신뢰.
- **SEC-21-6**: L-1 의 12자 기본이 `system_settings` UI 에서 4자까지 override 가능.
- **SEC-21-7**: anti-cheat Origin 검증이 `NODE_ENV === "production"` 가드. Origin 헤더는 curl 로 attacker 가 통제 가능하므로 효력 제한적.
- **SEC-21-8 (신규 High)**: `recruiting-invitations/bulk` 라우트가 `canManageContest` 누락 — 다른 강사 contest 에 후보자 초대 가능.
- **SEC-21-9 (신규 Med-High)**: `contests/quick-create` 가 문제 visibility 안 봄 — 다른 강사 비공개 문제 ID 끼워 넣기 가능.
- **C-2 논리 갭**: `isStaleRecruitingCandidate` 가 deadline 둘 다 null 시 false 반환.
- **여전히 열린 것**: M-1/M-3 (judgeClaimToken plaintext + 회전 부재, 어제 deferred), M-4 (32-bit reset token rate-limit key), M-6 (backup endpoint timing oracle), L-7 (compileOutput cap).
- **anti-cheat false-positive 남용 surface**: 도난 JWT 로 victim 명의 anti-cheat 이벤트 생성 → 부당 DQ. `uaHash` cross-check 미배선.

## 최우선 처리 12선 (5/21 신규 우선)

| 순위 | 이슈 | 영역 | 출처 |
|---|---|---|---|
| 1 | sandbox-gate 의 emailVerificationRequired/dailyQuotaExceeded i18n 처리 + ko 메시지 추가 | student/candidate | 회귀 |
| 2 | signup zod min(12) 로 통일 + 폼 힌트, recruit-start 도 동일 | student/candidate | 회귀 |
| 3 | H-1/H-2 gate ordering: platform-mode 먼저, sandbox-gate 나중. 또는 recruiting 컨텍스트에선 sandbox-gate 스킵 | candidate | 회귀 |
| 4 | C-2 dead-end UX: 후보자 로그인 실패 응답에 `/recruit/{token}/results` 안내 | candidate | 신규 |
| 5 | `recruiting-invitations/bulk` 에 `canManageContest` 추가 | security | SEC-21-8 |
| 6 | `contests/quick-create` 가 problem visibility 검증 | security | SEC-21-9 |
| 7 | `judge-worker-rs` health 가 docker capability 체크 (14h 사고 root cause) | admin | 신규 |
| 8 | `docker-compose.worker.yml` 의 하드코딩 `POST=0` 제거 | admin | 신규 |
| 9 | proxy matcher 에 password-reset/verify-email 추가 (또는 정적 CSP 완화) | security | SEC-21-3 |
| 10 | `system_settings.minPasswordLength` 하한을 12 로 고정 | security | SEC-21-6 |
| 11 | Rust 사이드카 fail-closed 의 NODE_ENV 의존 제거 (compose 에서 명시 전달) | security | SEC-21-4 |
| 12 | TA(`assistant` role) capability 가 contest 관리 라우트에서 실제 동작하도록 `canManageContest` 보강 | assistant | 신규 |

## 어제 → 오늘 진척 매트릭스

| 5/18 Top 10 | 5/21 상태 |
|---|---|
| #1 워커 e2e 헬스 + verdict 분포 알림 | ❌ 미진전 (judge-worker-rs/health 그대로) |
| #2 resetPassword tokenInvalidatedAt | ✅ 닫힘 |
| #3 후보자 계정 마감 후 잠금 | ✅ 닫힘 (단 dead-end UX 회귀) |
| #4 서버측 드래프트 복원 | ❌ 미진전 (POST only 유지) |
| #5 단일 인스턴스 제약 해제·문서화 | ❌ 미진전 |
| #6 DLQ 가시화 | ❌ 미진전 |
| #7 개별 학생 마감 연장 | ❌ 미진전 |
| #8 frozen leaderboard 자동 해제 | ✅ 닫힘 |
| #9 playground/compiler 이메일 + quota | ✅ 닫힘 (단 gate ordering 회귀) |
| #10 CSP nonce화 | ✅ 닫힘 (단 matcher 갭) |

5/10 닫힘, 5/10 미진전. 닫은 5개 중 3개가 새 회귀 동반. **순수 진척 = 2개 (#2, #8)**.

## 사용처별 운영 가능성 (재평가)

### 학생 과제 (homework)
- 핵심 흐름 동작. 단 sandbox-gate i18n 누락이 첫인상 망침. 12자 signup 모순도 등록 직후 첫 실패 만듦.
- **출시 차단**: 없음 (Low 회귀만)
- **출시 권장**: 위 #1, #2 처리 후

### 학생 정기 시험 (final exam)
- 드래프트 복원 부재가 여전히 시험 격침 위험. 워커 사고 재발 표면도 그대로(judge-worker health, docker-socket-proxy hardcode).
- **출시 차단**: 워커 e2e 헬스 + drilled 백업 + draft 복원
- **출시 권장**: 위 + #7, #8, #11 처리

### 프로그래밍 대회 (contest)
- frozen leaderboard fix 로 운영 부담 한 단계 감소. 다만 subtask/SPJ 등 contest 기능 갭은 큼.
- **출시 차단**: 없음 (Cycle 11/12 RPF 후순위 가능)
- **출시 권장**: 위 #7, #8 처리

### 채용 평가 (recruiting)
- **이번 사이클에 가장 후퇴**. 보안 코어는 좁아졌으나 후보자 화면 품질이 떨어졌어요.
- **출시 차단**: 회귀 #1, #2, #3, #4 + SEC-21-8 (recruiting-invitations/bulk IDOR) **필수**
- **출시 권장**: 위 4건 fix 후 1주 e2e 회귀 cover 후

### HA / 다중 인스턴스
- realtime-coordination 단일 가드가 거짓 통과 신호 주는 새 문제 발견.
- **출시 차단**: 가드 정직화 + DLQ + 멀티 워커 락 검증
- **출시 권장**: 별도 사이클 (3주+)

## 패턴 관찰

- **수정-회귀 비율**: 보안 fix 5건 닫는 동안 회귀 3건 발생 (60%). 보안 영역 hot pass 라서 UX 검증 없이 머지된 인상.
- **escape hatch 의존**: 이번 사이클 대부분 fix 가 env-var escape 와 함께 닫힘 (`SANDBOX_ALLOW_UNVERIFIED_EMAIL`, `*_ALLOW_UNAUTHENTICATED`). 운영자 misconfig 한 번에 여러 보안 레이어가 같이 무너짐.
- **NODE_ENV 의존성 누적**: 4개 fix 가 `NODE_ENV==='production'` 가드. 환경 변수 한 줄 잘못 set 하면 보안 표면이 단숨에 넓어짐.
- **UX 측 회귀 검증 부재**: 보안 fix 5건이 머지될 때 i18n·signup·gate ordering 검증이 자동으로 안 됐어요. e2e 스모크가 ko 로 라우트되는 영역이 없는 게 원인.
- **TA 권한 표면 dual-track**: `role='assistant'` 와 `group_instructors.role='ta'` 가 동작 차이 큼. 문서·라우트 양쪽에서 통일 필요.

## 검증 인프라 갭

- 단위/컴포넌트 2,650+ 통과
- e2e 38개 spec 중 8개 remote-safe
- **부재**: signup 흐름의 zod ↔ server 일치 검증, sandbox-gate i18n 키 ↔ ko.json 키 일치 검증, recruiting 후보자 로그인 dead-end → results 페이지 안내 검증
- **부재**: judge-worker-rs 의 docker capability 헬스 회귀 cover
- **부재**: docker-compose.worker.yml drift 가드 (어제 14h 사고의 직접 원인)

## 다음 단계 권장

### 즉시 (이번 주)
1. 회귀 4건 (#1–#4) fix + e2e cover
2. `recruiting-invitations/bulk` IDOR (#5) + `quick-create` (#6)
3. judge-worker-rs health 패치 (#7) + worker compose 하드코딩 제거 (#8)

### 단기 (2주)
4. proxy matcher 보강 (#9), system_settings 하한 (#10), Rust 사이드카 NODE_ENV 분리 (#11)
5. assistant role 의 contest manage 진입 동작 정직화 (#12)
6. 서버측 draft 복원 (5/18 #4 이월)
7. 개별 학생 마감 연장 (5/18 #7 이월)

### 중기 (1달)
8. DLQ + 알림 채널 (Slack/email)
9. 백업 restore 드릴 + 3-2-1
10. ranking cache invalidation 보강 (score-override 포함)
11. judgeClaimToken 해시 + 회전 (M-1/M-3 deferred)
12. anti-cheat uaHash cross-check (false-positive 남용 방어)

## 마지막 한마디

어제 리뷰가 "코어 보안 must-fix 가 채용 본격 시작 전 무조건 해결되어야 한다"고 했고, 이번 사이클은 정확히 그 방향으로 닫았어요. **그러나 닫는 과정에 회귀 3건이 동반됐고, 그 중 2건이 채용 후보자 UX 를 직접 망가뜨려요**. 채용 운영 본격 개시 전 회귀 4건 (#1–#4) + IDOR 1건 (#5) 은 반드시 fix 가 필요해요. 그 외 보안 escape hatch 패턴(NODE_ENV 의존, env var override)은 다음 보안 사이클에서 통합적으로 정리하는 게 좋아요. 운영 측은 어제의 14h 사고 root cause (judge-worker health, docker-socket-proxy hardcode) 가 아직 그대로라 다음 사고는 시간 문제예요.
