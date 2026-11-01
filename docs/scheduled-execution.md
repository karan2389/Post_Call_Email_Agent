# Scheduled Execution (proposed — not configured)

Status: **Proposed (D-026). Nothing has been configured.** No scheduled task exists. This document defines how the daily run is meant to execute and lists every behaviour that must be validated before relying on it. It replaces the former `deployment.md`, whose Cloud Run plan moved to `future-alternatives.md` §4.

## 1. Execution model

| Item | Proposal | Status |
|---|---|---|
| Runner | A **Claude Code scheduled task** using the user's Claude subscription | Proposed |
| Variant | Either a **cloud** scheduled task (runs remotely) or a **desktop** scheduled task (runs on the user's machine through the Claude desktop app). They differ in where the repository lives, whether the machine must be on, and which connectors are reachable | **OD-37.** Preferred: **test the cloud variant first**, if it is available in this environment; fall back to desktop only on evidence. Nothing about either variant is assumed to work until Phase 1 verifies it (`phase1-results.md`) |
| Not assumed | Cowork, other Claude products, and local MCP servers are **not** treated as equivalent to, or reachable from, a scheduled task | — |
| Instructions | The task prompt is short: "follow `workflows/daily-post-call-run.md` in this repository". All rules live in the repository | Proposed; availability of repo files in the session is R-02 |
| Connectors | Native, cloud-accessible Google Sheets and Gmail connectors authorised via Google OAuth | Observed in an interactive session only; scheduled availability is R-01 |
| Model | Selected in the scheduled-task settings; consumes Claude plan usage | Limits are R-09 |

## 2. Schedule

- Once daily at **09:00 Asia/Kolkata**, processing the previous calendar day's calls (D-013). **Cloud routines take UTC only** (cron and `run_once_at`), with a **1-hour minimum interval** (verified from the routine API guidance, Phase 1): 09:00 IST = 03:30 UTC, i.e. `30 3 * * *`. Desktop scheduled tasks use the local timezone instead. Dispatch jitter for routines is unobserved.
- Optional second daily run (e.g. 15:00 IST) for late transcripts (OD-27). Safe because processing is idempotent, but it doubles usage.
- Per-run cap `max_records_per_run` (proposal: 25) to bound context and plan usage. Overflow stays `PENDING` for the next run.

## 3. Environments and delivery modes (D-022)

| Stage | Spreadsheet | `delivery_mode` | Gmail |
|---|---|---|---|
| Phase 1–3 | Read-only on the real sheet (Phase 1 validation; Phase 3 real records, drafts only) or synthetic fixtures (Phase 2) | `dry_run` | None |
| Phase 4 | **Test copy** of the spreadsheet | `test` | Drafts / sends to allowlisted internal addresses only |
| Phase 5 | Real sheet (approved) | `shadow` | None to customers; drafts stored in the logs |
| Phase 6 go-live | Real sheet | `live` with `go_live_date` | Sends to customers for eligible calls on/after the go-live date |

Only `live` may send customer emails. Rollback = set `delivery_mode: shadow` in `config/run-settings.yaml`.

## 4. Validation register (must be tested; do not assume)

| ID | Risk / unknown | How to validate | Pass criterion | Phase |
|---|---|---|---|---|
| R-01 | Can a scheduled task reach the **native** Google Sheets and Gmail connectors during unattended execution? | Scheduled read-only run that lists connector tools and reads `Calls DONE!A1:AD1` | Both connectors available without user interaction | 1 |
| R-02 | Are `CLAUDE.md`, `workflows/`, `skills/`, `config/` available in the scheduled session (repository access, correct branch)? | Run prints the skill versions and settings it loaded | All files read; versions match the repository | 1 |
| R-03 | Can Sheets writes be restricted to approved cells? **Instructions and agent checks do not enforce this.** The connector acts as the authorising user, so protected ranges do **not** restrict a user who is the owner or an allowed editor. Only verified protected-range permissions count | Identify the connector's Google account; inspect the protected ranges; on a **test copy**, attempt a harmless write to a protected cell with that same account and confirm Google rejects it | Protected ranges are in place and a forbidden write is **rejected by Google** for the connector's account. Until then **no write of any kind to the real source sheet** (OD-36) | 1 (assess) / 3 (test copy) / 5 (real sheet gate) |
| R-04 | Can Gmail send **without routine human approval** in a scheduled run? Which permission settings, connector settings or Workspace admin policies control this? | On a test mailbox: scheduled `test`-mode send to an internal address | Send completes unattended, and the controlling setting is documented | 4 |
| R-05 | Persistence across independent sessions | Two consecutive scheduled runs on a test copy | Second run continues from `POST_CALL_EMAIL_LOGS` state; no repeated work | 3 |
| R-06 | Recovery after an interrupted run (session timeout, usage cut-off, connector error mid-run) | Deliberately stop a run mid-record on a test copy | Next run's RECOVER restores consistent states | 3 |
| R-07 | Uncertain Gmail send result without a duplicate. Does `send_message` return message/thread IDs? Can Sent mail be searched by recipient + subject + time through the connector, and how reliably? (No visible reference or header is used, OD-41) | Test sends + a read-only Sent-mail search on a test mailbox, including a simulated lost result | Either positive confirmation works reliably, or every unconfirmed send is routed to **human review** (`SEND_UNCONFIRMED`) with no auto-resend; the review process is exercised once end to end | 4 |
| R-08 | Overlapping runs: can the scheduler start a run while one is active, or can a manual run collide? Timezone of the trigger | Observe scheduler behaviour; test the run lock in `POST_CALL_EMAIL_EVENTS` | At most one active run; trigger fires at 09:00 IST | 1 / 3 |
| R-09 | Claude plan usage: transcripts of 13k–31k characters, ~10–20 calls/day, four skill stages per call, plus retries | Measure usage in shadow runs | Daily run completes within plan limits with headroom; the cap is tuned | 2 / 5 |
| R-10 | How failures are reported and reviewed (scheduled-task run history, notifications, summary rows) | Force a failure in a test run | The failure is visible to a named reviewer within a day (OD-23) | 1 / 5 |
| R-11 | Deterministic steps (date maths, URL parsing, SHA-256 signatures and hashes, UUID generation) cannot be done reliably by the model "in its head" | Check whether the scheduled environment can run small helper scripts; otherwise test model-only fallbacks | Deterministic outputs reproducible on fixtures (OD-38) | 1 |
| R-12 | Customer data in scheduled-session transcripts/history (transcripts, emails pass through the session) | Review where session history is stored, for how long, and who can see it | Company approval of data handling (OD-12) | 1 |
| R-13 | Identity of the connector account: emails are sent from the authorising Google account; the sheet is edited as that user | Confirm which account authorises each connector | Sender identity accepted (OD-39); account has only the needed access | 1 / 4 |
| R-14 | The backup spreadsheet is a recovery copy only (D-029). Its synchronisation, completeness and effect on agent-owned data in column AD are unverified; it could erase AD values (OD-43) | Read-only comparison with the original; confirm synchronisation behaviour with its owner | Synchronisation confirmed not to erase agent-owned data before any source write | 3 / 5
| R-15 | The Phase 3 draft spreadsheet (`1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40`, D-035) is uninspected (worksheet name, headers, access, rows unknown) and will hold real customer data; the connector account that writes it can also edit the source unless it is view-only there, so "read-only source" is procedural | Read-only inspection of both spreadsheets and the connector account's access (R-13); agree headers (OD-45) | Headers match the approved schema, access limited to named leads, connector account view-only on the source or the residual risk accepted in writing | 3

Any behaviour not yet validated is described in the docs as *proposed* or *(validate)*.

### 4a. Phase 1 status (2026-10-31; full detail in `phase1-results.md`)

| ID | Status after the read-only Phase 1 test |
|---|---|
| R-01 | **PARTIAL.** Google Sheets: verified in a manually triggered cloud run (reads only). Gmail: untested in cloud (deliberately not attached or called) |
| R-02 | **Partly verified (Test 2, 2026-10-31).** Test 1 saw an empty directory (no source). With the private repository `karan2389/Post_Call_Email_Agent` as the routine source, the cloud run cloned it and found `CLAUDE.md`, the runbook, settings, Phase 1 results and all four skills with matching versions. Not yet shown: automatic loading of `CLAUDE.md` as instructions, and a full run of the runbook (`docs/phase1-results.md` §5a) |
| R-03 | **Not met.** `Calls DONE` has **no protected ranges**; the connector account is unidentified; routine `permitted_tools` was accepted but **not enforced** (all nine Sheets tools listed in the cloud run). Only verified protected ranges count |
| R-04 | UNVERIFIED (no Gmail calls made) |
| R-05, R-06, R-07 | UNVERIFIED (need test copy, logs worksheets, Gmail) |
| R-08 | PARTIAL: routine cron is in **UTC** with a **1-hour minimum**; 09:00 IST = `30 3 * * *` UTC. Overlap behaviour and dispatch jitter untested |
| R-09 | One data point only: a trivial 3-step cloud run took 17 s. No volume measurement |
| R-10 | PARTIAL: run history and logs are readable through the API; notifications untested |
| R-11 | PARTIAL: `Bash` works in the cloud sandbox; interpreters untested; the date calculation could not be tested against a non-IST clock |
| R-12 | PARTIAL: cloud session logs are stored on claude.ai and retrievable; retention and visibility unknown; transcript reads pull content through the session (F3) |
| R-13 | UNVERIFIED: the connector's Google account is not discoverable from within calls |
| R-14 | UNVERIFIED: the backup has not been inspected; its synchronisation is outside this repository (`docs/backup-recovery.md`)
| R-15 | PARTLY INSPECTED (Phase 3A, 2026-11-01, read-only): the draft spreadsheet is empty (one worksheet, no header, no structures) and the source `Calls DONE` has no protected ranges. UNVERIFIED: the connector account and its Viewer/Editor level on both spreadsheets, and the destination sharing list (`docs/phase3a-preflight-report.md`) **Update (D-038): connector account `karan.s@flexifunnels.com` is Editor on both spreadsheets (confirmed by the user); source write protection NOT enforced; destination sharing unresolved.**

## 5. Cost and dependency policy (D-026)

- **Avoided in the primary design:** a separately billed Anthropic API integration, a separately deployed backend, Google Cloud resources (Cloud Run, Cloud Scheduler, Secret Manager).
- **Not free:** scheduled tasks consume the user's **Claude plan usage**, which is limited. Long transcripts and retries count. The per-run cap and per-record isolation (OD-40) manage this.
- **Connectors** need Google OAuth authorisation and suitable permissions on the spreadsheet and mailbox. They act as the authorising user.
- **Escalation path:** if the scheduled environment cannot meet reliability, volume or control requirements, parts of `future-alternatives.md` may become necessary. That would add cost and needs a new decision.

## 6. Failure reporting

- Every run writes `RUN_STARTED` and `RUN_FINISHED` (or `RUN_ABORTED`) events with counts by status and reason; that gives a daily trail in the spreadsheet.
- Scheduled-task run history/notifications as available (R-10).
- Optional: an internal summary email in `test`/`live` modes to a configured internal address (counts only, no customer content), subject to R-04.
- Reviewer and cadence: OD-23.

## 7. Go-live checklist (Phase 6)

1. R-01 … R-13 validated, or accepted with documented mitigations.
2. Scenario suite (`tests/evals/`) passed on the test copy, 100% on safety cases.
3. Shadow mode reviewed by the CSC team; skip reasons understood.
4. Protected ranges **verified** (R-03, OD-36) before the AD header was created; AD1 header created (approved step).
5. `POST_CALL_EMAIL_LOGS` / `POST_CALL_EMAIL_EVENTS` created (approved step).
6. Uncertain-send human-review process exercised end to end with a named reviewer (OD-41, OD-23); sender identity accepted (OD-39).
7. `go_live_date` agreed; executives briefed to stop manual sends from that date.
8. Management approval; switch `delivery_mode: live`.

## 8. Phase 4 scheduling investigation (2026-11-01, read-only; no task created)

Evidence is the tool descriptions of the desktop `scheduled-tasks` connector, `list_scheduled_tasks` (no tasks exist) and the machine time zone. **Nothing below has been run.**

| Question | Finding | Status |
|---|---|---|
| Where does a desktop scheduled task run? | A new Claude Code session on this machine in the task's working folder, with the task's stored prompt, permission mode and the tool approvals already granted to that routine. The repository (`src/`, `skills/`, `config/`) is therefore available, unlike cloud routines (no remote repo in R-02 Test 1). | from description, **unverified in a run** |
| When does it run? | Only while the Claude desktop app is open; if the app is closed when due, it runs **once on next launch** (missed days are not replayed). Recurring runs get a delay of several minutes. | from description |
| Time zone | Cron is evaluated in the **machine's local time**; this machine is India Standard Time (UTC+05:30), the same as `Asia/Kolkata`, so `0 9 * * *` is 09:00 IST. The target date must still be computed in code (`node src/p3.js target-date`), never from the local clock alone. | verified time zone; behaviour unverified |
| Overlapping runs | `run_scheduled_task` is refused while a run of that task is in progress (manual trigger). Overlap between a late catch-up and a fresh run is **not** prevented by the scheduler; the Send Log (SEND_IN_PROGRESS, send key) is the real safeguard, plus an explicit run lock still to be designed. | partly verified |
| Connector access in an unattended run | Sheets and Gmail are connected in this desktop session. Whether a scheduled run gets the same connectors and approvals without a person present is **untested** (R-01, R-04). | **untested** |
| Interruption and recovery | Each run starts fresh; the durable state is the Send Log and `Sheet1`; recovery reconciles open attempts first and never resends (`docs/phase4-idempotency.md`). | designed and mock-tested |
| Backfill after missed days | not provided by the scheduler; `phase3_discovery_lookback_days` and the idempotent planner can cover a bounded window. | design needed |

**Recommendation (for the user to decide, nothing is created):** a **local desktop scheduled task** in this repository folder, because it can reach the local helpers and skills and the connectors already attached here; a cloud routine cannot read `src/` without a cloned repository and has no tested Gmail path. Trade-offs: the laptop and app must be on at 09:00 (or the run happens at next launch, once), and unattended connector and approval behaviour must be proven first. **Proposed verification, needing the user's approval:** a dry-run-only scheduled task (no Gmail, `writes_enabled` false) that reads the previous day's records, runs `target-date` and the planner, and reports counts; run it once with `run_scheduled_task`, inspect it with `list_task_runs`, and only then consider anything that writes or sends.