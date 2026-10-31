# config/

Non-secret configuration only. Secrets come from environment variables (local `.env`, git-ignored) or Secret Manager (production). See `.env.example` for variable names.

No configuration files exist yet; they are created in Phase 1. Planned files:

| File | Contents |
|---|---|
| `settings.example.yaml` | Timezone (`Asia/Kolkata`), `target_date_offset_days`, `discovery_lookback_days` (OD-24), `transcript_wait_days` (OD-25), `max_followup_age_days`, `max_records_per_run`, `llm_failure_threshold`, lease duration, retry limits/backoff, environment flags. Placeholders only. |
| `sheet_schema.yaml` | Maps logical fields (`customer_email`, `transcript`, `call_status`, …) to real column headers; call-date format and `call_status` values for cancelled/no-show (OD-01, OD-26, OD-28) |
| `email_policy.yaml` | Subject template, word limits, banned phrases, allowed links, allowed support contacts, signature block, language, sensitive-topic policy (OD-08, OD-09, OD-11) |
| `eligibility.yaml` | Eligible call types, minimum transcript length, truncation threshold (OD-10) |

Rules:

- No model IDs until confirmed (OD-12); they are environment variables, not YAML defaults.
- No real spreadsheet IDs, addresses or credentials in committed files — use `*.example.yaml` with placeholders; real values via environment.
- Policy values are shared by the generation and validation stages so both enforce the same limits.
