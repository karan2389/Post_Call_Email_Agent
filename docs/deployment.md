# Deployment (Planned — not configured)

Status: **Plan only.** Nothing in this document has been created. Implementation is Phase 6 and requires OD-17, OD-22 and OD-23.

## 1. Target

| Component | Plan |
|---|---|
| Compute | Google Cloud Run — **Cloud Run Job** recommended (batch, runs to completion) over a Service (OD-17) |
| Trigger | Google Cloud Scheduler, timezone `Asia/Kolkata` |
| Concurrency | Job parallelism / task count = 1; no overlapping executions |
| Region | To be decided (Mumbai `asia-south1` is a likely candidate — OD-22) |
| Secrets | Secret Manager: Anthropic API key, Google credentials if not using workload identity |
| Identity | Dedicated service account; least privilege (see `security-privacy.md` §5) |
| Logs | Cloud Logging, structured JSON, redacted |
| Alerts | Cloud Monitoring alert on job failure and on `FAILED`/`SEND_UNCONFIRMED` counts (OD-23) |
| Image | Python 3.12 slim base; `skills/` and `config/` baked into the image |

## 2. Schedule (OD-17)

Decided (D-013): **once daily**, processing the previous calendar day's calls in Asia/Kolkata. Recommended trigger: 09:00 IST (`0 9 * * *`, Scheduler timezone `Asia/Kolkata`). An optional second run (e.g. 15:00 IST) can pick up late transcripts the same day (OD-27). Extra runs are safe because processing is idempotent.

## 3. Execution timeout and batch size

- Per-run cap `max_records_per_run` (proposal: 50) to stay well inside the job timeout and API rate limits; records beyond the cap stay `PENDING` for the next run (or the optional second run, OD-27).
- Lease duration > worst-case per-call processing time.

## 4. Environments

| Env | Data | Sending |
|---|---|---|
| local | synthetic | `DRY_RUN=true` |
| pilot | real (approved) | drafts or allowlisted internal recipients |
| production | real | automatic after go-live approval |

## 5. Release checklist (Phase 6+)

1. Unit + recovery tests pass.
2. Evaluation suite passes (100% safety cases).
3. Skill versions bumped and logged.
4. Config reviewed (model IDs, policy, allowlist state).
5. Secrets present in Secret Manager; no secrets in image.
6. Deploy job; run once manually with `DRY_RUN=true`; then enable scheduler.
