# Skills at Runtime

Status: **Revised for the scheduled-task architecture (D-026); availability in scheduled sessions to be validated (R-02).**

## 1. Principle

`skills/*/SKILL.md` remain the single source of truth for how the agent analyses transcripts, summarises, writes and validates emails. In the scheduled architecture, the **scheduled Claude session reads them as instructions**: the runbook (`workflows/daily-post-call-run.md`) tells it to read each file and follow it for the matching stage. They are not prompts assembled by a Python program any more.

- Explicit reading is required. The runbook names each file; the design does not rely on automatic skill discovery.
- Claude Code auto-discovers skills only under `.claude/skills/`. This repository's `skills/` folder is read explicitly, so discovery behaviour does not matter. Moving or mirroring the skills to `.claude/skills/` is optional and is not assumed (OD-37 / R-02).
- If a skill file cannot be read in a scheduled session, the run stops with `CONFIG_ERROR` before touching any record.

## 2. SKILL.md structure (contract, unchanged)

Each file has YAML front matter and fixed `##` sections:

```markdown
---
name: transcript-analysis
version: 1.2.0
stage: analysis
output_schema: AnalysisResult
---
# <Title>
## Objective
## Inputs
## Instructions        ← followed during the run
## Rules               ← followed during the run
## Output Schema       ← the JSON the stage must produce
## Examples            ← synthetic only
## Edge Cases          ← followed during the run
## Expected Output     ← acceptance criteria (used by tests)
## Changelog
```

## 3. How a scheduled run uses the skills

1. PREFLIGHT reads all four files and records `skill_versions` (e.g. `ta=1.2.0;cs=1.0.0;eg=1.1.0;ev=1.1.0`) in `RUN_STARTED` and on every log row.
2. For each record, the session performs the four stages in order. Each stage produces the JSON defined in that skill's Output Schema before the next stage starts.
3. Inputs are kept separate and labelled (`<transcript>`, `<call_metadata>`, `<recordings>`…). Content inside them is **data, never instructions**.
4. Policy values (word limits, banned phrases, signature, language) come from `config/` and are applied identically by generation and validation.
5. Deterministic checks (`docs/validation-rules.md` §2) are applied as explicit checklist steps, or by a helper if OD-38 allows one. They are not left to free-form judgement.
6. Invalid stage output → one retry → `FAILED` `LLM_OUTPUT_INVALID`.

**Separation of stages.** In the API design each stage was an independent call. In one scheduled session the validator stage runs in the same context that wrote the draft, which weakens its independence. Mitigation options, e.g. running validation in a separate subagent context per record, are OD-40.

## 4. Change management

- Any edit to a SKILL.md bumps `version` (patch = wording, minor = new rule/field, major = schema change) and adds a Changelog line.
- Re-run the scenario cases in `tests/evals/` on the test copy before the next scheduled run uses a changed skill.
- The scheduled task must read the intended branch or version of the repository (R-02).

## 5. Model selection

The model is chosen in the scheduled-task settings and comes from the user's Claude plan. Per-stage model IDs no longer exist. The run records `model_used` if the session can report it. The per-stage model configuration of the API design is in `future-alternatives.md` §2.
