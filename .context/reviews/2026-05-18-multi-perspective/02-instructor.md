# 강사 관점 리뷰 — 2026-05-18

## 어제 → 오늘 fix 추적

| 어제 짚은 이슈 | 오늘 상태 |
|---|---|
| `submissions.view_all`로 instructor가 다른 그룹 대회까지 봄 | ✅ fix (`getContestsForUser` 권한 좁힘) |
| 비공개 대회 URL에서 권한 없는 사용자 404 | ✅ fix (인라인 access-code gate) |
| 대회 참가자 목록 확인 불가 | ✅ fix (`/api/v1/contests/[id]/participants` + UI) |
| 일반 제출 → 단일 활성 과제 자동 라우팅 | ✅ fix |
| 학생 제출 메타데이터 cross-group 누수 | ✅ fix |

## 여전히 남은 이슈 (어제와 동일)

### 🔴 개별 학생 마감 연장 부재 (High)
`assignment_user_extensions` 테이블 미존재. 진단서·결석 등 학사 운영 사실상 필수.

### 🔴 CSV 로스터 임포트 부재 (High)
JSON `{userIds, usernames}`만 받음. 200명 클래스 학기마다 수동.

### 🔴 테스트 케이스 잠금 해제 권한이 `problems.delete` (Med-High)
일반 강사가 버그 테스트 못 고침.

### 🟡 LMS(Canvas/Blackboard) 연동 부재 (Med-High)
CSV는 plain. 한국 대학 e-class/LearnUs 매핑 수동.

### 🟡 그룹 공지·이메일 발송 부재 (Med)
discussion 외 채널 없음.

### 🟡 표절 트리아지 워크플로 없음 (Med)
similarity 결과는 `antiCheatEvents`만, 페어별 리뷰 UI 없음.

### 🟡 Bulk rejudge 50건 cap (Med)
300명 수업 재채점 시 6번 반복.

### 🟡 서브태스크 / Special Judge / Interactive 미지원 (Med-High)
README는 "IOI scoring"이라지만 `comparisonMode`는 `exact`/`float`만. 진짜 IOI 운영 불가.

### 🟡 과제 draft/preview 분리 없음 (Low-Med)
오타 채로 즉시 노출.

### 🟡 타임존이 시스템 전역 (Med)
과제·사용자 단위 TZ 없음.

### 🟡 강사 audit-log 범위 누락 (Med)
공동 강사 활동이 lead instructor에게 안 보임.

### 🟡 자동 채점 정확도 검증 도구 부재 (Med, 대회 운영 시 중요)
"정답 코드 업로드 → 모든 케이스 검증" 빌트인 없음.

### 🟢 문제 풀이 통계(케이스별 실패율) 누락 (Low)
strangepass 어디서 가장 많이 막혔는지 visualization 부재.

## 대회 운영 관점 (어제 동일)

### 🔴 Frozen leaderboard 자동 해제 없음 (High)
한 번 동결되면 영원히. `freezeUntil` 또는 `deadline + N분` 자동 unfreeze 필요.

### 🟡 클래리피케이션 푸시·알림 없음 (Med)
폴링 only.

### 🟡 ICPC 동점 처리 비표준 (Low, 문서화 필요)

### 🟢 첫 풀이 풍선·라이브 알림 (Low, 가시적 효과 큼)

### 🟡 anti-cheat 프로파일 분리 (Med)
시험 vs 대회 vs 팀 콘테스트가 같은 모델 → 팀 대회는 false positive 폭주.

## 오늘 새로 본 강사 측 이슈

### 🟡 채점 시스템 헬스 가시화 부재 (Med-High, 운영 사고 회피용)
오늘 14h 동안 모든 제출이 `compile_error`로 잘못 채점된 사고 발생. docker-socket-proxy 설정으로 워커가 컨테이너 못 띄움 → 채점 0%. 워커 컨테이너 healthcheck는 자기 HTTP만 보기 때문에 운영자에게 `Up (healthy)`로 표시됨. 강사 입장에선 "왜 학생 제출이 다 compile error지?"로 보임.
- **수정**: 워커 healthcheck에 end-to-end smoke (`docker run hello-world` 같은) 포함. 또는 admin/dashboard에 "최근 1시간 verdict 분포"가 정상에서 벗어나면(예: compile_error 비율 > 80%) 경고.

### 🟡 대회/시험 동일 워커 풀 격리 부재 (Med)
오늘 algo 워커 docker-proxy도 같은 잠금. 운영 fleet 전체가 같은 설정 drift에 취약. 호스트별 격리·redundancy 없음.

### 🟡 강사용 대시보드의 "지금 채점 중" 가시화 부족 (Low)
admin 대시보드엔 워커 슬롯/active_tasks 있지만 강사 대시보드엔 없음. 강사가 자기 과제 채점 상태를 보려면 학생 개별 제출 페이지 들어가야 함.

## Show-stopper

- **frozen leaderboard 자동 해제 부재** — 다음 대회 운영 전 무조건 fix.
- **개별 학생 마감 연장** — 학사 운영 사실상 필수.
- **CSV 로스터 임포트** — 학기 시작마다 수동.

## 추천 작업 순서 (어제 + 오늘 새 항목)

1. 채점 시스템 end-to-end 헬스 + verdict 분포 알림 (오늘 사고 재발 방지)
2. 개별 학생 마감 연장
3. CSV 로스터 임포트
4. Frozen leaderboard 자동 해제
5. 테스트 케이스 잠금 해제 권한 완화
6. Bulk rejudge cap 제거
7. 서브태스크 / Special Judge
