---
description: Prime agent with codebase understanding, technology profiles, and development context
---

# Prime: Load Project Context

## Arguments: $ARGUMENTS

## Objective

Build comprehensive understanding of the codebase by analyzing structure, documentation, technology research profiles, and key files. Produces a context summary that enables all other PIV commands.

## Reference Files Policy

**Default behavior**: Do NOT read reference files (`.agents/reference/`, `ai_docs/`, `ai-wiki/`, or similar reference directories) in full.

**Exception**: Only read reference files if the arguments explicitly request it (e.g., `--with-refs`, `include references`, `read reference files`).

**Technology Profiles**: Always LIST available profiles in `.agents/reference/` but only read their summaries (first 10 lines). Full profiles are consumed by `/plan-feature` and `/execute`.

Check arguments for keywords: `ref`, `reference`, `--with-refs`, `include ref`

## Reasoning Approach

**CoT Style:** Zero-shot

Before producing the output report, think step by step:
1. Scan codebase structure — file count, directory patterns, languages
2. Cross-reference `.agents/reference/` profiles with `.agents/plans/` progress
3. Assess development progress — what's done, what's pending, any gaps
4. Check artifact freshness — are plans/profiles outdated relative to recent commits?
5. Determine the precise next step based on current PIV loop position

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to terminal output (this command does not produce a file artifact).

If arguments contain `--no-manifest`, skip all manifest operations (legacy fallback).
Strip flags from arguments before processing reference file keywords.

## Process

### 0. Load or Build Manifest

> Skip this step and all manifest operations if `--no-manifest` flag is present.

**If `.agents/manifest.yaml` exists:**
- Read the manifest file into memory

**If `.agents/manifest.yaml` does not exist (first run):**
- Scan the filesystem to discover existing artifacts:
  - PRD: Check `PRD.md`, `.agents/PRD.md`
  - Profiles: Check `.agents/reference/*-profile.md`
  - Plans: Check `.agents/plans/*.md`
  - Progress: Check `.agents/progress/*-progress.md`
  - Validations: Check `.agents/validation/*.md`
- Build a manifest from discovered artifacts with inferred metadata:
  - `generated_at`: Use file modification date
  - `status`: Infer from file existence (`complete` if file exists)
  - Phase statuses: Infer from which plans/validations exist
- Create `.agents/` directory if it doesn't exist
- Write the new manifest to `.agents/manifest.yaml`

### 0b. Reconcile Manifest

Run every time (even on existing manifests):

1. **Compare manifest entries against actual files on disk:**
   - Files listed in manifest but missing from disk → set `status: missing`, output warning
   - Files on disk (PRD, profiles, plans, validations) not in manifest → add with inferred metadata, output warning

2. **Recalculate profile freshness:**
   - Read `profile_freshness_window` from CLAUDE.md PIV Configuration (default: 7d)
   - For each profile entry: if `generated_at` + freshness window < today → set `freshness: stale`
   - Otherwise → set `freshness: fresh`

3. **Update phase status consistency:**
   - Cross-reference plan files, progress files, and validation files against phase entries
   - Ensure phase statuses reflect actual artifact state

4. **Read `failures` and `checkpoints` sections** from manifest into memory for use in Step 0d

5. **Handle `stale_artifact` error category:** If manifest/disk mismatch is detected that can't be auto-resolved (e.g., file referenced by active execution but missing), classify as `stale_artifact`, write to manifest `failures` section, output `## PIV-Error` block

6. **Write reconciled manifest back to `.agents/manifest.yaml`**
7. **Update `last_updated` timestamp** (ISO 8601)

### 0c. Coverage Gap Detection

1. Identify the next unfinished phase from manifest (first phase where `plan` is `not_started` or `execution` is `not_started`)
2. Read the PRD phase section for that phase to extract technologies referenced
3. Cross-reference those technologies against existing profile entries in manifest
4. Flag:
   - **Missing profiles**: Technology referenced in phase but no profile exists
   - **Stale profiles**: Profile exists but `freshness: stale`
5. Store coverage gaps for use in the output report and next-action recommendation

### 0d. Failure Assessment

> Runs after coverage gap detection. Reads failure and checkpoint state from manifest.

1. **Read `checkpoints` section:** Identify any with `status: active`
2. **Read `failures` section:** Identify any with `resolution: pending`
3. **For pending failures:** Check `retry_count` vs `max_retries` from error taxonomy
4. **Determine failure state:**
   - Retries remaining → can retry
   - No retries remaining → needs rollback or escalation
   - Active checkpoint + no failure → execution was interrupted
   - No active checkpoints, no pending failures → clean state

5. **Read `notifications` section:** Identify any unacknowledged notifications
   - `blocking: true` with `acknowledged` absent or `false` → report as active blocker
   - `blocking: false` with `acknowledged` absent or `false` → include in status report as informational
   - `acknowledged: true` → skip (already forwarded by orchestrator)

6. **Read `preflight` section:** Check credential verification status
   - If `preflight.status: passed` → credentials are verified, autonomous execution is cleared
   - If `preflight.status: blocked` → credentials are missing, report as active blocker
   - If no `preflight` entry → preflight has not been run yet

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure:
On Linux, run: `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build'`

### 2. Read Core Documentation

- Read CLAUDE.md or similar global rules file
- Read README files at project root and major directories
- Read `.agents/PRD.md` or `PRD.md` (if exists)
- Read any architecture documentation in root or docs/

**Skip these unless arguments explicitly request references:**
- `.agents/reference/` directory (full content)
- `ai_docs/` directory
- `ai-wiki/` directory

### 3. Discover Technology Profiles

Check for research profiles produced by `/research-stack`:

```bash
ls .agents/reference/*-profile.md 2>/dev/null
```

If profiles exist:
- List each profile name and the technology it covers
- Read the first section (Agent Use Case line) from each to understand what's available
- Report profile count and technologies covered
- Note: These are consumed in full by `/plan-feature` and `/execute`

If no profiles exist:
- Note: "No technology profiles found. Run `/research-stack` after PRD creation."

### 4. Identify Key Files

Based on the structure, identify and read:
- Main entry points (main.py, index.ts, app.py, etc.)
- Core configuration files (pyproject.toml, package.json, tsconfig.json)
- Key model/schema definitions
- Important service or controller files

### 5. Understand Current State

Check recent activity:
!`git log -10 --oneline`

Check current branch and status:
!`git status`

### 6. Check Development Progress

**If manifest is available** (not `--no-manifest`):
- Report phase statuses from manifest (`phases` section): plan, execution, validation status per phase
- Report profile freshness counts: N fresh, N stale, N missing
- Report coverage gaps from Step 0c: missing or stale profiles for the next unfinished phase
- Report last manifest update timestamp

**Fallback** (if `--no-manifest` or manifest unavailable):
If `.agents/plans/` exists:
```bash
ls -t .agents/plans/*.md 2>/dev/null
```
Report which plans exist and their phases.

If `.agents/validation/` exists:
```bash
ls -t .agents/validation/*.md 2>/dev/null
```
Report most recent validation results.

If PRD exists, check the "Current Focus" section for active phase and status.

## Output Report

Provide a concise summary covering:

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture
- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Tech Stack
- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Technology Research Status
- Profiles available in `.agents/reference/`: [list or "none"]
- Technologies covered: [list]
- `/research-stack` status: [Complete / Not Run]

### Development Progress
- Active PRD phase: [Phase N or "No PRD"]
- Plans created: [list or "none"]
- Latest validation: [date and result or "none"]
- Progress tracking: [`.agents/progress/` status or "no active execution"]

### Core Principles
- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State
- Active branch
- Recent changes or development focus
- Any immediate observations or concerns

### Manifest Status (If Manifest Available)

Report:
- Manifest location: `.agents/manifest.yaml`
- Last updated: [timestamp]
- Reconciliation results: [N files matched, N warnings]
- Profile freshness: [N fresh, N stale, N missing]
- Coverage gaps: [list or "none"]
- Active checkpoints: [list with tag name and phase, or "none"]
- Pending failures: [list with error_category, retry count/max, details — or "none"]
- Pending notifications: [list with type, severity, details — or "none"]
- Pre-flight status: [passed | blocked | not run]
- Resolution recommendation: [retry guidance, rollback recommendation, or "clean state"]

### Recommended Next Step

**If manifest is available**, use manifest-driven priority logic (highest priority first):
0. **PRD validated but `/preflight` not run?** → "Run `/preflight` to verify credentials and environment before autonomous execution" (triggers when: PRD complete + profiles exist + `preflight` section absent from manifest OR `preflight.status != passed`)
1. **Pending failure + retries remaining?** → "Retry `/execute` — fix [details from failure entry]"
2. **Pending failure + no retries remaining?** → "Rollback to checkpoint `[tag]` and escalate — [details]"
3. **Active checkpoint + no failure?** → "Execution interrupted — resume `/execute [plan path]`"
4. Stale or missing profiles needed for next phase? → "Run `/research-stack --refresh` to update stale profiles" or "Run `/research-stack` to generate missing profiles" (also covers `stale_artifact` error category)
5. No PRD? → "Run `/create-prd` to define requirements"
6. Next phase has no plan? → "Run `/plan-feature \"Phase N: Name\"` to start planning"
7. Plan exists, not executed? → "Run `/execute .agents/plans/[plan].md`"
8. Executed, not validated? → "Run `/validate-implementation`"
9. Validated? → "Run `/commit` to ship"

Write the recommendation to the manifest `next_action` block:
```yaml
next_action:
  command: [command name]
  argument: "[argument string]"
  reason: "[why this is the recommended next step]"
  confidence: [high|medium|low]
```

**Fallback** (if `--no-manifest`): Use the static if/else chain:
- No PRD? → "Run `/create-prd` to define requirements"
- PRD exists, no profiles? → "Run `/research-stack` to research technologies"
- Profiles exist, no plans? → "Run `/plan-feature \"Phase 1\"` to start planning"
- Plan exists, not executed? → "Run `/execute .agents/plans/[plan].md`"
- Executed, not validated? → "Run `/validate-implementation`"
- Validated? → "Run `/commit` to ship"

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

### PIV-Automator-Hooks

Append to terminal output:

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

**Make this summary easy to scan - use bullet points and clear headers.**
