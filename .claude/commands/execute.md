---
description: Execute a development plan with Agent Teams parallelism and file-based progress tracking
argument-hint: [plan-file-path]
---

# Execute Development Plan

Execute a development plan with intelligent task parallelization and integrated validation. Uses Agent Teams for parallel execution when available, with sequential fallback mode.

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

## Step 1: Read and Parse Plan

- Read plan file from `$ARGUMENTS[0]`
- Extract `tasks` array with `id`, `description`, `depends_on`, and `output_files` fields
- Parse `TECHNOLOGY PROFILES CONSUMED` section and load profile references from `.agents/reference/`
- Validate plan structure and task IDs for circular dependencies

## Step 2: Initialize Progress Tracking

- Create or update `.agents/progress/{plan-name}-progress.md` with task list
- Set all tasks to status: "todo"
- Record: task ID, title, dependencies, assigned technology profiles, timestamps

## Step 4: Task Dependency Analysis

- Build dependency graph from all task `depends_on` fields
- Identify independent tasks (no dependencies or all dependencies resolved)
- Group independent tasks into parallel execution batches
- Detection rules:
  - Tasks modifying same files are dependent
  - Tasks using different tools/services are independent (unless explicit depends_on)
  - Tasks with completed prerequisite tasks can run in parallel
- Output analysis report: total tasks, identified batch count, critical path length, parallelization potential

## Step 5: Codebase Analysis

- Scan project structure for existing implementation patterns
- Map file locations, module structure, existing integrations
- Identify import statements and integration points for referenced modules
- Analyze technology profile requirements and check for available tools/libraries
- Document analysis findings for team context

## Step 6: Implementation - Agent Teams Mode (When Available)

**Team Lead Coordinates Execution:**
1. Analyze dependency graph from Step 4
2. Create parallel execution plan with task batches
3. For each batch:
   - Spawn teammates (one per independent task)
   - Provide each teammate with:
     - Task ID and description
     - Dependency graph showing completed tasks
     - Technology profiles from `.agents/reference/`
     - Codebase analysis from Step 5
     - Full context window
   - Each teammate:
     - Reads assigned technology profiles
     - Implements assigned task(s)
     - Pushes changes to shared repository
     - Reports completion status to lead
   - Lead waits for all teammates in batch to complete
   - Lead verifies integration between batch outputs before proceeding
4. Lead handles sequential dependencies directly
5. Update progress file throughout execution

**Agent Teams Rules:**
- Teammates coordinate through git push/pull on shared upstream
- Each teammate receives dedicated context window for their task
- Lead delegates implementation but coordinates overall flow
- Teammates can message each other for integration questions
- If teammate encounters issues with another's work, direct messaging required
- Failures in one task block dependent tasks only

**Terminal Visibility (REQUIRED):**
Lead MUST output progress to terminal so the user can track execution:
```
🚀 Batch [N]: Spawning [N] teammates

Teammate 1: [task ID] → [task description]
Teammate 2: [task ID] → [task description]

⏳ Batch [N] executing...

✅ Teammate 1 complete: [files created/modified, brief result]
❌ Teammate 2 failed: [error summary]

📊 Batch [N] complete: [N]/[N] succeeded
```
- Announce each batch BEFORE spawning teammates
- Report each teammate's result as they complete
- Summarize batch results before starting the next batch
- Never execute silently — the user must see what is happening

## Step 7: Implementation - Sequential Fallback Mode

Execute tasks serially when Agent Teams unavailable:

1. Sort tasks by dependency order
2. For each task in order:
   - Update progress file: task status → "doing"
   - Read technology profiles referenced in task
   - Implement task following description and dependencies
   - Push changes to repository
   - Update progress file: task status → "review"
3. Maximum one task in "doing" state at any time
4. Stop on critical failures; mark remaining tasks as "blocked"

## Step 8: Validation Phase

1. Collect all implemented features and modified files
2. Launch validator agent with Task tool:
   - Provide feature list with descriptions
   - Provide modified file manifest
   - Provide test coverage requirements from plan
3. Validator:
   - Creates unit tests for each feature
   - Tests integration points between tasks
   - Runs full test suite
   - Reports coverage and failures
4. Update progress file with validation results

## Step 9: Finalize Progress

- Update progress file: validated tasks → "done"
- Update progress file: failed tasks → "blocked"
- Leave unvalidated tasks in "review" for manual verification
- Record completion timestamps and validation results
- Record any remediation actions needed

## Step 10: Final Report

Output comprehensive execution summary:

```
EXECUTION COMPLETE

Tasks: {total} total, {completed} done, {review} review, {blocked} blocked
Execution Mode: {Agent Teams|Sequential Fallback}
Duration: {elapsed time}

Parallel Execution (if Agent Teams used):
- Teammates spawned: {count}
- Parallel batches: {count}
- Estimated time saved: {percentage}
- Critical path: {task IDs}

Technology Profiles Consumed:
- {profile name}: {tasks using it}
- {profile name}: {tasks using it}

Validation Results:
- Test coverage: {percentage}
- Tests passed: {count}
- Tests failed: {count}
- Coverage gaps: {list or "none"}

Implementation Summary:
- Files created: {count}
- Files modified: {count}
- Lines of code: {count}
- Integration points verified: {count}

Next Steps:
→ Run `/validate-implementation {plan-file}` to validate against PRD scenarios
- {remediation for any failures before validation}
- {documentation updates if needed}
```

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

## Rules and Error Handling

**Dependency Resolution:**
- Detect circular dependencies before execution; abort with error
- If task has unmet dependencies, block task and mark dependent tasks as "blocked"
- After task completion, automatically unblock dependent tasks

**Technology Profile Handling:**
- Load profiles from `.agents/reference/{profile-name}-profile.md`
- Profiles contain: tool instructions, integration patterns, best practices
- Pass profiles to teammates in Agent Teams mode
- Log profile consumption for final report

**File Conflict Resolution:**
- If two tasks modify same file, mark as dependent (make sequential)
- If modification conflicts occur, fail task and request manual merge
- Document all file conflicts in final report

**Agent Teams Fallback:**
- If Agent Teams unavailable, automatically switch to Sequential mode
- Log mode selection and availability check results
- Maintain same output format in both modes

**Completion Criteria:**
- All tasks status tracked in progress file
- All modified files committed to repository
- Validation phase completes successfully
- Final report generated
- No critical failures blocking deployment

**Abort Conditions:**
- Circular dependency detected
- Task fails 3 consecutive validation attempts
- Core integration test fails
- Manual intervention required (wait for user input)
