# Persona: Platform Admin (settings, users, capacity, ops) — RPF Cycle 1 (2026-06-11)

**Seat:** the operator running worv/auraedu/algo instances: app server +
dedicated judge worker host. **HEAD:** f977ef4c.

## Ops posture — materially better this cycle
- **Dead-worker detection finally autonomous:** background staleness sweep
  (7e198b51) + alertable reap log line (4e836c4a) + reclaim releases the dead
  worker's slots (ed73a23b). Previously a crashed single worker stayed
  "online" forever and admin-health lied to me.
- **Boot-time failure surfacing:** NODE_ENCRYPTION_KEY required at startup
  (a5e66736) instead of a runtime 500 the first time SMTP settings decrypt;
  JUDGE_ALLOWED_IPS unset now warns at startup (5f27c37e).
- **Backups I can trust:** verify-db-backup.sh does a REAL restore into a
  scratch DB when given a DSN (abfa90f5).
- **Audit trail survives crashes** for role/settings changes
  (recordAuditEventDurable, db514bda) and audit events are actually pruned at
  90 days now (39394420/39420539) — my retention policy doc is finally true.
- **Capacity knobs:** output cap / compile limits env-configurable
  (f44baab6/86999c13) — I can bound worker RAM on the 16 GB host; gVisor
  runtime is one env var away when I want syscall isolation (b3497c75,
  installer script + doc shipped, default OFF).

## Findings from this seat

### AD1 (MEDIUM, onboarding/incident, confidence High — verified)
The boot gate added for NODE_ENCRYPTION_KEY is correct, but the variable is
documented NOWHERE an operator looks: not in `.env.example`, not in
`.env.production.example`, not in `docs/deployment.md` (which documents the
*different* `PLUGIN_CONFIG_ENCRYPTION_KEY`). A new tenant following the docs
gets a crash-looping app container. The error message is good; the docs path
into it is broken. (= document-specialist DS2.) Cheap fix, do it this cycle.

### AD2 (MEDIUM, capacity hygiene, confidence Medium-High)
The self-reclaim `active_tasks` leak (code-reviewer CR1) presents to ME as a
single-worker fleet that gradually "loses" concurrency after long-compile
incidents — exactly the kind of slow corrosion I'd misdiagnose as load. The
sweep only heals it if the worker goes fully silent; a healthy-but-leaked
worker needs a restart. Fix the accounting (CR1) rather than documenting a
restart ritual.

### AD3 (LOW, settings UX, confidence Medium)
The two new restricted-mode override checkboxes
(allowAiAssistantInRestrictedModes / allowStandaloneCompilerInRestrictedModes)
are global kill-switches for exam-mode protections with no "currently
overriding N restricted contexts" indicator (designer UX2 / critic #5). They
are durable-audited (good — I can reconstruct who flipped them), but
prevention beats forensics for this one.

### AD4 (LOW, monitoring, confidence Medium)
The reap log line is alertable, but my alerting today keys on Prometheus
`judgekit_judge_workers{status=...}` scrape + log greps. The runbook
(`docs/judge-worker-incident-runbook.md`) should name the exact new log
message (`"staleness sweep reaped unresponsive worker(s) to offline"`) as the
trigger signature so whoever wires Loki/grep alerts uses the stable string.
Doc-only.

## Upgrade/deploy story (per CLAUDE.md constraints)
- `deploy-docker.sh` policies hold: algo stays app-only
  (SKIP_LANGUAGES/BUILD_WORKER_IMAGE/INCLUDE_WORKER encoded in
  .env.deploy.algo), secret_token drop verified loudly (c9f74b9a), no
  forbidden prune commands anywhere in scripts (re-grepped this cycle).
- IOI run-all flag required a worker-image rebuild — done on worker-0 per the
  remediation log; flag is inert for any tenant that hasn't rebuilt
  (backward-compatible serde default). Correct rollout design for the
  two-host topology.

## User management / capacity
- users/[id] permanent delete now scrubs recruiting PII transactionally
  (16212175) — GDPR/PIPA erasure is honest. Retention pruning covers 6 tables
  with legal-hold override.
- **source_drafts has no retention/pruning and accepts arbitrary language
  keys** (security S1) — from my seat that's unbounded DB growth I'd discover
  via backup-size creep. Endorse S1's fix + add a retention line.

## Verdict
Strongest ops cycle so far (sweep, durable audit, backup restore-test,
boot gates). Action items: AD1 docs fix now, CR1 accounting fix now, S1 now;
AD3/AD4 low.
