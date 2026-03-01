---
description: Scaffold a new project into context monorepo structure
argument-hint: [project-name]
---

# Scaffold: Initialize Context Monorepo Structure

## Overview

Create a standardized project structure optimized for agent consumption (context monorepo). This command sets up the directory skeleton, generates a `vision.md` from conversation with the developer, stubs out architecture and domain knowledge files, and initializes git.

The scaffold serves three purposes:
1. **Agent-ready structure** - Every downstream PIV command knows where to find and write artifacts
2. **Context foundation** - `vision.md` captures project intent before any PRD or planning begins
3. **Module scaffolding** - Creates per-module directories ready for `/discuss-module` and `/discuss-slice` output

## Arguments

Parse `$ARGUMENTS` for the project name. This argument is **required**.

- If no argument is provided, stop and ask: "What is the project name? (e.g., `my-cool-project`)"
- If the project name contains spaces, convert to kebab-case (e.g., "My Cool Project" becomes `my-cool-project`)
- Strip any leading/trailing whitespace

## Reasoning Approach

**CoT Style:** Zero-shot

Before scaffolding, think step by step:
1. Parse and validate the project name from arguments
2. Check if the target directory already exists — determine merge or fresh creation
3. Gather project vision through structured conversation
4. Identify modules from the discussion
5. Create directory structure and all stub files
6. Initialize git and generate CLAUDE.md

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to `vision.md` (the primary file artifact of this command).

---

## Process

### 1. Parse and Validate Project Name

Extract the project name from `$ARGUMENTS`.

**Validation rules:**
- Must be non-empty after stripping whitespace
- Convert spaces to hyphens, lowercase all characters (kebab-case)
- Strip any characters that are not alphanumeric, hyphens, or underscores
- Store the sanitized name as `{project-name}` for all subsequent steps

### 2. Check Target Directory

Check if `./{project-name}/` already exists.

**If directory exists:**
- List the existing contents
- Ask the developer: "Directory `{project-name}/` already exists. Merge into existing structure or abort?"
- **Merge**: Preserve all existing files. Only create directories and files that do not already exist. Skip writing any file that already has content.
- **Abort**: Stop execution and report: "Scaffold aborted. Existing directory preserved."

**If `.agents/` subdirectory exists within the target:**
- Preserve all existing manifest data, plans, validations, and reference files
- Only add missing directories from the scaffold structure

### 3. Gather Project Vision (Conversational)

Conduct a structured conversation with the developer to populate `vision.md`. Ask these questions one group at a time. Wait for responses before proceeding.

**Group 1 — Purpose and Users:**
- "What does this project do and why does it exist?"
- "Who are the target users and how will they interact with it?"

**Group 2 — Success and Constraints:**
- "What measurable outcomes define success for this project?"
- "What are the technical, business, or resource constraints?"

**Group 3 — Modules:**
- "What are the main modules or components of this project? For each, give a name, brief purpose, and key dependencies (if any)."
- "If you are unsure about modules yet, say 'none' and you can add them later with `/discuss-module`."

Record all answers for use in vision.md generation.

### 4. Create Directory Structure

Create the full directory tree under `./{project-name}/`:

```
{project-name}/
├── context/
│   ├── modules/                        # /discuss-module output (per module)
│   ├── profiles/                       # /research-stack output
│   ├── research/                       # raw research notes
│   ├── vision.md                       # generated in Step 5
│   ├── architecture.md                 # stub generated in Step 6
│   └── domain-knowledge.md             # stub generated in Step 7
├── src/                                # source code (agent-generated)
├── test-data/                          # test fixtures and sample data
├── .agents/
│   ├── manifest.yaml                   # initialized in Step 10
│   ├── plans/
│   ├── validation/
│   ├── progress/
│   └── reference/                      # technology profiles
├── .claude/
│   └── commands/                       # PIV commands
├── CLAUDE.md                           # generated in Step 9
└── .gitignore                          # generated in Step 8
```

**Module subdirectories:** For each module identified in Step 3, create:

```
context/modules/{module-name}/
├── specification.md                    # /discuss-module output (stub)
└── slices/                             # /discuss-slice output directory
```

**If zero modules were identified:** Create `context/modules/` as an empty directory. Do not create any module subdirectories.

### 5. Generate vision.md

Write `context/vision.md` using the developer's answers from Step 3. Follow this template:

```markdown
# Project Vision: {project-name}

## Purpose
[Developer's answer about what this project does and why it exists]

## Target Users
[Developer's answer about who uses this and how]

## Success Metrics
[Developer's answer about measurable outcomes]

## Constraints
[Developer's answer about technical, business, or resource constraints]

## Modules Overview
| Module | Purpose | Key Dependencies |
|--------|---------|-----------------|
| {name} | {brief} | {deps or "none"} |

## Last Updated
{current date in YYYY-MM-DD format}
```

If zero modules were identified, replace the Modules Overview table with:

```markdown
## Modules Overview
No modules defined yet. Use `/discuss-module` to add modules.
```

Append the hooks block to the end of `vision.md` (see Hooks section below).

### 6. Generate architecture.md Stub

Write `context/architecture.md`:

```markdown
# Architecture: {project-name}

## Overview
[Generated by /map-dependencies — run that command to populate this file]

## System Diagram
[Pending]

## Module Relationships
[Pending]

## Last Updated
{current date in YYYY-MM-DD format}
```

### 7. Generate domain-knowledge.md Stub

Write `context/domain-knowledge.md`:

```markdown
# Domain Knowledge: {project-name}

## Overview
This file captures domain-specific knowledge that is not obvious from the code.
Maintained by humans — update as domain understanding evolves.

## Key Concepts
[Add domain terms, business rules, and context that agents need to understand]

## Business Rules
[Add rules that govern how the system should behave]

## External References
[Links to documentation, specs, or resources]

## Last Updated
{current date in YYYY-MM-DD format}
```

### 8. Generate .gitignore

Write `.gitignore` at the project root:

```
node_modules/
__pycache__/
*.pyc
.env
.env.local
dist/
build/
.DS_Store
*.log
.venv/
venv/
```

### 9. Generate CLAUDE.md

Write `CLAUDE.md` at the project root with project-specific rules:

```markdown
# {project-name} — Development Rules

## Project Overview
{One-line summary from vision.md Purpose section}

## Context Structure
This project uses the context monorepo pattern:
- `context/vision.md` — Project vision and module overview
- `context/architecture.md` — System architecture (/map-dependencies output)
- `context/domain-knowledge.md` — Human-maintained domain knowledge
- `context/modules/{name}/specification.md` — Module specs (/discuss-module output)
- `context/modules/{name}/slices/{id}/context.md` — Slice context (/discuss-slice output)
- `context/profiles/` — Technology profiles (/research-stack output)
- `context/research/` — Raw research notes

## Agent Artifacts
- `.agents/manifest.yaml` — Project state tracking
- `.agents/plans/` — Implementation plans
- `.agents/validation/` — Validation results
- `.agents/progress/` — Execution progress
- `.agents/reference/` — Technology profiles

## Conventions
- Plain English over code snippets in all context documents
- Each module specification must be self-contained
- Update manifest after every artifact change
- Run `/prime` after `/clear` to reload context

## Last Updated
{current date in YYYY-MM-DD format}
```

### 10. Initialize Manifest

Write `.agents/manifest.yaml`:

```yaml
project:
  name: {project-name}
  scaffolded_at: {ISO 8601 timestamp}
  structure: context-monorepo

artifacts:
  vision:
    path: context/vision.md
    status: complete
    generated_at: {ISO 8601 timestamp}
  architecture:
    path: context/architecture.md
    status: stub
    generated_at: {ISO 8601 timestamp}
  domain_knowledge:
    path: context/domain-knowledge.md
    status: stub
    generated_at: {ISO 8601 timestamp}

modules:
  {module-name}:
    specification: context/modules/{module-name}/specification.md
    status: stub
    slices: []

settings:
  profile_freshness_window: 7d
  mode: autonomous

last_updated: {ISO 8601 timestamp}
```

If zero modules, omit the `modules` section entirely.

If `.agents/manifest.yaml` already exists, merge the new entries — preserve all existing keys.

### 11. Initialize Git Repository

Run `git init` in the project directory (if not already a git repo).

Create an initial commit:
```bash
git add -A
git commit -m "chore: scaffold project structure for {project-name}"
```

If git is already initialized, stage and commit the new scaffold files only.

### 12. Generate Module Specification Stubs

For each module identified in Step 3, write `context/modules/{module-name}/specification.md`:

```markdown
# Module: {module-name}

## Purpose
{Brief purpose from the developer's module description}

## Slice Breakdown
[Run `/discuss-module {module-name}` to populate this section]

## Data Contracts

### Provides (to other modules)
[Pending]

### Consumes (from other modules)
[Pending]

## Technology Requirements
[Pending]

## Infrastructure
[Pending]

## Testing Seeds
[Pending]

## Status
- Specification: stub
- Slices defined: 0
- Technologies needing profiles: none
```

---

## Edge Cases

**Module count is 0:** Create the `context/modules/` directory but no subdirectories. Skip the modules table in `vision.md`. Omit the `modules` section from manifest.

**Project name has spaces:** Convert to kebab-case before any directory creation. Example: "My Cool Project" becomes `my-cool-project`.

**`.agents/` already exists in target:** Preserve all existing files. Only create missing directories and files. Read existing `manifest.yaml` and merge new entries — never overwrite existing keys.

**Target directory is already a git repo:** Skip `git init`. Stage only the newly created scaffold files and commit them.

**Developer declines to answer some vision questions:** Use "[To be defined]" as placeholder text in the corresponding `vision.md` section. Note the gap in terminal output.

---

## Output Confirmation

After scaffolding is complete, report to terminal:

1. Project directory path (absolute)
2. Number of directories created
3. Number of files created
4. Number of modules scaffolded
5. Git initialization status
6. List of created files

### Reasoning

Output 4-8 bullets summarizing the scaffold process:

```
### Reasoning
- Parsed project name: {project-name} (from arguments: "{raw arguments}")
- Created [N] directories, [N] files
- Modules identified: [list or "none"]
- Git repo initialized with initial commit
- Vision populated from developer conversation
```

### Reflection

Self-critique the scaffold output (terminal only):
- Is the directory structure complete and correct?
- Does vision.md accurately capture the developer's answers?
- Are all module stubs created with correct paths?
- Is the manifest properly initialized?
- Were any edge cases encountered and handled?

Format:

```
### Reflection
- ✅/⚠️ [Finding]
- ✅/⚠️ [Finding]
```

---

## PIV-Automator-Hooks

Append to `context/vision.md`:

```
## PIV-Automator-Hooks
scaffold_status: complete
project_name: {project-name}
modules_created: {N}
structure_valid: true
git_initialized: true
next_suggested_command: discuss-module
next_arg: "{first-module-name or empty}"
confidence: high
```
