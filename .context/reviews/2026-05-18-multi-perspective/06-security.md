# 보안 리뷰 — 공격자 관점 — 2026-05-18

## 어제 → 오늘 fix 추적

| 어제 짚은 이슈 | 오늘 상태 |
|---|---|
| **IDOR**: `/submissions` 목록에서 학생이 비공개(대회/시험) 문제 제출 메타데이터 조회 | ✅ fix (non-staff visibility scope) |
| **IDOR**: `accepted-solutions` API가 대회 제출 코드까지 노출 | ✅ fix (`assignmentId IS NULL`) |
| 일반 제출 자동 라우팅 부재 | ✅ fix |
| Drizzle relational where bug (production 500s) | ✅ fix |
| 14h silent compile_error (운영) | ✅ fix |
| docker proxy fleet drift | ✅ fix (3 호스트 모두) |

오늘 fix는 모두 **보안 영향이 있는 것**들. IDOR 두 건 + 운영 사고 한 건.

## CRITICAL — 어제와 동일 (미해결)

### C-1. `resetPassword`가 기존 세션 무효화 안 함
**위치**: `src/lib/email/index.ts:124-194`
**영향**: 탈취된 JWT가 비밀번호 reset 후에도 유효.
**작업량**: 1줄.

### C-2. 채용 후보자 계정이 만료 후에도 password 로그인 가능
**위치**: `src/lib/assignments/recruiting-invitations.ts:638-671`
**영향**: 잔존 계정 + 약한 비밀번호.

## HIGH — 어제와 동일 (미해결)

### H-1. Playground/compiler 무제한 quota
### H-2. 공개 회원가입이 이메일 인증 없이 활성 계정 발급
### H-3. CSP `'unsafe-inline'` script (XSS containment 약함)
### H-4. 사이드카(code-similarity, rate-limiter) 토큰 미설정 시 fail-open
### H-5. IP 스푸핑 (XFF 1-element fallback)
### H-6. Forgot-password 이메일 대소문자 불일치

## MEDIUM — 어제와 동일

### M-1. `judgeClaimToken` 평문 저장 + shared-token fallback
### M-2. 후보자 username brute-force surface
### M-3. claim token 회전 안 됨
### M-4. Forgot-password rate-limit 키가 토큰 앞 8자
### M-5. recruiting 감사 로그 prefix 32-bit
### M-6. Backup endpoint timing oracle
### M-7. Stored XSS 잠재 표면 (markdown)
### M-8. Anti-cheat heartbeat curl로 우회 가능
### M-9~M-11. (minor)

## 오늘 새로 발견된 보안 이슈

### 🟡 SEC-NEW-1. ARM64 fleet 운영 시 binfmt qemu 등록의 신뢰 surface (Med)
- `tonistiigi/binfmt --install amd64` 컨테이너가 host kernel binfmt에 직접 등록
- 3rd-party 이미지의 privileged 컨테이너가 host kernel state 변경
- 신뢰 가정: tonistiigi/binfmt 이미지가 신뢰 가능
- **공격 표면**: 이 이미지가 변조되면 호스트 kernel binfmt 우회·악성 emulator 등록 가능
- **수정**: 이미지 hash pin, 정기 verify. 또는 host apt 패키지 + 수동 binfmt 등록 스크립트.

### 🟡 SEC-NEW-2. moonbit 등 amd64-only 이미지가 binfmt qemu로 실행됨 (Med)
- 후보자/학생이 moonbit 제출 → ARM64 host에서 qemu-x86_64로 처리
- qemu의 추가 공격 표면 (qemu CVE, syscall translation 버그)
- 표준 seccomp profile이 qemu syscall에 맞춰 검증됐는지 미확인
- **수정**: amd64-only 언어 활성화 시 명시적 위험 검토. 또는 ARM64 호스트에선 amd64-only 언어 비활성.

### 🟡 SEC-NEW-3. 운영 시 conversation log를 통한 시크릿 노출 (Med, 어제 권고 후속)
- 진단 흐름에서 `docker container env`로 `POSTGRES_PASSWORD` 노출 (이 세션 + 어제 세션 둘 다)
- agent 기반 ops가 흔해질수록 노출 빈도 증가
- 노출된 conversation은 운영자 권한 외 영역으로 저장될 수 있음
- **수정**:
  - DB 비밀번호 즉시 로테이션 (어제 권고했으나 미확인)
  - ops runbook에서 env 조회 시 `grep -v PASSWORD` 패턴 명시
  - secret 컬럼 자동 마스킹 wrapper

### 🟡 SEC-NEW-4. accepted-solutions IDOR fix의 회귀 위험 (Med, 회귀 방지 필요)
- 오늘 `assignmentId IS NULL` 필터 추가
- 회귀 방지 단위 테스트 있음 (3 케이스 통과)
- 다만 e2e가 없어 라우트 인테그레이션 회귀 시 silent fail 가능
- **수정**: e2e 추가 (Option B 작업으로 진행 예정)

### 🟡 SEC-NEW-5. 비공개 대회 인라인 접속 코드 게이트의 enumeration risk (Low)
- 오늘 추가한 인라인 게이트는 권한 없는 로그인 사용자에게 "코드 입력 UI" 노출
- 비공개 대회의 **존재**를 노출 (인증된 사용자 대상 ID enumeration 가능)
- 현재 ID는 nanoid라 추측 어려움 (62-bit)
- **수정**: enumeration risk 낮지만, rate limit 추가 권장

## 채용용 must-fix 10선 — 어제와 동일, 일부 우선순위 조정

1. **C-1**: `resetPassword`에서 `tokenInvalidatedAt` 세팅 (1줄)
2. **C-2 / M-2**: 후보자 계정 마감 후 잠금
3. **H-1 / H-2**: playground/compiler 이메일 인증 게이팅 + 일일 quota
4. **H-3**: CSP middleware nonce화
5. **H-4**: 사이드카 토큰 fail-closed
6. **H-5**: IP 스푸핑 폴백 fix
7. **H-6**: 이메일 정규화 일관화
8. **M-1 / M-3**: claim token 해시 + 회전
9. **L-1**: 비밀번호 12자/zxcvbn
10. **M-8**: anti-cheat heartbeat session 바인드

**+ 신규 운영 이슈 우선순위**:
- **SEC-NEW-3 후속**: DB 비밀번호 로테이션 진행 여부 확인. 안 됐으면 즉시.

## 컴플라이언스 갭 (GDPR / PIPA) — 어제 동일

1. self-service 데이터 export 부재
2. self-service erasure 부재
3. 보존 기간 미문서화
4. anti-cheat 모니터링 동의가 sessionStorage 기반
5. 감사 로그 보존 미문서화
6. 백업 파일에 hash 포함, chain of custody 운영자 의존
7. 위반 통보 절차 미문서화
8. 국외 이전 평가 미문서화

## 견고하게 잘 된 부분 (어제 동일, 강화됨)

- 인증: Argon2id + rehash, dummy 해시, JWT freshness, 토큰 해시 저장
- IDOR 방어: 오늘 추가 fix로 더 강화. 단위 테스트가 회귀 방지.
- CSRF: `X-Requested-With` + Origin + Sec-Fetch-Site
- 파일 업로드: magic-byte, zip-bomb cap, sharp 정규화
- 샌드박스 기본: cap-drop=ALL, no-new-privileges, --read-only, tmpfs noexec(대부분), network=none, pids-limit, user=nobody, custom seccomp
- SQL: parameterized, raw는 module-level constants only
- 시크릿: AES-256-GCM column encryption, env validation at boot

**이번 세션의 fix는 모두 보안 표면을 좁히는 방향**. C-1, H-1, H-2 같은 코어 보안 항목은 여전히 미해결이라 채용 평가 본격 운영 전 무조건 해결 필요.
