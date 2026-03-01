# Feature: Phase 11 — Mission Controller & Specialist Agents

The following plan should be complete, but validate documentation and codebase patterns before implementing.

## Feature Description

Transform the PIV orchestrator from sequential phase/slice execution into a DAG-aware Mission Controller that spawns specialist agents in parallel. Seven specialist agent types are defined as YAML configs — adding new agents requires no TypeScript changes. An event bus coordinates agent lifecycle. A dependency resolver tracks upstream deliverables and unblocks downstream work. A resource manager enforces concurrency limits and budget thresholds.

## User Story

As a developer with a validated context monorepo
I want to run `/go` and have the agent coalition build slices in parallel
So that complex multi-module systems are built faster than sequential execution allows

## Problem Statement

The current orchestrator processes slices sequentially via `runSlice()` in `piv-runner.ts`. Independent slices that could run in parallel wait in a queue. There is no mechanism for different agent types (executor, validator, iterator) — every slice gets the same generic session. No event system exists for extensible agent spawning.

## Solution Statement

Add a parallel Mission Controller that reads the dependency DAG from `architecture.md`, identifies independent work streams, and spawns specialist agents concurrently via the Agent SDK. Agent types are YAML-defined, enabling extensibility without code changes. The existing sequential runner remains for classic (non-monorepo) projects.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: orchestrator/src/ (new modules + index.ts routing)
**Dependencies**: @anthropic-ai/claude-agent-sdk, js-yaml (already installed)
**Agent Behavior**: Yes — implements Mission Controller decision tree (PRD 4.2)

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `anthropic-agent-sdk-profile.md` — Used for: agent spawning, session management, structured output
  - Key endpoints: `query()` with per-agent `cwd`, `systemPrompt`, `allowedTools`, `maxBudgetUsd`
  - Auth method: OAuth via CLI keychain (no API key)
  - Critical constraints: 1 active query per process recommended; connection conflicts at high concurrency (Issue #24631); must strip CLAUDECODE env var; require both `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
  - Concurrency: multiple processes can run concurrent sessions but share org-level rate limits
  - Cost: Sonnet ~$0.30-$2.00/session, Opus ~$0.60-$6.00/session
  - Structured output: `outputFormat: { type: "json_schema", schema }` → `message.structured_output`

**Impact on Implementation:**
Agent spawner wraps `query()` with per-agent configs from YAML. Resource manager limits concurrent `query()` calls to 3 (configurable). Each specialist gets its own `AbortController` with timeout from YAML budget. Mission Controller serializes critical operations (checkpoint, commit) while parallelizing execution.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `orchestrator/src/types.ts` (full file) — All shared types; add new types here
- `orchestrator/src/session-manager.ts` (full file) — `createSession()`, `runCommandPairing()` patterns
- `orchestrator/src/piv-runner.ts` (lines 505-765) — `runSlice()` for existing slice pipeline pattern
- `orchestrator/src/monorepo-resolver.ts` (full file) — `getWorkUnits()`, `WorkUnit` type
- `orchestrator/src/state-machine.ts` (lines 111-294) — `determineNextAction()` routing
- `orchestrator/src/config.ts` (full file) — `SESSION_DEFAULTS`, `loadConfig()`
- `orchestrator/src/index.ts` (lines 56-357) — CLI entry, lifecycle, Telegram setup
- `orchestrator/src/manifest-manager.ts` — `readManifest()`, `writeManifest()`, `mergeManifest()`
- `orchestrator/src/error-classifier.ts` — `classifyError()`, `getTaxonomy()`
- `orchestrator/src/heartbeat.ts` — `startHeartbeat()`, `stopHeartbeat()`

### New Files to Create

**Orchestrator modules (`.claude/orchestrator/src/`):**
- `event-bus.ts` — Typed EventEmitter for lifecycle events
- `agent-loader.ts` — YAML schema validation + agent registry
- `mission-planner.ts` — DAG parser + work allocation plan
- `agent-spawner.ts` — Agent SDK session factory with per-agent config
- `dependency-resolver.ts` — Deliverable tracking + unblocking
- `resource-manager.ts` — Concurrency limiter, cost tracker, budget enforcement
- `mission-controller.ts` — Top-level coordinator wiring everything together

**Agent YAML definitions (`.claude/agents/`):**
- `environment-architect.yaml`
- `executor.yaml`
- `pipeline-validator.yaml`
- `quality-iterator.yaml`
- `external-service-controller.yaml`
- `research-agent.yaml`
- `integration-agent.yaml`

**Tests (`.claude/orchestrator/tests/`):**
- `event-bus.test.ts`
- `agent-loader.test.ts`
- `mission-planner.test.ts`
- `agent-spawner.test.ts`
- `dependency-resolver.test.ts`
- `resource-manager.test.ts`
- `mission-controller.test.ts`

### Patterns to Follow

**Type definitions:** All types go in `types.ts`. MIRROR: `orchestrator/src/types.ts`
**Module exports:** Named exports, no default exports. MIRROR: `orchestrator/src/monorepo-resolver.ts`
**Error handling:** Use `classifyError()` from `error-classifier.ts`
**Session creation:** Use `query()` wrapper pattern from `session-manager.ts:46-82`
**Manifest updates:** Use `mergeManifest()` — never overwrite. MIRROR: `piv-runner.ts:288-298`
**Test structure:** Vitest with `describe`/`it` blocks. MIRROR: `tests/monorepo-resolver.test.ts`

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Decision Tree: Mission Controller — Next Work Allocation (PRD 4.2)**
- IF unblocked slices exist with no assigned agent → spawn Executor
- ELSE IF execution complete but not validated → spawn Pipeline Validator
- ELSE IF validation failed with retry budget → spawn Quality Iterator
- ELSE IF all slices in module validated → spawn Integration Agent
- ELSE IF all agents working, no unblocked work → wait for dependency resolution
- ON FAILURE (agent crash) → reassign to new agent, log in manifest

**Decision Tree: Quality Iterator — Fix Strategy (PRD 4.2)**
- IF data quality failure → analyze cases, add fixes, re-validate
- ELSE IF performance failure → profile, optimize hot path
- ELSE IF integration failure → read data contract, fix divergent side
- ELSE IF infrastructure failure → delegate to Environment Architect
- ELSE → escalate to Mission Controller
- ON FAILURE (3 iterations, no improvement) → escalate to human

**Decision Tree: Context Monorepo vs Classic (PRD 4.2)**
- IF `context/architecture.md` exists → monorepo mode → Mission Controller
- ELSE IF `PRD.md` exists → classic mode → existing `piv-runner.ts`
- ELSE → error, no context base

### Scenario Mappings

| Scenario | Workflow | Decision Tree | Success Criteria |
|----------|----------|---------------|------------------|
| SC-005 Parallel Building | MC reads DAG, spawns Executors for independent slices | Next Work Allocation | 3 slices, 2 built in parallel |
| SC-006 Agent Stall | MC detects no heartbeat for 10 min, kills + respawns | Next Work Allocation (ON FAILURE) | Replacement completes work |
| SC-007 Quality Iteration | Validator fails, Iterator spawned, fixes root cause | Quality Iterator Fix Strategy | Metric rises above threshold in ≤3 cycles |
| SC-008 External Rate Limit | ESC gets 429, backs off, retries | N/A (agent-internal) | Cost tracked, batch completes |
| SC-009 Cross-Agent Conflict | Strategic Overseer (Phase 12) — out of scope | N/A | N/A — Phase 12 |
| SC-011 New Module Mid-Build | MC detects new module in manifest, adds to graph | Next Work Allocation | New module scheduled without disruption |
| SC-012 Missing Domain Knowledge | Executor handles in code, documents in context | N/A (agent-internal) | Edge case documented |
| SC-013 New Agent YAML | MC loads `.claude/agents/*.yaml` on startup | Agent Loader | New agent registered, triggers respected |

### Error Recovery Patterns

- Agent session crash → kill session, spawn replacement from checkpoint (max 2 retries)
- Rate limit hit → exponential backoff via resource manager, queue pending work
- Infrastructure down → Environment Architect reprovisions (delegate)
- Quality gate failure → Quality Iterator, max 3 iterations, then escalate
- Budget threshold hit → pause non-critical work, report to Telegram

---

## FOUNDATION (Evolution Mode)

**Generation:** 3 | **Active PRD:** `PRD-gen2.md`

### What Previous Generations Implemented

| Gen | Phases | Delivered |
|-----|--------|-----------|
| 1 | 1-4 | Core orchestration engine, Telegram bot, VS Code resilience, multi-instance support |
| 2 | 5-8 | Supervisor: registry, monitor loop, stall detection, diagnosis, hot fix, SuperMemory |
| 3 | 9-10 | Context Plugin commands, PRD-gen2, manifest evolution, monorepo-aware slice runner |

### Key Existing Files (Do Not Recreate)

- `orchestrator/src/session-manager.ts` — SDK `query()` wrapper (extend, don't replace)
- `orchestrator/src/piv-runner.ts` — Sequential runner (keep for classic mode)
- `orchestrator/src/monorepo-resolver.ts` — WorkUnit helpers (import, don't duplicate)
- `orchestrator/src/types.ts` — Type registry (add new types here)

### Architecture Established

- Session management via Agent SDK `query()` with timeout/abort
- Manifest-driven state machine in `state-machine.ts`
- `CLAUDECODE` env var stripped in `session-manager.ts:24`
- Merge-only manifest updates via `manifest-manager.ts`
- Error taxonomy with retry budgets in `error-classifier.ts`

### Gen 3 Phase 11 Adds

- Parallel agent spawning with DAG-based dependency resolution
- YAML-defined specialist agents (7 types)
- Event bus for lifecycle-driven agent triggers
- Resource manager for concurrency/cost/budget control

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Types, Event Bus, Agent Schema

**Tasks:**
- Define all new types in `types.ts`: `AgentType`, `AgentConfig`, `LifecycleEvent`, `MissionPlan`, `AgentSession`, `ResourceState`, `DependencyEdge`, `DAGNode`
- Implement `event-bus.ts` — typed EventEmitter with lifecycle events
- Define YAML agent schema and implement `agent-loader.ts` — scan, validate, register

### Phase 2: Core — DAG Planner, Dependency Resolver, Resource Manager

**Tasks:**
- Implement `mission-planner.ts` — parse YAML adjacency list from `architecture.md`, build DAG, identify parallel streams
- Implement `dependency-resolver.ts` — track deliverables per slice, unblock downstream on upstream completion
- Implement `resource-manager.ts` — concurrency limit, cost accumulation, budget enforcement

### Phase 3: Agent Spawning + Mission Controller

**Tasks:**
- Implement `agent-spawner.ts` — create Agent SDK sessions per YAML agent config
- Implement `mission-controller.ts` — top-level coordinator: plan → spawn → monitor → resolve → repeat
- Create all 7 specialist agent YAML files in `.claude/agents/`

### Phase 4: Integration + Testing

**Tasks:**
- Update `index.ts` to route monorepo mode to Mission Controller
- Update `state-machine.ts` to detect Mission Controller mode
- Write unit tests for all 7 new modules
- Integration test: Mission Controller with mock agents

---

## VALIDATION STRATEGY

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|----------|-----------|---------------|
| SC-005 | Create 3-slice DAG (1 root, 2 dependent). MC spawns root immediately, dependents after | 2 agents run concurrently after root completes |
| SC-006 | Simulate agent timeout (abort after 5s). MC detects, respawns | Replacement agent receives same context |
| SC-007 | Pipeline Validator reports below threshold. Quality Iterator spawned | Iterator runs ≤3 cycles |
| SC-008 | Mock 429 response in agent spawner. Resource manager backs off | Work queued, retry succeeds after backoff |
| SC-011 | Add module to manifest mid-run. MC re-reads DAG | New module appears in work plan |
| SC-013 | Create new `.yaml` in agents/. Load on startup | Agent registered with correct triggers |

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `orchestrator/src/types.ts` — Add Mission Controller types

- **IMPLEMENT**: Add these types after existing types (line ~427):
  ```typescript
  // --- Mission Controller Types ---
  export type AgentType = "environment-architect" | "executor" | "pipeline-validator"
    | "quality-iterator" | "external-service-controller" | "research-agent" | "integration-agent";

  export type LifecycleEvent = "slice_ready" | "execution_complete" | "validation_failed"
    | "quality_gate_passed" | "integration_ready" | "agent_crash" | "module_complete";

  export interface AgentYamlConfig {
    schema_version: number;
    name: string;
    type: AgentType;
    description: string;
    triggers: LifecycleEvent[];
    system_prompt: string;
    model?: string;
    tools?: string[];
    budget?: { maxTurns?: number; maxBudgetUsd?: number; timeoutMs?: number };
    teams?: { enabled: boolean; max_teammates?: number };
  }

  export interface DependencyEdge {
    from: { module: string; slice: string };
    to: { module: string; slice: string };
    type: "data" | "schema" | "infrastructure" | "types";
  }

  export interface DAGNode {
    module: string;
    slice: string;
    dependencies: DependencyEdge[];
    dependents: DependencyEdge[];
    status: "blocked" | "ready" | "running" | "complete" | "failed";
    assignedAgent?: string;
  }

  export interface MissionPlan {
    nodes: DAGNode[];
    parallelStreams: DAGNode[][];
    totalSlices: number;
    maxParallelism: number;
  }

  export interface AgentSession {
    id: string;
    agentType: AgentType;
    module: string;
    slice: string;
    sessionId?: string;
    startedAt: number;
    status: "spawning" | "running" | "complete" | "failed" | "crashed";
    costUsd: number;
    retryCount: number;
  }

  export interface ResourceState {
    activeAgents: AgentSession[];
    maxConcurrent: number;
    totalCostUsd: number;
    budgetLimitUsd: number;
    queuedWork: DAGNode[];
  }
  ```
- **PATTERN**: Follow existing type grouping with section comments
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 2: CREATE `orchestrator/src/event-bus.ts` — Lifecycle event system

- **IMPLEMENT**: Typed EventEmitter wrapping Node.js `EventEmitter`
  - `emit(event: LifecycleEvent, payload: EventPayload)` — type-safe emit
  - `on(event: LifecycleEvent, handler)` — type-safe listener
  - `off(event: LifecycleEvent, handler)` — remove listener
  - EventPayload includes: `{ module: string; slice: string; agentType?: AgentType; details?: string; timestamp: number }`
  - Log every event emission to console for debugging
- **PATTERN**: MIRROR `orchestrator/src/heartbeat.ts` for module structure
- **IMPORTS**: `import { EventEmitter } from "node:events"`
- **GOTCHA**: EventEmitter memory leak warnings at >10 listeners — call `setMaxListeners(50)` in constructor
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 3: CREATE `orchestrator/src/agent-loader.ts` — YAML agent registry

- **IMPLEMENT**:
  - `loadAgents(agentsDir: string): AgentYamlConfig[]` — scan `*.yaml` files, parse, validate schema
  - `validateAgentSchema(raw: unknown): { valid: boolean; errors: string[] }` — check required fields, schema_version === 1
  - `getAgentForEvent(agents: AgentYamlConfig[], event: LifecycleEvent): AgentYamlConfig | null` — find agent triggered by event
  - On invalid YAML: log warning, skip file, continue (SC-013 error case)
  - On missing directory: return empty array, log info
- **IMPORTS**: `import { readFileSync, readdirSync, existsSync } from "node:fs"`, `import yaml from "js-yaml"`
- **PATTERN**: MIRROR `orchestrator/src/hooks-parser.ts` for file-reading patterns
- **GOTCHA**: `js-yaml` can throw on malformed YAML — wrap in try/catch per file
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 4: CREATE `orchestrator/src/mission-planner.ts` — DAG builder

- **IMPLEMENT**:
  - `parseDependencyGraph(architectureMd: string): DependencyEdge[]` — extract YAML adjacency list from architecture.md (section between triple-backtick yaml fences labeled "dependencies" or similar)
  - `buildDAG(edges: DependencyEdge[], workUnits: WorkUnit[]): MissionPlan` — construct DAG nodes from edges + work units. Mark nodes with 0 incoming dependencies as "ready". Calculate `maxParallelism` and `parallelStreams`.
  - `getReadyNodes(plan: MissionPlan): DAGNode[]` — return all nodes with status "ready" and no blocked dependencies
  - `markNodeComplete(plan: MissionPlan, module: string, slice: string): MissionPlan` — update status, check if dependents are now unblocked
  - `markNodeFailed(plan: MissionPlan, module: string, slice: string): MissionPlan` — mark failed, cascade-block dependents
  - Edge case: no architecture.md or no YAML section → fall back to sequential (all slices treated as independent with priority order)
- **PATTERN**: Pure functions returning new objects. MIRROR `monorepo-resolver.ts` functional style
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 5: CREATE `orchestrator/src/dependency-resolver.ts` — Deliverable tracker

- **IMPLEMENT**:
  - `createResolver(plan: MissionPlan): DependencyResolver` — factory
  - `DependencyResolver.markDeliverable(module: string, slice: string, type: DependencyEdge["type"])` — record that a deliverable is ready
  - `DependencyResolver.getUnblockedNodes(): DAGNode[]` — check each blocked node: if all incoming edges are satisfied, return as unblocked
  - `DependencyResolver.isComplete(): boolean` — all nodes complete or failed
  - `DependencyResolver.getBlockedBy(module: string, slice: string): DependencyEdge[]` — what's blocking a specific node
- **PATTERN**: Class with immutable MissionPlan reference, mutable deliverable tracking Set
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 6: CREATE `orchestrator/src/resource-manager.ts` — Concurrency + cost

- **IMPLEMENT**:
  - `createResourceManager(maxConcurrent: number, budgetLimitUsd: number): ResourceManager`
  - `ResourceManager.canSpawn(): boolean` — active agents < maxConcurrent AND totalCost < budget
  - `ResourceManager.registerAgent(session: AgentSession): void` — add to active set
  - `ResourceManager.releaseAgent(sessionId: string, costUsd: number): void` — remove from active, add cost
  - `ResourceManager.getState(): ResourceState` — current snapshot
  - `ResourceManager.queueWork(node: DAGNode): void` — add to queue when can't spawn
  - `ResourceManager.dequeueWork(): DAGNode | null` — pop next queued work when slot opens
  - Default maxConcurrent: 3 (from manifest `settings.max_concurrent_agents` or fallback)
  - Default budgetLimit: 50.0 USD (from manifest `settings.mission_budget_usd` or fallback)
- **PATTERN**: MIRROR `orchestrator/src/instance-registry.ts` for stateful manager pattern
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 7: CREATE `orchestrator/src/agent-spawner.ts` — Agent SDK session factory

- **IMPLEMENT**:
  - `spawnAgent(config: AgentYamlConfig, workUnit: WorkUnit, projectDir: string, contextAssembly: string): Promise<AgentSession>` — wraps `query()` with per-agent configuration
  - Context assembly: concatenate slice context.md + technology profiles + architecture.md excerpt + YAML system_prompt into the prompt string
  - Use `systemPrompt: { type: "preset", preset: "claude_code", append: config.system_prompt }`
  - Set `maxTurns` from config.budget or fallback to SESSION_DEFAULTS["execute"]
  - Set `maxBudgetUsd` from config.budget or fallback to 5.0
  - Set `allowedTools` from config.tools or fallback to ALL_TOOLS
  - Set `model` from config.model or fallback to "claude-sonnet-4-6" (use Sonnet for specialists, not Opus — cost efficiency)
  - Handle `AbortController` timeout from config.budget.timeoutMs
  - Return `AgentSession` with captured `sessionId`, cost, status
  - On error: classify via `classifyError()`, return session with `status: "failed"`
- **IMPORTS**: `import { query } from "@anthropic-ai/claude-agent-sdk"`
- **PATTERN**: MIRROR `session-manager.ts:buildOptions` and `createSession`
- **GOTCHA**: Must strip CLAUDECODE env var (MIRROR `session-manager.ts:24`). Must set `settingSources: ["project"]`
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 8: CREATE `orchestrator/src/mission-controller.ts` — Top-level coordinator

- **IMPLEMENT**:
  - `runMission(projectDir: string, notifier?: TelegramNotifier, pauseCheck?: () => Promise<void>): Promise<void>` — main entry point
  - **Startup sequence:**
    1. Read manifest, load agents via `agent-loader.ts`
    2. Read `context/architecture.md`, parse DAG via `mission-planner.ts`
    3. Initialize `resource-manager.ts` with settings from manifest
    4. Create `event-bus.ts` instance, wire up event handlers
    5. Create `dependency-resolver.ts` from mission plan
  - **Main loop:** (while resolver.isComplete() === false)
    1. `pauseCheck?.()` — respect pause/resume signals
    2. Get ready nodes from dependency resolver
    3. For each ready node where `resourceManager.canSpawn()`:
       a. Find matching agent config from loader (default: "executor")
       b. Assemble context (read slice context.md, profiles, architecture excerpt)
       c. Spawn agent via `agent-spawner.ts` (async — don't await)
       d. Register in resource manager
       e. Emit `slice_ready` event
    4. Queue remaining ready nodes if can't spawn
    5. Await any active agent completion (use `Promise.race` on active sessions)
    6. On agent completion:
       a. Release from resource manager
       b. If success: mark node complete, emit `execution_complete`, check newly unblocked nodes
       c. If failure: mark node failed, cascade-block dependents, emit `agent_crash` if applicable
       d. Check queued work, spawn if slot available
    7. Write heartbeat
    8. Check for blocking failures → break if found
  - **Post-loop:** Resolve checkpoints, write manifest, send Telegram summary
- **PATTERN**: MIRROR `piv-runner.ts:runAllPhases` for lifecycle (heartbeat, notifier, manifest updates)
- **GOTCHA**: `Promise.race` on agent sessions — need to track which promise resolved
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 9: CREATE 7 agent YAML files in `.claude/agents/`

- **IMPLEMENT** each YAML with: `schema_version`, `name`, `type`, `description`, `triggers`, `system_prompt`, `model`, `tools`, `budget`, `teams`
- **executor.yaml**: Triggers on `slice_ready`. Full tool access. Teams enabled (max 4). Sonnet. Budget: 100 turns, $5, 60 min. System prompt focuses on reading slice context.md, implementing code in `src/`, running tests.
- **pipeline-validator.yaml**: Triggers on `execution_complete`. Read + Bash tools. Teams enabled (max 3). Sonnet. Budget: 60 turns, $3, 30 min. System prompt focuses on running validation gates from context.md, reporting pass/fail with details.
- **quality-iterator.yaml**: Triggers on `validation_failed`. Full tool access. No teams. Sonnet. Budget: 80 turns, $4, 45 min. System prompt focuses on analyzing failures, identifying root causes, applying targeted fixes, re-running validation.
- **environment-architect.yaml**: Triggers on `slice_ready`. Bash + Read tools. No teams. Sonnet. Budget: 40 turns, $2, 20 min. System prompt focuses on Docker provisioning, infrastructure setup from slice requirements.
- **external-service-controller.yaml**: Triggers on `slice_ready`. Bash + Read + WebFetch tools. No teams. Sonnet. Budget: 60 turns, $3, 30 min. System prompt focuses on external API interactions, rate limit handling, cost tracking.
- **research-agent.yaml**: Triggers on `agent_crash`. Read + Grep + WebSearch tools. No teams. Haiku. Budget: 30 turns, $1, 15 min. System prompt focuses on investigating unknown edge cases, documenting findings.
- **integration-agent.yaml**: Triggers on `module_complete`. Full tool access. Teams enabled (max 3). Sonnet. Budget: 80 turns, $4, 45 min. System prompt focuses on cross-slice integration testing, data contract validation.
- **VALIDATE**: Parse all 7 with `js-yaml` — `node -e "const y=require('js-yaml'); const f=require('fs'); y.load(f.readFileSync('.claude/agents/executor.yaml','utf8'))"`

### Task 10: UPDATE `orchestrator/src/index.ts` — Route to Mission Controller

- **IMPLEMENT**: After manifest load (around line 82), detect monorepo mode:
  ```typescript
  if (isMonorepoManifest(manifest) && existsSync(join(projectDir, "context/architecture.md"))) {
    // Mission Controller mode
    const { runMission } = await import("./mission-controller.js");
    state.running = true;
    await runMission(projectDir, notifier, pauseCheck);
    state.running = false;
  } else {
    // Classic mode — existing sequential runner
    await runAllPhases(projectDir, notifier, pauseCheck, isRestart);
  }
  ```
- **PATTERN**: MIRROR existing monorepo detection in `state-machine.ts:199`
- **IMPORTS**: Add `import { isMonorepoManifest } from "./types.js"`
- **GOTCHA**: Must preserve ALL existing lifecycle management (PID, registry, shutdown, uncaught exception)
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 11: UPDATE `orchestrator/src/state-machine.ts` — Mission Controller awareness

- **IMPLEMENT**: In `determineNextAction()`, add Mission Controller detection after monorepo check (around line 199):
  - If `isMonorepoManifest(manifest)` AND `context/architecture.md` exists → use Mission Controller routing
  - Add `"mission-controller"` as a possible PivCommand value
  - The command returned should still be valid for the orchestrator to interpret
- **PATTERN**: Minimal change — add conditional before existing monorepo sequential logic
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 12: UPDATE `orchestrator/src/config.ts` — Mission Controller settings

- **IMPLEMENT**: Add new settings to config loading:
  - `max_concurrent_agents`: read from manifest `settings.max_concurrent_agents` or default 3
  - `mission_budget_usd`: read from manifest `settings.mission_budget_usd` or default 50.0
  - `agent_model`: read from manifest `settings.agent_model` or default "claude-sonnet-4-6"
  - Export `getMissionConfig()` function that reads these from manifest
- **PATTERN**: MIRROR existing `getSessionDefaults()` pattern
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 13: CREATE tests for all 7 new modules

- **IMPLEMENT** test files with 8-15 test cases each covering happy paths and edge cases:
- `tests/event-bus.test.ts`: emit/on/off, type safety, multiple listeners, listener removal
- `tests/agent-loader.test.ts`: valid YAML loads, invalid YAML skips, missing dir returns empty, schema validation catches missing fields, getAgentForEvent matches correct agent
- `tests/mission-planner.test.ts`: parse YAML adjacency list, build DAG from edges, getReadyNodes returns 0-dep nodes, markNodeComplete unblocks dependents, markNodeFailed cascades, empty graph handled, circular dependency detected
- `tests/dependency-resolver.test.ts`: markDeliverable unblocks dependent, getUnblockedNodes returns correct set, isComplete true when all done, getBlockedBy returns correct edges
- `tests/resource-manager.test.ts`: canSpawn true when under limit, false when at limit, registerAgent/releaseAgent lifecycle, cost accumulation, budget limit enforcement, queue/dequeue ordering
- `tests/agent-spawner.test.ts`: context assembly includes all parts, config maps YAML to SDK options, error handling returns failed session (mock `query()`)
- `tests/mission-controller.test.ts`: startup sequence loads all components, main loop spawns ready agents, completion triggers dependency check, failure cascades blocks, pause check respected
- **PATTERN**: MIRROR `tests/monorepo-resolver.test.ts` for Vitest structure
- **GOTCHA**: Mock `query()` from Agent SDK — do not make real API calls in unit tests
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run`

---

## TESTING STRATEGY

### Unit Tests

All 7 new modules tested in isolation. Mock external dependencies (Agent SDK `query()`, filesystem reads for YAML). Test pure logic: DAG construction, dependency resolution, resource management, event routing.

### Integration Tests

- Mission Controller startup with fixture `architecture.md` and YAML agents → verifies full wiring
- Agent loader + spawner integration: load YAML → spawn session with correct config (mocked SDK)
- Dependency resolution end-to-end: 3-node DAG → complete in correct order

### Edge Cases

- Empty DAG (no slices) → Mission Controller exits immediately
- All slices independent (no edges) → all spawned in parallel up to concurrency limit
- Circular dependency in architecture.md → detected and reported
- All agents fail → cascade-block everything, escalate
- Budget exceeded mid-mission → pause, report via Telegram
- Invalid YAML in `.claude/agents/` → skip, continue with valid agents
- Missing `architecture.md` → fall back to sequential slice runner

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd .claude/orchestrator && npx tsc --noEmit
```

**Expected**: Exit code 0, no type errors

### Level 2: Unit Tests

```bash
cd .claude/orchestrator && npx vitest run
```

**Expected**: All tests pass including 7 new test files. Existing tests unchanged.

### Level 3: Live Integration Tests (Agent SDK Tier 1-2)

```bash
cd .claude/orchestrator && npx vitest run tests/agent-spawner.test.ts
```

**Expected**: Agent spawner creates sessions with correct config. Mocked SDK calls verified.

For live SDK test (Tier 1 from profile):
```bash
node -e "import('@anthropic-ai/claude-agent-sdk').then(m => console.log('SDK import OK'))"
```

### Level 4: Live Integration Validation

```bash
cd .claude/orchestrator && npx vitest run tests/mission-controller.test.ts
```

End-to-end Mission Controller test with fixture DAG:
```bash
node -e "
const { loadAgents } = require('./dist/agent-loader.js');
const agents = loadAgents('.claude/agents');
console.log('Loaded agents:', agents.length);
agents.forEach(a => console.log(' -', a.name, ':', a.triggers.join(', ')));
"
```

YAML agent validation:
```bash
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const files = fs.readdirSync('.claude/agents').filter(f => f.endsWith('.yaml'));
files.forEach(f => {
  try { yaml.load(fs.readFileSync('.claude/agents/' + f, 'utf8')); console.log('✅', f); }
  catch(e) { console.log('❌', f, e.message); }
});
"
```

---

## ACCEPTANCE CRITERIA

- [ ] Mission Controller reads DAG from architecture.md and spawns agents in parallel
- [ ] Independent slices execute concurrently (up to concurrency limit)
- [ ] Dependencies resolve automatically as upstream completes
- [ ] 7 specialist agent YAML files in `.claude/agents/` — each loadable and valid
- [ ] New YAML agent discovered and registered on startup without code changes (SC-013)
- [ ] Invalid YAML fails gracefully — logged and skipped (SC-013 error case)
- [ ] Resource manager enforces concurrency limit and budget threshold
- [ ] Event bus emits lifecycle events that trigger correct agents
- [ ] Classic (non-monorepo) projects use existing sequential runner — zero regressions
- [ ] All existing tests pass (drift check)
- [ ] All new unit tests pass (7 test files)
- [ ] TypeScript compiles cleanly with `tsc --noEmit`

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No type checking errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] All acceptance criteria met
- [ ] Agent YAML files parseable and schema-valid

---

## NOTES

**Decision from Phase 0 — Mission Controller is new modules, not a rewrite:** The PRD explicitly states "new modules alongside existing code." This preserves backwards compatibility. Classic mode continues using `piv-runner.ts`. Monorepo mode with `architecture.md` routes to Mission Controller.

**Decision from Phase 0 — Concurrency limit of 3:** Conservative default matching PRD risk mitigation. Configurable via `settings.max_concurrent_agents` in manifest. Agent SDK profile warns about connection conflicts at high concurrency.

**Decision — Specialist model defaults to Sonnet:** Cost efficiency. Opus costs 2-4x more per session. Specialists work in bounded scope with rich context assembly — Sonnet is sufficient. Override per-agent via YAML `model` field.

**PRD gap note:** SC-009 (cross-agent file conflicts) is explicitly scoped to Phase 12 (Strategic Supervisor). This plan implements the agent spawning and coordination but does NOT implement conflict detection or resolution — that's Phase 12's responsibility.

**Architecture note:** The Mission Controller's main loop uses `Promise.race` to await the first completing agent, then processes its result and checks for newly unblocked work. This is event-driven execution within a structured loop — not pure EventEmitter callbacks — which keeps state management simple and testable.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 11 from PRD-gen2 (Gen 3 Phase 3)
independent_tasks_count: 9
dependent_chains: 4
technologies_consumed: anthropic-agent-sdk
next_suggested_command: execute
next_arg: ".agents/plans/phase-11-mission-controller-specialist-agents.md"
estimated_complexity: high
confidence: 7/10
