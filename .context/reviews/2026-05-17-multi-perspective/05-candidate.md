# 지원자(Candidate / Recruit) 관점 리뷰

리뷰 시점: 2026-05-17
대상 사용처: 외부 후보자 대상 코딩 평가(채용용)

## 잘 돌아가는 부분

- 초대 토큰 기반 진입(`src/app/(auth)/recruit/[token]/page.tsx:80-92`), 토큰은 해시 저장(`recruiting_invitations.tokenHash`, schema `:961`).
- 평가별 브랜딩(로고, 담당 이메일) 지원(`schema.pg.ts:354-356`).
- 사용된 토큰도 같은 기기에서 재진입 허용(`page.tsx:117`).
- Anti-cheat heartbeat이 제출 직전에 서버에서 검증됨(`src/lib/assignments/submissions.ts:298-317`).
- 토큰 brute-force 잠금: 여러 번 실패 시 lock-after-failures.
- 토큰 redemption은 atomic transaction.

## 미흡하거나 빠진 기능

### 🔴 시험 전 시스템 체크 페이지 부재 (High)
지원자가 시작 누르면 곧장 시험 시작. 사전에 에디터, 언어 런타임, 브라우저 호환성을 검증할 흐름이 없음. 첫 제출 시점에 "이 언어 안 됨" 같은 사태가 드러남.
- **수정**: 시작 전 "Hello world" 실행 체크 페이지(언어 + 자동 채점 + 인터넷 연결 + 브라우저).

### 🔴 서버 측 드래프트 복원 부재 (High, 학생 리뷰와 공통)
`code_snapshots` 테이블에 키 입력마다 글자 수 기록(`schema.pg.ts:989-1014`)하면서, 정작 사용자 화면에서 다시 읽는 API 없음.
- **시나리오**: 시험 중 노트북 죽거나 브라우저 갱신되면 작업 분실. 채용 평가에선 재시도 기회 없음.
- **수정**: `GET /api/v1/code-snapshots?problemId&assignmentId` + 마운트 시 localStorage와 reconcile.

### 🟡 Heartbeat 신선도 90초 — 약한 wifi에서 못 제출 (Med-High)
`ANTI_CHEAT_HEARTBEAT_FRESHNESS_MS = 90_000`(`src/lib/assignments/submissions.ts:48`). 95초 동안 연결 끊긴 후보자는 제출이 안 됨. 새로고침해서 heartbeat 다시 회복할 동안 시간 낭비.
- **수정**: 직전 heartbeat이 fresh했으면 grace로 수락하고 "verify" 후처리.

### 🟡 Anti-cheat 이벤트 grace 없음 (Med)
`src/lib/anti-cheat/review-model.ts:7-9`의 `blur`/`tab_switch`/`contextmenu`는 "signal" 등급. 그러나 클라이언트 측 debounce 없이 unconditional 서버 인서트. 잠시 노트 앱 보거나 시스템 알림 떠도 이벤트 폭주.
- **수정**: UI에서 사전 경고 후에 기록 OR 평가별 `allow_tab_switch` 옵션(엄격하지 않은 모드용).

### 🟡 모바일 코드 작성 불가 (High, 글로벌 채용)
CodeMirror 데스크톱용 그대로. 모바일 키보드 보조 바 없음, 좁은 화면에서 문제 설명 + 에디터가 둘 다 잘림.
- **시나리오**: 모바일만 쓰는 국가/지원자에게 시험 자체가 불가능.
- **수정**: 모바일 감지 후 "데스크톱 사용 권장" 안내 또는 모바일 전용 레이아웃.

### 🟡 결과 가시성 사전 안내 없음 (Med)
`showResultsToCandidate`, `hideScoresFromCandidates`(`schema:348-349`)는 관리자 토글. 후보자는 미리 알 수 없음. "결과 공개 여부"가 어떻게 설정됐는지 시작 전에 보여주는 안내 부재.
- **수정**: 시작 페이지에 "응시 결과는 ____ 공개됩니다" 명시.

### 🟡 후보자 본인 인증 약함 (Med, 산업 표준 한계)
초대 토큰 공유로 제3자 대리 응시 가능. IP 변경 감지는 있지만 신원 검증은 아님.
- **수정(옵션)**: 시작 시 신분증 사진 업로드, 웹캠 keepalive(필요 시).

### 🟡 후보자 계정이 평가 후에도 살아남음 (Med)
초대를 redeem하면 일반 사용자 계정이 만들어지고 `isActive=true`로 평생 살아남음(`src/lib/assignments/recruiting-invitations.ts:638-671`). 마감 후에도 본인이 username + 비밀번호로 일반 로그인 가능.
- **시나리오**: 마감 후 candidate가 본인 계정 살려서 다른 공개 콘텐츠 이용 가능. 운영자 데이터에 잔존 계정 누적.
- **수정**: 마감 시 자동 비활성화 또는 토큰 전용 인증으로 바인딩.

### 🟡 접근성 미흡 (Med, ADA/장애인 차별 금지)
- skip-link, focus-trap, 스크린 리더 친화 anti-cheat 경고 등 미비.
- Time extension 등 학사 accommodations에 해당하는 후보자 측 흐름 없음.

### 🟡 제출 영수증 부재 (Low-Med, HR 법적 요건)
제출 완료 후 PDF 또는 이메일 영수증 없음. 일부 회사에선 법적 증빙 요구.
- **수정**: 응시 완료 시 timestamp + 해시 포함된 요약 이메일.

### 🟡 후보자 비밀번호 정책 (Low)
초대 redeem 시 `accountPasswordMinChars`(`recruit.accountPasswordTooShort`)만 검증. 8자 최소(`src/lib/security/password.ts:1-21`)에 복잡도 룰 없음. 중간 난이도 채용에선 빠른 brute force 가능.

### 🟡 후보자 username 노출 (Med)
username은 10자 nanoid(62-bit). 감사 로그, 리더보드, 코멘트 참조에서 노출. 본인이 username + 비밀번호로 로그인 가능하므로 username 노출 = brute force surface.

### 🟢 본인 비밀번호 분실 시 자체 복구 흐름 없음 (Low)
시험 중 비밀번호 잊으면 운영자가 직접 reset해야 함(`recruit.accountPasswordResetRequiredNotice`). 시험 중에 자체 복구는 보안 위반이라 의도된 동작.

## 사용처별 영향

| 시나리오 | 영향 |
|---|---|
| 데스크톱 보유 국내 채용 | 보통 — 시스템 체크 + 드래프트 복원 보완 후 사용 가능 |
| 모바일 후보자 비율 높은 글로벌 채용 | **위험** — 사실상 불가 |
| GDPR/PIPA 적용 지역 | **위험** — 데이터 export/erasure self-service 부재 (관리자 리뷰 참조) |
| 부정행위에 민감한 정통 시험 | 보통 — anti-cheat 신호는 보조용. 감독관 필요 |

## Show-stopper 후보

- **시스템 체크 부재 + 서버 드래프트 복원 부재** 조합. 둘 중 한 번이라도 실패하면 "후보자 측 사고처럼 보이는 운영자 사고" 사례 생성.

## 추천 작업 순서

1. 시스템 체크 페이지 — 시작 전 5분 안에 환경 검증.
2. 서버 측 드래프트 복원 (학생 리뷰와 공유).
3. Heartbeat grace 정책.
4. 후보자 계정 마감 후 처리(자동 비활성화 또는 토큰 전용 바인딩).
5. 모바일 안내 또는 미지원 명시.

## 보안 메모

이 area는 보안 리뷰(`06-security.md`)와 강하게 연동돼 있어요:
- **C-1**: 비밀번호 reset이 기존 세션 무효화 안 함 → 토큰 탈취 시 세션 잔존.
- **C-2/M-2**: 후보자 계정 평생 살아남음 → 위 "잔존 계정" 항목과 동일 원인.
- **H-5**: `X-Forwarded-For` 1-element 케이스에서 IP 스푸핑 가능 → 신뢰성 약함.

보안 리뷰에서 같이 다룹니다.
