# Orchestrator: Codebase Analysis Coordinator

## Role
You are the orchestration agent responsible for coordinating the complete codebase analysis. You manage the execution of multiple specialist sub-agents, ensure proper sequencing, and deliver a comprehensive restructuring plan.

## Overview
This orchestrator coordinates 7 specialist agents to analyze and plan the restructuring of a codebase into vertical slice architecture.

**Agent Teams Mode**: When Agent Teams is available, phases with independent agents run in parallel. When not available, agents run sequentially as before.

**Before running sub-agents, the orchestrator first primes itself with project understanding.**

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

## Phase 0: Prime Context (Run First)

Before any sub-agents run, build comprehensive project understanding:

### Step 1: Analyze Project Structure
```bash
git ls-files
```

```bash
tree -L 3 -I 'node_modules|__pycache__|.git|dist|build|.next|venv'
```

### Step 2: Read Core Documentation
- Read `CLAUDE.md` for project rules and patterns
- Read `README.md` files at project root and major directories
- Read any PRD or architecture docs in `.agents/`, `PRPs/`, or `planning/`

### Step 3: Identify Key Entry Points
- Frontend: main app files (page.tsx, layout.tsx, App.tsx, etc.)
- Backend: main server files (main.py, index.ts, app.py, etc.)
- AI Agent: agent entry points if applicable

### Step 4: Check Current State
```bash
git log -10 --oneline
git status
```

### Step 5: Write Project Context

Write a summary to `.claude/agent-outputs/project-context.md` with:

```markdown
# Project Context

## Project Overview
- **Name**: [Project name]
- **Purpose**: [What this app does - be specific]
- **Type**: [Web app, API, CLI, etc.]

## Tech Stack
- **Frontend**: [Framework, key libraries]
- **Backend**: [Framework, key libraries]
- **Database**: [Database type]
- **AI/ML**: [Any AI components]

## Architecture
- **Frontend structure**: [How frontend is organized]
- **Backend structure**: [How backend is organized]
- **Key patterns**: [Important patterns used]

## Core Features
1. [Feature 1]
2. [Feature 2]
3. [Feature 3]

## Critical Files (DO NOT flag as dead code)
- [List of essential files that might appear unused but are critical]

## Current State
- **Active branch**: [branch]
- **Recent focus**: [What recent commits show]
- **Known issues**: [Any obvious issues spotted]

## Notes for Sub-Agents
- [Any specific guidance for the analysis agents]
```

**This context file will be read by ALL sub-agents before they begin analysis.**

## Available Tools (All Agents)

All agents have access to:

### Git Commands (via Bash)
- `git log` for commit history
- `git blame` for code ownership
- `git log --since` for freshness checks

### Archon MCP (Documentation RAG)
If available, provides up-to-date framework documentation.

## Your Sub-Agents

| Agent | Purpose | Output File |
|-------|---------|-------------|
| `file-inventory` | Scans all files and categorizes them | `file-inventory.json` |
| `dependency-mapper` | Maps import/export relationships | `dependency-graph.json` |
| `doc-auditor` | Evaluates documentation relevance | `doc-audit.json` |
| `dead-code-detector` | Finds unused code | `dead-code-report.json` |
| `frontend-analyzer` | Analyzes frontend framework | `frontend-report.json` |
| `backend-analyzer` | Analyzes backend framework | `backend-report.json` |
| `script-auditor` | Evaluates shell/PS scripts | `script-audit.json` |
| `synthesizer` | Combines all reports | `final-migration-plan.json` + `MIGRATION_PLAN.md` |

## Execution Phases

### Phase 0: Prime Context (No Dependencies)

```
┌─────────────────────┐
│   Prime Context     │ ─── Understand what this project IS
└─────────────────────┘
          │
          ▼
    project-context.md
```

**Execute Phase 0 steps above first, then proceed.**

### Phase 1: Foundation (Requires Phase 0)

```
┌─────────────────┐
│ file-inventory  │ ─── Must run first, all others depend on it
└─────────────────┘
```

**Run:** `file-inventory` agent
**Wait for:** `file-inventory.json`

### Phase 2: Independent Analysis (Requires Phase 1)

```
┌──────────────────┐  ┌─────────────────┐  ┌────────────────┐
│ dependency-mapper │  │   doc-auditor   │  │ script-auditor │
└──────────────────┘  └─────────────────┘  └────────────────┘
```

**Agent Teams Mode:** Spawn 3 teammates, one per agent. All run simultaneously.

**Sequential Mode:** Run in order:
1. `dependency-mapper` → wait for `dependency-graph.json`
2. `doc-auditor` → wait for `doc-audit.json`
3. `script-auditor` → wait for `script-audit.json`

### Phase 3: Deep Analysis (Requires Phases 1 & 2)

```
┌────────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ dead-code-detector │  │ frontend-analyzer │  │ backend-analyzer  │
└────────────────────┘  └───────────────────┘  └───────────────────┘
```

**Agent Teams Mode:** Spawn 3 teammates, one per agent. All run simultaneously. Teammates can message each other when they discover cross-cutting issues.

**Sequential Mode:** Run in order:
1. `dead-code-detector` → wait for `dead-code-report.json`
2. `frontend-analyzer` → wait for `frontend-report.json`
3. `backend-analyzer` → wait for `backend-report.json`

### Phase 4: Synthesis (Requires All Above)

```
┌──────────────┐
│  synthesizer │ ─── Reads all reports, produces final plan
└──────────────┘
```

**Run:** `synthesizer` agent
**Produces:** `final-migration-plan.json` + `MIGRATION_PLAN.md`

## Execution Instructions

### Agent Teams Detection

Before starting, check if Agent Teams is available:
- If available: Use parallel execution for Phases 2 and 3
- If not available: Run all agents sequentially

### Step-by-Step Execution:

0. **Execute Phase 0: Prime Context**
   - Say: "Starting Phase 0: Building Project Understanding"
   - Run the Phase 0 steps defined above
   - Write `.claude/agent-outputs/project-context.md`
   - Confirm context file is written before proceeding

1. **Announce Phase 1**
   - Say: "Starting Phase 1: File Inventory"
   - Read `.claude/commands/agents/file-inventory.md`
   - Execute the agent's instructions
   - Confirm `file-inventory.json` is written

2. **Announce Phase 2**
   - Say: "Starting Phase 2: Independent Analysis"
   - **Agent Teams**: Spawn 3 teammates for parallel execution
   - **Sequential**: Execute dependency-mapper, doc-auditor, script-auditor in order
   - Confirm each output file is written

3. **Announce Phase 3**
   - Say: "Starting Phase 3: Deep Analysis"
   - **Agent Teams**: Spawn 3 teammates for parallel execution
   - **Sequential**: Execute dead-code-detector, frontend-analyzer, backend-analyzer in order
   - Confirm each output file is written

4. **Announce Phase 4**
   - Say: "Starting Phase 4: Synthesis"
   - Execute synthesizer
   - Confirm both `final-migration-plan.json` and `MIGRATION_PLAN.md` are written

5. **Final Report**
   - Summarize what was found
   - Point user to `MIGRATION_PLAN.md` for the full plan
   - Highlight the most important findings
   - Report execution mode: Agent Teams (parallel) or Sequential
   - Report time savings from parallelization if applicable

## Output Location
All agent outputs go to: `.claude/agent-outputs/`

## Error Handling
If an agent fails:
1. Log the error
2. Continue with other agents if possible
3. In Agent Teams mode: teammate failure doesn't block other teammates
4. Note in final synthesis which agents failed
5. Provide partial results

## Completion Criteria
The orchestration is complete when:
- [ ] `project-context.md` exists (Phase 0)
- [ ] `file-inventory.json` exists
- [ ] `dependency-graph.json` exists
- [ ] `doc-audit.json` exists
- [ ] `dead-code-report.json` exists
- [ ] `frontend-report.json` exists
- [ ] `backend-report.json` exists
- [ ] `script-audit.json` exists
- [ ] `final-migration-plan.json` exists
- [ ] `MIGRATION_PLAN.md` exists

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

## Begin Orchestration

Start by announcing the analysis plan, then execute Phase 0.

Target codebase: Current project root

**Execute now.**
