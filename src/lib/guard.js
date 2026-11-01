'use strict';
// Deterministic spreadsheet write guard (Phase 4 prerequisite; D-029, D-035). Every write to a spreadsheet must be authorised by
// authorizeWrite() BEFORE the connector call. Pure function: no network, no files. The caller (a Claude session following the runbook)
// passes the request plus the gate values from config/run-settings.yaml. Limits (stated honestly): this is a code check the session
// is instructed to call; it cannot stop a connector call made without it. Google-level enforcement of source read-only does not
// exist (the connector account is Editor), so the guard is one of two layers together with the written instructions.

const DESTINATION_ID = '1_TxhedZ_sPTLXGPo36pFnoSNDCIWHU8uRtmhfXm2L40';   // Phase 3 Emails: the only approved write target
const SOURCE_ID = '1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI';         // CSC  Booking - All Agents: read only, never written
const BACKUP_ID = '10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q';         // CSC Booking - Backup: never read or written
const WRITE_TOOLS = /(^|__)(update_values|append_values|update_formulas|batch_clear_values|insert_dimension|update_spreadsheet|copy_sheet_to_another_spreadsheet)$/;

// request: { spreadsheetId, tool?, path? ('connector' | 'fallback' | ...), destinationSpreadsheetId? (copy target) }
// gates:   { writes_enabled, destination_sharing_verified, headers_verified, configuredDestinationId? }
function authorizeWrite(request, gates) {
  const reasons = [];
  const req = request || {};
  const g = gates || {};
  const id = typeof req.spreadsheetId === 'string' ? req.spreadsheetId.trim() : '';
  const deny = (code) => reasons.push(code);

  if (!id) deny('TARGET_MISSING');
  else if (id === SOURCE_ID) deny('SOURCE_WRITE_FORBIDDEN');
  else if (id === BACKUP_ID) deny('BACKUP_WRITE_FORBIDDEN');
  else if (id !== DESTINATION_ID) deny('TARGET_NOT_APPROVED');

  // copy_sheet_to_another_spreadsheet writes into a second spreadsheet: that one must be approved too
  if (req.destinationSpreadsheetId !== undefined && String(req.destinationSpreadsheetId).trim() !== DESTINATION_ID) deny('COPY_TARGET_NOT_APPROVED');

  // the destination configured in run-settings must still be the approved one (a silent config edit cannot redirect writes)
  if (g.configuredDestinationId !== undefined && g.configuredDestinationId !== DESTINATION_ID) deny('CONFIG_DESTINATION_MISMATCH');

  // any execution path other than the native connector (fallback scripts, other connectors, direct API) is not authorised
  if (req.path !== undefined && req.path !== 'connector') deny('UNAUTHORIZED_WRITE_PATH');
  if (req.tool && !WRITE_TOOLS.test(String(req.tool))) deny('NOT_A_KNOWN_WRITE_TOOL');

  if (g.writes_enabled !== true) deny('WRITES_DISABLED');
  if (g.destination_sharing_verified !== true) deny('DESTINATION_SHARING_NOT_CONFIRMED');
  if (g.headers_verified !== true) deny('HEADERS_NOT_VERIFIED');

  return { allowed: reasons.length === 0, reasons, target: id === DESTINATION_ID ? 'destination' : (id === SOURCE_ID ? 'source' : (id === BACKUP_ID ? 'backup' : 'unknown')) };
}

module.exports = { authorizeWrite, DESTINATION_ID, SOURCE_ID, BACKUP_ID };
