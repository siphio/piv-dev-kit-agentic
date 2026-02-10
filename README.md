# PIV Dev Kit (Agentic)

**AI-Powered Agent Development Framework — with State Awareness**

A systematic approach to building AI agents with Claude Code. The PIV (Prime-Implement-Validate) loop ensures every feature is properly planned, implemented, and verified before moving forward. Designed for Opus 4.6 and Agent Teams.

> **Agentic branch**: This variant adds persistent state tracking via `.agents/manifest.yaml` — deterministic phase progress, profile freshness detection, coverage gap analysis, and next-action recommendations. It also includes failure intelligence — structured error taxonomy, git checkpointing before execution, retry budgets, and manifest-persisted failure history that survives `/clear` + `/prime` cycles. Together, these form the foundation for the autonomous orchestrator wrapper.

---

## Philosophy

> "Most AI coding failures are context failures, not capability failures."

This framework solves the #1 problem with AI-assisted development: **context loss**. By creating structured documents at each phase, you maintain continuity across sessions, context resets, and even different AI assistants.

**Core Principles:**
- **Plain English over code snippets** - Documents should be readable by humans
- **Context is King** - Every command maximizes useful context
- **Self-contained phases** - Each phase works standalone after `/clear` + `/prime`
- **Human checkpoints** - Discussion before implementation, validation before shipping
- **Scenario-based validation** - Prove the agent behaves correctly, not just that code compiles
- **Structured reasoning** - Every command uses Chain-of-Thought internally, with visible reasoning summaries and self-reflection
- **Agent Teams ready** - Commands parallelize automatically when Agent Teams is available
- **Automation-ready** - Optional PIV-Automator-Hooks prepare artifacts for future SDK orchestration
- **State-aware** - `.agents/manifest.yaml` tracks phase progress, profile freshness, and coverage gaps deterministically
- **Failure-aware** - Structured error taxonomy with per-category recovery actions, git checkpointing, and retry budgets persisted in manifest

---

## The PIV Loop

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              PIV LOOP                                    │
│                                                                          │
│   PRIME ────► DEFINE ────► RESEARCH ────► PLAN ────► BUILD ────► VERIFY  │
│     │           │            │              │          │           │      │
│  /prime    /create-prd  /research-stack  /plan     /execute  /validate   │
│                                         -feature              -impl     │
│                                                                          │
│     ◄──────────────────── Feedback Loop ◄────────────────────            │
└──────────────────────────────────────────────────────────────────────────┘
```

| Phase | Purpose | Commands |
|-------|---------|----------|
| **Prime** | Load context, understand project state | `/prime` |
| **Define** | Create agent-native requirements | `/create-prd`, `/create_global_rules_prompt` |
| **Research** | Deep-dive technology stack (run once) | `/research-stack` |
| **Plan** | Create implementation plans per phase | `/plan-feature` |
| **Build** | Execute plans with parallel task support | `/execute` |
| **Verify** | Scenario-based agent validation | `/validate-implementation`, `/commit` |

---

## Quick Start

### 1. Install Commands

Copy the `.claude/commands/` folder to your project:

```bash
# From your project root
mkdir -p .claude/commands
cp -r /path/to/piv-dev-kit/.claude/commands/* .claude/commands/
```

### 2. Create Project Rules

```bash
/create_global_rules_prompt
```

This generates a `CLAUDE.md` file with:
- Tech stack documentation
- Code conventions
- Architecture patterns
- AI assistant instructions
- Agent Teams playbook (if using teams)
- PIV Configuration (hooks toggle)
- Prompting & Reasoning Guidelines (CoT, reflection, hooks format)

### 3. Start the PIV Loop

```bash
# Prime: Understand the project
/prime

# Create agent-native requirements document
/create-prd

# Research all technologies in the PRD (run ONCE)
/research-stack

# Plan first phase
/plan-feature "Phase 1 from PRD"

# Execute the plan (parallelizes with Agent Teams)
/execute .agents/plans/phase-1.md

# Validate against PRD scenarios
/validate-implementation .agents/plans/phase-1.md --full

# Ship it
/commit
```

---

## Commands Reference

### Prime Phase

#### `/prime`
Builds comprehensive understanding of your codebase, discovers technology profiles, and reports development progress. Loads, builds, and reconciles the project manifest for deterministic state tracking.

```bash
/prime                    # Standard analysis (with manifest)
/prime --with-refs        # Include reference documentation
/prime --no-manifest      # Legacy mode — skip manifest operations
```

**Manifest operations (automatic):**
1. **Load or build** — Reads `.agents/manifest.yaml` if it exists; on first run, scans filesystem for existing artifacts and builds the manifest from scratch
2. **Reconcile** — Compares manifest entries against actual files on disk, flags mismatches, recalculates profile freshness against the 7-day window
3. **Coverage gap detection** — Identifies the next unfinished phase, cross-references its technologies against existing profiles, flags missing or stale profiles
4. **Failure assessment** — Reads `failures` and `checkpoints` sections; factors active failures, retry counts, and available rollback points into next-action recommendation

**Output:** Project overview, architecture, tech stack, manifest status (freshness counts, coverage gaps, failure state, checkpoint status), failure-aware recommended next step

---

### Define Phase

#### `/create-prd`
Creates an agent-native Product Requirements Document from conversation context. Updates manifest with PRD entry and initializes all phase statuses.

```bash
/create-prd              # Creates PRD.md
/create-prd myproject    # Creates myproject.md
```

**Output:** 500-750 line PRD with:
- Agent Identity (personality, decision philosophy, autonomy level)
- Technology Decisions with rationale (feeds `/research-stack`)
- Agent Behavior Specification with decision trees and scenario definitions
- User stories linked to scenarios
- Implementation phases referencing technologies and scenarios

**Manifest write:** Adds `prd` entry (path, status, generated_at, phases_defined) and initializes all `phases` as `not_started`.

#### `/create_global_rules_prompt`
Generates project-specific CLAUDE.md rules including Agent Teams playbook, PIV Configuration (with `profile_freshness_window`), Prompting & Reasoning Guidelines, and a **Manifest Reference** section documenting what the manifest tracks and which commands write what.

---

### Research Phase

#### `/research-stack`
Deep-dives every technology in the PRD. Run once after PRD creation. Supports `--refresh` for lightweight updates of stale profiles.

```bash
/research-stack                       # Research all technologies from PRD.md
/research-stack PRD.md                # Specify PRD file
/research-stack --only instantly       # Research single technology
/research-stack --refresh              # Refresh all stale profiles (manifest-driven)
/research-stack --refresh instantly    # Refresh a specific profile
```

**Full generation process:**
1. Reads PRD Section 3 (Technology Decisions) to identify technologies
2. For each technology: researches official docs, community knowledge via WebSearch
3. Produces structured profile with auth, endpoints, rate limits, gotchas, validation hooks
4. **Agent Teams**: Spawns parallel researchers (one per technology)

**Refresh mode** (`--refresh`): Lightweight update for profiles past the 7-day freshness window.
1. Reads manifest to identify stale profiles (or targets a named technology)
2. Per profile: re-checks auth flows, rate limits, SDK versions, and breaking changes since last `generated_at` date
3. Updates only Sections 1 (auth), 4 (rate limits), 6 (SDK), 7 (gotchas) — preserves everything else
4. Updates manifest timestamps and freshness status

**Output:** `.agents/reference/{technology}-profile.md` per technology

**Manifest write:** Adds/updates `profiles` entries (path, generated_at, status, freshness, used_in_phases) after both full generation and refresh.

**Run once for full generation.** Use `--refresh` when `/prime` flags stale profiles.

---

### Plan Phase

#### `/plan-feature`
Creates comprehensive implementation plan consuming PRD and technology profiles.

```bash
/plan-feature "Phase 2: Agent Intelligence"
```

**Process:**
1. **Scope Analysis** - Reviews PRD, checks technology profiles exist, outputs recommendations
2. **User Validation** - Discuss approach before planning
3. **Technology Integration** - Reads `.agents/reference/` profiles, maps endpoints to tasks
4. **Plan Generation** - Creates 500-750 line plan with agent behavior specs

**Output:** `.agents/plans/phase-N-feature-name.md` with:
- Technology profiles consumed and key constraints
- Agent behavior implementation (decision trees, scenario mappings)
- Step-by-step tasks referencing profile endpoints
- Validation strategy mapped to PRD scenarios

**Manifest write:** Appends to `plans` list and sets `phases.[N].plan` to `complete`.

---

### Build Phase

#### `/execute`
Executes a development plan with intelligent task parallelization. Creates a git checkpoint before execution for safe rollback on failure.

```bash
/execute .agents/plans/phase-1.md
```

**Process:**
1. **Create checkpoint** — Tags current HEAD as `piv-checkpoint/{phase}-{timestamp}`, records in manifest
2. Parses plan, loads technology profiles
3. Analyzes task dependencies, builds dependency graph
4. **Agent Teams Mode**: Groups independent tasks into parallel batches, spawns teammates
5. **Sequential Mode**: Executes tasks one at a time (fallback)
6. Tracks progress in `.agents/progress/`
7. Runs validation phase with unit tests
8. **On failure**: Classifies error, writes to manifest `failures` section, outputs `## PIV-Error` block

**Agent Teams parallelization:**
- Independent tasks run simultaneously across teammates
- Teammates share code through git push/pull
- Direct messaging for integration questions
- Lead coordinates overall flow

**Failure handling:**
- On task failure: error is classified (e.g., `syntax_error`), written to manifest with retry count
- On retry: resumes from the failed task (completed tasks are not re-run)
- On retries exhausted: recommends rollback to checkpoint + human escalation
- Checkpoint remains active until `/commit` succeeds

**Manifest write:** Appends to `executions` list (phase, status, tasks_total/done/blocked), updates `phases.[N].execution`. On failure: writes to `failures` and `checkpoints` sections.

---

### Verify Phase

#### `/validate-implementation`
Scenario-based validation testing agent behavior against PRD definitions.

```bash
# Standard: Syntax + Components + Scenarios
/validate-implementation

# Full: Includes end-to-end pipeline
/validate-implementation --full

# Specific plan
/validate-implementation .agents/plans/phase-2.md --full
```

**Validation Levels:**

| Level | What It Tests | Source |
|-------|---------------|--------|
| Level 1 | Syntax, types, lint | Plan validation commands |
| Level 2 | Unit + component tests | Plan validation commands |
| Level 3 | PRD scenario validation | PRD Section 4.3 scenarios |
| Level 4 | Full pipeline end-to-end | Plan + PRD (--full only) |

**Scenario validation tests:**
- Happy path scenarios from PRD
- Error recovery paths from PRD
- Edge cases from PRD
- Decision tree branch verification
- Technology integration health checks

**Agent Teams**: Parallel validation — one teammate per scenario category.

**Failure handling:**
- Level 1/2 failures → classified as `syntax_error` or `test_failure`, written to manifest
- Scenario mismatches → classified as `scenario_mismatch` with PRD reference
- Integration auth failures → classified as `integration_auth`, immediate escalation
- Rate limit hits → classified as `integration_rate_limit` with backoff guidance
- All failures output a `## PIV-Error` block to terminal and write to manifest

**Manifest write:** Appends to `validations` list (path, phase, status, scenarios_passed/failed/skipped) and sets `phases.[N].validation` to `pass`/`partial`/`fail`. On failure: writes to `failures` section.

#### `/commit`
Creates git commits following project conventions.

```bash
/commit                  # Commits staged changes
/commit "feat: message"  # With custom message
```

---

## Developing AI Agents

The PIV framework is optimized for AI agent development. Here's the recommended workflow:

### Phase 1: Foundation

**Goal:** Core infrastructure, tools, basic pipeline

```bash
# 1. Create project structure and CLAUDE.md
/create_global_rules_prompt

# 2. Define requirements (agent-native PRD)
/create-prd
# → Includes Agent Behavior Specification
# → Includes Technology Decisions with rationale
# → Includes Scenario Definitions

# 3. Research all technologies (run ONCE)
/research-stack
# → Produces profiles in .agents/reference/
# → Auth patterns, endpoints, rate limits, gotchas

# 4. Plan foundation
/plan-feature "Phase 1: Foundation Pipeline"
# → Consumes technology profiles
# → Maps PRD scenarios to implementation

# 5. Execute (parallelizes with Agent Teams)
/execute .agents/plans/phase-1.md

# 6. Validate - tests PRD scenarios
/validate-implementation --full
# → Tests happy paths, error recovery, edge cases
# → Verifies decision tree behavior
# → Checks technology integration
```

### Phase 2: Agent Intelligence

**Goal:** Agent reasoning loop, decision trees, tool orchestration

```bash
# Plan agent layer (profiles already available)
/plan-feature "Phase 2: Agent Intelligence"

# Execute
/execute .agents/plans/phase-2.md

# Validate - scenario-based
/validate-implementation --full
```

### Phase 3+: Iteration

```bash
# Each phase follows the same loop:
/plan-feature "Phase N: [Feature]"
/execute .agents/plans/phase-N.md
/validate-implementation --full
/commit
```

---

## Agent Teams Integration

The framework supports Claude Code Agent Teams for parallel execution. Agent Teams is experimental and must be enabled:

```json
// settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Where Agent Teams Helps

| Command | Without Teams | With Teams |
|---------|--------------|------------|
| `/research-stack` | Sequential per technology | Parallel — one researcher per technology |
| `/execute` | One task at a time | Independent tasks run simultaneously |
| `/validate-implementation` | Sequential scenario testing | Parallel — one validator per scenario category |
| `/orchestrate-analysis` | Sequential agent phases | Parallel phases where dependencies allow |

### How It Works

- **Team Lead** reads the plan and identifies parallelizable work
- **Teammates** are spawned with specific tasks and full context windows
- Teammates share code through **git push/pull** on shared upstream
- **Direct messaging** enables real-time coordination between teammates
- Lead **waits for batch completion** before starting dependent tasks

### Token Considerations

Agent Teams uses significantly more tokens (each teammate = full Claude instance). Best for:
- Plans with 3+ independent tasks
- Research across multiple technologies
- Validation with many scenarios

Not recommended for simple single-file changes or tightly sequential work.

---

## Chain-of-Thought & Structured Reasoning

Every PIV command uses structured reasoning internally to improve output quality. This happens automatically — no configuration needed.

### How It Works

Each command has three reasoning layers:

1. **Chain-of-Thought (CoT)** — Internal step-by-step reasoning before generating output. Different styles per command complexity:

| Style | Commands | Description |
|-------|----------|-------------|
| Zero-shot | `/prime`, `/commit` | Simple step-by-step: "1. Scan structure. 2. Check progress..." |
| Few-shot | `/create-prd`, `/create_global_rules_prompt` | Includes examples of good vs bad output quality |
| Tree-of-Thought | `/plan-feature`, `/orchestrate-analysis` | Explores 2-3 approaches, evaluates each, selects best |
| Per-subtask | `/execute`, `/research-stack`, `/validate-implementation` | Each task/technology/scenario gets its own reasoning chain |

2. **Reasoning Summary** — A condensed 4-8 bullet summary visible in terminal output, showing *what was found* (not the full thinking process):

```
### Reasoning
- Scanned 14 tracked files, identified 3 config patterns
- Cross-referenced PRD Phase 2 with 2 technology profiles
- Gap found: no rate limit handling for X API
- Recommending: add retry logic before planning
```

3. **Self-Reflection** — A brief self-critique after generation, output to terminal only (never pollutes file artifacts):

```
### Reflection
- ✅ All PRD scenarios accounted for
- ⚠️ Technology profile for Redis not found — flagged in recommendations
- ✅ Line count within budget (623 lines)
```

### Why This Matters

- **Reduces drift** — Claude follows a structured reasoning path instead of free-associating
- **Improves consistency** — Every run follows the same cognitive steps regardless of context window state
- **Catches gaps at generation time** — Reflection identifies missing scenarios, misalignment with PRD, or incomplete coverage before the human even reviews
- **Zero configuration** — Works automatically on every command invocation

---

## PIV-Automator-Hooks

Optional machine-readable metadata blocks that can be appended to artifacts, preparing the framework for future autonomous SDK orchestration.

### What They Are

Simple key-value blocks at the end of file artifacts:

```
## PIV-Automator-Hooks
validation_status: partial
failure_categories: edge-cases,rate-limits
suggested_action: re-execute
suggested_command: execute
retry_remaining: 2
confidence: medium
```

- 5-15 lines, regex-parseable (`^([a-z_]+): (.+)$`)
- Each command defines its own keys (next command, confidence, status, etc.)
- Designed for a future SDK agent to parse and make deterministic decisions

### Enabling Hooks

Hooks are **disabled by default** — manual workflow stays clean.

**Project-level toggle** (in CLAUDE.md):
```markdown
## PIV Configuration
- hooks_enabled: true
```

**Per-command override:**
```bash
/create-prd myproject --with-hooks    # Enable for this run
/validate-implementation --no-hooks   # Disable for this run
```

### Hook Placement

- Commands that produce file artifacts (PRD, plans, profiles, validation reports) → hooks appended to the file
- Terminal-only commands (`/prime`, `/commit`, `/create_global_rules_prompt`) → hooks appear in terminal output

### Future Vision

A single autonomous "PIV Automator" agent that:
1. Starts from a goal or last artifact state
2. Runs `/prime` → reads manifest `next_action` (failure-aware) → executes the recommended command
3. Each command updates the manifest → `/prime` re-reconciles → picks next action
4. On failure: reads error category and retry budget from manifest → retries if eligible, rolls back to checkpoint if exhausted
5. Mimics phase isolation with intelligent `/clear` + `/prime`
6. Uses manifest for deterministic state (phases, failures, checkpoints) and hooks for per-artifact metadata

The manifest provides the **deterministic state loop** (where am I, what failed, what's next), the **failure intelligence** (error categories, retry counts, checkpoint references), and hooks provide **per-artifact metadata** (confidence, suggested action). Together they enable fully autonomous orchestration with safe failure recovery.

---

## State Awareness & Manifest

The framework tracks project state in `.agents/manifest.yaml` — a YAML file that provides deterministic, machine-readable state instead of inference-based guessing.

### What the Manifest Tracks

| Section | Purpose |
|---------|---------|
| `phases` | Plan, execution, and validation status per PRD phase |
| `prd` | Path, generation date, phases defined |
| `profiles` | Per-technology: path, generation date, freshness (fresh/stale), phases used in |
| `plans` | List of generated plans with phase, status, date |
| `executions` | List of execution runs with task counts and status |
| `validations` | List of validation runs with scenario pass/fail/skip counts |
| `checkpoints` | Git tag checkpoints with phase, status (active/resolved) |
| `failures` | Error history with category, retry count, resolution status, checkpoint reference |
| `next_action` | Recommended next command, argument, reason, confidence (failure-aware) |
| `settings` | `profile_freshness_window: 7d` |

### How It Works

1. **`/prime` builds and reconciles** — On first run, scans existing artifacts and builds the manifest. On every run, reconciles manifest against disk (catches manual edits, deletions), recalculates profile freshness, detects coverage gaps, and writes a `next_action` recommendation.

2. **All other PIV commands update it** — `/create-prd` initializes phases, `/research-stack` writes profile entries, `/plan-feature` marks plan complete, `/execute` records task counts, `/validate-implementation` records scenario results.

3. **Profile freshness** — Profiles older than 7 days (configurable via `profile_freshness_window` in CLAUDE.md) are flagged as `stale`. `/prime` recommends `/research-stack --refresh` to update them.

4. **Coverage gap detection** — `/prime` identifies the next unfinished phase, checks which technologies it references, and flags any that lack a profile or have a stale profile.

### Manifest-Driven Recommendations

Instead of a static if/else chain, `/prime` now uses manifest state to prioritize the next action:

1. Stale/missing profiles needed for next phase? → `/research-stack --refresh`
2. No PRD? → `/create-prd`
3. Next phase has no plan? → `/plan-feature "Phase N"`
4. Plan exists, not executed? → `/execute`
5. Executed, not validated? → `/validate-implementation`
6. Validated? → `/commit`

The recommendation is written to the manifest `next_action` block, making it parseable by a future autonomous orchestrator.

### Shared Conventions

- Always read manifest before writing — merge, never overwrite
- Timestamps use ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`)
- Create `.agents/` directory if it doesn't exist before writing
- Preserve existing entries — append new plans/validations, don't replace
- Phase status values: `not_started`, `in_progress`, `complete` (plan/execution); `not_run`, `pass`, `partial`, `fail` (validation)

### Legacy Fallback

Pass `--no-manifest` to `/prime` to skip all manifest operations and use the original file-scanning behavior.

---

## Failure Intelligence & Error Handling

When commands fail, the framework classifies the error, writes structured failure data to the manifest, and outputs a machine-readable `## PIV-Error` block to terminal. This ensures failure context survives `/clear` + `/prime` cycles and enables informed recovery decisions.

### Error Taxonomy

Every failure is classified into one of these categories, each with a defined recovery path:

| Category | Where It Happens | Recovery Action | Max Retries |
|----------|-----------------|-----------------|-------------|
| `syntax_error` | `/execute`, `/validate` L1 | Auto-fix and retry | 2 |
| `test_failure` | `/execute` validation, `/validate` L2 | Auto-fix and retry | 2 |
| `scenario_mismatch` | `/validate` Phase 3 | Re-read PRD, adjust implementation | 1 |
| `integration_auth` | `/validate` Tier 1, `/research-stack` | Escalate to human immediately | 0 |
| `integration_rate_limit` | `/validate` Tier 2-3 | Wait with backoff, retry | 3 |
| `stale_artifact` | `/prime` reconciliation | Auto-refresh via `/research-stack --refresh` | 1 |
| `prd_gap` | `/plan-feature` Phase 0 | Escalate — PRD needs human revision | 0 |
| `partial_execution` | `/execute` | Rollback to checkpoint, escalate | 0 |
| `line_budget_exceeded` | `/create-prd`, `/plan-feature` | Auto-trim and retry | 1 |

Categories with 0 retries always escalate to the human. Categories with retries attempt automatic recovery before escalating.

### PIV-Error Block

Always-on structured error output (not gated by hooks). Appears in terminal on any command failure:

```
## PIV-Error
error_category: syntax_error
command: execute
phase: 2
details: "TypeScript compilation failed in src/agent/tools.ts:45"
retry_eligible: true
retries_remaining: 1
checkpoint: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
```

This data is also written to the manifest `failures` section for persistence.

### Git Checkpointing

Before `/execute` modifies any source code, it creates a lightweight git tag marking the current clean state:

```
piv-checkpoint/phase-2-2026-02-10T16:30:00Z
```

**This is NOT a commit of new code.** It's a bookmark of the known-good state *before* execution starts — like a save point before a boss fight.

**When things go well:**
```
CHECKPOINT → /execute (all tasks pass) → /validate (passes) → /commit → checkpoint resolved
```

**When things fail:**
```
CHECKPOINT → /execute (task 7 fails) → /clear + /prime → sees failure in manifest
           → retry /execute (resumes from task 7) → succeeds → /validate → /commit → resolved
```

**When retries are exhausted:**
```
CHECKPOINT → /execute fails → retry fails → /prime recommends rollback
           → git reset --hard piv-checkpoint/... → clean state restored → human decides next step
```

### Retry vs Rollback

These are different actions:

- **Retry** = Don't rollback. Tasks 1-6 are fine. Fix the error in task 7 and resume from there. The `.agents/progress/` file tracks what's done.
- **Rollback** = Retries exhausted or `partial_execution` error. Reset to checkpoint, discard ALL execution changes, give the human a clean slate with the full failure history in the manifest.

### Failure-Aware Recommendations

`/prime` reads failure and checkpoint data from the manifest and adjusts its `next_action` accordingly:

| Manifest State | Recommendation |
|---------------|----------------|
| Active checkpoint + pending failure + retries remaining | "Retry `/execute` — fix [error details]" |
| Active checkpoint + pending failure + no retries | "Rollback to checkpoint + escalate to human" |
| Active checkpoint + no failure | "Execution was interrupted — resume `/execute`" |
| Resolved checkpoint + no failures | Normal flow — recommend next PIV command |

### Manifest Extensions

Phase 2 adds `checkpoints` and `failures` sections:

```yaml
checkpoints:
  - tag: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
    phase: 2
    created_before: execute
    status: active       # active | resolved

failures:
  - command: execute
    phase: 2
    error_category: syntax_error
    timestamp: 2026-02-10T17:00:00Z
    retry_count: 1
    max_retries: 2
    checkpoint: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
    resolution: pending  # pending | auto_fixed | rolled_back | escalated
    details: "TypeScript compilation failed in src/agent/tools.ts:45"
```

---

## Project Structure

After using PIV commands, your project will have:

```
your-project/
├── .claude/
│   └── commands/           # PIV commands (copy from piv-dev-kit)
├── .agents/
│   ├── manifest.yaml       # State tracking (phase progress, freshness, next action)
│   ├── plans/              # Implementation plans
│   │   ├── phase-1-foundation.md
│   │   └── phase-2-agent.md
│   ├── validation/         # Validation reports
│   │   ├── phase-1-2026-02-05.md
│   │   └── phase-2-2026-02-05.md
│   ├── reference/          # Technology profiles (from /research-stack)
│   │   ├── instantly-api-profile.md
│   │   ├── x-api-profile.md
│   │   └── elevenlabs-profile.md
│   └── progress/           # Execution progress tracking
│       └── phase-1-progress.md
├── CLAUDE.md               # Project rules (with Agent Teams playbook)
├── PRD.md                  # Agent-native requirements
└── src/                    # Your code
```

---

## Best Practices

### PRD Writing

**Do:**
- Keep to 500-750 lines
- Make Agent Behavior Specification the most detailed section
- Include 8-15 scenario definitions with error paths
- Capture technology decisions with rationale from conversation
- Reference scenarios in user stories

**Don't:**
- Include code snippets (save for plans)
- Make Agent Behavior Specification optional
- Skip error recovery patterns
- Leave technology choices unexplained

### Technology Research

**Do:**
- Run `/research-stack` once after PRD
- Let it research official docs AND community knowledge
- Review profiles for accuracy before planning
- Use `/research-stack --refresh` when `/prime` flags stale profiles (7-day window)
- Update profiles if implementation reveals gaps

**Don't:**
- Skip research and guess at API patterns
- Run before the PRD exists
- Rerun full generation for every phase (profiles persist — use `--refresh` for updates)

### Validation

**Do:**
- Run `--full` before shipping
- Test all PRD scenarios (happy, error, edge)
- Verify decision tree branches
- Check technology integration health

**Don't:**
- Skip scenario validation
- Trust static analysis alone
- Move to next phase with scenario failures
- Ignore error recovery path testing

---

## Command Cheat Sheet

| Command | When to Use | Output | Manifest Write |
|---------|-------------|--------|----------------|
| `/prime` | Start of session | Terminal summary + next step | Builds/reconciles full manifest, writes `next_action` |
| `/create-prd` | New project/feature | `PRD.md` (agent-native) | `prd` entry + initializes `phases` |
| `/create_global_rules_prompt` | New project setup | `CLAUDE.md` | None |
| `/research-stack` | After PRD, before planning (once) | `.agents/reference/*.md` | `profiles` entries |
| `/research-stack --refresh` | When profiles are stale (7+ days) | Updated profiles | `profiles` freshness timestamps |
| `/plan-feature` | Before implementing each phase | `.agents/plans/*.md` | Appends to `plans`, updates phase plan status |
| `/plan-feature --reflect` | Extended reflection pass | `.agents/plans/*.md` | Same as above |
| `/execute` | After plan approved | Implemented code | Creates checkpoint, appends to `executions`, writes `failures` on error |
| `/validate-implementation` | After execution | `.agents/validation/*.md` | Appends to `validations`, writes `failures` on error |
| `/validate-implementation --full` | Before shipping | Full scenario results | Same as above |
| `/commit` | After validation | Git commit | Resolves active checkpoint |
| `/create_reference` | Need documentation | `.agents/reference/*.md` | None |
| `/orchestrate-analysis` | Complex codebase analysis | Analysis report | None |

**Global flags** (work on any command):
| Flag | Effect |
|------|--------|
| `--with-hooks` | Enable PIV-Automator-Hooks for this run |
| `--no-hooks` | Disable hooks for this run |
| `--no-manifest` | Skip manifest operations (`/prime` only) |

---

## Troubleshooting

### "Technology profiles not found"
```bash
ls .agents/reference/  # Check what exists
/research-stack        # Generate profiles from PRD
```

### "Plan not found"
```bash
ls .agents/plans/  # Check what exists
/plan-feature "Phase 1"  # Create if missing
```

### Scenario validation failing
- Check PRD Section 4.3 scenarios match implementation
- Verify technology profiles are accurate (rate limits, endpoints)
- Check if external services are reachable
- Review mock strategy in technology profile Section 9

### `/prime` reports stale profiles
```bash
/research-stack --refresh              # Refresh all stale profiles
/research-stack --refresh instantly    # Refresh a specific profile
/prime                                 # Re-run to verify freshness
```

### `/execute` failed partway through
```bash
/clear
/prime                  # Shows failure details, retry count, checkpoint
# Follow the recommendation — retry or rollback
```
If retries are exhausted and you want to rollback:
```bash
git reset --hard piv-checkpoint/phase-N-...    # Revert to clean state
git clean -fd                                   # Remove untracked files from execution
/prime                                          # Confirm clean state
```

### `/validate-implementation` reports scenario mismatch
- Check PRD Section 4.3 — does the scenario definition match what was implemented?
- `/prime` will show the failure details and recommend retry or escalation
- If the implementation approach is wrong, rollback to checkpoint and re-plan

### Manifest out of sync
If you manually add/delete files in `.agents/`, `/prime` will detect the mismatch on next run and reconcile automatically. To reset completely:
```bash
rm .agents/manifest.yaml    # Delete manifest
/prime                       # Rebuilds from scratch
```

### Context lost after /clear
```bash
/prime  # Reloads context, reconciles manifest, shows next step
```

### Agent Teams not working
- Verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings
- Check you're using Claude Code (not API directly)
- One team per session only
- Teammates can't spawn nested teams

---

## Contributing

This framework evolves based on real-world usage. Key files:

- `.claude/commands/*.md` - Command definitions
- `CLAUDE.md` - Framework development rules

When modifying commands:
1. Read the full command first
2. Preserve PIV loop philosophy
3. Ensure Agent Teams compatibility (parallel + sequential paths)
4. Include Reasoning Approach, Hook Toggle, Reasoning/Reflection output sections
5. Test the workflow end-to-end
6. Keep cross-references consistent (PRD sections, profile structure)

---

## License

MIT - Use freely for your agent development projects.

---

## Summary

The PIV Dev Kit transforms AI agent development from chaotic to systematic:

1. **Prime** - Build context that persists, reconcile manifest state
2. **Define** - Agent-native PRD with behavior specs and scenarios
3. **Research** - Deep technology profiles (run once, `--refresh` to keep fresh)
4. **Plan** - Technology-informed, scenario-mapped implementation plans
5. **Build** - Parallel execution with Agent Teams
6. **Verify** - Scenario-based validation proving the agent behaves correctly

Every command uses **structured Chain-of-Thought reasoning** internally, outputs **visible reasoning summaries** for transparency, and performs **self-reflection** to catch gaps before human review. The **`.agents/manifest.yaml`** provides deterministic state tracking — phase progress, profile freshness, coverage gaps, failure history, checkpoint status, and failure-aware next-action recommendations. **Git checkpointing** before execution enables safe rollback, and a **structured error taxonomy** with per-category retry budgets ensures failures are handled predictably. Optional **PIV-Automator-Hooks** prepare per-artifact metadata for future autonomous SDK orchestration.

Every phase produces artifacts that survive context resets. The manifest ensures the framework always knows exactly where the project stands, what went wrong, and how to recover.

**Start here:**
```bash
/prime
/create-prd
/research-stack
/plan-feature "Phase 1"
```
