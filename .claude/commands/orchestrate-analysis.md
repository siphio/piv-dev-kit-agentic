# Orchestrator: Codebase Analysis Coordinator

## Role
You are the orchestration agent responsible for coordinating the complete codebase analysis. You manage the execution of multiple specialist sub-agents, ensure proper sequencing, and deliver a comprehensive restructuring plan.

## Overview
This orchestrator coordinates 7 specialist agents to analyze and plan the restructuring of a codebase into vertical slice architecture.

**Before running sub-agents, the orchestrator first primes itself with project understanding.**

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
- Frontend: `macro-tracker/app/page.tsx`, `macro-tracker/app/layout.tsx`
- Backend: `api/main.py`
- AI Agent: `api/agent/coach_agent.py`

### Step 4: Check Current State
```bash
git log -10 --oneline
git status
```

### Step 5: Write Project Context

After gathering this information, write a summary to `.claude/agent-outputs/project-context.md` with:

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
Use bash to run git commands directly:
- `git log` for commit history
- `git blame` for code ownership
- `git log --since` for freshness checks
- No MCP required - just run git commands

### Archon MCP (Documentation RAG)
Provides up-to-date framework documentation:
- Next.js App Router patterns and conventions
- Pydantic AI agent architecture best practices
- FastAPI route and dependency patterns
- Supabase client and auth patterns
- Use extensively to validate patterns against current best practices

## Your Sub-Agents

| Agent | Purpose | Output File |
|-------|---------|-------------|
| `file-inventory` | Scans all files and categorizes them | `file-inventory.json` |
| `dependency-mapper` | Maps import/export relationships | `dependency-graph.json` |
| `doc-auditor` | Evaluates documentation relevance | `doc-audit.json` |
| `dead-code-detector` | Finds unused code | `dead-code-report.json` |
| `frontend-analyzer` | Analyzes Next.js frontend | `frontend-report.json` |
| `backend-analyzer` | Analyzes FastAPI backend | `backend-report.json` |
| `script-auditor` | Evaluates shell/PS scripts | `script-audit.json` |
| `synthesizer` | Combines all reports | `final-migration-plan.json` + `MIGRATION_PLAN.md` |

## Execution Phases

### Phase 0: Prime Context (No Dependencies)
Build project understanding BEFORE any analysis:

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
These agents can run first as they have no prerequisites:

```
┌─────────────────┐
│ file-inventory  │ ─── Must run first, all others depend on it
└─────────────────┘
```

**Run:** `/agents/file-inventory`
**Wait for:** `file-inventory.json`

### Phase 2: Independent Analysis (Requires Phase 1)
These agents only need the file inventory:

```
┌──────────────────┐  ┌─────────────────┐  ┌────────────────┐
│ dependency-mapper │  │   doc-auditor   │  │ script-auditor │
└──────────────────┘  └─────────────────┘  └────────────────┘
```

**Run in sequence:**
1. `/agents/dependency-mapper` → wait for `dependency-graph.json`
2. `/agents/doc-auditor` → wait for `doc-audit.json`
3. `/agents/script-auditor` → wait for `script-audit.json`

### Phase 3: Deep Analysis (Requires Phases 1 & 2)
These agents need both file inventory and dependency graph:

```
┌────────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ dead-code-detector │  │ frontend-analyzer │  │ backend-analyzer  │
└────────────────────┘  └───────────────────┘  └───────────────────┘
```

**Run in sequence:**
1. `/agents/dead-code-detector` → wait for `dead-code-report.json`
2. `/agents/frontend-analyzer` → wait for `frontend-report.json`
3. `/agents/backend-analyzer` → wait for `backend-report.json`

### Phase 4: Synthesis (Requires All Above)
The synthesizer reads all reports and produces the final plan:

```
┌──────────────┐
│  synthesizer │ ─── Reads all reports, produces final plan
└──────────────┘
```

**Run:** `/agents/synthesizer`
**Produces:** `final-migration-plan.json` + `MIGRATION_PLAN.md`

## Execution Instructions

You will execute each agent by reading and following its prompt file, then producing its required output.

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
   - Execute dependency-mapper, doc-auditor, script-auditor in sequence
   - Confirm each output file is written

3. **Announce Phase 3**
   - Say: "Starting Phase 3: Deep Analysis"
   - Execute dead-code-detector, frontend-analyzer, backend-analyzer in sequence
   - Confirm each output file is written

4. **Announce Phase 4**
   - Say: "Starting Phase 4: Synthesis"
   - Execute synthesizer
   - Confirm both `final-migration-plan.json` and `MIGRATION_PLAN.md` are written

5. **Final Report**
   - Summarize what was found
   - Point user to `MIGRATION_PLAN.md` for the full plan
   - Highlight the most important findings

## Output Location
All agent outputs go to: `.claude/agent-outputs/`

## Error Handling
If an agent fails:
1. Log the error
2. Continue with other agents if possible
3. Note in final synthesis which agents failed
4. Provide partial results

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

## Begin Orchestration

Start by announcing the analysis plan, then execute Phase 1.

Target codebase: Current project root (siphio-website)

**Execute now.**
