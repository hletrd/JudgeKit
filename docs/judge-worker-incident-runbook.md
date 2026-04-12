# Judge worker incident runbook

_Last updated: 2026-04-12_

The judge worker is a privileged trust boundary because it launches sibling judge containers through the Docker proxy path.

## When to use this runbook
- worker starts failing container launches unexpectedly
- worker begins returning malformed or inconsistent execution results
- suspicious Docker activity or image changes are observed
- worker heartbeat/status looks abnormal during an assessment window

## Immediate containment
1. Stop routing new judging load to the affected worker.
2. Preserve logs and current worker/admin audit evidence.
3. If compromise is suspected, rotate judge credentials and inspect recent image changes.
4. Prefer replacing the worker instance over trying to patch a suspect live host in place.

## Investigation checklist
- review worker logs and recent admin Docker activity
- inspect recent language/image configuration changes
- inspect Docker daemon / proxy access path
- verify whether affected submissions were already partially judged and need requeue/review

## Recovery goals
- restore a known-good worker instance
- revalidate judging consistency on a small smoke set before resuming full load
- document any affected assessment windows and operator actions taken
