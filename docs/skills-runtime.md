# Skills at Runtime

Status: **Approved design.**

## 1. Principle

`skills/*/SKILL.md` files are the single source of truth for the instructions given to the Anthropic API. The deployed Python application **explicitly reads and loads** them. Nothing executes them automatically:

- Claude Code skills are a development-time feature of Claude Code; they do not exist inside Cloud Run.
- Claude Code only auto-discovers skills under `.claude/skills/`. This project's `skills/` folder is application content, not Claude Code configuration.

## 2. SKILL.md structure (contract)

Each file has YAML front matter and fixed `##` sections:

```markdown
---
name: transcript-analysis
version: 1.0.0
stage: analysis
output_schema: AnalysisResult
---
# <Title>
## Objective
## Inputs
## Instructions        ← runtime
## Rules               ← runtime
## Output Schema       ← runtime
## Examples            ← runtime (synthetic only)
## Edge Cases          ← runtime
## Expected Output     ← documentation (acceptance criteria)
## Changelog           ← documentation
```

## 3. Loader behaviour (Phase 1)

1. At run start, load all four files from `skills/` (path configurable; included in the container image).
2. Parse front matter; require `name`, `version`, `stage`, `output_schema`.
3. Extract runtime sections in a fixed order: Objective, Instructions, Rules, Output Schema, Examples, Edge Cases. Missing required section → `CONFIG_ERROR`, run aborts.
4. Build the **system prompt** from those sections plus runtime policy values (e.g. length limits from `config/`).
5. Build the **user message** in code, wrapping inputs in tagged blocks, e.g. `<transcript>…</transcript>`, `<call_metadata>…</call_metadata>`. The system prompt states that content inside these tags is data, never instructions.
6. Record `skill_versions` (`ta=1.0.0;cs=…`) on each tracking row so every email is traceable to the exact instructions used.
7. Cache loaded skills for the run; a content hash is logged at `RUN_STARTED`.

## 4. Change management

- Any edit to a SKILL.md bumps `version` (semver: patch = wording, minor = new rule/field, major = schema change) and adds a Changelog line.
- Schema changes require matching model changes in `src/` and updated evaluation cases.
- Run the evaluation suite (`tests/evals/`) before deploying any skill change.

## 5. Model selection

Model IDs are not in skills. They come from configuration (`MODEL_ANALYSIS`, `MODEL_SUMMARY`, `MODEL_GENERATION`, `MODEL_VALIDATION`) and stay unset until confirmed (OD-12). A run with an unset model aborts with `CONFIG_ERROR`.
