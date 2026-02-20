# Feature: Phase 7 — Diagnosis, Hot Fix & Propagation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

## Feature Description

Build the supervisor's intelligent intervention layer. When the Phase 6 monitor loop detects a stall that isn't a simple crash or agent-waiting, the supervisor now opens Agent SDK sessions to diagnose root cause, classify bugs as framework vs project, apply surgical hot fixes (<30 lines, single file), validate the fix, propagate it to all affected projects, and restart orchestrators. Failed fixes are reverted and escalated to Telegram.

## User Story

As a developer running multiple agent projects overnight,
I want the supervisor to diagnose and fix stalls automatically,
So that framework bugs are fixed once and propagated everywhere without waking me up.

## Problem Statement

Phase 6 detects stalls and classifies them, but `execution_error` always escalates to the human. The supervisor can restart crashed processes and agent-waiting sessions, but it cannot diagnose *why* something failed or fix the underlying bug. Every non-trivial stall requires human intervention.

## Solution Statement

Add three new modules: an **interventor** (Agent SDK sessions for diagnosis + fixing), a **bug location classifier** (framework vs project vs human-required), and a **propagator** (copy fixed files to projects, update versions, restart orchestrators). Wire these into the existing monitor cycle so `execution_error` triggers diagnosis before escalation.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: `supervisor/src/`
**Dependencies**: Phase 6 (monitor loop), Agent SDK, Telegram Bot API
**Agent Behavior**: Yes — implements Bug Location + Fix or Escalate decision trees (PRD 4.2)

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `anthropic-agent-sdk-profile.md` — Used for: Diagnosis and fixing sessions
  - Key endpoints: `query()` with `cwd` for remote diagnosis (Section 3.1), read-only sessions (Section 3.7), structured output (Section 3.4), abort (Section 3.5)
  - Auth method: API key via `ANTHROPIC_API_KEY`
  - Critical constraints: One active query per process (serialize sessions), Sonnet for diagnosis ($0.10-0.30), full fix sessions $0.30-0.80, always include `Read` in allowedTools
  - Gotchas: `settingSources: ["project"]` required for project context, `bypassPermissions` needs `allowDangerouslySkipPermissions: true`

- `telegram-bot-api-profile.md` — Used for: Fix-failure escalation with diagnosis details
  - Key endpoints: `sendMessage` (escalation with inline keyboard), `sendDocument` (log files)
  - Auth method: Bot token via `TELEGRAM_BOT_TOKEN`
  - Critical constraints: 4096 char limit, HTML parse mode, escape dynamic content

**Impact on Implementation:**
Agent SDK is the core technology — all diagnosis and fixing happens through `query()` sessions. Sessions must be serialized (one at a time). Diagnosis uses read-only tools for safety, fixing uses full tools with budget caps. Telegram is only used for failed-fix escalation.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `supervisor/src/types.ts` (lines 1-89) — All existing types. Extend here.
- `supervisor/src/recovery.ts` (lines 22-56) — `determineRecovery()` — modify to route `execution_error` through interventor
- `supervisor/src/monitor.ts` (lines 35-99) — `runMonitorCycle()` — integrate interventor dispatch
- `supervisor/src/classifier.ts` (lines 55-127) — `classifyStall()` — reference for classification pattern
- `supervisor/src/telegram.ts` (lines 1-157) — Telegram client — extend with fix-failure template
- `supervisor/src/improvement-log.ts` (lines 1-43) — Log writer — extend with diagnosis fields
- `supervisor/src/registry.ts` (lines 84-101) — `updateHeartbeat()` — used after propagation restart
- `supervisor/src/init.ts` (lines 53-71) — `cpSync` pattern for file copy — mirror for propagation
- `supervisor/src/version.ts` (lines 9-19) — `getDevKitVersion()` — reuse for version tracking
- `.claude/orchestrator/src/session-manager.ts` (lines 16-41) — Agent SDK `query()` + `buildOptions()` pattern
- `.claude/orchestrator/src/response-handler.ts` (lines 17-98) — SDK message processing pattern

### New Files to Create

- `supervisor/src/interventor.ts` — Agent SDK sessions for diagnosis and hot fixing
- `supervisor/src/propagator.ts` — File copy to projects, version update, orchestrator restart
- `supervisor/tests/interventor.test.ts` — Interventor unit tests (mocked Agent SDK)
- `supervisor/tests/propagator.test.ts` — Propagator unit tests (temp dir file ops)

### Patterns to Follow

**Agent SDK Session Pattern** (from `session-manager.ts`):
```typescript
const { CLAUDECODE: _, ...cleanEnv } = process.env;
const gen = query({
  prompt: diagnosticPrompt,
  options: {
    cwd: projectDir,
    model: "claude-sonnet-4-6",
    maxTurns: 15,
    maxBudgetUsd: 0.50,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    allowedTools: ["Read", "Glob", "Grep"],
    settingSources: ["project"],
    systemPrompt: { type: "preset", preset: "claude_code" },
    abortController: controller,
    env: cleanEnv,
  },
});
```

**Test Pattern** (from `recovery.test.ts`):
- `vi.mock()` external modules at top
- `makeProject()` / `makeConfig()` factory helpers
- `beforeEach(() => vi.clearAllMocks())`
- Direct import of mocked modules for assertion

**Telegram Escalation Pattern** (from `telegram.ts`):
- HTML format with `<b>` tags, `escapeHtml()` for dynamic content
- Structured message: header → fields → action needed

**File Copy Pattern** (from `init.ts`):
- `cpSync(src, dest, { recursive: true, filter: ... })`
- Validate source exists before copy
- Collect errors array, report all at end

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Bug Location** (PRD Section 4.2):
- IF same error_category at same phase in 2+ projects → `framework_bug` (high confidence)
- ELSE IF error file path is under `.claude/commands/` or `.claude/orchestrator/` → `framework_bug`
- ELSE IF error file path is under `src/`, `tests/` → `project_bug`
- ELSE IF error is credential/auth related → `human_required`
- ON AMBIGUOUS → attempt project-level fix first, escalate if fails

**Fix or Escalate** (PRD Section 4.2):
- IF root cause in single file AND fix <30 lines AND testable → hot fix
- ELSE IF fix touches multiple command files → escalate
- ELSE IF fix changes manifest schema or error taxonomy → escalate
- ELSE IF same fix attempted before and failed → escalate
- ELSE → escalate with diagnosis details

### Scenario Mappings

| Scenario | Agent Workflow | Decision Tree | Success Criteria |
|---|---|---|---|
| SC-002 (Framework bug, single project) | Detect → Diagnose → Classify as framework → Hot fix → Validate → Propagate → Restart | Bug Location + Fix or Escalate | Fix validated, propagated, orchestrator restarted |
| SC-003 (Multi-project pattern) | Detect 2+ stalls → Cross-reference → Single fix → Propagate to all → Restart all | Bug Location (multi-project path) | One fix resolves all stalled projects |
| SC-004 (Project-specific bug) | Detect → Diagnose → Classify as project → Open SDK session in project → Fix → Restart | Bug Location (project path) | Project code fixed, orchestrator restarted |
| SC-008 (Fix propagation) | After validated fix → Copy to all outdated projects → Update version → Restart | Propagation | All projects updated, versions match |
| SC-011 (Fix validation failure) | Apply fix → Run validation → Fails → Revert → Escalate with diagnosis | Fix or Escalate (validation branch) | Fix reverted, Telegram escalation sent |

### Error Recovery Patterns

- Diagnosis session fails (timeout/budget) → Escalate with partial diagnosis context
- Fix validation fails → Revert patch via git, escalate with full diagnosis
- Propagation file copy fails → Escalate for that project only, continue others
- Agent SDK not available → Escalate immediately (treat as human-required)
- Orchestrator fails to restart after propagation → Retry once, then escalate

---

## FOUNDATION

**Generation:** 2 | **Active PRD:** PRD.md

### What Gen 1 Already Implemented

| Phase | Name | Delivered |
|-------|------|-----------|
| 1 | Core Orchestration Engine | Agent SDK session manager, state machine, manifest manager, hooks parser, PIV runner |
| 2 | Telegram Interface | Grammy bot, PRD relay, slash commands, formatter, notifier |
| 3 | VS Code Integration & Resilience | Process manager, signal handler, error classifier, git manager |
| 4 | Multi-Instance Polish | Instance registry, drift detector, fidelity checker, budget calculator |

### Key Existing Files (Do Not Recreate)

- `supervisor/src/monitor.ts` — Monitor loop — extend, don't replace
- `supervisor/src/recovery.ts` — Recovery actions — modify `execution_error` path
- `supervisor/src/classifier.ts` — Stall classifier — reference pattern, add bug location
- `supervisor/src/telegram.ts` — Telegram client — extend with new template
- `supervisor/src/types.ts` — Types — extend with new interfaces

### Architecture Established in Gen 1 + Phases 5-6

- Supervisor is standalone TypeScript, runs via `tsx src/index.ts`
- Central registry at `~/.piv/registry.yaml` — single source of truth for project state
- Monitor loop polls registry every 15 min — zero AI cost during healthy operation
- Recovery dispatches by stall type — `execution_error` currently escalates (Phase 7 changes this)
- Telegram via direct HTTP + `@grammyjs/types` — no framework
- Improvement log is append-only markdown

### Gen 2 Adds (This Plan's Scope)

- Agent SDK integration for diagnosis and fixing
- Bug location classification (framework / project / human-required)
- Hot fix pipeline: patch → validate → propagate → restart
- Fix revert on validation failure + rich escalation

---

## IMPLEMENTATION PLAN

### Phase 1: Types & Foundation

Extend `types.ts` with new interfaces. Create the interventor's session wrapper.

### Phase 2: Interventor Core

Build `interventor.ts` — the Agent SDK session manager for diagnosis and hot fixing. Two-phase approach: read-only diagnosis, then write-enabled fix.

### Phase 3: Bug Location Classifier

Extend `classifier.ts` or create classifier logic in interventor that determines framework bug vs project bug vs human-required.

### Phase 4: Propagator

Build `propagator.ts` — copy fixed files to projects, update versions, restart orchestrators.

### Phase 5: Integration

Wire interventor + propagator into the monitor cycle. Change `execution_error` recovery path.

### Phase 6: Testing & Validation

Unit tests for all new modules. Integration test with temp directories.

---

## VALIDATION STRATEGY

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-002 | Mock a framework-level error in a registered project. Verify interventor diagnoses, fixes, validates, propagates. | Fix applied, validated, propagated to project, orchestrator restart attempted |
| SC-003 | Register 2 projects with same error_category at same phase. Verify single fix propagated to both. | Bug classified as framework, fix applied once, propagated to both |
| SC-004 | Mock a project-level error (file under src/). Verify interventor opens session in project dir. | Session opened with correct cwd, project-specific fix prompt sent |
| SC-008 | After a fix, verify file copied to project, version updated in registry. | File exists at destination, registry version matches dev kit version |
| SC-011 | Apply a fix that fails validation. Verify revert + escalation. | Fix reverted (git checkout), Telegram escalation sent with diagnosis |

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `supervisor/src/types.ts`

- **IMPLEMENT**: Add types for intervention, diagnosis, propagation:
  ```typescript
  export type BugLocation = "framework_bug" | "project_bug" | "human_required";

  export interface DiagnosticResult {
    bugLocation: BugLocation;
    confidence: "high" | "medium" | "low";
    rootCause: string;
    filePath: string | null;
    errorCategory: string;
    multiProjectPattern: boolean;
    affectedProjects: string[];
  }

  export interface HotFixResult {
    success: boolean;
    filePath: string;
    linesChanged: number;
    validationPassed: boolean;
    revertedOnFailure: boolean;
    details: string;
    sessionCostUsd: number;
  }

  export interface PropagationResult {
    project: string;
    success: boolean;
    filesCopied: string[];
    newVersion: string;
    orchestratorRestarted: boolean;
    error?: string;
  }

  export interface InterventionResult {
    project: string;
    phase: number | null;
    diagnostic: DiagnosticResult;
    fix: HotFixResult | null;
    propagation: PropagationResult[];
    escalated: boolean;
    totalCostUsd: number;
  }

  export interface InterventorConfig {
    devKitDir: string;
    diagnosisBudgetUsd: number;
    fixBudgetUsd: number;
    diagnosisMaxTurns: number;
    fixMaxTurns: number;
    timeoutMs: number;
  }
  ```
- **PATTERN**: MIRROR `supervisor/src/types.ts:39-47` (StallClassification shape)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 2: UPDATE `supervisor/src/config.ts`

- **IMPLEMENT**: Add interventor config loading from environment:
  ```typescript
  export function loadInterventorConfig(): InterventorConfig {
    return {
      devKitDir: process.env.PIV_DEV_KIT_DIR ?? resolve(__dirname, '..', '..'),
      diagnosisBudgetUsd: parseFloat(process.env.PIV_DIAGNOSIS_BUDGET_USD ?? '0.50'),
      fixBudgetUsd: parseFloat(process.env.PIV_FIX_BUDGET_USD ?? '2.00'),
      diagnosisMaxTurns: parseInt(process.env.PIV_DIAGNOSIS_MAX_TURNS ?? '15', 10),
      fixMaxTurns: parseInt(process.env.PIV_FIX_MAX_TURNS ?? '30', 10),
      timeoutMs: parseInt(process.env.PIV_INTERVENTION_TIMEOUT_MS ?? '300000', 10),
    };
  }
  ```
- **PATTERN**: MIRROR `supervisor/src/config.ts:14-35` (loadMonitorConfig pattern)
- **IMPORTS**: `import { resolve } from "node:path"` and the new `InterventorConfig` type
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 3: CREATE `supervisor/src/interventor.ts`

- **IMPLEMENT**: Agent SDK session wrapper for diagnosis and fixing. Core functions:
  1. `diagnoseStall(project, classification, config)` → `DiagnosticResult`
     - Build prompt with stall details, manifest failures, project path
     - Run read-only Agent SDK session (`allowedTools: ["Read", "Glob", "Grep"]`)
     - Use `outputFormat` with JSON schema for structured DiagnosticResult
     - Parse result into DiagnosticResult
  2. `classifyBugLocation(diagnostic, allStalled)` → updates DiagnosticResult
     - Check if 2+ projects stall with same error at same phase → `framework_bug`
     - Check file path: `.claude/commands/` or `.claude/orchestrator/` → `framework_bug`
     - Check file path: `src/` or `tests/` → `project_bug`
     - Credential/auth errors → `human_required`
  3. `applyFrameworkHotFix(diagnostic, config)` → `HotFixResult`
     - Open fix session in dev kit dir with full tools
     - Prompt: "Fix [rootCause] in [filePath]. Change must be <30 lines in a single file."
     - Run `tsc --noEmit` and `vitest run` to validate
     - If validation fails: `git checkout -- [filePath]` to revert, return failure
  4. `applyProjectFix(project, diagnostic, config)` → `HotFixResult`
     - Open fix session in project dir with full tools + settingSources
     - Prompt: "Fix [rootCause] in [filePath]. Verify the fix compiles and tests pass."
     - Return structured result
  5. `shouldEscalate(diagnostic, fixAttempted)` → boolean
     - Multi-file fix needed → true
     - Manifest schema change → true
     - Same fix failed before (check improvement log) → true
     - Auth/credential error → true
- **PROFILE**: Agent SDK profile Section 3.1 (basic query), Section 3.4 (structured output), Section 3.7 (read-only)
- **IMPORTS**: `import { query } from "@anthropic-ai/claude-agent-sdk"`, types from `./types.js`
- **GOTCHA**: Must unset `CLAUDECODE` env var to prevent nesting guard (MIRROR `session-manager.ts:24`)
- **GOTCHA**: Must pass `settingSources: ["project"]` for project context (SDK profile gotcha #1)
- **GOTCHA**: Must pass `systemPrompt: { type: "preset", preset: "claude_code" }` (SDK profile gotcha #2)
- **GOTCHA**: Serialize sessions — only one `query()` active at a time (SDK profile Section 4)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 4: CREATE `supervisor/src/propagator.ts`

- **IMPLEMENT**: File propagation and orchestrator restart. Core functions:
  1. `propagateFixToProjects(fixedFilePath, projects, config)` → `PropagationResult[]`
     - For each project in the registry:
       - Compute relative path of fixed file within dev kit
       - Compute destination path in project (same relative path)
       - `cpSync(src, dest)` — overwrite (framework is canonical per SC-008)
       - Update `pivCommandsVersion` in registry via `updateHeartbeat()`
       - Restart orchestrator via existing `spawnOrchestrator()`
     - Collect results per project; continue on individual failures
  2. `getOutdatedProjects(currentVersion, registryPath)` → `RegistryProject[]`
     - Read registry, filter projects where `pivCommandsVersion !== currentVersion`
  3. `revertFix(filePath, devKitDir)` → boolean
     - Run `git checkout -- <relative-path>` in dev kit dir
     - Return true if exit code 0
- **PATTERN**: MIRROR `supervisor/src/init.ts:53-71` for cpSync usage
- **IMPORTS**: `cpSync, existsSync` from `node:fs`, `execFileSync` from `node:child_process`, registry functions, `spawnOrchestrator` from recovery, version from `./version.js`
- **GOTCHA**: Propagation must handle missing destination directories (`mkdirSync` with `recursive: true`)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 5: UPDATE `supervisor/src/classifier.ts`

- **IMPLEMENT**: Add `agent_waiting_for_input` detection via piv-log or last session output:
  - Currently the classifier doesn't detect `agent_waiting_for_input` (only crash, error, hung)
  - Add: If manifest has a `notifications` entry with `type: "escalation"` and details mention "waiting" or "question" → classify as `agent_waiting_for_input`
  - This enriches the data the interventor receives
- **NOTE**: Keep the existing `classifyStall()` function unchanged for crash/error/hung paths. The new `agent_waiting_for_input` path is additive.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit && npx vitest run tests/classifier.test.ts`

### Task 6: UPDATE `supervisor/src/recovery.ts`

- **IMPLEMENT**: Change `execution_error` from always-escalate to diagnose-first:
  ```typescript
  case "execution_error":
    // Phase 7: Diagnose before escalating
    return { ...base, type: "diagnose" };
  ```
  Add `"diagnose"` to the `RecoveryAction.type` union in types.ts.
- **IMPLEMENT**: Update `executeRecovery()` to handle the new `"diagnose"` action type by delegating to a callback or returning a marker that `runMonitorCycle` handles.
- **PATTERN**: Keep the existing switch structure. Add one new case.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit && npx vitest run tests/recovery.test.ts`

### Task 7: UPDATE `supervisor/src/monitor.ts`

- **IMPLEMENT**: Integrate interventor dispatch into `runMonitorCycle()`:
  - When recovery action is `"diagnose"`:
    1. Call `diagnoseStall()` from interventor
    2. Call `classifyBugLocation()` to determine framework vs project
    3. If `framework_bug` and hot-fixable → `applyFrameworkHotFix()` → if success → `propagateFixToProjects()`
    4. If `project_bug` → `applyProjectFix()`
    5. If fix succeeds → restart orchestrator, increment `result.recovered`
    6. If fix fails or `human_required` → escalate via Telegram, increment `result.escalated`
  - Add `interventionsAttempted` to `MonitorCycleResult`
  - Load interventor config via `loadInterventorConfig()`
- **IMPORTS**: Import interventor functions and propagator functions
- **GOTCHA**: All Agent SDK sessions are serialized (one at a time, not parallel)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 8: UPDATE `supervisor/src/telegram.ts`

- **IMPLEMENT**: Add `telegramSendFixFailure()` — rich escalation for failed hot fixes:
  ```typescript
  export async function telegramSendFixFailure(
    config: SupervisorTelegramConfig,
    project: string,
    phase: number | null,
    diagnostic: DiagnosticResult,
    fixResult: HotFixResult,
  ): Promise<TelegramApiResponse<TelegramMessage>>
  ```
  Message template:
  ```
  <b>🔴 Hot Fix Failed — Escalation</b>

  <b>Project:</b> {project}
  <b>Phase:</b> {phase}
  <b>Bug Type:</b> {bugLocation}
  <b>Root Cause:</b> {rootCause}
  <b>File:</b> {filePath}
  <b>Fix Attempted:</b> {details}
  <b>Validation:</b> Failed
  <b>Fix Cost:</b> ${sessionCostUsd}

  <b>Action needed:</b> Manual fix required. Fix was reverted.
  ```
- **PATTERN**: MIRROR `supervisor/src/telegram.ts:135-157` (telegramSendEscalation)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 9: UPDATE `supervisor/src/improvement-log.ts`

- **IMPLEMENT**: Extend `ImprovementLogEntry` and `formatEntry()` to include diagnostic context:
  - Add optional fields: `bugLocation`, `rootCause`, `filePath`, `fixApplied`, `propagatedTo`
  - Update `formatEntry()` to render new fields when present
- **PATTERN**: Keep append-only, never-throw pattern from existing code
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 10: UPDATE `supervisor/src/types.ts` (RecoveryAction)

- **IMPLEMENT**: Add `"diagnose"` to `RecoveryAction.type`:
  ```typescript
  export interface RecoveryAction {
    type: "restart" | "restart_with_preamble" | "escalate" | "diagnose" | "skip";
    // ... rest unchanged
  }
  ```
- **IMPLEMENT**: Add optional diagnostic fields to `MonitorCycleResult`:
  ```typescript
  export interface MonitorCycleResult {
    projectsChecked: number;
    stalled: number;
    recovered: number;
    escalated: number;
    interventionsAttempted: number;
  }
  ```
- **IMPLEMENT**: Extend `ImprovementLogEntry` with optional fields:
  ```typescript
  export interface ImprovementLogEntry {
    // ... existing fields
    bugLocation?: BugLocation;
    rootCause?: string;
    filePath?: string;
    fixApplied?: boolean;
    propagatedTo?: string[];
  }
  ```
- **NOTE**: Merge with Task 1 type additions — ensure all types are added in one pass
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 11: CREATE `supervisor/tests/interventor.test.ts`

- **IMPLEMENT**: Unit tests with mocked Agent SDK:
  1. `diagnoseStall` — verify prompt includes project path, error details, stall classification
  2. `diagnoseStall` — verify read-only tools only (`["Read", "Glob", "Grep"]`)
  3. `classifyBugLocation` — framework bug: error in `.claude/commands/` path
  4. `classifyBugLocation` — project bug: error in `src/` path
  5. `classifyBugLocation` — multi-project pattern detection (2 projects same error)
  6. `classifyBugLocation` — credential error → `human_required`
  7. `applyFrameworkHotFix` — success path: SDK returns fix, validation passes
  8. `applyFrameworkHotFix` — failure path: validation fails, git revert called
  9. `applyProjectFix` — verify session opened with project's cwd
  10. `shouldEscalate` — multi-file fix → true
  11. `shouldEscalate` — same fix failed before → true
- **PATTERN**: MIRROR `supervisor/tests/recovery.test.ts` — vi.mock, factory helpers, clearAllMocks
- **MOCK**: `@anthropic-ai/claude-agent-sdk` query function, `node:child_process` execFileSync
- **VALIDATE**: `cd supervisor && npx vitest run tests/interventor.test.ts`

### Task 12: CREATE `supervisor/tests/propagator.test.ts`

- **IMPLEMENT**: Unit tests with temp directory file operations:
  1. `propagateFixToProjects` — copies file to correct destination path
  2. `propagateFixToProjects` — creates missing parent directories
  3. `propagateFixToProjects` — continues on individual project failure
  4. `propagateFixToProjects` — updates registry version
  5. `getOutdatedProjects` — filters by version mismatch
  6. `revertFix` — calls git checkout with correct path
  7. `revertFix` — returns false on git error
- **PATTERN**: MIRROR `supervisor/tests/classifier.test.ts` — mkdtempSync, afterEach rmSync
- **VALIDATE**: `cd supervisor && npx vitest run tests/propagator.test.ts`

### Task 13: UPDATE existing tests

- **IMPLEMENT**: Update `supervisor/tests/recovery.test.ts`:
  - Add test: `execution_error → diagnose action` (replaces old always-escalate)
  - Keep existing tests passing
- **IMPLEMENT**: Update `supervisor/tests/monitor.test.ts` (if exists):
  - Add mock for interventor functions
  - Test diagnosis dispatch flow
- **VALIDATE**: `cd supervisor && npx vitest run`

### Task 14: Add `@anthropic-ai/claude-agent-sdk` dependency

- **IMPLEMENT**: Add Agent SDK to supervisor's package.json:
  ```bash
  cd supervisor && npm install @anthropic-ai/claude-agent-sdk
  ```
- **GOTCHA**: The SDK requires Node.js 18+ (already met by engines field)
- **GOTCHA**: May need to separately install `@anthropic-ai/sdk` (profile gotcha #6)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 15: Full validation sweep

- **IMPLEMENT**: Run full test suite and type check:
  ```bash
  cd supervisor && npx tsc --noEmit && npx vitest run
  ```
- **VALIDATE**: All tests pass, zero type errors

---

## TESTING STRATEGY

### Unit Tests

All new functions tested with mocked external dependencies (Agent SDK, file system for propagation). Factory helpers for RegistryProject, StallClassification, MonitorConfig matching existing patterns.

### Integration Tests

- Propagator: Real file copy operations in temp directories (MIRROR classifier.test.ts pattern)
- Bug location classifier: Real file path analysis against mock registry data
- Improvement log: Real file append in temp directory

### Edge Cases

- Agent SDK session timeout during diagnosis → escalate with partial context
- Fix validation fails → revert + escalate (SC-011)
- Multi-project stall detected across monitor cycles (not all at once)
- Project directory missing or inaccessible during propagation
- Registry becomes corrupted during intervention → fallback to empty registry
- Agent SDK import fails (not installed) → escalate immediately
- Hot fix exceeds 30-line boundary during Agent SDK session → detect and revert

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd supervisor && npx tsc --noEmit
```

**Expected**: Exit code 0, zero errors

### Level 2: Unit Tests

```bash
cd supervisor && npx vitest run
```

**Expected**: All tests pass including new interventor, propagator, and updated recovery tests

### Level 3: Live Integration Tests

```bash
# Tier 1: Agent SDK import and health check
cd supervisor && node -e "import('@anthropic-ai/claude-agent-sdk').then(m => { console.log('SDK import OK:', typeof m.query); })"

# Tier 2: Minimal Agent SDK session (requires ANTHROPIC_API_KEY)
cd supervisor && npx tsx -e "
import { query } from '@anthropic-ai/claude-agent-sdk';
for await (const m of query({ prompt: 'respond ok', options: { maxTurns: 1, maxBudgetUsd: 0.01, model: 'claude-haiku-4-5' } })) {
  if (m.type === 'system') console.log('Init OK, session:', m.session_id);
  if (m.type === 'result') console.log('Result:', m.subtype, 'cost:', m.total_cost_usd);
}
"

# Tier 1: Telegram connectivity
cd supervisor && npx tsx -e "
const r = await fetch('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/getMe');
const j = await r.json();
console.log('Telegram:', j.ok ? 'OK' : 'FAIL', j.result?.username);
"
```

### Level 4: Live Integration Validation

```bash
# End-to-end: Run single monitor cycle against live registry
cd supervisor && npx tsx src/index.ts monitor --once

# Verify improvement log was created/updated
cat ~/.piv/improvement-log.md 2>/dev/null || echo "No interventions recorded (expected if all projects healthy)"

# Verify registry still valid after intervention cycle
cd supervisor && npx tsx -e "
import { readCentralRegistry } from './src/registry.js';
const reg = readCentralRegistry();
console.log('Projects:', Object.keys(reg.projects).length);
for (const [name, p] of Object.entries(reg.projects)) {
  console.log(' ', name, p.status, p.pivCommandsVersion);
}
"
```

---

## ACCEPTANCE CRITERIA

- [ ] `execution_error` stalls trigger diagnosis before escalation
- [ ] Framework bugs diagnosed via read-only Agent SDK sessions
- [ ] Hot fixes applied to single files, validated with tsc + vitest
- [ ] Failed fixes reverted via git checkout
- [ ] Fix validation failure triggers Telegram escalation with diagnosis
- [ ] Validated fixes propagated to all registered projects via file copy
- [ ] Registry `pivCommandsVersion` updated after propagation
- [ ] Orchestrators restarted after fix propagation
- [ ] Multi-project stall patterns detected as framework bugs
- [ ] Project-specific bugs fixed via Agent SDK sessions in project dir
- [ ] All interventions logged to improvement-log.md with diagnosis details
- [ ] SC-002, SC-003, SC-004, SC-008, SC-011 scenarios pass validation
- [ ] All existing tests continue to pass (zero regression)
- [ ] TypeScript compiles with zero errors

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed
- [ ] All validation commands Level 1-4 pass
- [ ] Full test suite passes (existing + new)
- [ ] Zero type checking errors (`tsc --noEmit`)
- [ ] Build succeeds (`tsc`)
- [ ] All acceptance criteria met

---

## NOTES

**Decision 1 — Structured logging**: Using manifest failures + improvement-log as diagnostic data source instead of separate `piv-log.md`. Simplifies implementation without losing diagnostic capability. If richer per-command event logging is needed later, it can be added to the orchestrator's response-handler.

**Decision 2 — Fix validation**: Framework fixes validated with `tsc --noEmit` + `vitest run` in dev kit. Project fixes validated within the Agent SDK fix session. No full phase re-execution — too expensive for MVP.

**Decision 3 — Session serialization**: All Agent SDK sessions run sequentially (one at a time) per SDK profile concurrency guidance. Diagnosis → fix → propagation is a sequential pipeline per stalled project.

**Decision 4 — Hot fix boundary enforcement**: The interventor prompt instructs Claude to limit changes to single file, <30 lines. The interventor also checks the result (lines changed) and reverts if boundary exceeded. This is defense-in-depth.

**Decision 5 — Multi-project pattern**: Detected by cross-referencing all stalled projects in the registry during a single monitor cycle. If 2+ projects share the same error_category at the same phase, it's classified as framework_bug. Pattern detection works within a cycle, not across cycles (simpler, still catches overnight batch stalls).

**PRD Gap**: PRD lists `piv-log.md emission — all PIV commands append structured events during execution` as in-scope, but PIV commands are markdown prompts — they don't execute code. Assumed the intent is that the supervisor reads existing structured data (manifest, orchestrator output) for diagnosis. If per-command event logging is required, it would need changes to the orchestrator's response-handler, not the PIV commands themselves.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 7 from PRD (Gen 2 Phase 3)
independent_tasks_count: 3
dependent_chains: 4
technologies_consumed: anthropic-agent-sdk,telegram-bot-api
next_suggested_command: execute
next_arg: ".agents/plans/phase-7-diagnosis-hot-fix-propagation.md"
estimated_complexity: high
confidence: 7/10
