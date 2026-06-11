# 종합 요약 — 다관점 리뷰 (2026-05-18)

전일 리뷰(`../2026-05-17-multi-perspective/`)이 있고, 그 사이 큰 fix가 다수 진행됐어요. 오늘 리뷰는 그 델타 + 새 관찰.

## 사용처별 출시 가능 여부 (어제 → 오늘)

| 사용처 | 어제 | 오늘 | 변동 사유 |
|---|---|---|---|
| 학생 과제 | 조건부 | 조건부 | 변동 없음 (마감 연장 부재 여전) |
| 학생 정기 시험 | 위험 | 위험 | 변동 없음 (드래프트 복원 부재) |
| 프로그래밍 대회 | 위험 | **조건부** | 비공개 대회 링크 fix, 참가자 목록 추가. 다만 frozen leaderboard·subtask 미해결 |
| 채용 평가 | 위험 | 위험 | IDOR fix는 했으나 C-1, C-2, H-1, H-2 등 코어 보안 미해결 |
| 다중 인스턴스 HA | 불가 | 불가 | 변동 없음 |

## 이번 세션(오늘) 적용 변경 모음

배포 상태: **세 호스트(auraedu, algo, worv) 모두 적용 + 102/102 judge image 빌드 + HTTP 200 + 워커 online**.

### 보안 / IDOR
- `/submissions` 목록 non-staff scope (own OR public-problem). 비공개 문제 제출 메타데이터 cross-student 누수 차단.
- `accepted-solutions` 엔드포인트 `assignmentId IS NULL` 필터. 대회 종료 후 문제 공개 시 모든 참가자 코드 누수 차단.

### Drizzle / 운영 버그
- `problems/page.tsx`의 `tagFilter`, `buildAccessFilter` 둘 다 사전 ID 해결 + `inArray`. `column problems.tag_id does not exist` 폭주 종료.

### 자동 라우팅
- 일반 제출/code-snapshots 단일 활성 과제로 자동 라우팅. 다중이면 기존 409 유지.

### 대회 UX
- 비공개 대회 URL → 인라인 access-code 게이트 (404 → 진입 가능).
- 참가자 목록 카드 (초대 vs 그룹 소속 구분).
- `submissions.view_all`이 대회 가시 권한에서 제외 (`groups.view_all`만).
- 리더보드 totalScore=0 행 이름도 muted.

### 로케일
- SEO-deterministic 페이지에서 명시적 쿠키 존중 (어제까지 무시되던 버그).

### 운영 사고 복구
- **auraedu**: docker-socket-proxy `POST=0` 잠금 14h 사고 복구 (POST/DELETE/ALLOW_START/STOP 보강).
- **algo worker**: 같은 잠금 발견 + 복구.
- **worv worker**: ALLOW_START/STOP 추가로 일관성 확보.
- 로컬 `docker-compose.production.yml`도 동일 fix 반영.

### Judge 이미지 빌드
- 5개 깨진 Dockerfile 패치: powershell(URL 갱신), simula(include path 수정), odin(LLVM 18), apl(CXXFLAGS 통일), moonbit(`--platform=amd64` + buildx + binfmt).
- 모든 102개 언어 이미지가 세 호스트 모두 빌드됨.
- ARM64 워커 운영 의존성 (binfmt 등록, buildx 플러그인) 문서화 필요.

### 한국어 i18n
- 720+ 문자열 해요체 자연화.
- "사용자명" → "아이디".
- 채팅 위젯 disclaimer 제거.

### 테스트
- 단위 2,429 + 컴포넌트 221 통과.
- 새 IDOR fix와 자동 라우팅에 대한 테스트 추가.

## 최우선 처리 10선 (어제 + 오늘 신규)

| 순위 | 이슈 | 영역 | 어제? | 오늘 추가? |
|---|---|---|---|---|
| 1 | 워커 e2e 헬스 + verdict 분포 알림 | admin | - | 🆕 (14h 사고 직접 원인) |
| 2 | `resetPassword`에서 `tokenInvalidatedAt` | security | ✅ | (1줄) |
| 3 | 후보자 계정 마감 후 잠금 | recruit/security | ✅ | |
| 4 | 서버 측 드래프트 복원 | student/candidate | ✅ | |
| 5 | 단일 인스턴스 제약 해제 또는 문서화 | admin | ✅ | |
| 6 | DLQ 가시화 | admin | ✅ | |
| 7 | 개별 학생 마감 연장 | instructor | ✅ | |
| 8 | frozen leaderboard 자동 해제 | instructor | ✅ | |
| 9 | playground/compiler 이메일 인증 + quota | security | ✅ | |
| 10 | CSP nonce화 (unsafe-inline 제거) | security | ✅ | |

## 운영 사고 회고 (오늘)

- **14h silent compile_error**: 4월 17/18일 commit이 docker-proxy를 잠그면서 워커가 컨테이너 못 띄움. healthcheck는 통과해서 표 안 남. **운영자 행동에서 발견할 가시화 부재**가 본질 원인.
- **fleet drift**: 같은 설정이 3개 호스트 다른 compose 파일에 같은 식으로 잠겨 있었음. **단일 commit/PR이 fleet 전체에 동일 사고 노출**.
- **시크릿 노출**: 진단 흐름에서 `POSTGRES_PASSWORD`가 conversation 로그에 노출. **agent 기반 ops가 늘수록 이 surface 증가**.

## 알려진 미해결 (어제 + 오늘 신규)

- 어제 미해결 다수 (boundary 변동 거의 없음): 멀티 인스턴스, DLQ, GDPR export, must-fix Top 10
- 오늘 새 운영 이슈: 워커 e2e 헬스, fleet config drift, binfmt 자동 셋업, OOM 호스트의 swap 자동화

## 다음 단계 권장

1. **즉시(이번 주)**:
   - 워커 e2e 헬스 모니터링 추가 (14h 사고 재발 방지)
   - DB 비밀번호 로테이션
   - 코어 보안 must-fix (C-1, H-1, H-2, H-5, H-6)
2. **단기(2주)**:
   - 서버 드래프트 복원
   - 개별 학생 마감 연장
   - frozen leaderboard auto-unfreeze
   - playground/compiler quota
   - CSV 로스터 임포트
3. **중기(1달)**:
   - DLQ + 인앱 알림
   - CSP nonce
   - 후보자 계정 라이프사이클
   - subtask / special judge

## 검증 인프라

- 단위/컴포넌트 테스트 강함 (2,650+ pass)
- e2e 38개 spec — 일부 cover, 핵심 흐름 다수 커버
- post-deploy 스모크: `PLAYWRIGHT_PROFILE=smoke`이 존재 (8개 remote-safe)
- **부재**: 오늘 fix한 페이지·라우트의 회귀 e2e (이번 Option B 작업으로 보강 예정)

## 마지막 한마디

어제 리뷰가 "구조적으로 견고하나 운영면에 갭"이라 평했고, 오늘 작업은 정확히 운영면을 메우는 방향. IDOR 두 건, 운영 사고 한 건, 빌드 인프라 정상화가 fix됐어요. 그러나 **채용 운영 본격 시작 전 코어 보안 must-fix(C-1, C-2, H-1, H-2)는 무조건 해결**해야 합니다 — 오늘 fix들은 표면을 좁혔을 뿐 핵심 취약점은 그대로.
