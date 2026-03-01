# Feature: Phase 12 — Strategic Supervisor & Coalition Intelligence

The following plan should be complete, but validate documentation and codebase patterns before implementing.

## Feature Description

Evolve the PIV supervisor from single-project crash detection to coalition-wide strategic oversight. The supervisor gains the ability to monitor an entire agent coalition (running via Mission Controller), detect convergence issues (spinning vs genuine progress), resolve cross-agent file conflicts, strategically reallocate resources, and store cross-project patterns in SuperMemory for long-term learning.

## User Story

As a developer running an agent coalition building a multi-module system
I want a strategic overseer that monitors coalition health, detects stalls and conflicts, and intervenes intelligently
So that the coalition converges to completion without manual debugging of inter-agent issues

## Problem Statement

The Mission Controller (Phase 11) can spawn and coordinate specialist agents but has no higher-level oversight. When agents spin without progress, conflict on shared files, or consume resources inefficiently, there is no system to detect and correct these coalition-level problems. The existing supervisor (Phases 6-8) only handles single-project stall detection — it cannot reason about multi-agent coalition behavior.

## Solution Statement

Add 4 new supervisor modules (coalition-monitor, convergence-tracker, strategic-interventor, conflict-resolver) that read manifest + registry state to build coalition snapshots, analyze convergence trends via sliding windows, detect file conflicts via git, and issue strategic actions (pause agents, reallocate work, escalate). Enhance existing memory.ts for cross-project pattern learning. Integrate into the existing monitor loop as a coalition monitoring mode that runs alongside per-project checks.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: supervisor/src/, supervisor/tests/
**Dependencies**: SuperMemory SDK (already installed), existing supervisor + orchestrator modules
**Agent Behavior**: Yes — implements Strategic Overseer decision trees from PRD-gen2 Section 4.2/4.4

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `supermemory-ai-profile.md` — Used for: Cross-project pattern learning
  - Key endpoints: `POST /v3/documents` (store patterns), `POST /v4/search` (recall patterns)
  - Auth: Bearer token via `SUPERMEMORY_API_KEY`
  - Critical constraints: Async ingestion (poll for `done` status), flat metadata only, `piv_test_ephemeral` container for tests

**Impact on Implementation:**
Cross-project learning stores coalition-level patterns (not just individual fixes). Metadata schema extends existing fix records with `pattern_type: "convergence" | "conflict" | "resource"` and `coalition_size` fields.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `supervisor/src/types.ts` — All existing supervisor types. Add new coalition types here.
- `supervisor/src/monitor.ts` — Monitor loop. Add coalition cycle integration here.
- `supervisor/src/memory.ts` — SuperMemory client. Extend with pattern learning methods.
- `supervisor/src/telegram.ts` — Notification formatting. Add coalition message templates.
- `supervisor/src/config.ts` — Env var loading. Add coalition config vars.
- `supervisor/src/classifier.ts` — Stall classification patterns to follow.
- `supervisor/src/interventor.ts` — Intervention patterns (Agent SDK sessions) to follow.
- `supervisor/src/recovery.ts` — Recovery action patterns (`determineRecovery`, `executeRecovery`).
- `supervisor/src/improvement-log.ts` — Logging patterns. Extend entry type for coalition actions.
- `.claude/orchestrator/src/types.ts` — Orchestrator types for reference (DAGNode, AgentSession, etc.)
- `.claude/orchestrator/src/mission-controller.ts` — How Mission Controller updates manifest.
- `.claude/orchestrator/src/resource-manager.ts` — Resource state structure.
- `.claude/orchestrator/src/dependency-resolver.ts` — DAG traversal patterns.

### New Files to Create

- `supervisor/src/coalition-monitor.ts` — Build CoalitionSnapshot from manifest + registry
- `supervisor/src/convergence-tracker.ts` — Sliding window convergence analysis
- `supervisor/src/strategic-interventor.ts` — Decision engine for coalition actions
- `supervisor/src/conflict-resolver.ts` — Git-based conflict detection and resolution
- `supervisor/tests/coalition-monitor.test.ts` — Coalition monitor unit tests
- `supervisor/tests/convergence-tracker.test.ts` — Convergence tracker unit tests
- `supervisor/tests/strategic-interventor.test.ts` — Strategic interventor unit tests
- `supervisor/tests/conflict-resolver.test.ts` — Conflict resolver unit tests

### Patterns to Follow

**Module Pattern (from classifier.ts):**
- Export pure functions, no classes
- Accept config + data inputs, return typed results
- Never throw — return null or error variants
- All I/O wrapped in try/catch

**Type Pattern (from types.ts):**
- String literal unions for enums: `type X = "a" | "b" | "c"`
- Interfaces for data shapes, not classes
- Optional fields with `?`, never `| undefined`

**Test Pattern (from monitor.test.ts):**
- `vi.mock()` entire modules at top
- Factory functions: `makeProject()`, `makeConfig()`, `makeRegistry()`
- Assert call counts and argument shapes
- Test both happy path and error conditions

**Config Pattern (from config.ts):**
- `loadXConfig(): XConfig` functions reading `process.env`
- Provide sensible defaults for every env var
- Validate ranges (min/max) where appropriate

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Decision: Coalition Health Assessment (New)**
- IF convergence_rate > 0 AND failure_rate < 20% → `healthy`
- ELSE IF convergence_rate > 0 AND failure_rate 20-50% → `degraded`
- ELSE IF convergence_rate == 0 for 3 consecutive windows → `spinning` (PRD: sliding window, <1% improvement)
- ELSE IF failure_rate > 50% OR budget exceeded → `critical`
- ON `critical` → pause coalition, escalate to human
- ON `spinning` → identify stuck agent, attempt resource reallocation
- ON `degraded` → deprioritize non-critical work, log warning

**Decision: Conflict Resolution (PRD SC-009)**
- IF git status shows conflicting changes between agents →
  - Read dependency DAG from manifest to determine upstream/downstream
  - IF upstream agent (A) modified shared type → A takes priority
  - IF change is additive (new field, no removal) → no actual conflict, continue
  - IF conflict is architectural (incompatible approaches) → escalate to human
- ON RESOLUTION → log to improvement log, store pattern in SuperMemory

**Decision: Strategic Intervention (PRD Phase 4)**
- IF agent stalled AND replacement also stalled → escalate to Strategic Overseer (SC-006 enhanced)
- IF coalition spinning → identify least-progressing agent, pause it, reallocate resources
- IF budget approaching limit → pause non-critical agents, focus on critical path
- IF cross-project pattern detected (same error in 2+ coalitions) → store as framework pattern

### Scenario Mappings

| Scenario (PRD) | Agent Workflow | Decision Tree | Success Criteria |
|---|---|---|---|
| SC-006 enhanced | Detect double-stall → Overseer analyzes coalition → intervene | Coalition Health | Overseer identifies systemic issue and acts |
| SC-009 | Detect file conflict → determine priority → instruct resolution | Conflict Resolution | Upstream wins, downstream rebases, no manual intervention |

### Error Recovery Patterns

- Coalition monitor fails to read manifest → skip cycle, retry next interval
- Convergence tracker gets inconsistent data → log warning, reset window
- Conflict resolution git command fails → escalate to human
- Strategic action fails → log, escalate, never retry same failed action
- SuperMemory unavailable → continue without cross-project learning (graceful degradation)

---

## FOUNDATION

**Generation:** 3 | **Active PRD:** PRD-gen2.md

### What Prior Generations Implemented

| Gen | Phases | Delivered |
|-----|--------|-----------|
| 1 | 1-4 | Orchestrator engine, Telegram, VS Code integration, multi-instance |
| 2 | 5-8 | Supervisor: registry, monitor loop, diagnosis, hot fixes, SuperMemory |
| 3 (prior) | 9-11 | Context Plugin, monorepo commands, Mission Controller, specialist agents |

### Key Existing Files (Do Not Recreate)

- `supervisor/src/monitor.ts` — Monitor loop entry point (extend, don't replace)
- `supervisor/src/types.ts` — All types (add new types here)
- `supervisor/src/memory.ts` — SuperMemory client wrapper (extend with pattern methods)
- `supervisor/src/telegram.ts` — Notification channel (add coalition formatters)
- `supervisor/src/config.ts` — Configuration loading (add coalition env vars)
- `supervisor/src/improvement-log.ts` — Audit trail (extend entry type)

### Architecture Established

- Supervisor reads registry + manifest, never writes manifest during active execution
- All I/O is defensive (try/catch, null returns, graceful degradation)
- Agent SDK sessions use `claude-sonnet-4-6`, strip `CLAUDECODE` env var
- Monitor cycle: read → classify → recover → log → notify
- SuperMemory: `containerTag` per project, `customId` for deduplication

### Gen 3 Phase 12 Adds (This Plan's Scope)

- Coalition-wide monitoring (multi-agent awareness beyond single-project stall detection)
- Convergence tracking with sliding window analysis
- Strategic intervention engine (pause, reallocate, deprioritize)
- Cross-agent file conflict detection and resolution
- Cross-project pattern learning via enhanced SuperMemory integration

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (Types + Config)

Add coalition types and configuration loading.

**Tasks:**
- Add all new types to `supervisor/src/types.ts`
- Add coalition config loading to `supervisor/src/config.ts`

### Phase 2: Core Modules

Implement the 4 new supervisor modules.

**Tasks:**
- Create `coalition-monitor.ts` (snapshot builder)
- Create `convergence-tracker.ts` (sliding window analysis)
- Create `strategic-interventor.ts` (decision engine)
- Create `conflict-resolver.ts` (git-based conflict detection)

### Phase 3: Integration

Wire new modules into existing supervisor infrastructure.

**Tasks:**
- Extend `monitor.ts` with coalition monitoring cycle
- Extend `telegram.ts` with coalition notification formatters
- Extend `memory.ts` with cross-project pattern learning
- Extend `improvement-log.ts` entry type for coalition actions

### Phase 4: Testing & Validation

Full test coverage for all new modules.

**Tasks:**
- Create all 4 test files with comprehensive coverage
- Run full test suite to verify zero regressions

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| Coalition snapshot | Read manifest with modules → snapshot built | Manifest missing/corrupt → null | None (read-only) |
| Convergence tracking | 5 snapshots → trend computed → healthy | 3 identical snapshots → spinning detected | Window state updated |
| Strategic intervention | Spinning detected → pause action emitted | Action fails → escalate | Improvement log entry |
| Conflict resolution | Git shows conflict → upstream wins | Git fails → escalate | Conflict resolution logged |
| Cross-project learning | Pattern stored → similar recalled | SuperMemory down → continue without | Memory record created |

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-006 enhanced | Mock double-stall → verify Overseer detects and acts | Strategic action emitted, escalation sent |
| SC-009 | Mock git conflict between 2 agents → verify resolution | Upstream agent prioritized, downstream instructed to rebase |

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `supervisor/src/types.ts`

- **IMPLEMENT**: Add these types after existing type definitions:

```typescript
// === Coalition Intelligence Types (Phase 12) ===

type CoalitionHealthStatus = "healthy" | "degraded" | "critical" | "spinning";

interface CoalitionSnapshot {
  timestamp: string;
  activeAgents: number;
  totalSlices: number;
  completedSlices: number;
  failedSlices: number;
  blockedSlices: number;
  runningSlices: number;
  totalCostUsd: number;
  budgetLimitUsd: number;
  conflictsDetected: number;
  healthStatus: CoalitionHealthStatus;
}

interface CoalitionHealthMetrics {
  convergenceRate: number;     // slices completed per hour
  failureRate: number;         // failed / (completed + failed), 0-1
  costPerSlice: number;        // totalCost / completedSlices
  conflictFrequency: number;   // conflicts per hour
}

interface ConvergenceWindow {
  snapshots: CoalitionSnapshot[];
  windowSize: number;
  isSpinning: boolean;
  trend: "improving" | "stable" | "degrading" | "spinning";
  improvementPercent: number;
}

type StrategicActionType =
  | "pause_agent"
  | "pause_coalition"
  | "reallocate"
  | "deprioritize"
  | "escalate"
  | "resolve_conflict";

interface StrategicAction {
  type: StrategicActionType;
  target: string;
  reason: string;
  coalitionHealth: CoalitionHealthStatus;
  timestamp: string;
}

interface ConflictDetection {
  hasConflict: boolean;
  conflictingFiles: string[];
  agentA: string;
  agentB: string;
  upstreamAgent: string | null;
  isArchitectural: boolean;
  resolution: "upstream_wins" | "additive_no_conflict" | "escalate";
}

interface CoalitionCycleResult {
  coalitionActive: boolean;
  snapshot: CoalitionSnapshot | null;
  convergence: ConvergenceWindow | null;
  actionsEmitted: StrategicAction[];
  conflictsResolved: number;
  patternsStored: number;
}

interface CoalitionMonitorConfig {
  projectPath: string;
  manifestPath: string;
  convergenceWindowSize: number;   // default 5
  spinningThreshold: number;       // default 0.01 (1%)
  failureRateCritical: number;     // default 0.5 (50%)
  failureRateDegraded: number;     // default 0.2 (20%)
  conflictCheckEnabled: boolean;   // default true
  crossProjectLearning: boolean;   // default true
}
```

- **PATTERN**: MIRROR `supervisor/src/types.ts` existing type conventions (string literals, interfaces)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 2: UPDATE `supervisor/src/config.ts`

- **IMPLEMENT**: Add `loadCoalitionConfig(): CoalitionMonitorConfig` function
- **ENV VARS**:
  - `PIV_COALITION_WINDOW_SIZE` (default 5)
  - `PIV_COALITION_SPINNING_THRESHOLD` (default 0.01)
  - `PIV_COALITION_FAILURE_CRITICAL` (default 0.5)
  - `PIV_COALITION_FAILURE_DEGRADED` (default 0.2)
  - `PIV_COALITION_CONFLICT_CHECK` (default "true")
  - `PIV_COALITION_CROSS_PROJECT` (default "true")
  - `PIV_COALITION_PROJECT_PATH` (required — path to monitored project)
  - `PIV_COALITION_MANIFEST_PATH` (default `{projectPath}/.agents/manifest.yaml`)
- **PATTERN**: MIRROR `loadMonitorConfig()` and `loadMemoryConfig()` patterns in same file
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 3: CREATE `supervisor/src/coalition-monitor.ts`

- **IMPLEMENT**: Functions to build CoalitionSnapshot from manifest:
  - `buildCoalitionSnapshot(config: CoalitionMonitorConfig): CoalitionSnapshot | null`
    - Read manifest.yaml from `config.manifestPath`
    - Extract modules/slices progress (handle both monorepo and classic phase modes)
    - Count: totalSlices, completedSlices, failedSlices, blockedSlices, runningSlices
    - Read activeAgents count from manifest executions or registry
    - Read cost from manifest or infer from execution entries
    - Return null if manifest unreadable (defensive)
  - `computeHealthMetrics(current: CoalitionSnapshot, previous: CoalitionSnapshot | null, elapsedHours: number): CoalitionHealthMetrics`
    - convergenceRate = (current.completedSlices - (previous?.completedSlices ?? 0)) / elapsedHours
    - failureRate = failedSlices / (completedSlices + failedSlices) or 0
    - costPerSlice = totalCostUsd / completedSlices or 0
    - conflictFrequency = conflictsDetected / elapsedHours
  - `classifyHealth(metrics: CoalitionHealthMetrics, config: CoalitionMonitorConfig): CoalitionHealthStatus`
    - Apply decision tree: healthy → degraded → critical → spinning thresholds
- **IMPORTS**: `js-yaml` for manifest parsing, types from `./types.js`
- **GOTCHA**: Manifest might have `phases` (classic) or `modules` (monorepo) — handle both
- **GOTCHA**: Never throw — return null on any read/parse error
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 4: CREATE `supervisor/src/convergence-tracker.ts`

- **IMPLEMENT**: Sliding window convergence analysis:
  - `createConvergenceTracker(windowSize: number, spinningThreshold: number): ConvergenceTracker`
    - Returns object with `addSnapshot(snapshot)` and `getWindow()` methods
    - Internal state: array of snapshots, capped at windowSize
  - `addSnapshot(snapshot: CoalitionSnapshot): ConvergenceWindow`
    - Push to window, trim if > windowSize
    - Compute improvement between consecutive snapshots
    - Detect spinning: 3+ consecutive windows with improvement < spinningThreshold
    - Compute trend: improving (positive), stable (near-zero but not spinning), degrading (negative), spinning
  - `getWindow(): ConvergenceWindow`
    - Return current window state
  - `isSpinning(): boolean` — convenience accessor
  - `reset(): void` — clear window (used after intervention)
- **PATTERN**: Stateful module using closure pattern (not class), similar to `restartHistory` Map in `monitor.ts`
- **GOTCHA**: Handle edge case of < 3 snapshots — can't determine spinning, return `stable`
- **GOTCHA**: Window size of 1 = no trend possible, return `stable`
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 5: CREATE `supervisor/src/conflict-resolver.ts`

- **IMPLEMENT**: Git-based conflict detection:
  - `detectConflicts(projectPath: string): ConflictDetection | null`
    - Run `git status --porcelain` in projectPath
    - Look for unmerged paths (UU, AA, DD markers)
    - If no conflicts, check for modified files that overlap between tracked agent sessions
    - Parse manifest for active agent assignments (module/slice → agentType mapping)
    - Return null if no conflicts or git fails
  - `determineUpstream(agentA: string, agentB: string, manifestPath: string): string | null`
    - Read manifest dependency graph
    - If A depends on B → B is upstream
    - If B depends on A → A is upstream
    - If no dependency relationship → null (escalate)
  - `classifyConflict(files: string[], projectPath: string): "upstream_wins" | "additive_no_conflict" | "escalate"`
    - Run `git diff` on conflicting files
    - If diff is purely additive (only additions, no deletions/modifications to existing lines) → `additive_no_conflict`
    - If changes are in shared type definitions or architectural files → `escalate`
    - Otherwise → `upstream_wins`
  - `formatConflictResolution(detection: ConflictDetection): string`
    - Human-readable description for improvement log / Telegram
- **IMPORTS**: `child_process` for git commands, `js-yaml` for manifest
- **GOTCHA**: Git commands can fail in non-git directories — always wrap in try/catch
- **GOTCHA**: Parse `git diff --stat` output carefully — additions vs modifications
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 6: CREATE `supervisor/src/strategic-interventor.ts`

- **IMPLEMENT**: Decision engine for coalition-level strategic actions:
  - `determineStrategicActions(snapshot: CoalitionSnapshot, convergence: ConvergenceWindow, conflicts: ConflictDetection | null, config: CoalitionMonitorConfig): StrategicAction[]`
    - Apply decision trees from PRD:
    - IF `snapshot.healthStatus === "critical"` → emit `pause_coalition` + `escalate`
    - IF `convergence.isSpinning` → identify least-progressing slice, emit `pause_agent` for its assigned agent
    - IF `snapshot.totalCostUsd >= snapshot.budgetLimitUsd * 0.9` → emit `deprioritize` non-critical agents
    - IF `conflicts?.hasConflict && conflicts.resolution === "escalate"` → emit `escalate`
    - IF `conflicts?.hasConflict && conflicts.resolution === "upstream_wins"` → emit `resolve_conflict`
    - Return array of actions (may be empty for healthy coalition)
  - `executeStrategicAction(action: StrategicAction, config: CoalitionMonitorConfig): boolean`
    - For `pause_agent`: Write pause signal to manifest notifications section
    - For `pause_coalition`: Write coalition-wide pause notification
    - For `escalate`: Return false (caller handles Telegram)
    - For `resolve_conflict`: Write resolution instruction to manifest
    - For `reallocate` / `deprioritize`: Write priority adjustment to manifest
    - Returns success boolean, never throws
  - `shouldPauseCoalition(snapshot: CoalitionSnapshot): boolean`
    - Budget exceeded OR failure_rate > 50% OR all agents failed
  - `identifyStuckAgent(snapshot: CoalitionSnapshot, manifestPath: string): string | null`
    - Read manifest executions, find agent with longest runtime and no progress
    - Return agent identifier or null
- **PATTERN**: MIRROR `determineRecovery()` in `recovery.ts` — pure decision function
- **GOTCHA**: Never write to manifest during active Mission Controller execution — use notifications section only
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 7: UPDATE `supervisor/src/monitor.ts`

- **IMPLEMENT**: Add coalition monitoring to existing monitor cycle:
  - Add `runCoalitionCycle(config: CoalitionMonitorConfig, memoryConfig: MemoryConfig, telegramConfig: SupervisorTelegramConfig | null): Promise<CoalitionCycleResult>`
    - Step 1: Build coalition snapshot via `buildCoalitionSnapshot()`
    - Step 2: If snapshot exists and has active agents → proceed
    - Step 3: Add snapshot to convergence tracker
    - Step 4: Detect conflicts via `detectConflicts()`
    - Step 5: Determine strategic actions via `determineStrategicActions()`
    - Step 6: Execute each action, log to improvement log
    - Step 7: Send Telegram notifications for escalations
    - Step 8: Store patterns in SuperMemory if cross-project learning enabled
    - Return CoalitionCycleResult
  - Modify `runMonitorCycle()` to call `runCoalitionCycle()` after existing project checks
    - Only if `coalitionConfig` is provided and a coalition is active
    - Coalition is active = manifest has `modules` section with running slices
  - Modify `startMonitor()` to accept optional `CoalitionMonitorConfig`
  - Add convergence tracker instance (module-level state, persists across cycles)
- **PATTERN**: Follow existing cycle pattern — read → classify → act → log → notify
- **IMPORTS**: Import from new modules: `coalition-monitor.js`, `convergence-tracker.js`, `strategic-interventor.js`, `conflict-resolver.js`
- **GOTCHA**: Coalition cycle is additive — existing per-project monitoring must continue unchanged
- **GOTCHA**: Convergence tracker state persists across cycles (not recreated per cycle)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit && npx vitest run`

### Task 8: UPDATE `supervisor/src/telegram.ts`

- **IMPLEMENT**: Add coalition-specific notification formatters:
  - `telegramSendCoalitionAlert(config, snapshot: CoalitionSnapshot, actions: StrategicAction[]): Promise<TelegramApiResponse<TelegramMessage>>`
    - Format: health status emoji + metrics summary + actions taken
    - Emojis: healthy=🟢, degraded=🟡, critical=🔴, spinning=🔄
  - `telegramSendConflictAlert(config, conflict: ConflictDetection): Promise<TelegramApiResponse<TelegramMessage>>`
    - Format: conflicting files, agents involved, resolution applied
  - `telegramSendConvergenceWarning(config, convergence: ConvergenceWindow): Promise<TelegramApiResponse<TelegramMessage>>`
    - Format: trend direction, snapshots count, improvement %, spinning status
- **PATTERN**: MIRROR `telegramSendEscalation()` and `telegramSendFixFailure()` — HTML formatting, escapeHtml, message splitting
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 9: UPDATE `supervisor/src/memory.ts`

- **IMPLEMENT**: Add cross-project pattern learning methods:
  - `storeCoalitionPattern(client: Supermemory, pattern: { type: string; description: string; metrics: CoalitionHealthMetrics; resolution: string; projectPath: string }): Promise<{ id: string; status: string } | null>`
    - Store as document with metadata: `pattern_type`, `coalition_size`, `convergence_rate`, `resolution_type`
    - containerTag: `"coalition_patterns"` (cross-project scope)
    - customId: `"pattern_{timestamp}_{type}"`
    - entityContext: "This is a coalition behavior pattern. Extract the trigger condition, health metrics, and resolution approach."
  - `recallCoalitionPatterns(client: Supermemory, queryText: string, limit?: number): Promise<MemorySearchResult[]>`
    - Search with containerTag: `"coalition_patterns"`
    - searchMode: `"hybrid"`, rerank: true, rewriteQuery: true
    - threshold: 0.4 (same as existing fix recall)
  - `storeConflictPattern(client: Supermemory, conflict: ConflictDetection, resolution: string): Promise<{ id: string; status: string } | null>`
    - Metadata: `conflict_type`, `files_affected`, `resolution_applied`
    - containerTag: `"coalition_patterns"`
- **PATTERN**: MIRROR `storeFixRecord()` and `recallSimilarFixes()` — defensive, returns null/[] on error
- **PROFILE**: SuperMemory `POST /v3/documents` for storage, `POST /v4/search` for recall
- **GOTCHA**: entityContext is per-containerTag — set once for `coalition_patterns` container
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 10: UPDATE `supervisor/src/improvement-log.ts`

- **IMPLEMENT**: Extend `ImprovementLogEntry` in types.ts and logging function:
  - Add optional fields to `ImprovementLogEntry`:
    - `coalitionHealth?: CoalitionHealthStatus`
    - `convergenceTrend?: string`
    - `strategicActions?: string[]`
    - `conflictResolution?: string`
    - `coalitionPatternId?: string`
  - Update `appendToImprovementLog()` to render new fields when present
    - Add `- **Coalition Health:** {status}` line
    - Add `- **Convergence:** {trend}` line
    - Add `- **Strategic Actions:** {actions}` line
    - Add `- **Conflict Resolution:** {resolution}` line
- **PATTERN**: MIRROR existing optional field rendering (bugLocation, rootCause, etc.)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 11: CREATE `supervisor/tests/coalition-monitor.test.ts`

- **IMPLEMENT**: Unit tests for coalition-monitor.ts:
  - Test `buildCoalitionSnapshot()`:
    - With valid monorepo manifest (modules + slices) → correct counts
    - With classic phase manifest → correct phase-based counts
    - With missing manifest → returns null
    - With corrupt YAML → returns null
  - Test `computeHealthMetrics()`:
    - Normal progress → positive convergence rate
    - No progress → zero convergence rate
    - With failures → correct failure rate
    - Zero completed slices → costPerSlice = 0 (no divide-by-zero)
  - Test `classifyHealth()`:
    - Low failure rate, positive convergence → healthy
    - High failure rate → degraded or critical based on threshold
    - Zero convergence for 3 windows → spinning
- **PATTERN**: MIRROR `tests/monitor.test.ts` — `vi.mock()`, factory functions, typed assertions
- **VALIDATE**: `cd supervisor && npx vitest run tests/coalition-monitor.test.ts`

### Task 12: CREATE `supervisor/tests/convergence-tracker.test.ts`

- **IMPLEMENT**: Unit tests for convergence-tracker.ts:
  - Test window management:
    - Adding snapshots up to window size → all retained
    - Adding beyond window size → oldest dropped
    - Empty window → stable trend
  - Test convergence detection:
    - Increasing completedSlices across snapshots → improving
    - Flat completedSlices for 3+ snapshots → spinning
    - Slightly decreasing → degrading
    - Mixed but net positive → stable
  - Test threshold sensitivity:
    - 0.9% improvement (below 1% threshold) → spinning
    - 1.1% improvement → not spinning
  - Test reset:
    - After reset → empty window, stable trend
- **VALIDATE**: `cd supervisor && npx vitest run tests/convergence-tracker.test.ts`

### Task 13: CREATE `supervisor/tests/strategic-interventor.test.ts`

- **IMPLEMENT**: Unit tests for strategic-interventor.ts:
  - Test `determineStrategicActions()`:
    - Healthy coalition → empty actions array
    - Critical health → pause_coalition + escalate actions
    - Spinning → pause_agent for stuck agent
    - Budget near limit → deprioritize action
    - Conflict with escalation → escalate action
    - Conflict with upstream resolution → resolve_conflict action
    - Multiple conditions → multiple actions in priority order
  - Test `shouldPauseCoalition()`:
    - Budget exceeded → true
    - >50% failure rate → true
    - Normal conditions → false
  - Test `identifyStuckAgent()`:
    - With stalled agent → returns identifier
    - All agents progressing → returns null
    - No active agents → returns null
- **VALIDATE**: `cd supervisor && npx vitest run tests/strategic-interventor.test.ts`

### Task 14: CREATE `supervisor/tests/conflict-resolver.test.ts`

- **IMPLEMENT**: Unit tests for conflict-resolver.ts:
  - Test `detectConflicts()`:
    - Clean git status → null (no conflicts)
    - Unmerged paths in git output → ConflictDetection with files
    - Git command fails → null
  - Test `determineUpstream()`:
    - A depends on B → B is upstream
    - No dependency → null
    - Manifest unreadable → null
  - Test `classifyConflict()`:
    - Additive changes only → additive_no_conflict
    - Shared type modifications → escalate
    - Regular file conflicts → upstream_wins
  - Mock `child_process.execSync` for git command outputs
- **VALIDATE**: `cd supervisor && npx vitest run tests/conflict-resolver.test.ts`

### Task 15: Run Full Test Suite + TypeCheck

- **VALIDATE**: `cd supervisor && npx tsc --noEmit && npx vitest run`
- **EXPECTED**: All existing tests (13 files) pass + 4 new test files pass. Zero regressions.

---

## TESTING STRATEGY

### Unit Tests

All 4 new modules get dedicated test files following existing `vi.mock()` patterns. Each test file covers:
- Happy path (valid inputs → correct outputs)
- Error handling (missing files, corrupt data → null/empty returns)
- Edge cases (empty manifests, single-slice coalitions, zero-division guards)
- Decision tree coverage (every branch of every decision tree)

### Integration Tests

- Coalition cycle integration: verify `runCoalitionCycle()` correctly chains snapshot → convergence → actions → logging
- Monitor loop integration: verify coalition cycle runs alongside existing per-project checks without interference
- Memory integration: verify coalition patterns stored and recalled (mocked SuperMemory client)

### Edge Cases

- Manifest has classic `phases` instead of `modules` — coalition monitor handles both
- Coalition with 0 completed slices — no divide-by-zero in metrics
- Convergence window with 1 snapshot — can't compute trend, default to "stable"
- Git not installed or not a git repo — conflict resolver returns null
- SuperMemory unavailable — all memory operations return null/[], cycle continues
- All agents failed simultaneously — critical health, coalition pause

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd supervisor && npx tsc --noEmit
```

**Expected**: Exit code 0, no type errors

### Level 2: Unit Tests

```bash
cd supervisor && npx vitest run
```

**Expected**: All tests pass (existing 13 + new 4 = 17 test files), zero failures

### Level 3: Live Integration Tests

```bash
cd supervisor && npx vitest run tests/coalition-monitor.test.ts tests/convergence-tracker.test.ts tests/strategic-interventor.test.ts tests/conflict-resolver.test.ts
```

**Expected**: All 4 new test files pass individually

### Level 4: Live Integration Validation

```bash
# SuperMemory coalition pattern write/search/delete cycle
cd supervisor && npx vitest run tests/coalition-monitor.test.ts --reporter=verbose
# Verify git-based conflict detection with test repo
cd supervisor && npx vitest run tests/conflict-resolver.test.ts --reporter=verbose
# Full regression suite
cd supervisor && npx vitest run --reporter=verbose
```

**Expected**: Full pipeline pass, zero regressions in existing tests

---

## ACCEPTANCE CRITERIA

- [ ] Coalition monitor builds accurate snapshots from both monorepo and classic manifests
- [ ] Convergence tracker detects spinning (3 consecutive windows, <1% improvement) per PRD spec
- [ ] Strategic interventor emits correct actions for each health status (healthy/degraded/critical/spinning)
- [ ] Conflict resolver detects git conflicts and determines upstream priority from dependency DAG
- [ ] Coalition monitoring integrates into existing monitor loop without disrupting per-project checks
- [ ] Telegram notifications sent for coalition health changes (degraded, critical, spinning)
- [ ] Cross-project patterns stored in SuperMemory with coalition_patterns containerTag
- [ ] All decision trees from PRD Section 4.2/4.4 implemented and tested
- [ ] SC-006 enhanced: double-stall escalates to Strategic Overseer
- [ ] SC-009: cross-agent file conflict resolved with upstream priority
- [ ] Zero regressions in existing supervisor tests (13 files)
- [ ] TypeScript compiles cleanly with zero errors

---

## COMPLETION CHECKLIST

- [ ] All 15 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (17 test files)
- [ ] No type checking errors (`npx tsc --noEmit`)
- [ ] All acceptance criteria met
- [ ] Code follows existing supervisor patterns (defensive I/O, null returns, no throws)

---

## NOTES

### Phase 0 Decisions Baked In

1. **Coalition pause authority**: Both individual and coalition-wide, with different thresholds (50% failure rate or budget exceeded for coalition pause). Implemented in `strategic-interventor.ts` via `shouldPauseCoalition()`.

2. **Health metrics**: 4 quantitative metrics (convergence_rate, failure_rate, cost_efficiency, conflict_frequency). Implemented in `coalition-monitor.ts` via `computeHealthMetrics()`.

3. **Communication pattern**: Manifest-based, read-only from supervisor. Supervisor reads `.agents/manifest.yaml` for progress state. Strategic actions are written to manifest `notifications` section (same pattern as existing escalations).

### Architecture Notes

- The supervisor and orchestrator (Mission Controller) are separate processes. Coalition monitoring reads manifest state written by the Mission Controller — no IPC or shared event bus.
- Convergence tracker maintains in-memory state (sliding window) across monitor cycles. State is lost on supervisor restart, which is acceptable — the window rebuilds within a few cycles.
- Conflict detection runs `git status` in the project directory. This is safe because the supervisor only reads git state, never modifies it.
- PRD specifies one-way authority (Overseer → Controller). Strategic actions are communicated via manifest notifications, which the Mission Controller reads.

### PRD Gap Assumptions

- PRD does not specify exact thresholds for `degraded` vs `critical` health. Assumed: failure_rate >20% = degraded, >50% = critical. If incorrect, this affects `classifyHealth()` thresholds only.
- PRD does not define how Strategic Overseer communicates "pause" to Mission Controller. Assumed: via manifest `notifications` section with `blocking: true`. Mission Controller already reads this section for pause decisions.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 12 from PRD-gen2
independent_tasks_count: 4
dependent_chains: 3
technologies_consumed: supermemory-ai
next_suggested_command: execute
next_arg: ".agents/plans/phase-12-strategic-supervisor-coalition-intelligence.md"
estimated_complexity: high
confidence: 8/10
