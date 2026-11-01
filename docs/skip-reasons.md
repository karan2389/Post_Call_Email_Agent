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
| `INVALID_CALL_ID` | — | Filter | `POST_CALL_CALL_ID` cell holds a malformed value; never overwritten. Recorded as an event, not a log row (no valid key) |
| `DUPLICATE_CALL_ID_IN_SOURCE` | T | Filter / Duplicates / pre-send | The same Call ID appears in more than one source row (e.g. a copied row); none is processed; human review |
| `DUPLICATE_SOURCE_ROW` | T | Duplicates | Same `source_fingerprint` (email + date + time) as another call already sent, in progress, or earlier in the snapshot — the same booking entered twice |
| `FINGERPRINT_COLLISION` | T | Duplicates | Phase 3 (D-036, proposed): two or more records have an identical fingerprint (normalised call date + call time + customer email) and are not clearly the same call, or a stored draft's fingerprint matches a record with a different recording URL set. None is merged or discarded and no draft is generated; each involved record gets a review row until a human resolves it (OD-46) |
| `RECORDING_URL_CONFLICT` | T | Duplicates | A recording URL in this row also appears in another row with a different fingerprint; rows are not assumed to be the same call; human review (OD-31) |
| `DUPLICATE_ALREADY_SENT` | T | Duplicates | Defensive: Call ID already `SENT` (should be unreachable because of the terminal guard) |
| `SOURCE_ROW_MISSING` | T | Eligibility / pre-send | Log row exists but its source row can no longer be found by Call ID, and a cleared ID could not be safely restored |

## 2. Call outcome (cancelled / no-show)

| Code | Type | Stage | Meaning |
|---|---|---|---|
| `CALL_CANCELLED` | T | Eligibility | `Meeting Notes` matches a cancelled pattern (OD-26) |
| `CUSTOMER_NO_SHOW` | T | Eligibility or Analysis | `Meeting Notes` matches a no-show pattern, or the transcript shows the customer never joined |

## 3. Data completeness

| Code | Type | Meaning |
|---|---|---|
| `MISSING_CUSTOMER_NAME` | D | Name empty (no generic greeting in MVP) |
| `MISSING_CUSTOMER_EMAIL` | D | Email empty |
| `INVALID_CUSTOMER_EMAIL` | D | Not a single syntactically valid address (may be corrected in the sheet) |
| `MISSING_FATHOM_URL` | D | `Recording URL` empty or whitespace-only |
| `INVALID_FATHOM_URL` | D | At least one token in `Recording URL` is not a valid `https://fathom.video/share/<token>` URL; flagged for review, never silently dropped; no partial-recording email (D-025) |
| `FATHOM_NOT_SHAREABLE` | D | A recording segment is not confirmed as viewable by the customer (OD-04) |
| `MISSING_TRANSCRIPT` | D | Transcript not yet available — the most common deferral |
| `TRANSCRIPT_POSSIBLY_TRUNCATED` | T | Length at/near the 50,000-character cell limit, or ends abruptly at the limit |
| `TRANSCRIPT_TOO_SHORT` | T | Below minimum length (threshold OD-10); usually a no-show or failed recording |

## 4. Policy and eligibility

| Code | Type | Meaning |
|---|---|---|
| `RECORDING_ALREADY_SENT` | T | Source `Recording Sent` is `yes` (any case): a support executive already emailed the recording (D-022). Checked at eligibility and again right before sending |
| `RECORDING_SENT_STATUS_UNCLEAR` | T | `Recording Sent` holds a value other than yes / no / empty; human review (D-022) |
| `BEFORE_GO_LIVE` | T | `live` mode and the call date is before `GO_LIVE_DATE`; the call belongs to the manual process (D-022) |
| `DRAFT_ONLY_MODE` | T | `shadow` or `dry_run` mode: the email was generated and validated but intentionally not sent; draft kept in `email_body` (D-022) |
| `CUSTOMER_OPTED_OUT` | T | `email_opt_out` is true (inactive: no opt-out column in the verified sheet) |
| `CALL_TYPE_EXCLUDED` | T | `call_type` not in the eligible list (inactive: no call-type column; OD-10) |
| `CALL_TOO_OLD` | T | Call older than `max_followup_age_days`; applies to retries of failed records |
| `RECIPIENT_NOT_ALLOWLISTED` | T | `test` mode and recipient not on `RECIPIENT_ALLOWLIST` |

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
| `LENGTH_REVIEW_REQUIRED` | T | The email body is above `human_review_above_words` (350, `config/email_policy.yaml`). Everything else may be valid; a human reviews and sends or edits it. The draft is stored in `email_body` (D-031) |

## 7. Technical

Code names are kept stable for the log schema and dashboard. Their meanings now refer to the scheduled-task runtime (D-026).

| Code | Type | Meaning |
|---|---|---|
| `LLM_API_ERROR` | R | The Claude model was unavailable or errored during a skill stage |
| `LLM_RATE_LIMITED` | R | Claude plan usage limit reached during the run (R-09) |
| `LLM_TIMEOUT` | R | A stage did not complete (session time limit, interrupted session) |
| `LLM_OUTPUT_INVALID` | R | Stage output not valid JSON / schema mismatch after one in-run retry |
| `SHEETS_API_ERROR` | R | Google Sheets connector read/write failure (record-level), or run abort at fetch |
| `GMAIL_TRANSIENT_ERROR` | R | Gmail connector error where the message was **not** accepted |
| `UNEXPECTED_ERROR` | R | Any other error inside one record's processing (sanitised detail); the run continues with other records |
| `GMAIL_SEND_ERROR` | F | Definite rejection (e.g. invalid recipient) |
| `GMAIL_AUTH_ERROR` | F | Gmail connector authorisation or permission problem (incl. a send blocked pending approval, R-04); no further records claimed this run |
| `SEND_UNCONFIRMED` | F | Delivery could not be positively confirmed. **Human review required**; the Call ID is blocked from any further send until a person records `CONFIRMED_SENT` or `CONFIRMED_NOT_SENT` (OD-41, `delivery-state-machine.md` §5) |
| `CONFIG_ERROR` | F | Invalid run settings, missing skill/runbook file, header guard failure or bad `target_date_override`; run aborts |
| `CONNECTOR_UNAVAILABLE` | F | A required native Google connector is not available in the scheduled session (R-01); run aborts before touching records |
| `RETRY_LIMIT_EXCEEDED` | F | Retryable failure hit `max_attempts` |

## 8. Event types (not reason codes)

Recorded in `POST_CALL_EMAIL_EVENTS.event_type`:

`RUN_STARTED` (also the run lock), `RUN_FINISHED`, `RUN_ABORTED`, `PROCESSING_HALTED` (circuit breaker or Gmail auth), `TRANSITION`, `DEFERRED` (recheck of a waiting record), `WAIT_EXPIRED`, `LEASE_EXPIRED`, `RECONCILED_SENT`, `TRACKING_WRITE_ERROR`, `CALL_ID_ASSIGNED`, `CALL_ID_ADOPTED` (valid ID found without a log row), `CALL_ID_RESTORED` (cleared ID written back), `INVALID_CALL_ID`, `ROW_SHIFTED` (row changed between read and write; nothing written), `SOURCE_CHANGED` (source changed between generation and send), `SEND_REVIEW_REQUIRED` (an unconfirmed send was handed to a human), `REVIEW_RESOLVED` (a human decision was applied).
