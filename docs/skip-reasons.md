# Skip, Deferral and Failure Reason Codes

Every non-sent outcome carries a code from this file. Add new codes here **before** using them in code.

| Outcome | Status | Meaning |
|---|---|---|
| **Deferred** | `PENDING` + `pending_reason` | Data may still arrive. Rechecked every run until `pending_until`; then becomes `SKIPPED` with the **same code**. |
| **Skipped** | `SKIPPED` + `reason_code` | Data, policy or content reason that will not change. Terminal. Not retried (manual reprocess only, OD-20). |
| **Failed** | `FAILED` + `reason_code` | Technical reason. Retryable where marked (see `delivery-state-machine.md` §8). |

Type column: **D** = deferrable (waits, then skips on expiry), **T** = terminal skip, **R** = retryable failure, **F** = non-retryable failure.

## 1. Identity and duplicates

| Code | Type | Stage | Meaning |
|---|---|---|---|
| `MISSING_CALL_DATETIME` | T | Filter | Call date empty, unparseable or ambiguous; cannot be matched to a target date |
| `INVALID_CALL_ID` | T | Filter | `call_id` cell present but malformed; never auto-overwritten |
| `DUPLICATE_SOURCE_ROW` | T | Duplicates | Same `source_fingerprint` or Fathom ID as another call already sent or in progress |
| `DUPLICATE_ALREADY_SENT` | T | Duplicates | Defensive: Call ID already `SENT` (should be unreachable because of the terminal guard) |
| `SOURCE_ROW_MISSING` | T | Eligibility | Log row exists but its source row can no longer be found by Call ID |

## 2. Call outcome (cancelled / no-show)

| Code | Type | Stage | Meaning |
|---|---|---|---|
| `CALL_CANCELLED` | T | Eligibility | Source `call_status` says cancelled |
| `CUSTOMER_NO_SHOW` | T | Eligibility or Analysis | Source `call_status` says no-show, or the transcript shows the customer never joined |

## 3. Data completeness

| Code | Type | Meaning |
|---|---|---|
| `MISSING_CUSTOMER_NAME` | D | Name empty (no generic greeting in MVP) |
| `MISSING_CUSTOMER_EMAIL` | D | Email empty |
| `INVALID_CUSTOMER_EMAIL` | D | Not a single syntactically valid address (may be corrected in the sheet) |
| `MISSING_FATHOM_URL` | D | URL empty |
| `INVALID_FATHOM_URL` | D | Not an HTTPS URL on an allowed Fathom host |
| `FATHOM_NOT_SHAREABLE` | D | Recording is not confirmed as viewable by the customer (OD-04) |
| `MISSING_TRANSCRIPT` | D | Transcript not yet available — the most common deferral |
| `TRANSCRIPT_POSSIBLY_TRUNCATED` | T | Length at/near the 50,000-character cell limit, or ends abruptly at the limit |
| `TRANSCRIPT_TOO_SHORT` | T | Below minimum length (threshold OD-10); usually a no-show or failed recording |

## 4. Policy and eligibility

| Code | Type | Meaning |
|---|---|---|
| `RECORDING_ALREADY_SENT` | T | *Proposed (OD-29):* source `Recording Sent` is `yes` (any case), so an agent already emailed the recording manually |
| `CUSTOMER_OPTED_OUT` | T | `email_opt_out` is true (inactive: no opt-out column in the verified sheet) |
| `CALL_TYPE_EXCLUDED` | T | `call_type` not in the eligible list (OD-10) |
| `CALL_TOO_OLD` | T | Call older than `max_followup_age_days`; applies to retries of failed records |
| `RECIPIENT_NOT_ALLOWLISTED` | T | Allowlist mode active and recipient not on it (test/pilot only) |

## 5. Analysis outcomes

Produced by the transcript-analysis skill's `skip_recommendation`. All terminal (T).

| Code | Meaning |
|---|---|
| `TRANSCRIPT_INCOMPLETE` | Conversation clearly cut off, missing large parts, or unintelligible |
| `INSUFFICIENT_CONTENT` | No substantive support discussion (greetings only, wrong number, test call) |
| `CUSTOMER_NO_SHOW` | Customer never joined (see §2) |
| `NOT_A_SUPPORT_CALL` | Internal, sales or other non-support call |
| `MULTIPLE_CUSTOMERS_AMBIGUOUS` | Several customers on the call and recipient cannot be matched with confidence |
| `SENSITIVE_TOPIC_REQUIRES_HUMAN` | Refunds, compensation, legal threats, account security, disputed cancellations (policy OD-11) |
| `ANALYSIS_LOW_CONFIDENCE` | Model could not classify outcomes reliably |
| `LANGUAGE_UNSUPPORTED` | Transcript language outside policy (OD-08) |

## 6. Validation

| Code | Type | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | T | One or more blocking issues; details in `validation_issue_codes`; rejected draft stored in `email_body` |

## 7. Technical

| Code | Type | Meaning |
|---|---|---|
| `LLM_API_ERROR` | R | Anthropic API error (5xx, connection) |
| `LLM_RATE_LIMITED` | R | 429 / overloaded |
| `LLM_TIMEOUT` | R | Request exceeded timeout |
| `LLM_OUTPUT_INVALID` | R | Output not valid JSON / schema mismatch after in-run retry |
| `SHEETS_API_ERROR` | R | Read/write failure on Google Sheets (record-level), or run abort at fetch |
| `GMAIL_TRANSIENT_ERROR` | R | 5xx / quota; message not accepted |
| `UNEXPECTED_ERROR` | R | Unhandled exception inside a record's error boundary (sanitised detail); the run continues with other records |
| `GMAIL_SEND_ERROR` | F | Definite rejection (e.g. invalid recipient) |
| `GMAIL_AUTH_ERROR` | F | Credentials/permission problem; no further records claimed this run |
| `SEND_UNCONFIRMED` | F | Could not confirm whether the email was sent; manual review |
| `CONFIG_ERROR` | F | Missing/invalid configuration, skill file or `TARGET_DATE`; run aborts |
| `RETRY_LIMIT_EXCEEDED` | F | Retryable failure hit `max_attempts` |

## 8. Event types (not reason codes)

Recorded in `POST_CALL_EMAIL_EVENTS.event_type`:

`RUN_STARTED`, `RUN_FINISHED`, `RUN_ABORTED`, `PROCESSING_HALTED` (circuit breaker or Gmail auth), `TRANSITION`, `DEFERRED` (recheck of a waiting record), `WAIT_EXPIRED`, `LEASE_EXPIRED`, `RECONCILED_SENT`, `TRACKING_WRITE_ERROR`.
