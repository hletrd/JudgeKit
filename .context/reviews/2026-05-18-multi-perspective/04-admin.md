# 관리자(Admin) 관점 리뷰 — 2026-05-18

## 어제 → 오늘 fix 추적

| 어제 짚은 이슈 | 오늘 상태 |
|---|---|
| docker-socket-proxy 잠금으로 14h silent compile_error | ✅ fix (auraedu + algo worker + worv worker 모두 POST/DELETE/ALLOW_START/STOP 보강, 로컬 compose도 반영) |
| Drizzle relational query 버그 (column problems.tag_id) | ✅ fix (problems/page.tsx tagFilter + buildAccessFilter 둘 다 inArray 패턴) |
| 5개 judge image 빌드 실패 | ✅ fix (Dockerfile 패치 + worv 임시 swap + tonistiigi/binfmt 등록) |
| 모든 호스트에 새 변경 배포 | ✅ 완료 (auraedu, algo, worv 모두 HTTP 200, 워커 online) |

## 어제 그대로 남은 이슈

### 🔴 멀티 인스턴스 배포 불가 (High)
`realtime-coordination.ts:238-279`이 `APP_INSTANCE_COUNT=1` 강제. shared backend "declared but not implemented". HA·무중단 deploy·LB 뒤 N대 운영 모두 불가.

### 🔴 DLQ 가시화 부재 (High)
워커 dead-letter 디렉터리 silent prune. 채점 작업 분실 추적 불가.

### 🟡 멀티 테넌트 격리 부재 (High, 다조직 운영 시)
`tenants`/`organizations` 테이블 없음.

### 🟡 GDPR/PIPA 데이터 export self-service 부재 (Med-High, 채용 운영 시)
삭제는 가능, export 부재.

### 🟡 자동 스케일 신호 부재 (Med)
언어별 큐 깊이 미노출.

### 🟡 시크릿 로테이션 도구 부재 (Med)
- `apiKeys` 만료 임박 경고 없음
- `hcaptchaSecret`, `smtpPass` 로테이션 흐름 없음
- 오늘 진단 중 `POSTGRES_PASSWORD`가 conversation log에 노출됨 (rotate 권장 — 어제 권고에서 진행 여부 미확인)

### 🟡 인앱 알림 부재 (Med)
`/api/metrics`만 있고 인앱 alert 없음. 외부 Alertmanager 의존.

### 🟡 데이터 보존 정책 UI 부재 (Low-Med)
환경변수 only.

### 🟡 워커 force-remove 후 active_tasks 카운터 드리프트 가능 (Low)

### 🟡 이미지 빌드 위치 강제 안 됨 (Med)
admin UI에서 빌드 누르면 잘못된 서버에서도 가능.

## 오늘 새로 발견된 운영 이슈

### 🔴 워커 헬스체크가 실제 채점 가능 여부 미반영 (High, 14h 사고 직접 원인)
- 워커 컨테이너 health check가 자기 HTTP `/health`만 봄
- 실제 `docker run` 가능 여부, 큐 처리 여부 미검증
- proxy ACL 잠겨도 컨테이너는 "Up (healthy)"로 표시
- **수정**: judge worker health check에 "synthetic docker run hello-world" 포함. 또는 별도 "judge-end-to-end-health" 메트릭 + alert.

### 🔴 호스트별 운영 설정 drift (High, fleet-wide 사고 가능성)
- 오늘 fleet 전체에서 docker-proxy 설정이 같은 식으로 잠겨 있었음 (auraedu app, algo worker, worv worker)
- 단일 commit으로 fleet 전체가 동일 사고에 노출됨
- 워커 compose의 ALLOW_START/STOP env 변수 추가 시 worv에 적용 안 됨 (compose 파일이 호스트마다 다르게 진화)
- **수정**: deploy 스크립트가 compose env 일관성 검증. 또는 fleet config GitOps화.

### 🟡 ARM64 호스트의 binfmt 등록 운영 의존성 (Med)
- moonbit이 amd64-only 툴체인 → ARM64에서 qemu binfmt 필요
- 기본 apt 패키지(`binfmt-support`)는 docker container path와 안 맞음
- `tonistiigi/binfmt --install amd64`로 재등록 필요
- **수정**: 워커 셋업 스크립트에 binfmt 등록 단계 포함 + 재부팅 시 자동 재등록. systemd unit 권장.

### 🟡 OOM-suspect 빌드의 swap 필요 (Med)
- worv (3.7GB RAM)에서 idris2 chezscheme bootstrap이 OOM
- 빌드 중에만 임시 swap 추가하면 됨
- **수정**: deploy/build 스크립트가 RAM < 4GB 호스트에서 자동으로 swap 추가/제거. 또는 prebuilt idris2 바이너리 사용.

### 🟡 운영 시 conversation log 노출되는 시크릿 (Med, 어제 권고 후속)
- `docker exec judgekit-db env`로 password 노출되는 진단 흐름이 흔함
- agent 기반 자동화로 시크릿 노출 위험 증가
- **수정**: ops runbook에서 env 확인 시 `grep -v PASSWORD` 사용 권장 명시. 또는 secret 컬럼만 마스킹하는 wrapper.

### 🟢 디스크 사용량 모니터링 부재 (Low)
- algo는 64G/96G 사용 (67%), 빌드 시 더 늘어남
- 임계치 알림 없음

## Show-stopper 후보

- **워커 e2e 헬스** — 14h 사고 재발 방지를 위해 무조건. 운영자가 모르는 사이 채점 죽는 게 가장 큰 위험.
- **realtime coordination** — HA가 필요하면. 단일 인스턴스 운영이면 보류 가능.

## 추천 작업 순서

1. 워커 end-to-end 헬스 + verdict 분포 알림
2. DLQ 가시화 (admin UI)
3. fleet 설정 drift 방지 (deploy 검증 또는 GitOps)
4. binfmt 자동 셋업 스크립트 (ARM64 워커용)
5. realtime coordination 구현 또는 단일 인스턴스 제약 문서화
6. 사용자 self-service 데이터 export
7. 시크릿 로테이션
