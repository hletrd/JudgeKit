# Exam integrity model

_Last updated: 2026-04-12_

JudgeKit currently uses an **integrity telemetry** model, not a full proctoring model.

## What the platform does today
- records browser focus/tab-switch signals
- records copy/paste/context-menu style signals
- supports code-similarity review workflows
- preserves timing/progress/submission history for human review

## What these signals mean
These signals are **advisory**. They are useful review inputs, but they are not proof of misconduct on their own.

## Recommended evidence model
1. Start from the assumption that any single signal may be noisy or explainable.
2. Corroborate with submission history, timestamps, problem context, and any relevant human explanation.
3. Reserve serious sanctions for cases where multiple pieces of evidence align.

## Implication for high-stakes use
If you need stronger assurance for formal exams or public contests, you should add operational controls beyond the current browser-event telemetry model.

## Review tiers
- **Context** — ambient telemetry such as periodic heartbeats. Useful for timeline reconstruction, not suspicion on its own.
- **Signal** — browser-behavior events such as tab switches or copy/paste that may justify closer review but still need corroboration.
- **Escalate** — stronger anomalies such as code-similarity findings or IP-change patterns that merit deeper human investigation.
