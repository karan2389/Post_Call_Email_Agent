# Scheduling investigation: Windows Task Scheduler versus the Claude desktop scheduled task (C0, D-068)

Read-only investigation on 2026-11-02. **No task was created and scheduling is not approved.** Proposed run time for discussion: 12:00 IST (`0 12 * * *`, the machine is on India Standard Time).

## 1. Evidence gathered (this machine)
- `claude` CLI 2.1.126 is installed (`C:\Users\karan\.local\bin\claude.exe`) and supports `-p/--print`, `--allowedTools`, `--permission-mode`, `--mcp-config`, `--dangerously-skip-permissions`.
- **`claude mcp list` reports "No MCP servers configured."** The Gmail and Google Sheets connectors used in the desktop app are therefore **not visible to a command-line run**.
- Windows Task Scheduler service is running; no existing task mentions claude or post-call. The machine is Windows 11 Home with S3 standby and hibernate (a scheduled run needs wake handling).
- `.env` permissions (icacls): inherited from `C:\`, granting **Users: read** and **Authenticated Users: modify** in addition to Administrators and SYSTEM. Any local account could read or change it.
- The desktop `scheduled-tasks` connector exists and lists no tasks (earlier findings: `docs/scheduled-execution.md` section 8).

## 2. Comparison
| Question | Windows Task Scheduler + `claude -p` | Claude desktop scheduled task |
|---|---|---|
| Claude and connectors unattended | Claude runs, **but the Gmail and Sheets connectors are not available to the CLI** (no MCP servers configured). Making them available would mean adding MCP servers with their own authorisation, which is credential setup that has not been authorised. A job started this way could not read the source sheet or send mail. | Runs a new session in this repository with the connectors attached to the desktop app. **Unattended connector and approval behaviour is untested** (R-01, R-04). |
| Gmail authentication surviving session closure | Not applicable until connectors exist for the CLI. | The authorisation is held by the connector service for the Claude account, not by this local session (inference, **unverified**). If it expires, the run must fail closed (no send), because reconnecting needs a person. |
| Machine and app must be on | The machine must be awake (wake timer) but the app need not be open. | The desktop app must be open; a missed run happens **once** on next launch; days are not replayed. |
| `.env` protection | Same file; a service account would need read access. | Same file. **Was weak (see 1); fixed 2026-11-02 (D-069):** `.env` is now restricted to the owner, Administrators and SYSTEM, and the unused Brevo key was removed from it (the user still revokes the key in Brevo). The Gmail-only path needs no environment variables. |
| Overlapping runs | Task setting "do not start a new instance" (`MultipleInstances = IgnoreNew`) plus a lock file. | `run_scheduled_task` refuses a second manual run; a late catch-up run is not prevented. The Send Log (`SEND_IN_PROGRESS`, unique send keys) is the real safeguard; add an `O_EXCL` lock file in `local/` with a stale timeout (not built). |
| Missed runs | "Start the task as soon as possible after a missed start" (`StartWhenAvailable`) and wake-to-run; backfill is not provided. | Once on next launch; backfill is not provided. For both, a bounded lookback window with the idempotent planner and send keys avoids gaps and duplicates. |
| Failure reporting | Last Run Result and the Windows event log; nothing notifies anyone. | `list_task_runs` history; no notification. |
| Fit with the architecture | Poor today (no connectors). | Best available, but unproven unattended. |

## 3. Failure reporting design (proposed, not built)
- Every run ends with a one-screen summary (counts and codes only, no customer data): examined, sent, blocked, reconciliation required, errors.
- The summary is written to the run history and, once internal sending is authorised for it, emailed to an internal address through the Gmail connector. A missing summary by a set time is itself the failure signal, checked by a named person.
- Any `RECONCILIATION_REQUIRED`, `SEND_FAILED`, or connector authentication failure stops sending for that run and is surfaced the same day.

## 4. Conclusions and options
1. **Windows Task Scheduler with `claude -p` is not viable with the current connectors.** It would need new connector or credential setup that is not authorised.
2. **Recommended path (unchanged):** a local desktop scheduled task, first as a **dry-run-only** task (no Gmail send, `writes_enabled` false) to prove unattended connector access, then reassess. It needs the user's explicit approval to create.
3. **Not yet investigated:** a cloud routine. The repository now has a private GitHub remote, which earlier blocked cloud use (R-02); whether a cloud routine can clone it, run `node` helpers and reach Gmail is unverified.
4. Decisions needed from the user: run time (12:00 IST proposed), who watches the failure signal, whether to fix `.env` permissions or remove the Brevo key.
