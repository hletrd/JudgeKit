# 관리자(Admin) 관점 리뷰 — 플랫폼 운영자 입장

리뷰 시점: 2026-05-17
대상 사용처: 단일 조직 운영, 다년간 학사 운영, 채용 평가 운영, 대회 운영

## 잘 돌아가는 부분

- 백업/복원 라우트(`src/app/api/v1/admin/restore/route.ts:137-147`)가 복원 전 자동 스냅샷을 남김.
- 감사 로그 1급 시민(`audit_events` 테이블, `:118-146`).
- 워커 등록·heartbeat 흐름(`src/app/api/v1/judge/{register,heartbeat,claim,poll,deregister}/route.ts`).
- Rate limit 노브를 `system_settings`로 노출(`src/lib/db/schema.pg.ts:547-577`).
- `/api/metrics`에 Prometheus 호환 메트릭(cron secret으로 게이팅).
- 언어별 시간 제한 멀티플라이어(`:520-525`).
- 민감 컬럼 AES-256-GCM 암호화(`enc:` 버전 prefix), 비밀번호 Argon2id.

## 미흡하거나 빠진 기능

### 🔴 멀티 인스턴스 배포 불가 (High)
`src/lib/realtime/realtime-coordination.ts:238-279`가 `APP_INSTANCE_COUNT=1`이거나 `REALTIME_SINGLE_INSTANCE_ACK=1`이 아니면 시작 단계에서 거부. shared coordination backend는 "declared but not implemented" (`:252`).
- **영향**: HA 구성 / 무중단 deploy / 단순 로드밸런서 뒤 N대 운영 모두 불가.
- **수정**: PG `LISTEN/NOTIFY` 기반 coordination 구현 → SSE 채널을 인스턴스 간에 공유. 또는 Redis 채택.

### 🔴 DLQ 보임 불가 — 채점 작업 조용히 분실 (High)
워커가 실패한 작업을 자기 파일시스템(`judge-worker-rs/src/executor.rs:123`)의 dead-letter 디렉터리에 던지고, `prune_dead_letter_dir(max_files)`로 조용히 삭제해요. 관리자 UI에서 DLQ를 보거나 reprocess하는 경로가 없음.
- **영향**: 학생 제출이 사일런트하게 사라질 수 있음. 채점 누락 의심 시 디버깅 불가능.
- **수정**: DLQ 항목을 앱 서버로 다시 보고하는 내부 endpoint → DB에 메타데이터 → `/dashboard/admin/workers/dlq` 페이지.

### 🟡 멀티 테넌트 격리 부재 (High, 사용처 따라)
`tenants`/`organizations` 테이블 없음. 모든 사용자가 한 user 테이블 공유.
- **영향**: 같은 배포에서 두 별개 클래스를 데이터 분리해 운영 불가. 한 조직 운영에만 적합.
- **수정**: `organization_id`를 `users/groups/assignments/problems`에 도입, row-level scoping.

### 🟡 GDPR/PIPA 데이터 내보내기 self-service 부재 (Med-High, 채용 운영 시 법적 리스크)
- 삭제는 `users/[id]` DELETE에서 가능 (`src/app/api/v1/users/[id]/route.ts:443`, 그룹 소유 시 차단).
- 그러나 **사용자 본인의 데이터 export** 엔드포인트가 없음. GDPR Art. 15·20, PIPA 접근권 위반.
- **수정**: `GET /api/v1/users/me/export` (제출, 코드 스냅샷, 본인 actor 감사 이벤트 포함 zip/json bundle).

### 🟡 자동 스케일 신호 부재 (Med)
워커 register/heartbeat은 있지만 "언어별 큐 깊이" 메트릭 미노출. 운영자가 외부 도구로 따로 instrument해야 함.
- **수정**: `/api/metrics`에 `judge_queue_depth{language="..."}` 추가.

### 🟡 시크릿 로테이션 도구 부재 (Med)
- `apiKeys`는 발급/폐기만 가능, 만료 임박 경고나 자동 로테이션 없음.
- `hcaptchaSecret`, `smtpPass` 등 암호화 저장은 되지만 로테이션 흐름 없음.
- **수정**: 만료일 + 임박 알림 + "회전 가능" 표시.

### 🟡 인앱 알림 부재 (Med)
`/api/metrics`는 노출되지만 "모든 워커 오프라인", "큐 막힘", "DB latency p99 > 1s" 같은 인앱 알림이 없음. 외부 Alertmanager 의존.
- **수정**: 시스템 상태 헬스 룰을 system_settings에 + 임계 초과 시 Web push/이메일.

### 🟡 데이터 보존 정책 UI 부재 (Low-Med)
보존 기간이 환경변수(`SUBMISSION_RETENTION_DAYS`)로 설정. `system_settings`에 노출 안 됨. ops 권한 없이 변경 불가.

### 🟡 워커 force-remove 후 active_tasks 카운터 드리프트 가능 (Low)
`judge_workers.activeTasks`는 카운터 + CHECK constraint `>= 0`. 그러나 워커 강제 제거나 비정상 종료 시 카운터가 실제와 안 맞을 수 있음.
- **수정**: "reconcile activeTasks" 운영 도구.

### 🟡 이미지 빌드 위치 강제 안 됨 (Med)
CLAUDE.md는 "이미지 빌드는 워커 서버에서만"이라고 명시. 그러나 admin UI가 앱 서버에서 빌드 버튼을 그대로 노출(`src/app/api/v1/admin/docker/images/build/route.ts`). 운영자가 잘못된 서버에서 누르면 broken state.
- **수정**: `WORKER_BUILD_ALLOWED` 같은 deploy-config 플래그 + 빌드 차단 시 명확한 메시지.

### 🟡 글로벌 rate limit 키 (Med)
`rate_limits` 키가 단일 text 컬럼이라 라우트 단위 글로벌 카운터(`judgeQueueFull` 같은 곳)에서는 노이지한 유저가 다른 유저에게 영향. tenant 분리 없음.

## 운영 중 실제로 터진 사례 (이번 세션 관찰)

- **5/16 13:10 ~ 5/17 02:50** (약 14시간): docker-socket-proxy 설정 오류로 워커가 모든 제출을 `compile_error`로 잘못 기록. 워커 컨테이너 healthcheck는 자기 HTTP 엔드포인트만 보기 때문에 `Up (healthy)`로 표시됐고, 운영자도 채점 정상 작동 중이라 오해.
- **수정**: 워커 healthcheck에 실제 docker run sanity 체크 포함. 또는 별도 "judge end-to-end" 헬스 메트릭.

## 사용처별 영향

| 사용처 | 영향 |
|---|---|
| 단일 조직 학사 운영 | 보통 — 멀티 인스턴스만 못 하지 그 외 동작 |
| 채용 평가 운영 | **위험** — GDPR/PIPA 데이터 export 흐름 빠짐 |
| 대회 운영 | 보통 — 분실 위험(DLQ 보임 부재)이 가장 큰 변수 |

## 추천 작업 순서

1. **워커 e2e 헬스 + DLQ 가시화** — 14시간 채점 사고 같은 게 다시 안 일어나도록.
2. **realtime coordination 구현 또는 단일 인스턴스 제약 문서화** — 운영자가 헛수고 안 하게.
3. **사용자 self-service 데이터 export** — 채용 운영 시 컴플라이언스 필수.
4. **시크릿 로테이션 + 인앱 알림**.
5. **멀티 테넌트** — 두 조직 이상 호스팅할 계획이면.

## 시크릿 노출 사고 (이번 세션)

진단 과정에서 `docker exec judgekit-db env` 출력에 `POSTGRES_PASSWORD`(`a3fe936d...`)가 conversation log에 노출됐어요. 운영자 권한 외 영역으로 저장될 수 있으니 **DB 비밀번호 로테이션 권장**합니다. 추가로 `.env.production`의 모든 시크릿 점검 권장.
