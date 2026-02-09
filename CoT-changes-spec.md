# PIV Dev Kit — CoT Enhancement: Full Change Specification

## Context for Reviewer

This document specifies exact changes to implement Chain-of-Thought (CoT), Self-Reflection, and PIV-Automator-Hooks across the PIV Dev Kit framework. The PIV Dev Kit is a collection of Claude Code slash commands (`.claude/commands/*.md`) that implement a Prime-Implement-Validate development loop for AI-assisted development.

### Design Decisions Already Agreed

1. **CoT visibility**: Condensed reasoning summary (4-8 bullets) visible in terminal. Full reasoning stays internal as prompt-level instructions.
2. **Reflection**: Terminal output only — never written into file artifacts. Keeps line budgets clean.
3. **Hook toggle**: CLAUDE.md setting as project-level default + per-command `--with-hooks`/`--no-hooks` flag override.
4. **Hooks format**: Simple key-value pairs, 5-15 lines, regex-parseable (`^([a-z_]+): (.+)$`), appended to file artifacts only when enabled.
5. **Token budget**: CoT adds ~100-200 tokens per command prompt. Reflection adds ~10 lines terminal output. Hooks add 5-15 lines to file artifacts.

### What We Need Reviewed

- Are the CoT styles appropriate per command?
- Are the hook keys sufficient for a future SDK orchestrator to parse and make decisions?
- Are there any gaps, inconsistencies, or missing fields?
- Does the reflection pattern add value without being redundant?
- Any concerns about the hook toggle mechanism?

---

## 1. CLAUDE.md Changes

**File**: `CLAUDE.md`
**Action**: Add two new sections at the end of the file.

### Add: `## 12. PIV Configuration`

```markdown
## 12. PIV Configuration

Settings that control PIV command behavior across all commands.

| Setting | Default | Description |
|---------|---------|-------------|
| hooks_enabled | false | Append `## PIV-Automator-Hooks` to file artifacts |

**Current Settings:**
- hooks_enabled: false

**Override per command:** Add `--with-hooks` or `--no-hooks` to any command invocation to override the project default for that run.

**How commands check this:** Read this section from CLAUDE.md. If `hooks_enabled: true`, append hooks. If argument contains `--with-hooks`, enable regardless. If `--no-hooks`, disable regardless.
```

### Add: `## 13. Prompting & Reasoning Guidelines`

```markdown
## 13. Prompting & Reasoning Guidelines

All PIV commands use structured reasoning internally. These are the shared patterns.

### CoT Styles

| Style | When Used | Commands |
|-------|-----------|----------|
| Zero-shot | Lightweight/focused tasks | /prime, /commit |
| Few-shot | Complex generation with examples | /create-prd, /create_global_rules_prompt |
| Tree-of-Thought | Decision exploration with multiple approaches | /plan-feature, /orchestrate-analysis |
| Per-subtask | Parallel teammate tasks | /execute, /research-stack, /validate-implementation |

### Terminal Reasoning Summary

Every command outputs a brief `### Reasoning` section to terminal showing the key steps taken:

```
### Reasoning
- Scanned 14 tracked files, identified 3 config patterns
- Cross-referenced PRD Phase 2 with 2 technology profiles
- Gap found: no rate limit handling for X API
- Recommending: add retry logic before planning
```

Rules:
- 4-8 bullet points maximum
- Shows *what was found*, not the full thinking process
- Appears before the main output section

### Reflection Pattern

After main generation, each command performs a brief self-critique:
- Is output aligned with PRD/scenarios/profiles?
- Is it complete — any missing sections or gaps?
- Is it consistent with existing artifacts?

Reflection output goes to **terminal only** — never into file artifacts. Format:

```
### Reflection
- ✅ All PRD scenarios accounted for
- ⚠️ Technology profile for Redis not found — flagged in recommendations
- ✅ Line count within budget (623 lines)
```

### Hook Block Format

When hooks are enabled, append this to the **end** of file artifacts:

```
## PIV-Automator-Hooks
key: value
key: value
```

Rules:
- 5-15 lines maximum
- Simple key-value pairs (no nesting, no arrays)
- Parseable with regex: `^([a-z_]+): (.+)$`
- Each command defines its own keys (documented per command)
- **Placement rule**: Hooks are appended to the primary file artifact when the command produces one (e.g. PRD.md, plan.md, profile.md, validation report, progress file). For commands that output only to terminal (e.g. /prime, /commit, /create_global_rules_prompt), the hooks block appears in terminal output.

### Argument Parsing

Commands that accept flags parse them from `$ARGUMENTS`:
- Strip `--with-hooks` and `--no-hooks` from arguments before processing
- Strip `--reflect` where applicable — currently supported only by `/plan-feature`; other commands ignore it
- Remaining text is the actual argument (filename, phase name, etc.)
```

---

## 2. `/prime` Changes

**File**: `.claude/commands/prime.md`
**Current line count**: 145 lines
**CoT Style**: Zero-shot

### Add after `## Reference Files Policy`, before `## Process`:

```markdown
## Reasoning Approach

**CoT Style:** Zero-shot

Before producing the output report, think step by step:
1. Scan codebase structure — file count, directory patterns, languages
2. Cross-reference `.agents/reference/` profiles with `.agents/plans/` progress
3. Assess development progress — what's done, what's pending, any gaps
4. Check artifact freshness — are plans/profiles outdated relative to recent commits?
5. Determine the precise next step based on current PIV loop position

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip hook flags from arguments before processing reference file keywords.
```

### Add to `## Output Report`, after `### Recommended Next Step`:

```markdown
### Reasoning

Output 4-8 bullets summarizing what you found during analysis. Place this BEFORE the Project Overview section in terminal output. Example:

```
### Reasoning
- Scanned [N] tracked files, [N] directories
- PRD found at [path], currently on Phase [N]
- [N] technology profiles available, [N] plans created
- Last commit [date]: [summary]
- Gap: [observation, if any]
```

### Reflection

After generating the full report, output a brief self-critique to terminal:
- Is this summary complete and accurate?
- Did I miss context from CLAUDE.md, PRD, or recent commits?
- Is my recommended next step correct given the project state?

Format:

```
### Reflection
- ✅/⚠️ [Finding]
- ✅/⚠️ [Finding]
```

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, append to terminal output:

```
## PIV-Automator-Hooks
current_phase: [define|research|planning|executing|validating|shipping]
completed_phases: [comma-separated list]
pending_items: [brief description]
recommended_next_command: [command name without /]
recommended_arg: "[argument string]"
requires_clear_before_next: [true|false]
confidence: [high|medium|low]
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| current_phase | Where the project is in the PIV loop | `define`, `research`, `planning` |
| completed_phases | What's already done | `define,research` |
| pending_items | What's next in queue | `execute phase-2` |
| recommended_next_command | Which command to run | `plan-feature` |
| recommended_arg | Argument for that command | `"Phase 2: Agent Intelligence"` |
| requires_clear_before_next | Whether context should be reset | `true`, `false` |
| confidence | How confident in the recommendation | `high`, `medium`, `low` |

---

## 3. `/create-prd` Changes

**File**: `.claude/commands/create-prd.md`
**Current line count**: 380 lines
**CoT Style**: Few-shot

### Add after `## CRITICAL: Length Constraint`, before `## PRD Structure`:

```markdown
## Reasoning Approach

**CoT Style:** Few-shot

Before writing each PRD section, reason through:
1. Extract agent identity, autonomy level, and personality from conversation
2. Rationalize technology decisions — capture the *why* from discussion, not just the *what*
3. Define agent behaviors with explicit decision trees covering happy paths AND failures
4. Create 8-15 testable scenarios (Given/When/Then/Error/Edge) from conversation examples
5. Link every user story to at least one scenario bidirectionally
6. Phase the implementation so each phase is self-contained after `/clear` + `/prime`

**Few-shot example for scenario quality:**

Good scenario:
```
Given: User provides a company URL
When: Agent researches the company
Then: Agent returns 3-5 key facts
Error: If URL unreachable, agent reports failure and suggests manual input
Edge: URL redirects to a different domain
```

Bad scenario:
```
Given: Input
When: Agent runs
Then: Output
```

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip hook flags from arguments before using remaining text as output filename.
```

### Replace `## Output Confirmation` with:

```markdown
## Output Confirmation

After creating the PRD:
1. Confirm file path
2. Report line count (must be 500-750)
3. List any assumptions made
4. Suggest which phase to start with
5. **Remind user**: Run `/research-stack` before `/plan-feature` to generate technology profiles

### Reasoning

Output 4-8 bullets summarizing your generation process:

```
### Reasoning
- Extracted [N] technology decisions from conversation
- Defined [N] scenarios ([N] happy, [N] error, [N] edge)
- [N] user stories mapped to scenarios
- Phased into [N] implementation phases
- Key assumption: [if any]
```

### Reflection

Self-critique the generated PRD (terminal only):
- Does the Agent Behavior Specification fully reflect the conversation?
- Are all technology decisions captured with rationale?
- Are scenarios testable and specific (not generic)?
- Do all phases reference scenarios and technologies?
- Is the line count within 500-750?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, append to the PRD file:

```
## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: [comma-separated list]
scenarios_count: [N]
phases_count: [N]
next_suggested_command: research-stack
next_arg: "[PRD filename]"
confidence: [high|medium|low]
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| prd_status | Whether PRD generation completed | `complete` |
| technologies_to_research | Feeds `/research-stack` | `Claude API,ElevenLabs,X API v2` |
| scenarios_count | Total scenarios defined | `12` |
| phases_count | Implementation phases | `3` |
| next_suggested_command | What to run next | `research-stack` |
| next_arg | Argument for next command | `PRD.md` |
| confidence | Quality confidence | `high`, `medium`, `low` |

---

## 4. `/plan-feature` Changes

**File**: `.claude/commands/plan-feature.md`
**Current line count**: 725 lines
**CoT Style**: Tree-of-Thought (ToT)

### Add after `## Mission`, before `## Planning Process`:

```markdown
## Reasoning Approach

**CoT Style:** Tree-of-Thought (ToT) for decisions, zero-shot for analysis

During Phase 0 (Scope Analysis), explore 2-3 approaches for each decision point:
1. For each decision, generate 2-3 viable approaches
2. Evaluate each against PRD requirements, technology profiles, and codebase patterns
3. Select the approach with strongest justification
4. Present selection with rationale to user

During Phase 5 (Strategic Thinking), reason step by step:
1. How does this feature fit the existing architecture?
2. What are the critical dependencies and order of operations?
3. What could go wrong? (Edge cases, race conditions, errors)
4. Which technology profile constraints shape the implementation?
5. How do PRD decision trees map to concrete code?

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
If arguments contain `--reflect`, perform an extended reflection pass before finalizing.
Strip all flags from arguments before using remaining text as the feature description.
```

### Add to the plan template (Phase 6 markdown template), after `## NOTES`:

```markdown
## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: [Phase N from PRD]
independent_tasks_count: [N]
dependent_chains: [N]
technologies_consumed: [comma-separated profile names]
next_suggested_command: execute
next_arg: ".agents/plans/[this-file].md"
estimated_complexity: [low|medium|high]
confidence: [N]/10
```

*(This block only appears in the generated plan file when hooks are enabled)*

### Add to `## Report` section, after existing report items:

```markdown
### Reasoning

Output 4-8 bullets summarizing the planning process:

```
### Reasoning
- Analyzed PRD Phase [N] with [N] user stories
- Consumed [N] technology profiles
- Explored [N] approaches for [key decision], selected [choice]
- Identified [N] independent tasks, [N] sequential chains
- Mapped [N] PRD scenarios to validation strategy
```

### Reflection

Self-critique the generated plan (terminal only):
- Does the plan enable one-pass implementation success?
- Are technology profile constraints reflected in task descriptions?
- Do validation commands cover all relevant PRD scenarios?
- Is every decision from Phase 0 baked into the plan?
- Is line count within 500-750?
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| plan_status | Ready state | `ready_for_execution` |
| phase_source | Which PRD phase | `Phase 2` |
| independent_tasks_count | Parallelizable tasks | `5` |
| dependent_chains | Sequential chains | `2` |
| technologies_consumed | Profiles used | `instantly-api,x-api` |
| next_suggested_command | What to run | `execute` |
| next_arg | Argument | `.agents/plans/phase-2.md` |
| estimated_complexity | Difficulty | `low`, `medium`, `high` |
| confidence | Success likelihood | `8/10` |

---

## 5. `/execute` Changes

**File**: `.claude/commands/execute.md`
**Current line count**: 203 lines
**CoT Style**: Per-subtask

### Add after opening description paragraph, before `## Step 1`:

```markdown
## Reasoning Approach

**CoT Style:** Per-subtask

For each task or batch:
1. Load plan context and relevant technology profiles
2. Resolve dependencies — confirm prerequisites are complete
3. Analyze the task — what files to create/modify, what patterns to follow
4. Implement following plan specifications and profile constraints
5. Validate locally — run task-level validation command

After each batch, perform brief reflection:
- Did all tasks in the batch integrate correctly?
- Any conflicts between parallel task outputs?
- Are dependent tasks now unblocked?

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip flags from arguments before using remaining text as plan file path.
```

### Add to `## Step 10: Final Report`, after existing report template:

```markdown
### Reasoning

Output 4-8 bullets summarizing execution:

```
### Reasoning
- Executed [N] tasks in [N] batches ([Agent Teams|Sequential])
- [N] technology profiles consumed across tasks
- [N] file conflicts resolved, [N] integration issues addressed
- Critical path: [task IDs]
- Key challenge: [if any]
```

### Reflection

Self-critique the execution (terminal only):
- Did all tasks complete within plan specifications?
- Are there integration gaps between batch outputs?
- Is the codebase in a consistent state for validation?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, append to the progress file (`.agents/progress/{plan-name}-progress.md`):

```
## PIV-Automator-Hooks
execution_status: [success|partial|failed]
tasks_completed: [N]/[Total]
tasks_blocked: [N]
files_created: [N]
files_modified: [N]
next_suggested_command: validate-implementation
next_arg: "[plan-path] --full"
requires_clear: [true|false]
confidence: [high|medium|low]
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| execution_status | Overall result | `success`, `partial`, `failed` |
| tasks_completed | Progress fraction | `7/8` |
| tasks_blocked | Stuck tasks | `1` |
| files_created | New files | `12` |
| files_modified | Changed files | `5` |
| next_suggested_command | What to run | `validate-implementation` |
| next_arg | Argument | `.agents/plans/phase-1.md --full` |
| requires_clear | Context reset needed | `true`, `false` |
| confidence | Result confidence | `high`, `medium`, `low` |

---

## 6. `/validate-implementation` Changes

**File**: `.claude/commands/validate-implementation.md`
**Current line count**: 620 lines
**CoT Style**: Per-subtask

### Add after `## Arguments`, before `## Architecture`:

```markdown
## Reasoning Approach

**CoT Style:** Per-subtask (one per validation level/scenario category)

For each validation level:
1. Load the relevant source (plan commands, PRD scenarios, technology profiles)
2. Determine what to test and expected outcomes
3. Execute tests and capture results
4. Compare actual vs expected outcomes
5. Classify: PASS / FAIL / PARTIAL / SKIPPED

For scenario validation specifically:
1. Map scenario Given/When/Then to executable steps
2. Determine integration tier (live vs fixture vs mock)
3. Execute and verify each assertion
4. Document deviations with specific details

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip `--with-hooks`, `--no-hooks`, and `--full` from arguments before using remaining text as plan path.
```

### Add to `## Phase 5: Report`, after terminal summary template:

```markdown
### Reasoning

Output 4-8 bullets summarizing validation:

```
### Reasoning
- Tested [N] code validation commands (Level 1-2)
- Validated [N] PRD scenarios ([N] happy, [N] error, [N] edge)
- Verified [N] decision tree branches
- Technology integration: [N] Tier 1, [N] Tier 2, [N] Tier 3, [N] Tier 4
- Key finding: [most important result]
```

### Reflection

Self-critique the validation (terminal only):
- Did we achieve full scenario coverage from PRD Section 4.3?
- Are any decision tree branches untested?
- Were failure categories correctly identified?
- Is the recommended next step accurate given results?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, append to the validation report file:

```
## PIV-Automator-Hooks
validation_status: [pass|partial|fail]
scenarios_passed: [N]/[Total]
scenarios_failed: [N]
decision_branches_tested: [N]/[Total]
failure_categories: [comma-separated: e.g. edge-cases,rate-limits]
suggested_action: [commit|re-execute|fix-and-revalidate]
suggested_command: [commit|execute|validate-implementation]
suggested_arg: "[appropriate argument]"
retry_remaining: [N]
requires_clear: [true|false]
confidence: [high|medium|low]
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| validation_status | Overall result | `pass`, `partial`, `fail` |
| scenarios_passed | Success fraction | `10/12` |
| scenarios_failed | Failure count | `2` |
| decision_branches_tested | Coverage fraction | `8/10` |
| failure_categories | What failed | `edge-cases,rate-limits` |
| suggested_action | What to do about failures | `commit`, `re-execute`, `fix-and-revalidate` |
| suggested_command | Next command | `execute` |
| suggested_arg | Argument | `.agents/plans/phase-1.md --with-mocks` |
| retry_remaining | Retries left before escalation | `2` |
| requires_clear | Context reset needed | `true`, `false` |
| confidence | Result confidence | `high`, `medium`, `low` |

**Note:** This is the most critical hook block for autonomous loop behavior. The `suggested_action` + `retry_remaining` fields enable a future SDK agent to decide whether to retry, fix, or escalate.

---

## 7. `/research-stack` Changes

**File**: `.claude/commands/research-stack.md`
**Current line count**: 499 lines
**CoT Style**: Per-subtask

### Add after `## Agent Teams Mode`, before `## Research Process`:

```markdown
## Reasoning Approach

**CoT Style:** Per-subtask (one per technology)

For each technology being researched:
1. Extract PRD context — why chosen, what agent needs, relevant scenarios
2. Research official documentation — auth, endpoints, rate limits, SDKs
3. Research community knowledge — gotchas, workarounds, real-world patterns
4. Structure findings into profile format
5. Classify all endpoints into testing tiers (1-4)

After completing each profile, reflect:
- Is the profile accurate and complete for this agent's needs?
- Are there missing gotchas or undocumented limitations?
- Does the testing tier classification cover all endpoints?

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip flags from arguments. Check for `--only [tech]` to research single technology.
```

### Add to `## Profile Quality Criteria`, after the checklist:

```markdown
### PIV-Automator-Hooks Per Profile (If Enabled)

If hooks are enabled, append to each profile file:

```
## PIV-Automator-Hooks
tech_name: [technology name]
research_status: complete
endpoints_documented: [N]
tier_1_count: [N]
tier_2_count: [N]
tier_3_count: [N]
tier_4_count: [N]
gotchas_count: [N]
confidence: [high|medium|low]
```
```

### Add to `## Final Output`, after summary report template:

```markdown
### Reasoning

Output 4-8 bullets summarizing all research:

```
### Reasoning
- Researched [N] technologies from PRD Section 3
- Generated [N] profiles totaling [N] endpoints documented
- Key finding: [most important discovery]
- Potential issue: [any technology limitation affecting PRD]
```

### Reflection

Self-critique the research (terminal only):
- Are all PRD technologies covered?
- Are profiles accurate based on official docs + community sources?
- Do testing tier classifications make sense for each endpoint?
- Any profile gaps that could cause issues during planning?
```

### Hook Keys Explained (Per Profile)

| Key | Purpose | Example Values |
|-----|---------|----------------|
| tech_name | Technology identifier | `Claude API` |
| research_status | Completion state | `complete` |
| endpoints_documented | Endpoint count | `8` |
| tier_1_count | Auto-live endpoints | `3` |
| tier_2_count | Test data endpoints | `2` |
| tier_3_count | Approval-required | `2` |
| tier_4_count | Mock-only | `1` |
| gotchas_count | Known issues found | `4` |
| confidence | Research quality | `high`, `medium`, `low` |

---

## 8. `/commit` Changes

**File**: `.claude/commands/commit.md`
**Current line count**: 96 lines
**CoT Style**: Zero-shot

### Add after `## Pre-Flight Check`, before `## Process`:

```markdown
## Reasoning Approach

**CoT Style:** Zero-shot

Before committing, think step by step:
1. Review all staged changes — what files, what type of change
2. Determine commit type (feat/fix/docs/refactor/etc.) from the changes
3. Generate a descriptive message following project conventions
4. Verify no sensitive files (.env, credentials) are staged

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip flags from arguments before using remaining text as custom commit message.
```

### Add to `## Output`, after existing report items:

```markdown
### Reasoning

Output 3-5 bullets:

```
### Reasoning
- Staged [N] files ([N] created, [N] modified)
- Commit type: [type] based on [rationale]
- Verified no sensitive files included
```

### Reflection

Quick self-critique (terminal only):
- Does the commit message accurately describe the changes?
- Were all relevant files included?
- Does it follow project conventions?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, output to terminal after commit:

```
## PIV-Automator-Hooks
commit_status: [success|failed]
commit_hash: [short hash]
files_committed: [N]
next_suggested_command: prime
next_arg: ""
confidence: high
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| commit_status | Whether commit succeeded | `success`, `failed` |
| commit_hash | Short git hash | `a1b2c3d` |
| files_committed | File count | `7` |
| next_suggested_command | What to run next | `prime` |
| next_arg | Argument | `""` (empty — fresh prime) |
| confidence | Always high for commits | `high` |

---

## 9. `/create_global_rules_prompt` Changes

**File**: `.claude/commands/create_global_rules_prompt.md`
**Current line count**: 244 lines
**CoT Style**: Few-shot

### Add after `**PROMPT BEGINS HERE:**`, before `Help me create the global rules`:

```markdown
## Reasoning Approach

**CoT Style:** Few-shot

Before generating CLAUDE.md:
1. Determine project type — new or existing codebase
2. If existing: analyze structure, config files, patterns, conventions
3. If new: gather requirements via questions, research best practices
4. Structure findings into the required sections
5. Ensure all sections are specific to this project, not generic

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting (if CLAUDE.md already exists for update).
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
```

### Add to `### Required Sections:`, after section 14 (Agent Teams Playbook):

```markdown
15. **PIV Configuration** (for projects using PIV loop)
    - Add the configuration block:
      ```markdown
      ## PIV Configuration
      - hooks_enabled: false
      ```
    - Set to `true` if the project plans to use SDK automation or wants hook metadata

16. **Prompting & Reasoning Guidelines** (for projects using PIV loop)
    - Add the CoT styles table (zero-shot, few-shot, ToT, per-subtask)
    - Add the Terminal Reasoning Summary format (4-8 bullets)
    - Add the Reflection pattern description (terminal only, ✅/⚠️ format)
    - Add the Hook Block Format specification (key-value, regex-parseable)
    - Reference CLAUDE.md in piv-dev-kit for the canonical version of these guidelines
```

### Add after `## Output Format:`:

```markdown
### Reasoning

Output 4-6 bullets:

```
### Reasoning
- Project type: [new|existing] — [brief justification]
- Analyzed [N] config files, [N] source files for patterns
- Tech stack: [summary]
- Included Agent Teams playbook: [yes|no]
- Included PIV Configuration + Reasoning Guidelines: [yes|no]
```

### Reflection

Self-critique (terminal only):
- Is the CLAUDE.md tailored to this specific project?
- Does it cover the PIV philosophy and prompting guidelines?
- Are code examples drawn from the actual codebase (not generic)?
- Is it within 100-500 lines?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, output to terminal:

```
## PIV-Automator-Hooks
rules_status: generated
includes_teams_playbook: [true|false]
includes_piv_config: [true|false]
includes_reasoning_guidelines: [true|false]
next_suggested_command: create-prd
next_arg: ""
confidence: [high|medium|low]
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| rules_status | Whether generation completed | `generated` |
| includes_teams_playbook | Agent Teams section present | `true`, `false` |
| includes_piv_config | PIV Config section present | `true`, `false` |
| includes_reasoning_guidelines | Reasoning section present | `true`, `false` |
| next_suggested_command | What to run next | `create-prd` |
| next_arg | Argument | `""` |
| confidence | Quality confidence | `high`, `medium`, `low` |

---

## 10. `/orchestrate-analysis` Changes

**File**: `.claude/commands/orchestrate-analysis.md`
**Current line count**: 253 lines
**CoT Style**: Tree-of-Thought

### Add after `## Overview` (line 8), before `## Phase 0: Prime Context`:

```markdown
## Reasoning Approach

**CoT Style:** Tree-of-Thought for phase coordination

Before each phase:
1. Assess what data is available from prior phases
2. Determine if Agent Teams can parallelize this phase
3. Identify potential cross-cutting issues between agents
4. Decide execution strategy (parallel vs sequential)

After each phase, reflect:
- Did all agents in this phase complete successfully?
- Are outputs consistent with each other?
- Is the data sufficient for the next phase?

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
```

### Add after `## Completion Criteria`, before `## Begin Orchestration`:

```markdown
### Reasoning

Output 4-8 bullets summarizing orchestration:

```
### Reasoning
- Executed [N] phases with [N] total agents
- Mode: [Agent Teams parallel | Sequential]
- Phase results: [brief per-phase summary]
- Key findings: [most important discoveries]
```

### Reflection

Self-critique (terminal only):
- Did all agents complete successfully?
- Are the outputs consistent and non-contradictory?
- Is the migration plan actionable and complete?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, append to `MIGRATION_PLAN.md`:

```
## PIV-Automator-Hooks
analysis_status: [complete|partial|failed]
agents_completed: [N]/[Total]
execution_mode: [parallel|sequential]
critical_findings: [N]
next_suggested_command: plan-feature
next_arg: "[recommended first action]"
confidence: [high|medium|low]
```
```

### Hook Keys Explained

| Key | Purpose | Example Values |
|-----|---------|----------------|
| analysis_status | Overall result | `complete`, `partial`, `failed` |
| agents_completed | Success fraction | `7/8` |
| execution_mode | How it ran | `parallel`, `sequential` |
| critical_findings | Important issues found | `3` |
| next_suggested_command | What to do with results | `plan-feature` |
| next_arg | Argument | `"Phase 1: Restructure"` |
| confidence | Result confidence | `high`, `medium`, `low` |

---

## Summary Matrix

| File | CoT Style | Reasoning | Reflection | Hooks Location | Hooks Keys |
|------|-----------|-----------|------------|----------------|------------|
| CLAUDE.md | N/A (defines guidelines) | N/A | N/A | N/A | N/A |
| prime.md | Zero-shot | 4-8 bullets, terminal | Terminal only | Terminal | 7 keys |
| create-prd.md | Few-shot | 4-8 bullets, terminal | Terminal only | PRD file | 7 keys |
| plan-feature.md | Tree-of-Thought | 4-8 bullets, terminal | Terminal only | Plan file | 9 keys |
| execute.md | Per-subtask | 4-8 bullets, terminal | Terminal only | Progress file | 9 keys |
| validate-implementation.md | Per-subtask | 4-8 bullets, terminal | Terminal only | Validation report | 11 keys |
| research-stack.md | Per-subtask | 4-8 bullets, terminal | Terminal only | Each profile file | 9 keys |
| commit.md | Zero-shot | 3-5 bullets, terminal | Terminal only | Terminal | 5 keys |
| create_global_rules_prompt.md | Few-shot | 4-6 bullets, terminal | Terminal only | Terminal | 6 keys |
| orchestrate-analysis.md | Tree-of-Thought | 4-8 bullets, terminal | Terminal only | MIGRATION_PLAN.md | 6 keys |

## Consistency Rules (All Commands)

1. **Hook toggle**: Every command checks CLAUDE.md `hooks_enabled` first, then `--with-hooks`/`--no-hooks` flags override
2. **Reasoning**: Always appears in terminal, before main output, 4-8 bullets
3. **Reflection**: Always terminal only, never in file artifacts, uses ✅/⚠️ indicators
4. **Hooks**: Only appended when enabled, 5-15 lines, simple key-value, regex-parseable
5. **Hook placement**: Hooks are appended to the primary file artifact when the command produces one (e.g. PRD.md, plan.md, profile.md). For terminal-only commands (e.g. /prime, /commit), hooks appear in terminal output.
6. **Argument parsing**: All flags stripped before processing actual arguments. `--reflect` is currently supported only by `/plan-feature`; other commands ignore it.
7. **Agent Teams**: Teammates inherit parent command's CoT style; lead uses ToT/reflection for coordination
8. **Manual mode preservation**: When hooks are disabled (the default), commands behave exactly as they did before this enhancement — no visible change in artifacts or terminal output except for the added Reasoning and Reflection sections in terminal.
