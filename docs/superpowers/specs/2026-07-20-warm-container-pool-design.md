# 웜 컨테이너 풀 (Warm Container Pool) 설계

- 작성일: 2026-07-20
- 대상: `oj`(= `auraedu`) 배포의 채점 워커 + 관리자 페이지
- 스코프: **실행(테스트케이스) 단계만 웜 풀 상주화, 컴파일은 기존 콜드 유지, 웜 경로 불가 시 콜드 폴백**

---

## 1. 목표 / 배경

### 목표
- `oj` 타깃에서 **Python 3 / C++ / C** 채점 컨테이너를 미리 띄워 둔 상태로 상시 유지해, 제출이 들어왔을 때 컨테이너 생성·시작(cold start) 지연 없이 즉시 실행되게 한다.
- 워커를 **온디맨드(ondemand)로 띄울지 상시(warm)로 띄울지**를 **관리자 페이지에서** 조절할 수 있게 한다. 세밀도: **전역 on/off + 언어별 상주 여부 + 언어별 대기 개수**.

### 현재 구조 (조사 결과)
- **`oj` = `auraedu` 배포의 별칭.** `deploy-docker.sh:137-155`에서 `DEPLOY_TARGET=oj`를 `auraedu`로 매핑. 앱 + 워커가 한 머신에 있는 통합(integrated) 구성이며, 배포마다 원격 호스트/DB가 분리되어 있어 **oj 관리자 설정은 oj 워커에만** 적용된다.
- **채점 워커 프로세스(Rust `judge-worker`)는 이미 상시 실행**이다. 큐를 폴링하며 제출을 claim 한다.
- **채점용 샌드박스 컨테이너는 제출마다 온디맨드**로 뜬다: 컴파일 1회 + 테스트케이스당 1회 = N+1개 `docker run`, 1회용, 유저 간 재사용 없음(격리 요구).
- 유일한 웜업 장치는 `WORKER_PREWARM_IMAGES`(`config.rs:294-308`, `main.rs:296-348`)로, 시작 시 이미지 레이어를 페이지 캐시에만 올린다. **컨테이너를 상주시키지 않으며** 런타임 재구성도 불가.
- **자원 제한은 컨테이너 생성 시점에** 걸린다: `docker.rs:341-391`에서 `docker run --memory/--memory-swap/--cpus/--pids-limit/--ulimit`를 제출별 `memory_limit_mb` 등으로 설정하고, 피크 메모리는 컨테이너 cgroup(`memory.peak`)에서 읽는다(`docker.rs:162-183`).
- **앱 → 워커 런타임 설정 채널이 없다.** `register`/`heartbeat` 응답에는 설정이 없고(`register/route.ts:80-85`, `heartbeat/route.ts:97`), 제출별 설정만 `claim` 응답으로 전달된다(`claim/route.ts:412-426`). 워커는 모든 자체 설정을 시작 시 env로만 읽는다(`config.rs:54-332`).

### 핵심 제약이 낳은 설계 원칙
컨테이너 자원 한도가 **생성 시점에 제출별로** 고정되므로, "미리 띄워 exec만" 하는 순진한 방식은 제출별 메모리/시간 제한과 피크 측정을 깨뜨린다(채점 정확성·악용 방지의 핵심). 따라서:

1. **웜 풀은 "빠른 경로"일 뿐이고, 언제든 오늘과 100% 동일한 콜드 `docker run`으로 폴백**한다. 웜 경로가 불가능한 모든 경우(풀 고갈, 한도 조정 실패, 미지원 언어, 커널 미지원 등)는 자동 강등되어 채점은 항상 정상 동작한다.
2. **웜 컨테이너는 여전히 1회용**(테스트케이스 1건에만 사용 후 폐기)으로 유지해 케이스별 격리·피크 메모리 측정 모델을 그대로 보존한다.
3. **컴파일 단계는 웜 풀 대상이 아니다** — 제출당 1회뿐이라 비중이 작고, 컴파일용 seccomp가 실행용과 달라 섞으면 격리가 약해지기 때문이다.

---

## 2. 비목표 (Non-goals)

- 컴파일 단계 웜화 (이번 스코프 제외).
- 제출당 컨테이너 1개로 테스트케이스 전체 재사용 (seccomp 분리·케이스별 피크메모리 재설계가 필요해 제외).
- 동적 오토스케일링(부하 기반 min/max 자동 증감). 개수는 관리자 지정 고정값.
- per-worker 개별 설정 테이블. 이번엔 배포 전역(`system_settings`) 설정으로 충분(배포별 DB 분리로 자연 스코핑). 추후 확장 여지만 남긴다.
- algo 등 분리형(separated) 타깃 지원은 자동으로 따라오지만(같은 코드), 이번 검증 대상은 oj.

---

## 3. 아키텍처 개요

```
[관리자 UI: settings/warm-pool]
    │  (server action / PUT, capability: system.settings)
    ▼
[system_settings.warmPool JSONB]  ── getResolvedSystemSettings()
    │
    ▼ (register / heartbeat 응답에 warmPool 필드 신설)
[judge-worker-rs: PoolManager]  ── 하트비트(~30s)마다 목표 vs 실제 대조·조정
    │
    ├─ 유휴 대기 컨테이너 풀 유지 (이미지 단위: judge-cpp, judge-python ...)
    │
    ▼ (executor: 테스트케이스 실행 시)
[웜 컨테이너 adopt] ── docker update(한도) → docker cp(코드/입력) → docker exec(실행)
    │                    → 폐기 → 비동기 보충
    └─ 웜 불가 시 ▶ 기존 콜드 docker run (폴백)
```

풀은 **언어가 아니라 도커 이미지 단위**로 관리한다. `judge-cpp:latest`가 C(c17/c23)와 C++(cpp20/23/26) 공용, `judge-python:latest`가 Python 3 전용이므로(`src/lib/judge/languages.ts` `JUDGE_LANGUAGE_CONFIGS`, `judge-worker-rs/src/languages.rs`), 관리자 UI는 언어로 고르되 내부적으로 이미지로 그룹핑해 중복 상주를 막는다.

---

## 4. 데이터 모델

### `system_settings` 컬럼 추가 — `src/lib/db/schema.pg.ts` (systemSettings, :587-680)
```ts
warmPool: jsonb("warm_pool").$type<WarmPoolConfig | null>(),
```
`homePageContent`/`footerContent`과 동일한 jsonb 패턴을 따른다. 마이그레이션: `drizzle/pg/0040_warm_pool.sql`
```sql
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "warm_pool" jsonb;
```

### 설정 타입 — `src/lib/judge/warm-pool.ts` (신규, 공용 타입/정규화)
```ts
export interface WarmPoolConfig {
  enabled: boolean;
  // 이미지 단위 목표 개수. 키는 judge 이미지명, 값은 유휴 대기 컨테이너 수(0~MAX_PER_IMAGE).
  images: Record<string, number>;
}
export const WARM_POOL_MAX_PER_IMAGE = 8;   // 이미지당 상한 (idle 자원 보호)
export const WARM_POOL_MAX_TOTAL = 24;      // 전체 상한
```
- `WarmPoolConfig`는 `SystemSettingsRecord`(`src/lib/system-settings.ts:16-88`)에 `warmPool?: WarmPoolConfig | null`로 추가하고, 폴백 select 분기(:167)에도 `null` 기본을 넣는다.
- **정규화 함수** `resolveWarmPoolTargets(config, enabledLanguages)`: 관리자 설정을 언어→이미지로 환산해 이미지별 목표 개수 맵을 만든다. 같은 이미지를 여러 언어가 공유하면 **개수는 max**(합산 아님 — 웜 judge-cpp 하나가 C·C++ 모두 처리 가능하므로). 상한(`WARM_POOL_MAX_PER_IMAGE`, `WARM_POOL_MAX_TOTAL`) 클램프. `enabled=false`면 빈 맵.

### oj 기본값 (시드)
- 시드/기본 상수로 `enabled: true`, `images: { "judge-cpp": 2, "judge-python": 2 }` 제공.
- 적용 방식: 관리자가 값을 저장하기 전까지 `getResolvedSystemSettings` 단계에서 기본값을 채운다(다른 토글의 default 패턴과 동일, `src/lib/system-settings.ts:173`). DB에 하드 시드하지 않아 다른 배포에서 원치 않으면 관리자에서 끌 수 있다.

---

## 5. API 변경 (앱 ↔ 워커 전파 채널 신설)

### register 응답 — `src/app/api/v1/judge/register/route.ts:80-85`
`{ workerId, workerSecret, heartbeatIntervalMs, staleClaimTimeoutMs }`에 추가:
```ts
warmPool: resolvedWarmPoolTargets   // { enabled, images: { "judge-cpp": 2, ... } }
```
워커가 시작 직후 목표 풀을 즉시 구성할 수 있게 한다.

### heartbeat 응답 — `src/app/api/v1/judge/heartbeat/route.ts:97`
`{ ok: true }`에 동일한 `warmPool` 필드를 추가한다. 워커는 하트비트마다(약 30초) 최신 목표를 받아 풀을 재조정 → **관리자 토글이 재배포 없이 ~30초 내 반영**.

- 두 라우트 모두 `getResolvedSystemSettings()` + `resolveWarmPoolTargets()`로 목표 맵을 계산해 응답에 싣는다. `enabledLanguages`는 기존 `languageConfigs.isEnabled`를 재사용.
- 응답 스키마/타입을 `src/lib/judge/`의 공용 타입으로 노출(테스트에서 shape 검증).

### 워커 측 wire 타입 — `judge-worker-rs/src/types.rs`
- `RegisterResponseData`(:335-346)와 `HeartbeatResponse`에 `warm_pool: Option<WarmPoolTargets>` 추가(`#[serde(default)]`로 하위호환). 구형 앱이면 `None` → 웜 풀 비활성(콜드 동작 = 오늘과 동일).

---

## 6. 워커(Rust) 변경 — `judge-worker-rs/`

### 6.1 신규 모듈 `src/pool.rs` — `PoolManager`
- 이미지별 유휴 컨테이너 핸들 큐를 보관: `HashMap<String /*image*/, VecDeque<WarmContainer>>`.
- **reconcile(targets):** 목표 개수와 실제를 대조해 부족분은 비동기로 생성(spawn), 초과분/비활성/미지원은 폐기(drain). 하트비트 콜백에서 호출.
- **대기 컨테이너 생성:** `docker run -d --name <uuid> --memory <WARM_CEILING>m --cpus <max> --pids-limit <max> <image> sleep infinity` 형태. **넉넉한 상한** + **현행 실행 컨테이너와 동일한 네트워크/보안 옵션**(seccomp 실행용 프로필, `no-new-privileges`, 네트워크 격리 등은 `docker.rs`의 현재 run 옵션 조립을 기준으로 일치시킨다)으로 띄운다. 워크스페이스는 컨테이너 내부 tmpfs(`/workspace`)로 준비(생성 시점엔 제출이 없으므로 바인드 마운트 없이 시작). uid 65534 실행은 현행 `workspace.rs` 방식을 유지하되 exec 시점 chown 처리.
- **acquire(image) -> Option<WarmContainer>:** 큐에서 pop, 없으면 `None`(→ 폴백). pop 직후 **비동기 보충** 트리거.
- **discard(container):** `docker rm -f`(현행 reaper 경로 재사용, `docker.rs:284,537-561`).
- 이미지 미존재 시 생성 실패를 경고 로그로 남기고 해당 이미지 목표를 0으로 취급(현행 prewarm의 누락 처리와 동일 정책).

### 6.2 실행 경로 — `src/executor.rs` / `src/docker.rs`
테스트케이스 실행(현행 `docker.rs` `docker run` 경로, run 옵션 조립 `:341-391`)에 **웜 경로 분기**를 추가:

**웜 경로 (가능 시):**
1. `pool.acquire(image)`로 대기 컨테이너 확보.
2. `docker update <c> --memory <mb>m --memory-swap <...> --cpus <...> --pids-limit <...>`로 **제출별 한도 적용**. (memory 조정은 cgroup v2 필요 — 6.4 참고.)
3. `docker cp`(또는 exec `sh -c 'cat > ...'`)로 코드/입력 파일을 `/workspace`에 주입, 소유권 정리.
4. 측정 직전 **`memory.peak` 리셋**(케이스별 피크 정확도 확보, 6.4 참고).
5. `docker exec`로 실행. 시간 측정은 현행 방식(exec 감싼 타이밍, `docker.rs:183` 주석의 "컨테이너 생성/셋업 제외" 정신과 일치) 유지, 벽시계 타임아웃은 exec에 부여.
6. 피크 메모리를 컨테이너 cgroup에서 읽음(현행 `read_cgroup_memory_peak`, `docker.rs:162-183`).
7. **컨테이너 폐기 후 보충**(1회용 격리 유지).

**폴백 경로:** 위 어느 단계라도 실패하거나 `acquire`가 `None`이면, 기존 콜드 `docker run` 경로를 그대로 실행. 결과·측정은 동일.

- **DB override 우선순위**(`executor.rs:248-284`)와 `run_all_test_cases`(IOI) 처리 등 기존 실행 의미론은 그대로. 웜/콜드는 컨테이너 획득 방식만 다르고 명령·측정은 동일해야 한다.

### 6.3 설정/수명주기 — `src/config.rs`, `src/main.rs`
- register 응답의 `warm_pool`로 `PoolManager` 초기화(`main.rs:277-381` 등록 직후, 기존 prewarm 스폰 `:296-348` 근처). 웜 풀이 켜진 이미지는 별도 이미지-프리웜을 생략해도 무방(대기 컨테이너가 곧 페이지 캐시를 채움) — 단, 안전하게 기존 prewarm은 유지.
- heartbeat 태스크(`main.rs:384-439`)에서 응답의 `warm_pool`을 `PoolManager::reconcile`로 전달.
- 종료(SIGTERM drain, `docs/judge-workers.md:13-51`) 시 풀 컨테이너 전부 `docker rm -f`.
- env 킬스위치 `WORKER_WARM_POOL_DISABLE=true`: 앱 설정과 무관하게 워커에서 웜 풀 강제 비활성(운영 안전장치). `config.rs:from_env`에 추가.

### 6.4 남은 기술 리스크 (구현 중 해결, 실패 시 콜드 폴백)
- **`docker update`의 memory 조정**은 cgroup v2 필요. cgroup v1 호스트면 웜 경로 비활성(콜드 폴백). 시작 시 1회 감지해 로그.
- **`--ulimit`은 생성 시점 고정**(update 불가): 웜 컨테이너는 넉넉한 ulimit으로 생성하고, 엄격히 필요한 항목은 exec 시 `prlimit`로 프로세스에 적용하거나, 조정 불가하면 해당 케이스만 콜드 폴백.
- **`memory.peak` 리셋**은 커널 지원(cgroup v2, `memory.peak`에 쓰기)이 필요. 미지원이면 웜 경로에서 케이스 간 리셋 불가 → 해당 이미지 웜 경로 비활성(콜드 폴백)해 측정 정확도 보장.
- **seccomp**: 웜 컨테이너는 실행용 프로필로 고정. 컴파일은 웜 대상이 아니므로 충돌 없음.
- **idle 자원 비용**: `WARM_POOL_MAX_PER_IMAGE`/`WARM_POOL_MAX_TOTAL`로 상한. 대기 컨테이너는 `sleep infinity`라 CPU~0, 메모리 최소.

---

## 7. 관리자 UI

### 저장/쓰기 경로 (기존 패턴 준수)
- **검증**: `src/lib/validators/system-settings.ts`에 `warmPool` zod 스키마 추가(`enabled: boolean`, `images: record(string, int 0..MAX)`).
- **서버 액션**: `src/lib/actions/system-settings.ts` `updateSystemSettings`(:64)에 `hasOwnInput("warmPool")` 가드로 부분 업데이트 처리(:187-189 패턴). upsert → `invalidateSettingsCache()`(:248) → 감사 이벤트(:259) → `revalidatePath`.
- **REST**: `src/app/api/v1/admin/settings/route.ts` PUT(:45)에도 동일 반영. 필요 시 `allowedConfigKeys`(:87-99)에 키 추가. capability는 기존 `system.settings`.
- warmPool은 보안 민감 설정은 아니나, 원한다면 `SENSITIVE_SETTINGS_KEYS`(현재 비밀번호 재확인 게이트) 대상에서는 제외한다(운영 편의).

### UI 컴포넌트
- `src/app/(dashboard)/dashboard/admin/settings/` 에 **"웜 컨테이너 풀" 탭/섹션** 신설(`settings-tabs.tsx`에 항목 추가, 신규 `warm-pool-form.tsx`).
  - 전역 스위치: "웜 풀 사용" 체크박스(`Checkbox`).
  - 언어별 상주 목록: `languageConfigs`에서 `isEnabled`인 언어를 나열, 각 언어에 **상주 여부 체크 + 대기 개수 입력**. 같은 이미지를 공유하는 언어(C/C++)는 UI에서 "이 이미지는 judge-cpp 공용" 힌트 표기, 저장 시 이미지 단위로 환산.
  - 저장 시 `updateSystemSettings({ warmPool })` 호출.
  - 현재 워커가 실제로 유지 중인 풀 상태를 보고 싶다면 후속으로 `admin/workers`에 표시(이번 스코프 밖, 선택).
- 페이지 서버 컴포넌트(`settings/page.tsx`)에서 `getSystemSettings()`(:119) 결과로 초기값 주입, capability 가드(:110-111) 유지.
- **i18n**: `messages/`에 라벨 키 추가. 한국어 문자열은 프로젝트 규칙대로 **letter-spacing 커스텀 금지**, 해요체 통일.

---

## 8. 엣지 케이스 / 안전성

- **웜 풀 off → on 토글**: 다음 하트비트에서 목표 풀 생성. 즉시 효과 필요 시 최대 ~30초 지연 허용.
- **개수 축소/off**: 초과분 유휴 컨테이너 즉시 폐기.
- **이미지 없음/빌드 전**: 생성 실패 경고 로그, 해당 이미지 웜 경로 skip → 콜드 폴백.
- **풀 고갈(동시 채점 > 대기 수)**: 초과분 콜드 폴백. 웜은 best-effort.
- **워커 재시작**: register 응답으로 풀 재구성.
- **구형 앱/워커 혼용**: `#[serde(default)]` / 응답 필드 optional로 하위호환. 필드 없으면 웜 풀 비활성 = 오늘 동작.
- **cgroup v1 / 커널 미지원**: 웜 경로 전체 비활성, 콜드 폴백.
- **algo 등 다른 배포**: 각자 DB의 `system_settings`를 따르며 기본 off로 두면 영향 없음.

---

## 9. 테스트 계획

- **앱(단위/통합, vitest)**:
  - `resolveWarmPoolTargets`: 언어→이미지 환산, C/C++ max 병합, 상한 클램프, disabled → 빈 맵.
  - register/heartbeat 응답에 `warmPool` 포함 및 shape 검증. 구형(필드 없음) 하위호환.
  - 서버 액션/PUT 부분 업데이트가 다른 컬럼을 덮지 않음(`hasOwnInput`), 감사 이벤트·캐시 무효화 호출.
  - 검증 스키마 경계값(개수 음수/초과, 미지원 이미지 키).
- **워커(Rust)**:
  - `PoolManager::reconcile` 목표>실제/실제>목표/0 목표 조정 로직(도커 호출은 trait mock).
  - `warm_pool` 역직렬화 하위호환(`None`).
  - 웜 경로 실패 시 콜드 폴백 선택 로직(도커 mock으로 update/exec 실패 주입).
- **E2E/수동(oj 스테이징)**: 웜 on 상태에서 Python/C++/C 제출의 첫 실행 지연이 콜드 대비 감소하는지, 채점 결과·시간/메모리 측정이 콜드와 일치하는지, 관리자 토글이 ~30초 내 반영되는지.
- **회귀 안전**: 웜 풀 off(기본 비활성 배포)에서 기존 채점 경로/테스트가 그대로 통과.

---

## 10. 롤아웃

1. 스키마 + 마이그레이션 `0040_warm_pool.sql`, 공용 타입/정규화(`warm-pool.ts`), 검증.
2. register/heartbeat 응답에 `warmPool` 추가(앱). 워커는 아직 무시 → 무해.
3. 워커 `PoolManager` + 실행 경로 웜 분기 + 콜드 폴백 + 킬스위치.
4. 관리자 UI(폼/탭/서버액션/REST/i18n).
5. oj 기본값(judge-cpp:2, judge-python:2)로 스테이징 검증 → 운영 반영.
- 각 단계는 **웜 풀 off일 때 오늘과 동일**하도록 유지해 언제든 중단/롤백 가능.

---

## 11. 미해결/후속 (이번 스코프 밖)

- 컴파일 단계 웜화, 제출당 컨테이너 재사용.
- per-worker 개별 풀 설정(현재는 배포 전역).
- 부하 기반 동적 오토스케일.
- `admin/workers`에 실시간 풀 점유/유휴 현황 표시.
