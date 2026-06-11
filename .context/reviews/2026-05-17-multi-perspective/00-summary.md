# 종합 요약 — 다관점 리뷰

리뷰 시점: 2026-05-17
대상 사용처(동시): 채용 코딩 평가 · 학생 과제/시험 · 프로그래밍 대회

## 사용처별 출시 가능 여부 (Go/No-Go)

| 사용처 | 출시 가능? | 주된 차단 사유 |
|---|---|---|
| 학생 과제 | 조건부 | 서버 드래프트 복원, 개별 마감 연장 없음 |
| 학생 정기 시험 | **위험** | 서버 드래프트 복원 부재 → 작업 분실 사고 가능 |
| 프로그래밍 대회 | **위험** | 동결 리더보드가 자동 해제 안 됨, subtask·special judge 미지원 |
| 채용 평가 | **위험** | 잔존 후보자 계정, 데이터 export 부재(GDPR/PIPA), 시스템 체크 페이지 없음 |
| 다중 인스턴스 HA | **불가** | realtime coordination 구현 부재(`APP_INSTANCE_COUNT=1` 강제) |

각 영역의 상세는 동일 디렉터리의 다른 문서들 참고:
- `01-student.md` — 학생 관점
- `02-instructor.md` — 강사 관점
- `03-assistant.md` — 조교 관점
- `04-admin.md` — 관리자 관점
- `05-candidate.md` — 채용 응시자 관점
- `06-security.md` — 보안 리뷰

## 최우선 처리 10선 (모든 관점 통합)

| 순위 | 이슈 | 출처 | 심각도 | 작업량 |
|---|---|---|---|---|
| 1 | **`resetPassword`에서 `tokenInvalidatedAt` 세팅** — 비밀번호 reset 후에도 탈취된 JWT 유효 | 06-security C-1 | Critical | 1줄 |
| 2 | **채용 후보자 계정 마감 후 잠금** — 잔존 계정 + 약한 비밀번호 brute force | 06-security C-2, 05-candidate | Critical | 1일 |
| 3 | **서버 측 코드 드래프트 복원** — 시험 중 작업 분실 사고 방지 | 01-student, 05-candidate | High | 0.5일 |
| 4 | **단일 인스턴스 제약 해제 또는 명시 문서화** — HA/무중단 deploy 불가 | 04-admin | High | 며칠 (PG LISTEN/NOTIFY) ~ 즉시 (문서화) |
| 5 | **워커 DLQ 가시화** — 채점 작업 silent loss | 04-admin | High | 1~2일 |
| 6 | **개별 학생 마감 연장 테이블** — 학사 운영 시 거의 필수 | 02-instructor | High | 1일 |
| 7 | **frozen leaderboard 자동 해제 (`freezeUntil`)** — 한 번 동결되면 영원히 | 02-instructor | High | 0.5일 |
| 8 | **playground/compiler에 이메일 인증 + 일일 quota** — Docker 남용 차단 | 06-security H-1, H-2 | High | 1일 |
| 9 | **CSP middleware nonce화** — `'unsafe-inline'` 제거 → 미래 XSS regression 차단 | 06-security H-3 | High | 1~2일 |
| 10 | **CSV 로스터 임포트** — 학기마다 손작업 제거 | 02-instructor | High | 0.5일 |

## 이번 세션에서 실제로 적용한 변경

배포는 보류 상태(사용자 지시). 아래는 **소스 코드에 반영된 변경**이며 다음 deploy 시 한꺼번에 올라갑니다.

### 기능
1. **대회 참가자 목록** — 초대 화면 상단에 현재 참가자 카드 (`participants` API + UI). `초대` vs `그룹 소속` 뱃지로 진입 경로 구분.
2. **대회 일반 제출 → 자동 라우팅** — 문제가 1개 활성 과제에 속하면 `assignmentContextRequired` 대신 자동으로 그 과제로 라우팅. 2개 이상이면 기존 409 유지(UI에서 선택해야).
3. **비공개 대회 URL 폴백** — 권한 없는 로그인 사용자가 비공개 대회 링크 접속 시 404 대신 인라인 접속 코드 입력 폼.

### 버그 수정
4. **로케일 토글 무시되는 문제** — 비로그인 사용자가 SEO-deterministic 공개 페이지에서 명시적 쿠키를 무시당하던 버그. 이제 쿠키 → deterministic → Accept-Language 순으로 존중.
5. **본인 그룹 아닌 대회까지 보이는 문제** — `getContestsForUser`와 `getUserContestAccess`에서 `submissions.view_all`을 가시 권한에서 제외 (그건 cross-group 채점 권한일 뿐). admin만 전 대회 가시.
6. **리더보드 이름 셀 muted 처리** — `totalScore === 0`인 비참가자/관리자 행에서 이름도 다른 셀과 함께 muted.
7. **Drizzle relational query bug 3곳 패치** — `problems/page.tsx`의 `tagFilter`와 `buildAccessFilter` 둘 다 mapColumnsInSQLToAlias 우회 (사전 ID 해결 + `inArray`).

### 운영 (production 직접 작업)
8. **docker-socket-proxy 환경변수 복구** — `POST=1, DELETE=1, ALLOW_START=1, ALLOW_STOP=1` 추가. 14시간 동안 모든 제출이 컨테이너를 못 띄워 `compile_error`로 잘못 채점되던 사고 복구. 로컬 repo 동일 수정 반영.

### 텍스트
9. **한국어 i18n 자연화** — 720+ 문자열 합쇼체→해요체, 번역체 제거.
10. **"사용자명" → "아이디"** 일괄 변경 + 조사 정합화.
11. **채팅 위젯 disclaimer 제거**.

## 운영 중 관찰한 사고 (이번 세션)

- **14시간 silent 채점 실패**: docker-socket-proxy 설정 변경(4/17~4/18 커밋)으로 워커가 컨테이너를 못 띄움 → 모든 제출이 `compile_error`. 워커 healthcheck가 자기 HTTP 엔드포인트만 봐서 `Up (healthy)`로 표시되어 운영자도 놓침.
  - **즉시 fix 됨** (위 #8).
  - **재발 방지 권장**: 워커 healthcheck에 end-to-end smoke test(실제 docker run sanity) 포함하거나, 별도 "judge end-to-end" 헬스 메트릭 + 알림.

- **시크릿 노출**: 진단 중 `docker exec judgekit-db env` 출력이 conversation log에 포함되며 `POSTGRES_PASSWORD` 노출. **DB 비밀번호 rotate 권장**.

## 알려진 미해결 / 결정 보류

- 대회 리더보드 staff(role 기반) 필터: 현재는 `totalScore===0` 휴리스틱으로 muted 처리. 사용자가 role 기반 처리를 원하면 LeaderboardEntry에 role 추가 작업 필요.
- 모바일 에디터: 사용자 결정 대기 (지원 안 함 + 안내, vs 모바일 전용 레이아웃).
- subtask/special judge/interactive: 핵심 구조 변경 필요 — 별도 plan 문서화 필요.
- 다중 인스턴스 coordination: 명시 문서화 또는 구현 결정 필요.

## 추천 다음 스텝

1. **이번 세션 변경사항 commit & 다음 deploy** — 14시간 사고 재발 방지 위해 빠를수록 좋음.
2. **보안 must-fix Top 5** (위 1, 2, 8, 9, 그리고 H-5 IP 스푸핑 fix) — 채용 평가 운영 전 반드시.
3. **시험·대회 데이터 보호** (위 3, 4, 5) — 가용성과 무결성.
4. **학사 운영 보강** (위 6, 10 + LMS 호환 CSV) — 학기 사이클에 맞춰.
5. **대회 운영** (위 7 + subtask + ICPC 동점 처리 문서화).

각 항목 1~2일 작업이라 한 주 안에 Top 5는 처리 가능. 보안 Top 10 전체는 2주 정도 잡으면 됨.

## 마지막 한마디

코드베이스는 **구조적으로 견고**해요 — 캐퍼빌리티 모델, atomic SQL claim, 토큰 해시, custom seccomp, Argon2id, magic-byte 검증 등 보안 인식이 잘 깔려 있어요. 채점 엔진과 contest scoring도 정확한 편.

문제는 **운영면**에 집중돼 있어요 — silent failure (DLQ, healthcheck), 복구 흐름 (드래프트, extension), 운영자 UI (DLQ, 알림, 트리아지). 이 부분만 보강하면 세 가지 사용처(채용·학사·대회) 모두 안정적으로 굴릴 수 있는 베이스에요.
