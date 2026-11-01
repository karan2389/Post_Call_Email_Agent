'use strict';
// Maps a transcript-analysis result to a Phase 3 handling decision (D-039 OD-11, D-044 coverage-first). Pure function;
// existing reason codes only (docs/skip-reasons.md). `processing: null` means: continue to summary and email generation
// in `mode` (full | conservative | neutral_fallback). Transcript quality never stops generation.

const GENUINE_SKIPS = new Set(['CUSTOMER_NO_SHOW', 'INSUFFICIENT_CONTENT', 'NOT_A_SUPPORT_CALL', 'MULTIPLE_CUSTOMERS_AMBIGUOUS']);
const MODES = new Set(['full', 'conservative', 'neutral_fallback']);

function modeOf(analysis) {
  if (MODES.has(analysis.generation_mode)) return analysis.generation_mode;
  if (analysis.transcript_quality === 'substantially_garbled') return 'neutral_fallback';
  if (analysis.transcript_quality === 'partly_garbled' || analysis.overall_confidence === 'low') return 'conservative';
  return 'full';
}

// analysis: AnalysisResult/1 JSON.
function reviewDecision(analysis) {
  if (!analysis) return { processing: 'FAILED', reason: 'LLM_OUTPUT_INVALID', mode: null, notes: 'no valid analysis result' };
  const sensitive = Array.isArray(analysis.sensitive_topics) ? analysis.sensitive_topics : [];
  if (sensitive.length) {
    return { processing: 'REVIEW_REQUIRED', reason: 'SENSITIVE_TOPIC_REQUIRES_HUMAN', mode: null, notes: `sensitive topics: ${sensitive.join(', ')}` };
  }
  const skip = analysis.skip_recommendation && analysis.skip_recommendation.skip === true;
  if (skip) {
    const code = analysis.skip_recommendation.reason_code;
    if (GENUINE_SKIPS.has(code)) return { processing: 'SKIPPED', reason: code, mode: null, notes: 'skip recommended by transcript analysis' };
    if (code === 'SENSITIVE_TOPIC_REQUIRES_HUMAN') return { processing: 'REVIEW_REQUIRED', reason: code, mode: null, notes: 'sensitive topic' };
    // a quality-based skip (ANALYSIS_LOW_CONFIDENCE, TRANSCRIPT_INCOMPLETE, unknown) is superseded: write a conservative email
    return { processing: null, reason: null, mode: 'neutral_fallback', notes: `quality skip '${code}' superseded by coverage-first policy` };
  }
  return { processing: null, reason: null, mode: modeOf(analysis), notes: 'continue to summary and email generation' };
}

module.exports = { reviewDecision, GENUINE_SKIPS };