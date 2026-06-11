# 관리자(Admin) 관점 리뷰 — 2026-05-21

리뷰 시점: 2026-05-21
대상 사용처: oj.auraedu.me (단일 호스트 ARM64), algo.xylolabs.com (app + 별도 worker-0 x86_64), test.worv.ai (app + ARM64 worker)
직전 14시간 silent compile_error 사고 직후 운영자 시각 정리.

## 어제 → 오늘 진척 추적

| 어제(5/18) 짚은 이슈 | 오늘 상태 |
|---|---|
| 워커 헬스체크가 실제 채점 가능 여부 미반영 (14h 사고 직접 원인) | ❌ 그대로. `judge-worker-rs/src/runner.rs:376` `async fn health() -> StatusCode { StatusCode::OK }` 그대로예요. 어제 사고 root-cause를 알아냈는데도 healthcheck는 아직 자기 자신만 봐요. |
| 호스트별 운영 설정 drift (fleet-wide 사고 가능성) | 🟡 부분 진전. `docker-compose.production.yml`은 fleet 전체에 동일하게 POST=1/DELETE=1/ALLOW_START=1/ALLOW_STOP=1로 박았는데, `docker-compose.worker.yml:29-31`은 여전히 POST=0/DELETE=0이에요. worker-0(algo)·worv worker가 어떤 compose 파일을 쓰는지에 따라 또 잠길 수 있어요. fleet GitOps 없음. |
| ARM64 binfmt 등록 운영 의존성 | ❌ scripts 추가 안 됨. setup.sh에 binfmt 등록 단계 없음. 재부팅 시 또 끊겨요. |
| 멀티 인스턴스 배포 불가 | ❌ `realtime-coordination.ts:238-279` 그대로. `scripts/check-high-stakes-runtime.sh:22-27`이 `REALTIME_COORDINATION_BACKEND=postgresql`를 요구하는데 백엔드 구현체는 아직 declared-but-not-implemented예요. |
| DLQ 가시화 부재 | ❌ admin UI 그대로 없음. `src/app/(dashboard)/dashboard/admin/workers`에 page.tsx + workers-client.tsx뿐. dead-letter 디렉터리는 `prune_dead_letter_dir(_, 1000)`로 조용히 삭제(`executor.rs:1002`). |
| 시크릿 로테이션 도구 부재 | ❌ 그대로. 어제 POSTGRES_PASSWORD 노출 사고 후속도 미진. |
| 이미지 빌드 위치 강제 안 됨 | ❌ admin UI에서 잘못된 서버에서 빌드 누를 수 있음. CLAUDE.md만 명시. |
| 디스크 사용량 모니터링 부재 | 🟡 `monitor-health.sh:20-37`이 disk를 보긴 하는데 systemd-cat journal로만 보내요. 외부 알림 없음. |

## 오늘 새로 들어온 변화 (positive)

- `deploy-docker.sh:1108-1135`에 post-deploy smoke(`PLAYWRIGHT_PROFILE=smoke`) 추가. 어제 14h 사고를 다시 잡을 수 있는 첫 방어선이에요.
- 102/102 judge 언어 이미지 fleet 전체 빌드 성공. powershell/simula/odin/apl/moonbit Dockerfile 패치 반영.
- Rust 사이드카(code-similarity, rate-limiter) 둘 다 production에서 AUTH_TOKEN 없으면 startup refuse — `code-similarity-rs/src/main.rs:184`, `rate-limiter-rs/src/main.rs:401`. fail-closed.
- CSP static fallback이 fail-loud로 바뀌어서 잘못 라우팅된 요청이 silent XSS 통로가 되는 대신 깨져요.
- `deploy-docker.sh:599-620` pre-deploy `pg_dump` 항상 수행 + `BACKUP_RETAIN_DAYS=30`. SKIP_PREDEPLOY_BACKUP=1 escape hatch만 있고 기본은 강제. 좋아요.

이 셋 다 14h 사고 직후 첫 cycle의 결과로 보여요. 다만 정작 root cause(워커 e2e health)는 아직 안 닫혔어요.

---

# 1. Top 5 ops gaps — 시험 중에 다시 터질 수 있는 것

운영자가 시험·대회 중에 진짜로 마주칠 실패 모드부터.

## 🔴 #1 워커 e2e health가 여전히 없어요 (어제도 #1, 오늘도 #1)

- `judge-worker-rs/src/runner.rs:376` health 핸들러는 단순히 `StatusCode::OK` 반환. docker 권한도 안 보고 큐 처리 가능 여부도 안 봐요.
- `docker-compose.production.yml:143-148` healthcheck도 그 핸들러를 `wget`으로 두드릴 뿐이라 14h 사고 그대로 재현 가능해요.
- root cause를 어제 알아냈는데도 fix가 안 들어간 게 가장 충격적이에요. 시험 도중에 같은 일이 나면 또 모릅니다.
- **구체적 수정**: `runner.rs:376` health 핸들러에서
  1. `DOCKER_HOST`로 `GET /containers/json?limit=1` 호출해서 200 받는지 확인 (docker-proxy ACL이 또 잠겼는지 감지)
  2. 최근 N분 동안 claim된 submission이 있는지(`compile_error` 비율 포함)를 app서버에서 별도 메트릭 `judgekit_judge_recent_compile_error_ratio`로 노출 — 5분 윈도우 ratio > 0.9면 critical
  3. /api/v1/judge/heartbeat에 worker가 "마지막 docker_run_ok 시각"을 같이 보고. app서버는 그게 5분 넘어가면 worker status를 `stale`로 강등.
- 별 비용 안 들어요. 14h × 3호스트 = 42 host-hour 의 silent fail을 막아요.
- **post-deploy smoke**가 부분적으로 안전망 역할은 하는데 *deploy 시점*에만 돌아요. 한참 잘 돌다가 docker daemon 재시작·proxy 정책 변경·iptables flush 같은 걸로 사고 나면 smoke가 못 잡아요.

## 🔴 #2 worker-0(algo) / worv worker compose 분기 = 또 같은 fleet 사고

- `docker-compose.worker.yml:23-31`에서 dedicated worker compose는 여전히 `POST=0`, `DELETE=0`, `BUILD=0`을 하드코딩. 본문 comment(`:25-28`)도 "BUILD / POST / DELETE are hardcoded off here"라고 자랑스럽게 적혀 있어요. 어제 사고가 정확히 이 설정에서 났는데도요.
- algo의 worker-0과 worv의 dedicated worker가 이 compose를 쓰면 submission 전부 `compile_error`로 나가요.
- 운영자가 사고 당시 손으로 풀어둔 호스트 vs. 안 푼 호스트가 다음 deploy 때 rsync로 되돌아갈 위험이 있어요. `deploy-docker.sh:455-476` rsync `--delete`라 호스트별 로컬 수정은 다 날아가요.
- **구체적 수정**:
  1. `docker-compose.worker.yml:29-31`를 `${WORKER_DOCKER_PROXY_POST:-1}` / `${WORKER_DOCKER_PROXY_DELETE:-1}` / `${WORKER_DOCKER_PROXY_ALLOW_START:-1}` / `${WORKER_DOCKER_PROXY_ALLOW_STOP:-1}`로 노출 + 기본값을 1로. BUILD는 0 유지가 맞아요.
  2. deploy-docker.sh가 worker compose를 deploy할 때 `docker exec judgekit-worker-docker-proxy env | grep -E '^(POST|DELETE|ALLOW)='` 확인 후 1이 아니면 abort.
  3. compose에 `# CHANGED 2026-05-17 — was 0, locked all judging` 같은 root-cause 코멘트를 박아서 미래의 누군가가 "보안상 더 안전해 보인다"는 이유로 다시 0으로 돌리지 않도록.

## 🔴 #3 docker daemon log·container log rotation 없음 → 디스크 풀

- `docker-compose.production.yml` 어디에도 `logging:` 블록이 없어요. docker 기본 json-file driver는 무제한 누적이에요. systemd journal에 의존하면 fleet마다 분량이 달라요.
- algo는 어제 시점 64GB/96GB(67%). 추가 빌드 사이클 돌면 디스크 풀 위험. judgekit-app·judgekit-judge-worker는 verbose RUST_LOG=info까지 켜져 있어요(`docker-compose.production.yml:163`, `:182`).
- 디스크 풀 = postgres pgdata 쓰기 실패 = DB read-only로 떨어짐 = 모든 제출 fail. 시험 중에 터지면 최악.
- **구체적 수정**:
  ```yaml
  services:
    app:
      logging:
        driver: json-file
        options:
          max-size: "50m"
          max-file: "5"
  ```
  모든 서비스에 동일하게. `judge-worker`, `code-similarity`, `rate-limiter`, `docker-proxy`, `db`까지. 단순한 한 줄짜리 patch지만 안 들어가 있어요.
- judge 언어 이미지 정리는 `deploy-docker.sh:580-582`에서 `docker image prune -f` 1회만. dangling만 정리하고 :latest로 떠 있는 미사용 언어 이미지는 그대로 누적돼요. 102개 언어 × ~300MB = 30GB+. 모든 호스트가 평등하게 30GB 굳혀두는 중.

## 🔴 #4 백업은 있는데 복원 드릴이 없어요

- `deploy-docker.sh:599-620`이 매 deploy마다 `pg_dump --format=custom`을 `/home/$USER/backups/`로 떨궈요. 좋아요.
- `scripts/online-judge-backup.timer`가 03:15에 매일 한 번 더 떠요. 좋아요.
- 그런데 **복원 드릴이 없어요**. `scripts/verify-db-backup.sh:13-27`은 gzip이 valid한지·SQL 텍스트 100줄 들었는지만 보고 끝. 실제 `pg_restore` 안 돌려봐요. 시험 직전에 DB 날아가면 복원이 *처음* 돌리는 거예요.
- **구체적 수정**:
  1. `verify-db-backup.sh`에 `docker run --rm postgres:18-alpine pg_restore --list <dump>` 추가. TOC가 깨졌는지 확인.
  2. monthly drill 스크립트: 임시 `postgres:18-alpine` 컨테이너에 restore → `SELECT count(*) FROM users` 같은 sanity → 컨테이너 폐기. systemd timer로 매월 1일 03:30 실행. 결과를 `/api/metrics`에 `judgekit_last_backup_restore_drill_age_seconds`로 노출.
  3. 백업 파일을 다른 호스트로 cross-copy. 지금 backup이 같은 디스크에 있어요. 디스크 실패 시 백업도 같이 잃어요. `rclone copy` to S3-compatible (또는 nas-ops의 NAS) 한 줄 추가.

## 🔴 #5 알림 채널이 사실상 없어요 — systemd journal만 봐요

- `scripts/notify-failure@.service:6-8`이 systemd-cat으로만 찍어요. email 코드는 주석.
- `scripts/monitor-health.sh:16` 모든 alert가 `systemd-cat -t judgekit-monitor`. 호스트에 SSH로 들어가서 `journalctl -t judgekit-monitor`를 봐야 알 수 있어요.
- `/api/metrics`는 있지만 Prometheus가 어디서 스크랩하는지 fleet 차원에서 약속이 없어요. CRON_SECRET이 환경마다 다른지 같은지도 안 보여요.
- 시험 중에 worker offline됐을 때 운영자에게 *바로* 닿는 채널이 없어요. SMTP 통합도 `src/lib/email`에서 사용자 알림용으로만 쓰여요.
- **구체적 수정**:
  1. `monitor-health.sh`에 `ALERT_WEBHOOK_URL` env 추가. critical level이면 `curl -X POST` Slack/Discord webhook으로 push.
  2. `/api/metrics`의 status가 503이 N분 지속되면 server-side에서 같은 webhook으로 push (지금은 client polling만 가능).
  3. `notify-failure@.service`에 webhook ExecStart 활성화 (주석 풀고 ALERT_WEBHOOK_URL 사용).

이 다섯 개는 다 비용 적은데 운영 임팩트 큰 항목이에요. 시험·대회 중에 #1·#2가 같이 터지면 어제 14h 사고가 그대로 재현돼요.

---

# 2. 백업·DR 평가

## 현재 상태

| 항목 | 현재 | 부족한 점 |
|---|---|---|
| pg_dump 정기 백업 | ✅ `online-judge-backup.timer` 03:15 매일, custom format + gzip | retention 30일, 단일 호스트 디스크 |
| pre-deploy 스냅샷 | ✅ `deploy-docker.sh:599-620` 매 deploy. SKIP_PREDEPLOY_BACKUP=1 옵트아웃만 가능 | retention `BACKUP_RETAIN_DAYS=30` |
| 백업 verification | 🟡 gzip valid + SQL 텍스트 들었는지 | 실제 pg_restore 한 번도 안 돌려봄 |
| off-host 복제 | ❌ 없음 | 호스트 디스크 실패 = 모든 백업 손실 |
| restore 드릴 | ❌ 없음 | 사고 시 RTO 불명 |
| PIT 복구 (WAL archive) | ❌ 없음 | 마지막 03:15 백업 이후 데이터 전부 손실 가능 |
| Backup 암호화 | 🟡 `BACKUP_PATH.age` 옵션 있지만 AGE_RECIPIENT가 fleet 기본값 아님 (`backup-db.sh:90-95`) | 운영자가 명시적으로 켜야 됨 |
| app-data volume 백업 | ❌ `judgekit-app-data` named volume은 백업 안 됨 (`docker-compose.production.yml:98`) | 무엇이 들었는지 따라 손실 위험 |
| dead-letter volume 백업 | ❌ `judgekit-dead-letter` 백업 안 됨 + DLQ admin UI도 없음 | DLQ 항목 silent prune |

## 평가

- 백업 *생성* 흐름은 합격이에요. 매일 + deploy마다 = 사실상 2 빈도.
- **복구 가능성은 검증 안 됐어요**. `verify-db-backup.sh`가 gzip 무결성만 보는 건 1차 방어선이지 복구 보장이 아니에요. pg_dump custom format은 TOC 깨지면 gzip은 valid해도 restore 못 해요.
- **3-2-1 룰 위배**: 한 호스트에 백업 하나만. 외부 복제 없음. 다른 미디어 없음.
- **시간 분해능 부족**: 03:15 daily면 worst case 24h 데이터 손실. 시험 끝나고 발견되면 학생들 제출 다 날아가요.
- **DLQ는 백업·복구 대상에서 빠져 있어요**. `executor.rs:1002`의 1000-item prune은 백업이 아니라 *삭제*예요. 어떤 채점이 dead-letter로 갔는지 영구 기록 없음.

## 구체적 DR 플랜 제안

1. **pg_dump cross-copy** — `backup-db.sh` 마지막에 `rclone copy "$BACKUP_PATH" remote:judgekit-fleet-backups/$(hostname)/` 추가. nas-ops NAS나 backblaze b2 같은 외부 저장소로. fleet 3호스트 × 30일 × ~50MB ≈ 4.5GB, 무료 tier로 충분.
2. **PIT 복구를 원한다면 WAL archiving** — `docker-compose.production.yml`에서 postgres에 `archive_mode=on archive_command='cp %p /var/lib/postgresql/wal-archive/%f'` 추가 + 별도 볼륨. 단, 운영 부담이 늘어요. 시험 운영 최대 1시간 손실 허용이면 ok, 분 단위라면 검토.
3. **월간 restore drill** — systemd timer로 매월 1일:
   ```bash
   docker run --rm --name dr-drill \
     -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill -e POSTGRES_USER=drill \
     -d postgres:18-alpine
   sleep 10
   docker exec -i dr-drill pg_restore -U drill -d drill < latest_backup.sql.gz
   docker exec dr-drill psql -U drill -d drill -c "SELECT count(*) FROM users" > drill-result.log
   docker rm -f dr-drill
   ```
   결과를 `/api/metrics`에 `judgekit_dr_drill_passed{ts="..."} 1` 로 노출.
4. **백업 모니터링** — `getAdminHealthSnapshot()`에 last successful backup age 추가. 25h 넘으면 degraded. `src/lib/ops/admin-health.ts:64-96`에 한 줄.
5. **DLQ persistence** — `executor.rs:1002` 직전에 dead-letter entry를 app server `POST /api/v1/judge/dead-letter`로 보고 + DB에 메타데이터 저장. silent prune 대신 admin이 reprocess 누를 수 있게.

---

# 3. 알림 매트릭스 — signal → channel → human

오늘 시점 운영자가 *알 수 있는* 신호와 *알 수 없는* 신호 분리.

## 현재 작동 중인 알림 흐름

| 신호 | 채널 | 인간에게 도달 방법 |
|---|---|---|
| `/api/metrics` 503 (DB down 등) | Prometheus scrape | 외부 Prometheus + Alertmanager 있어야 함. 현재 fleet에 설정됐는지 불명. |
| `monitor-health.sh` critical | systemd journal | SSH로 `journalctl -t judgekit-monitor`. 사람이 봐야 알아요. |
| deploy 실패 | stderr/exit code | deploy 돌리는 사람만. CI 통합 없음. |
| post-deploy smoke 실패 | `/tmp/judgekit-smoke-${DOMAIN}.log` + stderr (`deploy-docker.sh:1124-1128`) | 마찬가지로 deploy 돌리는 사람만. |
| pre-deploy backup 실패 | `die` (`deploy-docker.sh:613-616`) | deploy aborts. 인간이 봐요. ✅ |
| Postgres ANALYZE 실패 | `|| true` (`deploy-docker.sh:852`) | **인간에게 안 가요**. silent swallow. |
| `audit_events` failed writes | `judgekit_audit_failed_writes` gauge | Prometheus scrape 있어야 함. 인앱 alert 없음. |
| worker offline 누적 | 없음 | 사람이 admin UI에서 봐야 알아요. |
| login_events 실패 폭발 | 없음 | 무차별 brute-force 와중에도 알 길 없음. |
| rate-limit 차단 폭발 | 없음 | rate-limiter-rs는 자기 metrics를 안 노출함. |
| docker daemon restart | systemd | 사람이 SSH 들어가야 알아요. |
| disk > 85% | `monitor-health.sh` journal | 외부 알림 없음. |
| pgdata 볼륨 mismatch | `pg-volume-safety-check.sh` | deploy 시에만 봐요. 평소엔 안 봐요. |

## 부족한 알림 (있어야 하는 것)

| 신호 | 추천 채널 |
|---|---|
| verdict 분포 이상 (compile_error 비율 > 50%, 5min 윈도우) | webhook (Slack/Discord) — 어제 14h 사고는 100% compile_error였음 |
| worker active_tasks 카운터 드리프트 (`judge_workers.activeTasks`가 실제 docker ps와 불일치) | webhook |
| post-deploy smoke FAIL | webhook (지금은 stderr만) |
| db backup age > 25h | webhook + `/api/metrics` |
| login_events failed > N/min (brute force) | webhook |
| rate-limit 차단 비율 급증 | webhook |
| `audit_events` failed_writes > 0 | webhook (지금은 metrics만) |
| docker-proxy ACL 변경 감지 | webhook (어제 사고 root cause) |
| judge worker 컨테이너 재시작 N회 / 5min | webhook |
| nginx error rate (5xx > 1%) | webhook |
| disk > 80% | webhook (지금 journal만) |
| ssl cert expiry < 14d | webhook |

## 매트릭스 표 (제안)

| Severity | Signal | Channel | Human | 응답 시간 목표 |
|---|---|---|---|---|
| P0 | DB down, worker e2e fail, app 503 ratio > 5% | Slack #judgekit-incidents + PagerDuty/SMS | 운영 당직 | 5분 |
| P1 | compile_error ratio > 50%, post-deploy smoke fail, backup age > 25h | Slack #judgekit-incidents | 운영 당직 | 30분 |
| P2 | worker stale, disk > 85%, audit failed writes > 0 | Slack #judgekit-ops | 다음 영업일 | 1일 |
| P3 | ssl < 30d, backup retention 임박, image size 증가 | Slack #judgekit-ops digest | 주간 리뷰 | 1주일 |

지금은 P0~P3 어디에도 자동 채널이 없어요. SSH + journal + 사람 눈썰미가 유일.

---

# 4. 구체적 파일·줄 reference + 제안

## A. `judge-worker-rs/src/runner.rs:376`

```rust
async fn health() -> StatusCode {
    StatusCode::OK
}
```

**문제**: 어제 14h 사고 root cause. docker-proxy ACL 잠겨서 `docker run` 전부 fail해도 이 health는 200.

**제안**:
```rust
async fn health(State(state): State<Arc<RunnerState>>) -> impl IntoResponse {
    let docker_ok = check_docker_capability(&state.docker_client).await;
    let recent_compile_error_ratio = state.metrics.compile_error_ratio_5min();
    if !docker_ok {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({
            "status": "docker_unavailable",
            "reason": "docker-proxy returned 403 — check POST/DELETE/ALLOW_START/STOP"
        })));
    }
    if recent_compile_error_ratio > 0.9 {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({
            "status": "degraded",
            "compile_error_ratio_5min": recent_compile_error_ratio
        })));
    }
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}
```

`check_docker_capability`는 `GET /containers/json?limit=0` 한 번 호출하면 됨. 추가 비용 거의 없어요.

## B. `docker-compose.worker.yml:23-31`

```yaml
- CONTAINERS=1
- IMAGES=${WORKER_DOCKER_PROXY_IMAGES:-0}
- BUILD=0
- POST=0
- DELETE=0
- LOG_LEVEL=warning
```

**문제**: dedicated worker(algo의 worker-0, worv worker)에서 POST/DELETE/ALLOW_START/ALLOW_STOP이 전부 비활성. comment(`:25-28`)도 "hardcoded off"라 자랑하는데, 그 hardcoded off가 정확히 14h 사고의 그 lockup이에요.

**제안**: production 호스트의 worker는 무조건 POST/DELETE/ALLOW_*가 1이어야 한다는 게 어제 사고로 *증명*됐어요. BUILD만 0 유지가 옳고 나머지는 1이 production-correct.

```yaml
- BUILD=0
- POST=${WORKER_DOCKER_PROXY_POST:-1}
- DELETE=${WORKER_DOCKER_PROXY_DELETE:-1}
- ALLOW_START=${WORKER_DOCKER_PROXY_ALLOW_START:-1}
- ALLOW_STOP=${WORKER_DOCKER_PROXY_ALLOW_STOP:-1}
- LOG_LEVEL=warning
```

그리고 deploy-docker.sh / deploy-worker.sh에:
```bash
# Verify the worker docker-proxy is not lockup-prone
ACTUAL_POST=$(remote "docker exec judgekit-worker-docker-proxy printenv POST 2>/dev/null")
if [[ "$ACTUAL_POST" != "1" ]]; then
    die "Worker docker-proxy POST=$ACTUAL_POST (expected 1). This caused the 14h compile_error sweep on 2026-05-16. Aborting."
fi
```

## C. `docker-compose.production.yml` 전반

logging 블록 없음. 모든 service에:
```yaml
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "5"
```

특히 `judge-worker` (verbose 채점 로그)·`app` (Next.js stdout)·`db` (slow query log)는 필수.

## D. `deploy-docker.sh:580-582`

```bash
info "Removing stale worker images from previous builds..."
remote "docker image prune -f" >/dev/null 2>&1 || true
```

**문제**: dangling만 prune. tagged 미사용 언어 이미지는 영원히 누적. 102개 언어 × ~300MB 평균.

**제안**: deploy 끝에 일정 정도 정리:
```bash
# Remove images older than 7 days that are not currently running
remote "docker image prune -a --filter 'until=168h' --filter 'label!=keep' -f" >/dev/null 2>&1 || true
```

또는 specific tagging: judge 언어 이미지에 `--label keep=judge-language`를 박고 `label!=keep`로 prune 제외. 안 그러면 호스트가 매주 diskful로 가요.

## E. `src/lib/ops/admin-health.ts:64-117`

verdict 분포·DLQ size·backup age 메트릭이 없어요.

**제안 추가**:
```typescript
const verdictDist = await rawQueryOne<VerdictRow>(`
  SELECT
    count(*) FILTER (WHERE final_verdict = 'accepted') AS accepted,
    count(*) FILTER (WHERE final_verdict = 'compile_error') AS compile_error,
    count(*) FILTER (WHERE final_verdict = 'wrong_answer') AS wrong_answer,
    count(*) FILTER (WHERE final_verdict = 'runtime_error') AS runtime_error
  FROM submissions
  WHERE created_at > NOW() - INTERVAL '5 minutes'
`);

// 5분 윈도우에서 compile_error > 90% AND total > 10이면 워커 ACL 잠금 의심
const total = Object.values(verdictDist).reduce((a, b) => a + b, 0);
const compileErrorRatio = total > 0 ? verdictDist.compile_error / total : 0;
const judgePathHealthy = !(total > 10 && compileErrorRatio > 0.9);
```

그리고 `admin-metrics.ts`에서 `judgekit_verdict_total{verdict="..."}` counter로 노출. 외부 Prometheus가 alert rule 박을 수 있게.

## F. `scripts/monitor-health.sh:16` + `scripts/notify-failure@.service`

webhook 없음. systemd journal로만 흘러요.

**제안**:
```bash
# scripts/monitor-health.sh 상단에 추가
alert_webhook() {
  local sev="$1" msg="$2"
  [[ -z "${ALERT_WEBHOOK_URL:-}" ]] && return
  curl -fsS -X POST -H 'Content-Type: application/json' \
    --max-time 5 \
    -d "{\"severity\":\"${sev}\",\"host\":\"$(hostname)\",\"message\":\"${msg}\"}" \
    "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
}

# log() 함수 안에서 severity == "CRITICAL"이면 alert_webhook 호출
```

## G. `scripts/verify-db-backup.sh:13-27`

gzip valid + 100줄만 봐요. 실제 restore는 안 함.

**제안**:
```bash
# PostgreSQL backup verification — actual restore test
TEMP_PG_CONTAINER="pg-verify-$(date +%s)"
docker run --rm -d --name "$TEMP_PG_CONTAINER" \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify -e POSTGRES_USER=verify \
  postgres:18-alpine >/dev/null

# wait for healthy
for i in $(seq 1 30); do
  docker exec "$TEMP_PG_CONTAINER" pg_isready -U verify >/dev/null 2>&1 && break
  sleep 1
done

if [[ "$BACKUP_PATH" == *.dump ]]; then
  docker exec -i "$TEMP_PG_CONTAINER" pg_restore -U verify -d verify < "$BACKUP_PATH"
else
  zcat "$BACKUP_PATH" | docker exec -i "$TEMP_PG_CONTAINER" psql -U verify -d verify
fi

ROW_COUNT=$(docker exec "$TEMP_PG_CONTAINER" psql -U verify -d verify -tAc \
  "SELECT count(*) FROM users")
docker stop "$TEMP_PG_CONTAINER" >/dev/null

[[ "$ROW_COUNT" -gt 0 ]] || { echo "ERROR: restore produced 0 users — backup is corrupt" >&2; exit 1; }
echo "Backup restore verified ($ROW_COUNT users restored)"
```

## H. `deploy-docker.sh:1115-1121` post-deploy smoke

```bash
E2E_PASSWORD="${E2E_PASSWORD:-skip-login}"
```

**문제**: E2E_PASSWORD가 없으면 `skip-login`이라는 *문자열*을 admin 패스워드로 시도해요. `tests/e2e/support/constants.ts:25` `requireEnv("E2E_PASSWORD")`는 `skip-login`도 truthy라 그대로 통과. 결과적으로 login spec이 실제 admin 비번 없이 도는데 username/password 둘 다 잘못된 채로 spec 실패. 운영자는 "post-deploy smoke FAILED" 보고 진짜 사고인지 비번 없어서 그런 건지 구분 못 해요. comment(`:1112-1114`)는 "no-login subset"을 받는다고 하지만 실제로는 login도 시도해요.

**제안**:
- E2E_PASSWORD가 `skip-login` placeholder이면 login spec을 `test.skip()`으로 우회. helpers.ts에서 `if (process.env.E2E_PASSWORD === 'skip-login') test.skip('login spec skipped (no real credentials)')` 처리.
- 또는 smoke 프로파일을 둘로 나눠: `smoke-noauth`(login 안 함, 항상 가능)·`smoke-full`(login 필요, E2E_PASSWORD 있을 때만). deploy-docker.sh가 E2E_PASSWORD 유무 보고 골라 호출.
- 어떤 spec이 진짜 실패고 어떤 spec이 자격증명 부재인지가 운영자에게 명확해야 해요.

## I. `docker/Dockerfile.judge-clean:6-8`

`ftp.cs.ru.nl`이 auraedu에서 unreachable. fleet 차원 빌드 fail.

**제안**:
1. clean3.1 tarball을 fleet 내부 mirror에 박아두고 그 URL로. nas-ops에 NAS HTTP serve.
2. 또는 multi-stage로 이미 빌드된 base를 ghcr/내부 registry에 push해두고 deploy 시 pull.
3. `--retry`도 추가: `curl --retry 5 --retry-delay 2 --retry-all-errors`. 일시 네트워크 fail에 강함.
4. 빌드 fail 시 fleet 전체가 깨지지 않도록 deploy-docker.sh에서 individual lang failure를 swallow하고 missing 목록만 warning. 지금 `for lang in $LANGS_TO_BUILD; do remote "..."; done`(`deploy-docker.sh:562-565`)이 한 lang 실패하면 set -e로 전체 abort.

## J. `src/lib/realtime/realtime-coordination.ts:238-279` + `scripts/check-high-stakes-runtime.sh:22-27`

high-stakes 체크가 `REALTIME_COORDINATION_BACKEND=postgresql` 요구. realtime-coordination.ts는 그 backend가 "declared but not implemented". 즉 high-stakes 모드는 *형식적으로 통과는 가능*한데(env만 박으면) 실제 coordination은 안 도는 상태. 운영자 입장에서 가짜 통과예요.

**제안**: realtime-coordination.ts:252 근처에서 `REALTIME_COORDINATION_BACKEND === 'postgresql'`이면 실제로 PG `LISTEN/NOTIFY` 채널 구독을 켜거나, 켜지지 않은 채로 `check-high-stakes-runtime.sh`가 fail하도록 일치시키세요. 지금은 두 파일이 거짓말로 합의하고 있어요.

## K. `src/app/api/v1/health/route.ts:8-42`

app health가 DB connectivity만 봐요. judge worker · code-similarity · rate-limiter 사이드카는 안 봐요. app은 healthy인데 worker 다 죽어 있어도 app은 200.

**제안**: `/api/v1/health/judge`를 분리해서 (1) judge_workers status (2) recent verdict 분포 (3) DLQ 누적 수 셋을 200/503로 노출. nginx/upstream LB가 traffic을 적절히 빼낼 수 있게.

## L. `docker-compose.production.yml:153-172` code-similarity·rate-limiter

`depends_on:` 안 걸려 있어요. app이 이 둘 없이 시작해도 200. 사용자 hit 시점에 5xx.

**제안**:
```yaml
app:
  depends_on:
    db:
      condition: service_healthy
    code-similarity:
      condition: service_healthy
    rate-limiter:
      condition: service_healthy
```

지금 app이 사이드카 healthcheck 결과를 기다리지 않아요. 부팅 race에서 사용자 첫 요청이 사이드카로 못 가서 500.

## M. `deploy-docker.sh:843-852` ANALYZE swallow

```bash
remote "... psql -h db -U judgekit -d judgekit -c 'ANALYZE;'" 2>&1 || true
success "Database statistics updated"
```

ANALYZE 실패해도 success 찍어요. 통계 안 갱신된 채로 운영 → planner가 잘못된 plan 사용 → slow query. 운영자에게 안 알려요.

**제안**: `|| { warn "ANALYZE failed"; }` 정도. die까지는 과해요.

## N. `src/lib/data-retention.ts:7` `loginEvents: 180`일

**관찰**: audit_events 90일, login_events 180일은 합리적인데, **audit log 자체의 백업 분리가 없어요**. 90일 보존 = 90일 지나면 누가 뭘 했는지 모름. 분쟁·법적 쟁의 시 문제 될 수 있어요.

**제안**: audit_events pruning 전에 cold storage(파일로 덤프)로 옮기는 옵션. 또는 `AUDIT_EVENT_RETENTION_DAYS=3650` 처럼 길게 뽑아두고 디스크 압박 시 별도 처리.

---

# 5. 추가 운영 관찰

## 5.1 시크릿 로테이션 — 4종 + 어제 노출 사고 후속

- POSTGRES_PASSWORD: 어제 conversation log 노출 사고. rotate 권장 → 안 되었으면 *지금 당장* rotate 필요. `deploy-docker.sh:361`이 처음 deploy에만 random hex 32 생성. rotate procedure 없음.
- AUTH_SECRET(NextAuth): 한 번 rotate하면 모든 세션 무효. 시험 중에 절대 못 함. 학기 사이에 의도적 rotate window 필요.
- JUDGE_AUTH_TOKEN: worker-app 사이 인증. rotate하면 worker compose의 env 동시 갱신 필요.
- CODE_SIMILARITY_AUTH_TOKEN / RATE_LIMITER_AUTH_TOKEN: 어제 fail-closed 적용으로 빠뜨리면 사이드카가 죽어요. rotate 후 app도 같이 재배포 필요.
- PLUGIN_CONFIG_ENCRYPTION_KEY: rotate 불가에 가까움. 기존 plugin secret 다 못 풀어요. 별도 re-encrypt 마이그레이션 필요.
- SMTP_PASS: 이메일 인증·비번 리셋 의존. rotate 시 사일런트 fail 가능.
- hcaptchaSecret: 마찬가지로 user-facing 영향.

**구체적 제안**: `scripts/rotate-secret.sh <KEY> <NEW_VALUE>` 만들어서 (1) .env.production 갱신 (2) 영향 받는 컨테이너 식별 + 재시작 (3) 검증 (4) audit_events에 기록 (5) Slack webhook. 7종 키 각각에 대해 "rotate 가능 시점·downtime·재배포 필요 컨테이너" 표를 docs에.

## 5.2 운영자 SSH 들어가서 env 확인하면 시크릿 노출되는 흐름

어제 사고에서 정확히 이게 일어났어요. `docker exec judgekit-db env`로 진단할 때 POSTGRES_PASSWORD가 conversation log로 흘러갔어요.

**제안**:
- `scripts/safe-env.sh <container>`를 만들어서 `docker exec $1 env | grep -vE '^(POSTGRES_PASSWORD|AUTH_SECRET|JUDGE_AUTH_TOKEN|.*_AUTH_TOKEN|SMTP_PASS|.*_SECRET)='` 같은 마스킹 wrapper.
- AGENTS.md / CLAUDE.md 운영 섹션에 "env 확인 시 raw `docker exec env` 금지, `scripts/safe-env.sh` 사용" 명시.
- agent 자동화가 `docker exec env`를 직접 쏘지 않도록 prompt 가이드. agent가 운영 진단을 할 일이 늘어나면 노출 risk가 비례해서 늘어요.

## 5.3 멀티 인스턴스 / HA

여전히 단일 인스턴스. `realtime-coordination.ts:238`이 `APP_INSTANCE_COUNT=1` 강제.

배포 토폴로지 봤을 때 oj.auraedu.me, algo.xylolabs.com, test.worv.ai는 각각 별개 서비스(별개 DB). 같은 도메인을 N대로 띄우는 HA는 의도 안 한 듯해요. 만약 의도하지 않은 거면 어제·오늘 리뷰의 "멀티 인스턴스 불가" High 등급은 사실 *상관없음*으로 강등해도 돼요. 그러나 무중단 deploy는 여전히 불가 — deploy 시점에 app 컨테이너 down 시간 동안 503.

**제안**: 단일 인스턴스 운영을 명시적으로 *정책*으로 박고, "무중단 deploy 안 함, deploy 시 ~30초 503 가능"을 운영 SLA에 적어두세요. 그러면 HA 미구현은 *결정*이지 *gap*이 아니에요.

## 5.4 Capacity planning — 워커 하나가 얼마나 받을 수 있나

- `judge-worker-rs/src/config.rs:219`에서 `JUDGE_CONCURRENCY` 1..16. `deploy-docker.sh:364` 기본 `JUDGE_CONCURRENCY=2`. `docker-compose.worker.yml:49` 기본 `JUDGE_CONCURRENCY=4`. 같은 fleet에서 두 기본값이 달라요.
- 한 worker가 동시에 N개의 docker run을 띄움. submission당 평균 ~5초 가정 시 concurrency=4면 worker 하나가 분당 ~48개 처리.
- 시험에 100명이 동시에 제출 누르면 (보통 1인당 5~10초에 한 번씩) 분당 600~1200건. 워커 하나로는 cliff.
- worker-0(algo) 추가가 있긴 한데 worv·auraedu는 dedicated worker 없음.
- 부하 분기점 측정·문서가 없어요. 시험 직전에 알게 됨.

**제안**:
1. `stress-tests.mjs`(이미 repo에 있음)로 동시 N submission 부하 테스트 결과를 `docs/ops/capacity.md`로 기록. 호스트별 한계 명시.
2. `JUDGE_CONCURRENCY` 기본값을 fleet 전반 일치 (worker compose vs main compose 통일).
3. `judgekit_judge_queue_depth_by_language` 메트릭 추가해서 어떤 언어가 병목인지 보이게. 어제 #18 리뷰에서도 같은 지적.

## 5.5 Audit log 보존 + 누가 무엇 했나

- `audit_events` 테이블 있고 90일 보존. login_events 180일.
- audit-logs admin 페이지 있음 (`src/app/(dashboard)/dashboard/admin/audit-logs`).
- 그런데:
  - 검색·필터·export 기능 강도 미확인. 90일 후 데이터 영구 손실.
  - audit_events 자체 백업이 db dump에 묻혀 가요. 별도 보존 정책·encryption 없음.
- **제안**: 매월 audit_events을 별도 파일로 export → 외부 storage. 90일 prune 이후에도 콜드 storage에서 조회 가능.

## 5.6 Idempotency·롤백

`deploy-docker.sh`:
- ✅ Idempotent한 부분: `ensure_env_secret`, `ensure_env_literal`, secret_token backfill DO-block, ANALYZE.
- ❌ Idempotent하지 않은 부분: docker build (no-cache), drizzle-kit push, nginx config 덮어쓰기.
- ❌ **롤백 메커니즘 없음**: `:latest` 태그만 사용. 이전 버전 이미지 보존 안 함. `previous` 태그도 안 만들어요. deploy 후 사고 발견하면 git revert + 재배포뿐.

**제안**:
1. deploy 시 기존 `:latest`를 `:previous`로 retag → 새 이미지 빌드 → fail 시 `:previous`로 즉시 fallback.
2. db 마이그레이션 롤백은 매우 어려움. pre-deploy backup이 사실상의 rollback point. 충분.
3. `scripts/rollback-deploy.sh` 추가:
   ```bash
   # 1. docker tag previous → latest, restart
   # 2. pg_restore from latest pre-deploy backup (with confirmation)
   # 3. nginx reload
   ```

## 5.7 운영 절차서·runbook 부재

이번 14h 사고는 사실 *어디를 보면 알 수 있었는지* 운영자가 몰라서 길어졌어요. compile_error 폭증을 보는 dashboard도 없고 verdict 분포 alert도 없으니 사고 자체가 안 보였어요.

**제안**: `docs/ops/incident-runbook.md`에 시나리오별 1차 진단 명령:
- 채점 fail 의심: `docker exec judgekit-judge-worker curl localhost:3001/health` + `docker exec judgekit-docker-proxy printenv | grep -E '^(POST|DELETE|ALLOW)='` + verdict 분포 query
- DB 느림 의심: pg_stat_activity 보기
- 디스크 풀: `docker system df` + 언어 이미지 정리
- 사이드카 죽음: `docker compose ps` + `docker logs --tail=100 code-similarity`

---

# 6. Show-stopper 후보

시험·대회·채용 평가 진행 중에 사고 나면 *그 운영을 망치는* 것만 추림.

| 항목 | 발생 확률 | 사고 영향 | 운영 인지까지 시간 |
|---|---|---|---|
| docker-proxy POST=0 lockup (#2) | 중 (어제 fleet 동시 발생) | 모든 제출 compile_error | 14h(어제), 잠재적 무한 |
| 디스크 풀 (#3) | 중 (algo 67%, 빌드마다 증가) | DB write fail, 모든 기능 정지 | 모니터 없음 |
| 백업 + 복원 안 됨 (#4) | 저 (백업 verify는 됨) | 데이터 영구 손실 가능 | 발생 후에야 알 수 있음 |
| 워커 e2e silent fail (#1) | 중 | 14h 동안 모든 채점 잘못 기록 | 학생 신고가 들어와야 알 수 있음 |
| 시크릿 노출 후 rotate 못 함 (5.1) | 저 (rotate 도구 없으므로 *해야 할* 때 못 함) | 인증 우회 가능 | 외부 침투 시그널 의존 |

이 다섯이 어제 사고가 가르쳐준 진짜 위험. 시험 중에 셋 이상 동시에 터지면 운영 회복 불가.

---

# 7. 추천 작업 순서 (오늘 기준)

1. **워커 e2e health 즉시 박기** (`runner.rs:376` 30줄 patch + heartbeat 보강). 어제 root cause를 알았는데도 fix가 비어 있는 게 가장 큰 문제.
2. **`docker-compose.worker.yml` POST/DELETE/ALLOW_* 기본 1로** + deploy 시 verify. fleet drift 막기.
3. **모든 컨테이너에 `logging: max-size: 50m` 박기**. 디스크 풀 1차 방어.
4. **`scripts/monitor-health.sh` + `notify-failure@.service`에 ALERT_WEBHOOK_URL** 통합. P0~P1 신호가 인간에게 도달하는 채널.
5. **verdict 분포 메트릭 + DLQ 가시화** (`admin-health.ts` + `/dashboard/admin/workers/dlq`). 어제 14h 사고가 *발생 5분 안에* 보이도록.
6. **백업 cross-copy + 월간 restore drill**. 데이터 손실 방어선.
7. **post-deploy smoke의 placeholder password 분기** (`deploy-docker.sh:1120` `E2E_PASSWORD=skip-login` 문제 정리). smoke의 신호가 운영자에게 명확하도록.
8. **`Dockerfile.judge-clean` ftp.cs.ru.nl mirror** + per-language fail isolation.
9. **시크릿 rotate 스크립트** (7종) + POSTGRES_PASSWORD 어제 노출 후 rotate 진행 상태 확인.
10. **운영 runbook 작성** — 어제 14h 사고가 다시 나도 1분 안에 진단할 수 있도록 명령어 수준으로.

11~ (나중에)
- realtime coordination PG LISTEN/NOTIFY 구현 또는 단일 인스턴스 정책 공식화.
- 멀티 테넌트(다른 review 항목).
- 사용자 self-service data export (GDPR/PIPA).
- ARM64 binfmt systemd unit.
- audit log cold storage export.

---

# 8. 추가로 짚고 넘어가야 하는 운영 디테일

## 8.1 nginx config가 deploy마다 새로 써져요

`deploy-docker.sh:884-1057`이 매 deploy마다 `/etc/nginx/sites-available/judgekit`를 *완전 덮어쓰기*합니다. 운영자가 임시로 nginx config를 손보면(예: 특정 IP block, maintenance page, location 추가) 다음 deploy에 통째로 날아가요.

- rate-limit zone(`judgekit_login:10m rate=5r/s`, `judgekit_judge:1m rate=10r/s`)이 hardcoded. 시험 시작 직전에 burst를 늘리고 싶어도 deploy 다시 돌려야 해요.
- `client_max_body_size 50M`도 hardcoded. 큰 코드 제출(과제 첨부)을 지원하고 싶을 때 운영자가 못 늘려요.
- nginx config가 git 또는 별도 storage에 백업되지 않아요. 운영자가 손으로 수정한 게 있으면 deploy 한 번에 손실.

**제안**:
1. nginx config를 template로 빼고(`/etc/nginx/sites-available/judgekit.template`) `envsubst`로 변수 채워 넣기. 운영자 customization은 별도 `.local` 파일에 박고 include.
2. 또는 deploy 전에 기존 config 백업: `remote_sudo "cp /etc/nginx/sites-available/judgekit /etc/nginx/sites-available/judgekit.bak.$(date +%s)"`. retention 정책으로 정리.

## 8.2 SSL 자동 갱신 모니터링 없음

`scripts/bootstrap-instance.sh:273`이 `certbot.timer`를 enable하긴 해요. 좋아요. 그런데:
- 갱신 실패 시 운영자에게 alert 갈 경로가 없어요. 만료 일주일 전에 갱신 실패해도 D-day에 사이트 다운.
- `/api/metrics`에 `judgekit_ssl_cert_expiry_seconds{domain="..."}` 같은 게 없어요. 외부 Prometheus blackbox exporter 의존.
- nginx config가 deploy로 덮어써지면(8.1) `ssl_certificate` 경로가 새 도메인용으로 잘못 가리키는 사고 가능.

**제안**:
- `monitor-health.sh`에 cert expiry 체크 추가: `openssl s_client -connect ${DOMAIN}:443 -servername ${DOMAIN} </dev/null 2>/dev/null | openssl x509 -noout -enddate`. 14일 이내면 critical webhook.
- `certbot renew`의 결과를 systemd OnFailure로 fail webhook 연결.

## 8.3 Rust 사이드카 — 인증은 있는데 가시성이 없어요

- `code-similarity-rs`·`rate-limiter-rs` 둘 다 `/metrics` 엔드포인트가 없어요(`grep -rn "/metrics" rate-limiter-rs/src code-similarity-rs/src`).
- `/health`만 있고 (1) 처리한 요청 수 (2) 실패율 (3) p99 latency (4) auth fail 횟수 알 길이 없어요.
- rate-limiter는 *모든 요청의 hot path*예요. 여기 문제 생기면 fleet 전체 영향. 가시성이 health/200/503 두 상태뿐이면 운영 전혀 안 됨.

**제안**:
- 각 사이드카에 `axum-prometheus` 같은 미들웨어 + `/metrics` 노출. app server `/api/metrics`가 scrape해서 federate (또는 별도 Prometheus가 직접 scrape).
- 최소한: `rate_limiter_check_total{outcome="allow|deny"}`, `rate_limiter_check_duration_seconds`, `rate_limiter_auth_fail_total`.

## 8.4 Graceful shutdown 일관성

`src/lib/audit/node-shutdown.ts:37`에서 Next.js 앱이 SIGTERM 받으면 audit flush 시도해요. 좋아요.

그런데:
- `judge-worker-rs`가 진행 중인 채점을 graceful drain하는지 미확인. 한가운데 채점 중 docker stop 받으면 학생 제출이 사라질 수 있어요.
- `docker-compose.production.yml`에 `stop_grace_period` 명시 없음. docker default(10초)면 long-running 채점은 SIGKILL.
- pre-stop hook으로 worker에게 "더 이상 claim하지 마라"를 신호줄 수 있어야 하는데 그런 mechanism 없음.

**제안**:
1. `judge-worker-rs`에 SIGTERM 핸들러: 새 claim 멈춤 + 진행 중 작업 완료 대기 → 최대 N초 → SIGKILL.
2. `docker-compose.production.yml`의 `judge-worker`에 `stop_grace_period: 120s` 추가.
3. deploy-docker.sh가 worker 중지 전 "queue drain" 시도. 채점 진행 중인 게 0개 될 때까지 대기.

## 8.5 데이터베이스 connection pool 가시성

`src/lib/db/`의 pg pool size·active connection 수가 `/api/metrics`에 없어요. postgres `pg_stat_activity`로 외부에서 봐야 함.

- pool exhaustion 사고 시 운영자가 "DB 느림"으로 오인하기 쉬워요. 실제로는 connection 부족.
- `getAdminHealthSnapshot()` (`src/lib/ops/admin-health.ts:64`)에 `pool.totalCount` / `pool.idleCount` / `pool.waitingCount` 한 줄로 추가 가능.

## 8.6 Docker daemon healthcheck

docker daemon 자체가 hang했을 때 알 길 없음. journal `docker.service` status로만 알 수 있어요.

- daemon hang은 `docker exec` 통째로 멎음 → healthcheck도 멎음 → app·worker 둘 다 unhealthy로 떨어져요. 직접 docker daemon 진단 명령 없어요.
- 운영자가 SSH 들어가서 `systemctl status docker`·`journalctl -u docker -n 100` 봐야 알 수 있어요.

**제안**: `monitor-health.sh`에 `docker info >/dev/null 2>&1 || critical "docker daemon unreachable"` 한 줄.

## 8.7 nginx access log → 로그 분석 안 됨

- nginx access log를 GoAccess/awstats 같은 걸로 fleet 차원 집계하는 흐름 없음.
- 어떤 user-agent가 / 어떤 IP에서 / 어떤 endpoint를 두드리는지 운영자가 알 길 없음. abuse 탐지 안 됨.
- 시험 중 IP block 정책을 운영자가 적용하려고 해도 raw log를 사람이 grep해야 해요.

**제안**: nginx log를 systemd journal로 보내고 (또는 외부 log aggregator) fleet 차원 query 가능하게.

## 8.8 Container restart loop 감지

`docker-compose.production.yml`의 모든 service가 `restart: unless-stopped`. 잘못된 config로 컨테이너가 *반복적으로* 죽고 restart되는 상황이 가능해요. 운영자가 알 길:

- `docker compose ps`로 가끔 봐야 함. 자동 감지 X.
- 30초마다 restart 중인데도 우연한 한 순간엔 `Up`으로 표시 가능.

**제안**: `monitor-health.sh`에 `docker inspect --format='{{.RestartCount}}' <container>` 체크. 1시간 사이에 +5 이상이면 critical.

## 8.9 Submission queue gauge가 통합 카운터뿐

`submissionQueue.pending`은 `WHERE status IN ('pending', 'queued', 'judging')` 한 덩어리예요. 어떤 단계에서 막혔는지 운영자 알 길 없음:
- `pending` 많음 = app에서 worker로 못 보냄 (네트워크·인증)
- `queued` 많음 = worker가 못 claim
- `judging` 많음 = 채점 자체 느림 (특정 언어·문제 무거움)

각각 다른 대응이 필요한데 한 숫자로 합쳐져 있어요.

**제안**: `judgekit_submission_queue{status="pending|queued|judging"}` 라벨링.

## 8.10 시험 모드 / contest mode runbook

- 시험 시작 전 운영자가 *해야 하는* 점검 리스트가 코드 베이스에 없어요.
- post-deploy smoke는 deploy 시점 1회. 시험 시작 1시간 전 manual sanity check은 누가, 무엇을 보고 OK 판단하는지 SOP 부재.

**제안**: `docs/ops/contest-mode-checklist.md`:
- worker 모든 호스트 online (`SELECT * FROM judge_workers WHERE status = 'online'`)
- judge 언어 이미지 모두 존재 (`docker images | grep judge-`)
- docker-proxy POST=1 (#2 사고 재발 방지 체크)
- 최근 1시간 verdict 분포 정상 (compile_error 비율 < 5%)
- backup이 24h 이내
- 디스크 < 80%
- SSL > 30일
- rate-limiter healthy
- nginx limit_req zone 시험 트래픽에 맞게 조정

체크리스트 자동화하면 더 좋아요: `scripts/contest-preflight.sh` exit 0이면 모든 OK.

---

# 9. 어제(5/18) vs 오늘(5/21) 델타 요약

| 영역 | 5/18 | 5/21 | 평가 |
|---|---|---|---|
| Top 1 워커 e2e health | 미해결 | 미해결 (`runner.rs:376` 그대로) | ❌ 가장 중요한 root cause fix가 안 들어감 |
| Fleet drift | 부분 해결 (production compose) | 부분 (`worker.yml`은 여전히 POST=0) | 🟡 절반 |
| 102/102 언어 이미지 | 일부 fail | 모두 빌드 성공 | ✅ |
| Pre-deploy backup | 있음 | 있음 + SKIP_PREDEPLOY_BACKUP=1 escape hatch | ✅ |
| Post-deploy smoke | 없음 | 추가됨 (PLAYWRIGHT_PROFILE=smoke) | ✅ 단, E2E_PASSWORD placeholder 처리 미흡 |
| Rust 사이드카 fail-closed | declared | 실제 implemented | ✅ |
| CSP fallback | silent | fail-loud | ✅ |
| 시크릿 노출 사고 | 발생 | rotate 진행 여부 불명 | ❌ 후속 확인 필요 |
| Auraedu judge-clean | 빌드 fail | 그대로 (ftp.cs.ru.nl 도달 불가) | ❌ |
| DLQ admin UI | 없음 | 없음 | ❌ |
| 알림 채널 | systemd journal만 | systemd journal만 | ❌ |
| 멀티 인스턴스 | 단일 강제 | 단일 강제 | 🟡 정책 문서화도 안 됨 |
| Disk monitoring | journal | journal | ❌ |
| Log rotation | 없음 | 없음 | ❌ |
| Restore drill | 없음 | 없음 | ❌ |
| Capacity doc | 없음 | 없음 | ❌ |
| Audit log retention | 90일 | 90일 (변화 없음) | 🟡 cold storage 부재 |

**positive delta**: 102 image build·post-deploy smoke·CSP fail-loud·Rust 사이드카 fail-closed.
**critical regression risk**: 어제 사고 root cause (`runner.rs:376` health) 미수정. 같은 사고 또 나면 정확히 같은 14h 패턴.

---

# 10. 오늘의 한 줄 평

어제 14h × 3호스트 silent fail의 root cause를 알아낸 직후의 cycle인데도, 그 root cause를 *기술적으로* 막을 fix는 아직 들어가지 않았어요. post-deploy smoke를 추가한 건 외곽 방어선이고, 진짜 안쪽(`runner.rs:376` health 핸들러)은 여전히 `StatusCode::OK`만 반환하고 있어요. 시험·대회 한가운데에서 같은 사고가 다시 일어나면, 운영자가 알아채는 데 또 14시간 걸려요. 이 한 줄 patch가 가장 시급해요. 백업·DR·알림은 그 다음.
