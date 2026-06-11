# 03. 판정 엔진 (v3)

## 총평 (★★★★☆)

Rust 기반 저지 워커와 Docker 샌드박싱은 **기술적으로 우수**하다. v2와 동일하게 평가한다. 견고하고 안전하며 확장 가능한 구조다. 경쟁 프로그래밍에서 요구하는 고급 판정 기능 중 **2개**(Special Judge, 서브태스크)만 여전히 누락되어 있다.

---

## 아키텍처

### 강점

**Rust 저지 워커** (`judge-worker-rs/`)
- C/C++로 작성된 전통적 저지(BOJ의 뼈대) 대비 메모리 안전성과 성능이 보장
- 비동기 처리로 다수의 채점을 동시에 처리
- Semaphore 기반 동시성 제어
- Exponential backoff로 idle polling 최적화
- Graceful shutdown 처리
- CPU 탐지 (ARM/x86) 및 상세 모델 조회
- 하트비트 메커니즘으로 워커 건강 상태 추적

**Docker 샌드박싱** (`docker/`)
- seccomp 프로파일, 네트워크 차단, 리소스 제한 — 보안이 철저
- AMD64/ARM64 양쪽 지원 — Apple Silicon, AWS Graviton 등에서 실행 가능
- 언어별 독립 컨테이너 — 한 언어의 취약점이 다른 언어에 영향을 주지 않음

**분산 아키텍처**
- 워커 등록 + 하트비트로 여러 대의 저지 워커 운영 가능
- 앱 서버와 저지 워커의 분리 배포 가능
- PostgreSQL advisory lock으로 원자적 제출 클레임 (`FOR UPDATE SKIP LOCKED`)

**채점 큐 상태 표시가 있다** (v2 정정)
`LiveSubmissionStatus` 컴포넌트에서 큐 위치(`queuePosition`)와 현재 채점 중인 테스트케이스(`gradingTestCase`)를 표시한다. 5초 폴링. v2가 "채점 큐 상태 표시 불확실"이라고 했으나, **구현되어 있다**.

### 아쉬운 점

**채점 파이프라인의 투명성이 부족하다.**
- 컴파일 → 실행 → 출력 비교 → 결과의 각 단계에서 무슨 일이 일어나는지 사용자에게 불투명
- Circuit breaker 패턴이 없어 워커 장애 시 무한 대기 가능
- Dead letter queue가 없어 실패한 제출이 묻힐 수 있음

---

## 판정 결과 (Verdict) 품질

### 지원되는 결과
- AC (Accepted) — 정답
- WA (Wrong Answer) — 오답
- TLE (Time Limit Exceeded) — 시간 초과
- MLE (Memory Limit Exceeded) — 메모리 초과
- RE (Runtime Error) — 런타임 에러
- CE (Compilation Error) — 컴파일 에러

### 상세 피드백 (v2 정정)

v2가 "WA에서 어느 케이스에서 틀렸는지 모름", "TLE에서 실제 시간 안 보여줌", "RE 종류 구분 안 함"이라고 했으나, **`showDetailedResults=true`(기본값)일 때 모두 표시된다**:

- WA: 실패한 테스트케이스 인덱스, 점수
- TLE: 실행 시간 vs 시간 제한 비교
- RE: Segfault, Division by Zero, Stack Overflow 등 에러 종류 구분
- CE: 컴파일 에러 메시지
- `showRuntimeErrors`, `showCompileOutput`도 문제별 설정 가능

이것은 **BOJ보다 상세한 피드백**이다. BOJ는 WA 시 어떤 케이스에서 틀렸는지 절대 알려주지 않는다.

### 여전히 치명적 누락

**1. Special Judge (checker) 미지원 — P0**
경쟁 프로그래밍에서 special judge는 **선택이 아닌 필수**다. 정답이 하나가 아닌 문제(최적해 출력, 가능한 해 중 아무거나, 답이 여러 개인 경우)를 출제하려면 반드시 필요.

현재 Rust 워커는 exact match 또는 floating-point 비교만 지원. 출제자가 checker 프로그램을 작성하여 판정하는 인터페이스가 없다.

영향:
- 최적해 문제 출제 불가
- Constructive 문제 출제 불가
- 다중 정답 문제 출제 불가
- 경쟁 프로그래밍 대회 문제의 약 30%가 special judge를 요구

**2. 인터랙티브 문제 미지원 — P1**
출제자의 프로그램(인터랙터)과 참가자의 프로그램이 실시간으로 통신하는 문제. Docker 실행 환경에서 인터랙터와의 IPC(파이프/소켓)가 구현되어 있지 않다.

**3. 서브태스크 / 그룹 채점 미지원 — P0**
IOI 스타일 문제의 서브태스크별 부분 점수. 테스트케이스에 그룹 ID와 점수를 부여하는 구조가 없다.

---

## 언어 지원 (★★★★★)

### 장점
- **124개 언어 변형** 지원. BOJ(~60), Codeforces(~60), LeetCode(~30)의 2배.
- Docker 컨테이너 기반이므로 언어 추가가 용이
- PyPy 포함 (v2가 "PyPy 지원 필요 (P2)"라고 했으나 이미 있음)
- 언어별 버전 핀닝이 정확함
- 한국어 이색 언어: 아희(Aheui), 혀엉(Hyeong), 엄준식(Umjunsik)

### 주의 필요
- **C++ 최적화**: `-O2` 플래그가 기본인지 확인 필요. 경쟁 프로그래밍에서는 C++ `-O2`가 표준.
- **Java**: `Main` 클래스명 강제 여부 확인 필요.

---

## 코드 유사도 (안티치트) (★★★☆☆)

### code-similarity-rs
- Rust 구현의 Jaccard n-gram 분석
- rayon + ahash로 병렬 처리
- 속도와 정확도의 균형이 좋을 것으로 보임
- 하지만 **의미적 유사도**(변수명 변경, 코드 재구조화)는 탐지하지 못함

### 실시간 모니터링
- 대회 중 부정행위 실시간 감지가 약함
- anti-cheat events 테이블은 있으나, 실시간 대시보드와 경고 시스템이 약함

---

## 개선 제안

| 우선순위 | 기능 | 이유 | 예상 난이도 |
|----------|------|------|-------------|
| P0 | Special Judge (checker) | 없으면 대회 출제가 제한됨 | 중간 |
| P0 | 서브태스크 / 그룹 채점 | IOI 모드 필수 | 중간 |
| P1 | 인터랙티브 문제 | 현대 대회 빈출 | 높음 |
| P2 | 실시간 안티치트 대시보드 | 대회 운영 | 중간 |
| P2 | 출력 전용 문제 완성 | IOI | 중간 |
| P3 | C++ 컴파일 옵션 커스터마이징 | 파워 유저 | 낮음 |
| P3 | 의미적 코드 유사도 분석 | 고급 안티치트 | 높음 |
