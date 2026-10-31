# config/

Non-secret configuration read by the scheduled task (D-026). The primary architecture has **no secrets**: Google access comes from connector OAuth grants, and the model comes from the Claude plan. No API keys or credential files belong here.

| File | Status | Contents |
|---|---|---|
| `run-settings.yaml` | Exists (proposed values; nothing reads it yet) | Delivery mode, go-live date, allowlist, date override, windows (lookback, wait, max age), limits (records per run, attempts, lease, run lock), source spreadsheet/worksheet, Call ID column/header, logs location (OD-18) |
| `sheet_schema.yaml` | Planned (Phase 1) | Verified `Calls DONE` headers A–AC for the header guard; logical field → header mapping (`Date`, `Time of the call`, `Customer Name`, `Email`, `Call lead by(who took the call)`, `Meeting URL`, `Recording URL`, `Recording Sent`, `Meeting Notes`, `Transcript`); excluded internal columns; `Meeting Notes` cancel/no-show patterns (OD-26); `Recording Sent` normalisation (D-022) |
| `email_policy.yaml` | Planned (Phase 2) | Subject template, word limits, banned phrases, allowed links/contacts, signature, language, sensitive-topic policy |

Rules:

- No customer addresses or credentials in committed files. The verified spreadsheet ID and worksheet name are non-secret identifiers; access is controlled by Google permissions.
- Changing `delivery_mode` (e.g. rolling back to `shadow`) is a one-line edit that takes effect at the next run's PREFLIGHT. The scheduled task must read the updated repository version (R-02).
- Policy values are shared by the generation and validation stages so both enforce the same limits.
