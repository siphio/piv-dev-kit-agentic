# Feature: Phase 3 — VS Code Integration & Resilience

The following plan should be complete, but validate documentation and codebase patterns before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Production-ready orchestrator lifecycle: a `/go` slash command for VS Code that spawns the orchestrator as a detached background Node process, crash recovery that resumes from manifest state, PID-based duplicate prevention, graceful shutdown on SIGTERM/SIGINT, uncommitted change detection on restart, and self-contained drop-in packaging.

## User Story

**US-006 (Crash Recovery):**
As a developer, I want the orchestrator to resume from where it left off after an unexpected restart, so that no progress is lost and I don't have to manually figure out what completed.

**US-007 (Drop-in Distribution):**
As a developer starting a new project, I want to drop the `.claude/` folder into my project and immediately have orchestration capabilities, so that setup is copying a folder, not configuring infrastructure.

## Problem Statement

The orchestrator runs but has no VS Code launch mechanism, no crash recovery, no duplicate-instance prevention, and no formal packaging. A developer must manually run `npx tsx src/index.ts` from the orchestrator directory — there's no way to start it from VS Code, detect if it's already running, or survive a crash gracefully.

## Solution Statement

Add a process lifecycle layer: PID file management, startup recovery logic, signal-based graceful shutdown, and a Claude Code `/go` slash command that spawns the orchestrator as a detached `node` process with log output. The orchestrator reads manifest on startup to determine resume point via the existing `determineNextAction()` state machine.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: index.ts (entry point), new process-manager.ts, new /go command
**Dependencies**: Node.js child_process, fs, process (all built-in — no new npm packages)
**Agent Behavior**: Yes — crash recovery implements PRD decision tree "Phase Advancement" resume path

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `claude-agent-sdk-profile.md` — Used for: Session lifecycle (query/resume) during crash recovery
  - Key endpoints: `query()`, session resume via `resume` option
  - Auth method: OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`)
  - Critical constraints: Sessions are ephemeral; crash recovery creates fresh session and re-primes

- `anthropic-auth-profile.md` — Used for: OAuth token validation at startup
  - Auth method: OAuth subscription token
  - Critical constraint: Token must be present or orchestrator refuses to start

**Impact on Implementation:**
Crash recovery cannot resume an Agent SDK session (sessions are ephemeral). Instead, the orchestrator creates a fresh session via `runCommandPairing()` and the state machine determines which phase/step to resume from manifest state. This is already the design — `runAllPhases()` skips completed phases.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `.claude/orchestrator/src/index.ts` (full file) — Why: Main entry point; shutdown handlers, Telegram setup, execution flow. New PID/recovery logic integrates here.
- `.claude/orchestrator/src/piv-runner.ts` (lines 266-309) — Why: `runAllPhases()` already skips completed phases — crash recovery leverages this directly.
- `.claude/orchestrator/src/state-machine.ts` (lines 86-189) — Why: `determineNextAction()` handles active checkpoints and pending failures — core of recovery logic.
- `.claude/orchestrator/src/git-manager.ts` (lines 43-46) — Why: `hasUncommittedChanges()` — used during restart validation.
- `.claude/orchestrator/src/manifest-manager.ts` (lines 24-28, 34-45) — Why: `readManifest()`/`writeManifest()` — manifest is sole recovery state.
- `.claude/orchestrator/src/config.ts` (full file) — Why: `loadConfig()` pattern for new config fields.
- `.claude/orchestrator/src/types.ts` (full file) — Why: All type definitions; new types added here.
- `.claude/orchestrator/src/error-classifier.ts` (lines 1-15) — Why: Error taxonomy includes `partial_execution` and new `orchestrator_crash` category.
- `.claude/orchestrator/src/telegram-notifier.ts` — Why: `sendText()` used for restart notifications.
- `.claude/orchestrator/package.json` — Why: Scripts section; add `build` output verification.
- `.claude/orchestrator/tsconfig.json` — Why: Confirms `outDir: "dist"`, `rootDir: "src"`.
- `.claude/orchestrator/tests/state-machine.test.ts` — Why: Test pattern with `baseManifest()` factory.

### New Files to Create

- `.claude/orchestrator/src/process-manager.ts` — PID file management, stale detection, process spawning
- `.claude/orchestrator/tests/process-manager.test.ts` — Unit tests for PID lifecycle
- `.claude/commands/go.md` — Claude Code `/go` slash command

### Relevant Documentation

- Node.js child_process.spawn docs — `detached: true`, `stdio: ['ignore', fd, fd]` pattern for background processes
- Node.js process.kill(pid, 0) — Zero-signal technique for checking if process is alive without killing it

### Patterns to Follow

**Naming Conventions:** camelCase functions, PascalCase types/interfaces, kebab-case files (MIRROR: all existing src/*.ts files)

**Error Handling:** try/catch with console.log for warnings, throw for fatal errors (MIRROR: git-manager.ts:5-11 execFileSync pattern)

**Module Exports:** Named exports only, no default exports (MIRROR: all existing modules)

**Test Pattern:** vitest with describe/it/expect, `baseManifest()` factory for test data (MIRROR: tests/state-machine.test.ts:10-42)

**Sync vs Async:** File system ops that are startup-critical use sync APIs (existsSync, readFileSync for PID). Manifest operations remain async (MIRROR: git-manager.ts uses execFileSync, manifest-manager.ts uses async fs).

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Crash Recovery Decision Tree (PRD Section 4.2 — Phase Advancement + new):**

1. Startup → Read PID file
   - PID file exists + process alive → ABORT with "orchestrator already running (PID: N)"
   - PID file exists + process dead → Remove stale PID, continue startup (log warning)
   - No PID file → Continue startup

2. Startup → Read manifest
   - Manifest exists → `determineNextAction()` for resume point
   - Manifest missing → Log "no manifest found, run /prime first", exit 1
   - Manifest parse error → Rebuild from filesystem scan (delegate to /prime on first command)

3. Startup → Check git state
   - Uncommitted changes detected → Log warning, notify Telegram, continue (don't auto-stash)
   - Clean working tree → Continue normally

4. Startup → Check for active checkpoint with no failure
   - Active checkpoint found → "Execution interrupted — resume from last completed step"
   - Pending failure found → Follow existing retry/rollback logic in `handleError()`
   - Clean state → Start from `determineNextAction()` recommendation

### Scenario Mappings

| Scenario (PRD 4.3) | Agent Workflow | Decision Tree | Success Criteria |
|---|---|---|---|
| SC-011: Crash Recovery | Restart → read manifest → check git → resume from next uncompleted step | Crash Recovery Tree | Resumes without re-executing completed work |
| SC-012: Empty Phase | Plan → execute (minimal) → validate (doc check) → commit | Phase Advancement | Handles phases with no testable code |

### Error Recovery Patterns

- `orchestrator_crash`: Detected on restart via stale PID file + manifest state. Recovery: read manifest, create fresh Agent SDK session, resume from `determineNextAction()`.
- `manifest_corruption`: YAML parse error. Recovery: log error, exit with guidance to run `/prime` (which rebuilds manifest from filesystem).
- `partial_execution` with active checkpoint: Already handled by `piv-runner.ts` `handleError()` function.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Process Manager Module

Create `process-manager.ts` with PID lifecycle functions and error types for the new `orchestrator_crash` category.

### Phase 2: Core — Startup Recovery & Graceful Shutdown

Integrate process manager into `index.ts`: PID write on start, recovery logic on restart, cleanup on shutdown, Telegram notification on restart with resume context.

### Phase 3: Integration — /go Slash Command

Create the Claude Code `/go` command that spawns the orchestrator as a detached background process with log output.

### Phase 4: Testing & Validation

Unit tests for process manager, integration of crash recovery into existing state machine tests, and acceptance criteria verification.

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| Fresh start | PID written, execution begins | Missing OAuth token → exit 1 | PID file created |
| Crash recovery | PID stale → removed, manifest read, resumes | Manifest corrupt → exit with guidance | Stale PID cleaned, fresh PID written |
| Duplicate prevention | Running PID → abort with message | — | No state change |
| Graceful shutdown | SIGTERM → PID removed, bot stopped | PID removal fails → warn only | PID file deleted |
| /go command | Spawns detached process, shows PID | Build not compiled → error message | Process spawned, PID visible |

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-011 | Kill orchestrator mid-execution, restart, verify resumes from correct phase | No re-execution of completed phases; notification sent |
| SC-012 | Create a phase with doc-only deliverables, run through PIV loop | Phase completes without test failures |

### Validation Acceptance Criteria

- [ ] PID file written on startup, removed on clean shutdown
- [ ] Stale PID detection works (process dead but PID file exists)
- [ ] Duplicate instance prevented (process alive with PID file)
- [ ] Manifest read on startup determines resume point
- [ ] Uncommitted changes detected and logged on restart
- [ ] Telegram notification sent on restart with resume context
- [ ] `/go` command spawns detached process successfully
- [ ] Log file captures stdout/stderr at `.agents/orchestrator.log`
- [ ] `npm install && npm run build` produces working `dist/index.js`
- [ ] All decision trees return expected outcomes per PRD

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `.claude/orchestrator/src/types.ts` — Add process management types

- **IMPLEMENT**: Add `ProcessInfo` interface and extend `ErrorCategory` union with `"orchestrator_crash" | "manifest_corruption"`
- **PATTERN**: MIRROR existing type definitions in types.ts:86-96 (FailureEntry pattern)
- **IMPORTS**: None needed (type-only additions)
- **TYPES TO ADD**:
  ```typescript
  export interface ProcessInfo {
    pid: number;
    startedAt: string;
    projectDir: string;
  }
  ```
- **EXTEND ErrorCategory**: Add `"orchestrator_crash" | "manifest_corruption"` to the union
- **EXTEND ErrorTaxonomyEntry usage**: These categories need taxonomy entries in error-classifier
- **GOTCHA**: The `ErrorCategory` union is referenced in `error-classifier.ts` `ERROR_TAXONOMY` record — both must be updated together
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 2: UPDATE `.claude/orchestrator/src/error-classifier.ts` — Add new error categories

- **IMPLEMENT**: Add taxonomy entries and classification patterns for `orchestrator_crash` and `manifest_corruption`
- **PATTERN**: MIRROR existing entries in error-classifier.ts:6-14
- **TAXONOMY ENTRIES**:
  - `orchestrator_crash`: `{ maxRetries: 0, needsHuman: false, recoveryAction: "resume from manifest state" }`
  - `manifest_corruption`: `{ maxRetries: 0, needsHuman: false, recoveryAction: "rebuild manifest via /prime" }`
- **CLASSIFICATION PATTERNS**:
  - `orchestrator_crash`: `[/crash/i, /orchestrator.*restart/i, /stale.*pid/i]`
  - `manifest_corruption`: `[/manifest.*corrupt/i, /yaml.*parse/i, /manifest.*invalid/i]`
- **GOTCHA**: The `ERROR_TAXONOMY` record key type is `ErrorCategory` — new categories must be added to the union type FIRST (Task 1)
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 3: UPDATE `.claude/orchestrator/src/state-machine.ts` — Update inline taxonomy

- **IMPLEMENT**: Add `orchestrator_crash: 0` and `manifest_corruption: 0` to the inline `getErrorTaxonomy` map at line 193
- **PATTERN**: MIRROR existing entries in state-machine.ts:193-204
- **GOTCHA**: This is a duplicate of the taxonomy in error-classifier.ts — both must match. The inline copy exists to avoid circular imports (documented in state-machine.ts:191)
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 4: CREATE `.claude/orchestrator/src/process-manager.ts` — PID file lifecycle

- **IMPLEMENT**: Full PID file management module with these exported functions:
  - `writePidFile(projectDir: string): void` — Write current process PID + metadata to `.agents/orchestrator.pid` as JSON
  - `readPidFile(projectDir: string): ProcessInfo | null` — Read and parse PID file, return null if missing
  - `removePidFile(projectDir: string): void` — Delete PID file (silent if missing)
  - `isProcessAlive(pid: number): boolean` — Use `process.kill(pid, 0)` in try/catch (signal 0 = check existence)
  - `checkForRunningInstance(projectDir: string): { running: boolean; pid?: number }` — Read PID file, check if alive, return status. If stale, remove PID file and return `{ running: false }`.
- **PATTERN**: Use sync fs APIs (readFileSync, writeFileSync, unlinkSync, existsSync) — MIRROR git-manager.ts sync pattern for startup-critical ops
- **IMPORTS**: `import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs"` and `import { join } from "node:path"` and `import type { ProcessInfo } from "./types.js"`
- **PID FILE FORMAT**: JSON `{ "pid": 12345, "startedAt": "ISO-8601", "projectDir": "/path" }`
- **PID FILE LOCATION**: `join(projectDir, ".agents/orchestrator.pid")`
- **GOTCHA**: `process.kill(pid, 0)` throws ESRCH if process doesn't exist, EPERM if no permission — catch both, treat ESRCH as "not alive" and EPERM as "alive but not ours"
- **GOTCHA**: Race condition between check and write — acceptable for single-developer use case
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 5: UPDATE `.claude/orchestrator/src/index.ts` — Integrate process lifecycle

- **IMPLEMENT**: Add startup recovery, PID management, and enhanced shutdown to `main()`:
  1. **After config load, before manifest read**: Call `checkForRunningInstance(projectDir)`. If running, print error and `process.exit(1)`.
  2. **After duplicate check**: Call `writePidFile(projectDir)`.
  3. **After manifest read**: Call `hasUncommittedChanges(projectDir)` from git-manager. If true, log warning: `"⚠️ Uncommitted changes detected — validating state before continuing"`. Send Telegram notification if notifier available.
  4. **On startup with active checkpoint or pending failure**: Log recovery context: `"🔄 Recovering from previous state — ${action.reason}"`. Send Telegram notification: `"Orchestrator restarted, resuming from Phase N"`.
  5. **Enhance shutdown handler**: Call `removePidFile(projectDir)` before `process.exit(0)`. Wrap in try/catch (don't fail shutdown on PID removal error).
  6. **Add uncaughtException handler**: `process.on("uncaughtException", ...)` — attempt PID removal + manifest failure write before exit.
  7. **Skip execution in dry-run**: PID file should NOT be written in `--dry-run` mode (already exits early).
- **PATTERN**: MIRROR existing shutdown handler at index.ts:129-133
- **IMPORTS**: Add `import { checkForRunningInstance, writePidFile, removePidFile } from "./process-manager.js"` and `import { hasUncommittedChanges } from "./git-manager.js"`
- **GOTCHA**: PID file must be written BEFORE Telegram bot starts polling (bot.start() is non-blocking but PID should already be set)
- **GOTCHA**: The existing `shutdown` function only exists inside the `if (config.telegram)` block — need to create a top-level shutdown handler that always runs PID cleanup, with Telegram stop as conditional
- **GOTCHA**: Don't double-handle SIGINT/SIGTERM — replace the existing per-Telegram handler with one unified handler
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 6: UPDATE `.claude/orchestrator/src/piv-runner.ts` — Add restart notification

- **IMPLEMENT**: Add an optional `isRestart` parameter to `runAllPhases()`:
  ```typescript
  export async function runAllPhases(
    projectDir: string,
    notifier?: TelegramNotifier,
    pauseCheck?: () => Promise<void>,
    isRestart?: boolean
  ): Promise<void>
  ```
  If `isRestart` is true and notifier exists, send notification before starting: `"🔄 Orchestrator restarted — resuming from Phase N"` where N comes from the manifest's next unfinished phase.
- **PATTERN**: MIRROR existing notifier?.sendPhaseStart() pattern at piv-runner.ts:104
- **IMPORTS**: Add `getNextUnfinishedPhase` to the import from state-machine.js
- **GOTCHA**: The `isRestart` flag is set by `index.ts` when it detects an active checkpoint or pending failure at startup
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 7: UPDATE `.claude/orchestrator/src/telegram-notifier.ts` — Add restart notification method

- **IMPLEMENT**: Add `sendRestart(phase: number, reason: string): Promise<void>` method that sends a tagged message:
  ```
  🔄 <b>Orchestrator Restarted</b>
  Resuming from: Phase {phase}
  Reason: {reason}
  ```
- **PATTERN**: MIRROR existing `sendPhaseStart()` method pattern
- **IMPORTS**: None needed (extends existing class)
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 8: UPDATE `.claude/orchestrator/package.json` — Add start:prod script

- **IMPLEMENT**: Add scripts for production mode:
  ```json
  "start:prod": "node dist/index.js",
  "prebuild": "rm -rf dist"
  ```
- **PATTERN**: Standard Node.js production script convention
- **GOTCHA**: The `/go` command will call `npm run build && npm run start:prod` — the build must produce working JS in `dist/`
- **VALIDATE**: `cd .claude/orchestrator && npm run build`

### Task 9: CREATE `.claude/commands/go.md` — VS Code /go slash command

- **IMPLEMENT**: Claude Code slash command that:
  1. Checks if `.claude/orchestrator/package.json` exists (drop-in detection)
  2. Runs `cd .claude/orchestrator && npm install` if `node_modules` missing
  3. Runs `cd .claude/orchestrator && npm run build` to compile TypeScript
  4. Checks for existing PID file — if orchestrator already running, report status and exit
  5. Spawns orchestrator as detached background process:
     ```bash
     cd .claude/orchestrator && node dist/index.js > ../../.agents/orchestrator.log 2>&1 &
     ```
  6. Reports PID and log file location to user
  7. Shows tail of log to confirm startup
- **FORMAT**: Markdown command file with `---` frontmatter:
  ```yaml
  ---
  description: Start the PIV orchestrator as a background process
  ---
  ```
- **GOTCHA**: The `/go` command is a Claude Code slash command (`.claude/commands/go.md`). It contains INSTRUCTIONS for Claude to execute, not code. Claude reads the markdown and uses Bash tool to run the commands.
- **GOTCHA**: Log redirect uses `../../.agents/` because the command runs from `.claude/orchestrator/` — use absolute path instead: `$PIV_PROJECT_DIR/.agents/orchestrator.log` or resolve from package.json location
- **GOTCHA**: Environment variables must be available — command should source `.claude/orchestrator/.env` if it exists, or instruct user to set them
- **VALIDATE**: Verify file exists at `.claude/commands/go.md` and is valid markdown

### Task 10: UPDATE `.claude/orchestrator/.env.example` — Add log path documentation

- **IMPLEMENT**: Add comment documenting the log file location:
  ```
  # Log file (auto-created by orchestrator)
  # Location: .agents/orchestrator.log
  # PID file: .agents/orchestrator.pid
  ```
- **PATTERN**: MIRROR existing .env.example comment style
- **VALIDATE**: File exists and is readable

### Task 11: UPDATE `.gitignore` — Add runtime artifacts

- **IMPLEMENT**: Add entries for runtime artifacts that should not be committed:
  ```
  # PIV Orchestrator runtime
  .agents/orchestrator.pid
  .agents/orchestrator.log
  .claude/orchestrator/dist/
  .claude/orchestrator/node_modules/
  ```
- **GOTCHA**: Check if any of these are already in .gitignore before adding duplicates
- **VALIDATE**: `git status` should not show dist/ or node_modules/ as untracked

### Task 12: CREATE `.claude/orchestrator/tests/process-manager.test.ts` — Unit tests

- **IMPLEMENT**: Comprehensive tests for process-manager.ts:
  1. `writePidFile` — writes valid JSON with pid, startedAt, projectDir
  2. `readPidFile` — returns null when file missing, returns ProcessInfo when present
  3. `removePidFile` — deletes file, no error when missing
  4. `isProcessAlive` — returns true for current PID (`process.pid`), false for non-existent PID (use a very high number like 999999999)
  5. `checkForRunningInstance` — returns `{ running: false }` when no PID file, returns `{ running: true, pid }` when current process PID is in file, returns `{ running: false }` and removes stale PID when dead PID is in file
- **PATTERN**: MIRROR tests/state-machine.test.ts structure: `describe/it/expect`, use `os.tmpdir()` for isolated test directories
- **IMPORTS**: `import { describe, it, expect, beforeEach, afterEach } from "vitest"` and process-manager functions and `import { mkdtempSync, existsSync, readFileSync, mkdirSync } from "node:fs"` and `import { join } from "node:path"` and `import os from "node:os"`
- **TEST SETUP**: Create temp directory with `.agents/` subdirectory in `beforeEach`, clean up in `afterEach`
- **GOTCHA**: Tests must create `.agents/` subdirectory inside temp dir since PID file lives at `{projectDir}/.agents/orchestrator.pid`
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/process-manager.test.ts`

### Task 13: UPDATE `.claude/orchestrator/tests/state-machine.test.ts` — Add recovery scenario tests

- **IMPLEMENT**: Add test cases for crash recovery state detection:
  1. `determineNextAction` with active checkpoint + no failure → returns "execute" with "resume" argument
  2. `determineNextAction` with pending `orchestrator_crash` failure → returns appropriate action
  3. `determineNextAction` with `manifest_corruption` → returns appropriate action
  4. Verify completed phases are skipped correctly (existing test — ensure still passes)
- **PATTERN**: MIRROR existing test structure, use `baseManifest()` factory with modifications
- **GOTCHA**: The inline taxonomy in `state-machine.ts` must include new error categories for these tests to pass
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/state-machine.test.ts`

### Task 14: UPDATE `.claude/orchestrator/tests/error-classifier.test.ts` — Add new category tests

- **IMPLEMENT**: Add test cases for new error categories:
  1. `classifyError("orchestrator crash detected", "orchestrator")` → `"orchestrator_crash"`
  2. `classifyError("manifest YAML parse error", "prime")` → `"manifest_corruption"`
  3. `getTaxonomy("orchestrator_crash")` → `{ maxRetries: 0, needsHuman: false, ... }`
  4. `getTaxonomy("manifest_corruption")` → `{ maxRetries: 0, needsHuman: false, ... }`
- **PATTERN**: MIRROR existing error-classifier.test.ts test structure
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/error-classifier.test.ts`

### Task 15: Run full test suite and type check

- **IMPLEMENT**: Execute all validation commands and fix any issues
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit && npx vitest run`

---

## TESTING STRATEGY

### Unit Tests

**Framework**: vitest (existing)
**Pattern**: describe/it/expect with factory functions for test data

| Module | Test Count | Key Scenarios |
|--------|-----------|---------------|
| process-manager.ts | ~8 | PID write/read/remove, alive check, stale detection, duplicate prevention |
| state-machine.ts (additions) | ~4 | Recovery from checkpoint, new error categories |
| error-classifier.ts (additions) | ~4 | Classification and taxonomy for new categories |

### Integration Tests

Not formally required — crash recovery is validated via scenario testing (SC-011) during `/validate-implementation`. The unit tests cover the individual components; the integration point is `index.ts main()` which is tested via smoke test (dry-run mode).

### Edge Cases

1. **PID file with invalid JSON** — `readPidFile` returns null, logs warning
2. **PID file with permissions issue** — catch EACCES, treat as "can't determine" → warn and continue
3. **Two processes racing to write PID** — acceptable risk for single-developer tool; last writer wins
4. **Process dies between PID check and PID write** — non-issue (checking own PID)
5. **Manifest partially written on crash** — YAML parse will fail → `manifest_corruption` path
6. **Log file grows unbounded** — out of scope for Phase 3 (Phase 4 polish)
7. **`dist/` directory missing** — `/go` command runs `npm run build` first
8. **node_modules missing** — `/go` command runs `npm install` first

---

## VALIDATION COMMANDS

### Level 1: Syntax & Types

```bash
cd .claude/orchestrator && npx tsc --noEmit
```

**Expected**: Exit code 0, zero errors

### Level 2: Unit Tests

```bash
cd .claude/orchestrator && npx vitest run
```

**Expected**: All tests pass (87 existing + ~16 new = ~103 total)

### Level 3: Smoke Tests

```bash
# Dry-run mode (no PID written, no execution)
cd .claude/orchestrator && npx tsx src/index.ts --dry-run

# Verify build output
cd .claude/orchestrator && npm run build && ls dist/index.js

# Verify PID file lifecycle (manual)
cd .claude/orchestrator && npx tsx -e "
import { writePidFile, readPidFile, removePidFile } from './src/process-manager.ts';
const dir = process.env.PIV_PROJECT_DIR || process.cwd().replace('/.claude/orchestrator', '');
writePidFile(dir);
const info = readPidFile(dir);
console.log('PID written:', info);
removePidFile(dir);
console.log('PID removed:', readPidFile(dir));
"
```

### Level 4: /go Command Verification

```bash
# Verify command file exists and has frontmatter
head -5 .claude/commands/go.md

# Verify .gitignore entries
grep "orchestrator.pid" .gitignore
grep "orchestrator.log" .gitignore
```

---

## ACCEPTANCE CRITERIA

- [ ] Orchestrator reads manifest on startup to determine current state (US-006)
- [ ] Resumes from the next uncompleted step, not from the beginning (US-006)
- [ ] Detects uncommitted changes and validates state before continuing (US-006)
- [ ] Sends notification on restart with resume context (US-006)
- [ ] Orchestrator lives in `.claude/orchestrator/` alongside existing commands (US-007)
- [ ] `npm install` inside orchestrator directory installs all dependencies (US-007)
- [ ] No external infrastructure required — runs locally as background process (US-007)
- [ ] Works alongside existing PIV slash commands without conflict (US-007)
- [ ] PID file prevents duplicate instances per project
- [ ] Graceful shutdown removes PID file on SIGTERM/SIGINT
- [ ] `/go` command spawns orchestrator as detached process
- [ ] Log file captures output at `.agents/orchestrator.log`
- [ ] TypeScript compiles with zero errors
- [ ] All unit tests pass (existing + new)
- [ ] SC-011 (crash recovery) scenario addressed
- [ ] SC-012 (empty phase) scenario addressed
- [ ] Drop-in to fresh project works with `npm install` in orchestrator dir

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (1-15)
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + smoke)
- [ ] No type checking errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability

---

## NOTES

### Design Decisions from Scope Analysis

1. **Telegram from /go**: The `/go` command starts the full orchestrator including Telegram if credentials are in `.env`. No special routing — `loadConfig()` already handles mode detection.

2. **Log location**: `.agents/orchestrator.log` chosen because `.agents/` is the orchestrator's state directory. PID file alongside at `.agents/orchestrator.pid`.

3. **Sync PID operations**: PID file uses sync fs APIs because it's startup-critical and must complete before any async work begins. Matches `git-manager.ts` pattern.

4. **No session resume on crash**: Agent SDK sessions are ephemeral. Crash recovery creates fresh sessions. The manifest-based state machine ensures no work is repeated — `runAllPhases()` already skips completed phases.

5. **Uncommitted changes on restart**: The orchestrator logs a warning but continues. Uncommitted changes from a crashed execution are likely partial work from the last phase — the checkpoint/rollback system handles this. Auto-stashing could lose important state.

6. **Error categories**: Added `orchestrator_crash` (maxRetries: 0, needsHuman: false) and `manifest_corruption` (maxRetries: 0, needsHuman: false). Neither needs human intervention — the orchestrator self-recovers or instructs the user to run `/prime`.

### PRD Gap: SC-012 (Empty Phase)

PRD describes SC-012 as an edge case where a phase has no testable code. The existing `runPhase()` already handles this — if validation finds nothing to test, it reports "no testable deliverables". No new code needed for SC-012 — it's an emergent property of the current architecture. Documenting as a NOTE rather than a task.

**Assumption**: SC-012 does not require new implementation; it's verified via the existing PIV loop. If this assumption is incorrect, it affects: validation strategy only (would need a dedicated test fixture).

---

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 3 from PRD
independent_tasks_count: 4
dependent_chains: 3
technologies_consumed: claude-agent-sdk, anthropic-auth
next_suggested_command: execute
next_arg: ".agents/plans/phase-3-vscode-integration-resilience.md"
estimated_complexity: medium
confidence: 8/10
