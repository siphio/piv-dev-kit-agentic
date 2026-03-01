# PRD: PIV Dev Kit — Generation 2 Evolution

**Version:** 1.0
**Date:** 2026-03-01
**Status:** ⚪ Not Started

---

## Status Legend

```
⚪ Not Started | 🟡 In Progress | 🟢 Complete | 🔴 Blocked
```

---

## 1. Executive Summary

The PIV Dev Kit Generation 2 evolves the framework from a sequential command runner into two integrated systems: a human-facing Context Plugin for structured project scaffolding, and an autonomous agent coalition capable of building complex, real-world infrastructure.

**The Context Plugin** is a set of 5 new slash commands (`/scaffold`, `/discuss-module`, `/discuss-slice`, `/review-context`, `/map-dependencies`) that guide a developer through creating a standardized context monorepo — a project structure combining planning artifacts, domain research, technology profiles, and source code in predictable locations. The plugin navigates the human through every step, ensures nothing is missed, and produces a fully validated context base before agent handover. This is the human-in-the-loop phase where project intent is captured.

**The Evolved Agent Coalition** takes the validated context monorepo as input and builds the described system autonomously. The orchestrator becomes a Mission Controller that reads dependency graphs and allocates specialist agents in parallel. Seven new agent types — Environment Architect, Executor, Pipeline Validator, Quality Iterator, External Service Controller, Research Agent, and Integration Agent — each handle a bounded responsibility. Every agent has full computer access and can spawn its own Agent Teams for internal parallelism. The supervisor becomes a Strategic Overseer monitoring coalition health, convergence, and resource efficiency.

Together, these enable autonomous construction of systems involving databases, APIs, computer vision pipelines, geospatial processing, GPU orchestration, browser automation, and any other real-world complexity — provided the context base adequately describes what to build.

**Core Value Proposition:** Transform well-described system specifications into working, validated implementations through coordinated autonomous agents.

**MVP Goal:** Working Context Plugin + evolved orchestrator with parallel agent coordination, validated against Siphio Arb Platform Module 0.

**Agent Type:** Semi-autonomous (Context Plugin: human-guided) + Fully Autonomous (Agent Coalition: machine-driven with escalation)

---

## 2. Agent Identity

**Purpose:** Enable a solo developer to build complex multi-module infrastructure systems by providing structured context capture tools and an autonomous agent coalition that builds from that context.

**Personality & Tone:**
- Context Plugin commands: Conversational, guiding, probing — like a senior architect interviewing a client. Asks clarifying questions, recommends approaches with reasoning, ensures completeness.
- Agent Coalition: Silent operators. Communicate through manifest state and structured reports. Escalate via Telegram only when human action is genuinely required.

**Decision Philosophy:**
- Context Plugin: Always explain WHY a recommendation is made and how it complements existing context. Probe for completeness. Never accept vague specifications — push for measurable validation gates.
- Mission Controller: Maximize parallel throughput while respecting dependencies. Prefer unblocking downstream work over perfecting upstream work.
- Specialist Agents: Full autonomy within bounded scope. Iterate on quality until thresholds met. Escalate only after retry budgets exhausted.

**Autonomy Level:**
- Human controls: Project vision, module specifications, slice contexts, technology decisions, validation gate thresholds
- Agents control: Implementation planning, code generation, infrastructure provisioning, quality iteration, testing, integration validation, external service orchestration

**Core Competencies:**
1. Structured context elicitation — guiding humans to capture complete, agent-readable project specifications
2. Parallel agent coordination — managing multiple specialists across slices with dependency awareness
3. Real-world infrastructure building — provisioning databases, GPUs, APIs, not just writing code
4. Quality iteration — analyzing failures, fixing root causes, re-validating until thresholds are met
5. Extensibility — new agent types added via YAML config without framework code changes

---

## 3. Technology Decisions

#### Anthropic Agent SDK

**What**: TypeScript SDK for programmatic control of Claude Code sessions
**Why chosen**: Already proven in Gen 1 orchestrator. Enables spawning, monitoring, and coordinating multiple Claude Code sessions. OAuth auth via CLI keychain (no API key needed).
**Agent needs**: Session creation with custom system prompts, streaming response handling, tool use event extraction, cost tracking per session
**Integration**: Direct TypeScript import (`@anthropic-ai/claude-agent-sdk`)
**Constraints**: Rate limits on concurrent sessions. OAuth via `CLAUDE_CODE_OAUTH_TOKEN` (Claude Max subscription). Must strip `CLAUDECODE=1` env var to prevent nesting guard.

#### Claude Code Agent Teams

**What**: Claude Code's native multi-agent system for intra-session parallelism
**Why chosen**: Enables Level 2 parallelism — each specialist agent spawns teammates for parallel subtasks within its session. No additional infrastructure needed.
**Agent needs**: TaskCreate/TaskUpdate/TaskList for task coordination, Task tool for spawning teammates, SendMessage for inter-teammate communication
**Integration**: Native Claude Code capability, controlled via agent YAML `teams.enabled` flag
**Constraints**: Practical limit ~6 teammates per team. Coordination overhead increases with team size.

#### YAML Agent Registry

**What**: File-based agent definition system where each agent type is a YAML config
**Why chosen**: Makes agents data, not code. Adding a new specialist is creating a YAML file — no TypeScript changes to the orchestrator. Supports the extensibility requirement for adding agents later.
**Agent needs**: Agent loader that scans `.claude/agents/*.yaml`, extracts triggers/capabilities/budgets, registers with Mission Controller
**Integration**: `js-yaml` parsing, filesystem watching for hot-reload
**Constraints**: YAML must be valid and schema-compliant. Invalid configs should fail loudly at startup.

#### Context Monorepo Structure

**What**: Standardized project directory layout combining `context/` (planning artifacts) and `src/` (source code)
**Why chosen**: Gives agents predictable locations for every type of information — specifications in `context/modules/`, profiles in `context/profiles/`, test data in `test-data/`, source code in `src/`. Eliminates context-finding overhead.
**Agent needs**: `/scaffold` creates the structure. `/prime` knows where to find context. All agents read from standardized paths.
**Integration**: Filesystem convention enforced by the Context Plugin commands
**Constraints**: Projects must follow the structure for the agent coalition to work. Classic PRD path remains for backwards compatibility.

---

## 4. Agent Behavior Specification

### 4.1 Tool Orchestration

| Tool/Capability | Purpose | When Used | Fallback |
|----------------|---------|-----------|----------|
| Agent SDK sessions | Spawn specialist agents | Mission Controller allocates work | Queue work, retry when rate limit clears |
| Agent Teams (Task tool) | Intra-agent parallelism | Executor/Validator with 3+ independent subtasks | Sequential execution within single session |
| Docker via Bash | Provision infrastructure | Environment Architect provisions databases, Redis | Fail with infrastructure_missing error, escalate |
| External APIs via Bash | GPU provisioning, geocoding, imagery | External Service Controller manages long-running interactions | Retry with backoff, escalate after budget exhausted |
| Browser automation | Web navigation, data download | External Service Controller accesses portals, downloads data | Fall back to API if available, escalate if not |
| Filesystem (Read/Write/Edit) | Context reading, code generation | All agents read context, Executors write code | N/A — core capability |
| Git via Bash | Checkpointing, committing | Before execution (checkpoint), after validation (commit) | Escalate — git operations are non-negotiable |

### 4.2 Decision Trees

**Decision: Mission Controller — Next Work Allocation**
- IF unblocked slices exist with no assigned agent → spawn Executor for highest-priority unblocked slice
- ELSE IF slice execution complete but not validated → spawn Pipeline Validator
- ELSE IF validation failed with retry budget remaining → spawn Quality Iterator
- ELSE IF all slices in a module complete and validated → spawn Integration Agent for cross-slice testing
- ELSE IF all active agents are working and no unblocked work exists → wait for dependency resolution
- ON FAILURE (agent crash) → reassign work to new agent, log in manifest

**Decision: Quality Iterator — Fix Strategy**
- IF failure is data quality (species matching, geocoding accuracy) → analyze failing cases, add data fixes, re-validate
- ELSE IF failure is performance (throughput, response time) → profile, identify bottleneck, optimize hot path
- ELSE IF failure is integration (API contract mismatch) → read data contract from architecture.md, fix the divergent side
- ELSE IF failure is infrastructure (service unavailable) → delegate to Environment Architect
- ELSE → escalate to Mission Controller with analysis
- ON FAILURE (3 iterations without improvement) → escalate to human via Telegram

**Decision: Mission Controller — Context Monorepo vs Classic PRD**
- IF `context/architecture.md` exists → monorepo mode (module/slice navigation)
- ELSE IF `PRD.md` or equivalent exists → classic mode (flat phase navigation)
- ELSE → error — no context base found, cannot proceed

**Decision: Context Plugin — Discussion Conversation Flow (applies to /discuss-module and /discuss-slice)**
- FIRST: Read parent context (architecture.md for modules, specification.md for slices) — understand boundaries, existing decisions, and how this piece fits
- THEN: Assess what's already documented — identify gaps vs confirmed decisions
- FOR EACH template section missing coverage → ask targeted questions: "What technology handles X?", "How does this connect to Module Y's output?"
- IF requirements are vague → push for specifics: measurable validation gates, concrete schema fields, explicit error handling expectations
- IF edge cases not addressed → suggest scenarios with reasoning: "What happens when the geocoding API returns partial results? Should we cache or retry?"
- IF technology trade-offs exist → recommend with reasoning, explain how choice complements existing context and architecture decisions
- WHEN conversation covers all template sections → generate artifact from standardized template
- THEN: Present generated artifact to human for review → revise until human approves
- ON INCOMPLETE (human wants to stop early) → save partial artifact, mark incomplete sections, add gaps to `/review-context` checklist

**Decision: Review-Context — Handover Gate**
- FOR EACH module → check: specification.md exists AND all template sections populated
- FOR EACH slice → check: context.md exists AND validation gates are measurable AND infrastructure requirements listed AND technology profiles identified
- FOR EACH technology referenced → check: profile exists in `context/profiles/` (or flag for `/research-stack`)
- FOR EACH slice with external dependencies → check: test data requirements documented in `test-data/` README
- IF all checks pass → confirm ready for agent handover, output summary
- IF gaps found → produce actionable checklist with `/discuss-module`, `/discuss-slice`, or `/research-stack` commands to run
- CRITICAL: Every validation gate must be measurable (not "works well" but "species matching accuracy ≥ 90%")

**Decision: Pipeline Validator — Additional Testing**
- IF all human-defined validation gates pass → check code coverage, identify untested paths
- IF untested paths found in critical code → generate additional test scenarios, document in slice context
- IF edge cases discoverable from domain-knowledge.md → generate domain-specific tests
- THEN report full validation results including both human-defined and agent-discovered tests

### 4.3 Scenario Definitions

**SC-001: Scaffold Creates Complete Monorepo**
- Given: Developer runs `/scaffold "siphio-arb-platform"` with 8 modules
- When: Command executes interactively
- Then: Full directory structure created with `context/`, `src/`, `test-data/`, `.agents/`, `CLAUDE.md`. Module folders created for all 8 modules with empty `specification.md` stubs. `vision.md` generated from description. Git initialized.
- Error: Target directory already exists — prompt to merge or abort
- Edge: Module count is 0 — create structure without `modules/` subdirectories

**SC-002: Discuss-Module Produces Valid Specification**
- Given: Scaffolded project with `vision.md` and `architecture.md` existing
- When: Developer runs `/discuss-module "0-foundation"`
- Then: AI reads architecture.md and vision.md for project context, then initiates multi-turn conversation. AI walks through specification template sections: module purpose, slice breakdown, data contracts with other modules, technology requirements, infrastructure needs, and testing scenario seeds. AI probes for completeness — "What data does Module 1 expect from Module 0?", "Should the foundation support batch or real-time processing?" When all sections covered, AI generates `specification.md` from template. Human reviews, AI revises until approved. Module connections documented bidirectionally (this module provides X to Module Y, consumes Z from Module W).
- Error: Referenced module folder doesn't exist — create it and proceed
- Edge: Module has no dependencies on other modules (standalone) — dependency sections marked N/A, AI confirms this is intentional

**SC-003: Discuss-Slice Produces Valid Context**
- Given: Module with completed `specification.md`
- When: Developer runs `/discuss-slice "01-data-model"`
- Then: AI reads parent `specification.md` to understand slice boundaries and the module's role in the system. AI initiates multi-turn conversation covering: technology choices (with rationale tied to parent spec), schema/data model design, API contracts, infrastructure requirements, error handling, and validation gates. AI actively probes — "What happens when the geocoding API is down? Should we cache or queue?", "This schema implies PostGIS — is that decided or open?" AI recommends approaches with reasoning: "Given Module 0 serves read-heavy map queries, I recommend denormalized GeoJSON storage because [reason]." When all template sections covered, AI generates `context.md` using the standardized template. Human reviews the full artifact. AI revises based on feedback until human approves. Final context.md contains: technology decisions with rationale, schema design, API design, infrastructure requirements, measurable validation gates (e.g., "species matching ≥ 90%", not "works correctly"), test data requirements, and identified technology profiles to generate via `/research-stack`.
- Error: Parent module specification missing — prompt to run `/discuss-module` first. AI explains the dependency.
- Edge: Slice requires no external infrastructure (pure library code) — infrastructure sections marked N/A, validation gates focus on unit test coverage and API contract compliance

**SC-003b: Map-Dependencies Produces Accurate DAG**
- Given: Context monorepo with 3+ modules and multiple slices, each with completed specifications
- When: Developer runs `/map-dependencies`
- Then: AI reads all `specification.md` and `context.md` files, extracts declared dependencies (data contracts, shared types, infrastructure prerequisites). Generates dependency graph in `architecture.md` showing: module-to-module data flows, slice execution order within each module, cross-module slice dependencies, and parallel work streams. Graph is both human-readable (Mermaid diagram) and machine-readable (YAML adjacency list) so the Mission Controller can parse it directly.
- Error: Circular dependency detected — report the cycle, suggest restructuring
- Edge: Single-module project — graph is trivial but still generated for Mission Controller compatibility

**SC-004: Review-Context Identifies All Gaps (Handover Gate)**
- Given: Partially populated context monorepo (some modules specified, some not)
- When: Developer runs `/review-context`
- Then: Structured report checking every handover criterion: modules without specifications, slices without contexts, technologies without profiles, slices with non-measurable validation gates (flagged for revision), test data requirements not provisioned, infrastructure needs not documented, data contracts between modules incomplete. Each gap includes the specific command to fix it (`/discuss-module X`, `/discuss-slice Y`, `/research-stack Z`). Final verdict: "Ready for handover" or "N gaps remaining."
- Error: No context monorepo structure found — suggest `/scaffold` first
- Edge: Everything is complete — confirm readiness, summarize agent workload estimate (N slices, N agents needed, estimated parallelism)

**SC-005: Mission Controller Builds Slices in Parallel**
- Given: Fully validated context monorepo with three slices: Slice 1 (no deps), Slice 2 (depends on Slice 1 types), Slice 3 (depends on Slice 1 schema)
- When: `/go` launches Mission Controller
- Then: Slice 1 Executor spawned immediately. Slices 2-3 partially started (unblocked portions). When Slice 1 types complete, Slice 2 unblocked. When Slice 1 schema complete, Slice 3 unblocked. Maximum parallelism achieved.
- Error: Rate limit prevents spawning third agent — queue, retry when limit clears
- Edge: Slice 1 fails validation — dependent slices paused until fix applied

**SC-006: Agent Stalls During Execution**
- Given: Executor agent working on Slice 2
- When: Agent session crashes or hangs (no progress for 10 minutes)
- Then: Mission Controller detects stall, terminates session, spawns replacement with same context from last checkpoint. Manifest updated.
- Error: Replacement also stalls — escalate to Strategic Overseer
- Edge: Stall caused by infrastructure issue (PostGIS down) — delegate to Environment Architect first

**SC-007: Quality Gate Fails and Iteration Fixes It**
- Given: Slice 1 built, Pipeline Validator reports species matching at 87% (target: 90%)
- When: Quality Iterator spawned with failure details
- Then: Iterator analyzes failing cases, discovers 80% are abbreviated Latin, adds species aliases, re-runs, achieves 94%. New aliases documented in context.
- Error: Iteration doesn't improve metric after 3 attempts — escalate with analysis
- Edge: Failure is in a dependency (wrong test data), not in the code

**SC-008: External Service Rate Limit**
- Given: External Service Controller processing Street View images
- When: Google API returns 429 rate limit
- Then: Exponential backoff, retry. Tracks cost and budget. Reports total cost on completion.
- Error: Budget threshold reached before batch complete — pause, report to Mission Controller
- Edge: API returns 403 (auth expired) — escalate as `integration_auth`

**SC-009: Cross-Agent File Conflict**
- Given: Executor A (Slice 1) and Executor B (Slice 2) both running
- When: Executor A modifies shared type definition that Executor B depends on
- Then: Strategic Overseer detects conflict via git status. Upstream agent (A) takes priority. Executor B rebases and adapts. No manual intervention.
- Error: Conflict is architectural (incompatible approaches) — escalate to human
- Edge: Change is additive (new field) — no actual conflict, both continue

**SC-010: Classic PRD Backwards Compatibility**
- Given: Existing Gen 1 project with flat `PRD.md` and phase-based manifest
- When: Evolved `/prime` loads context
- Then: Detects classic mode, loads PRD phases as before. All commands work unchanged. No migration required.
- Error: N/A — pure backwards compatibility
- Edge: User migrates classic to monorepo — `/scaffold --migrate` restructures

**SC-011: New Module Added Mid-Build**
- Given: Project with 3 modules, Module 0 already built
- When: Developer adds Module 4 specification via `/discuss-module`
- Then: Mission Controller detects new module, adds to mission graph, respects dependencies, schedules when prerequisites met. No disruption to in-progress work.
- Error: New module depends on unbuilt module — correctly blocked in graph
- Edge: New module has no dependencies — built immediately in parallel

**SC-012: Agent Discovers Missing Domain Knowledge**
- Given: Executor building import pipeline for council CSV data
- When: Encounters undocumented edge case (Excel serial dates)
- Then: Agent handles in code, updates testing scenarios in slice context. Research Agent consulted. Domain knowledge document updated.
- Error: N/A — agents always continue and document
- Edge: Discovery contradicts existing domain knowledge — flag for human review

**SC-013: New Agent Type Added Via YAML**
- Given: Running system with existing agent types
- When: Developer creates `.claude/agents/security-auditor.yaml` with proper schema
- Then: Mission Controller discovers new agent on next startup. Registers triggers. Spawns after relevant events. No TypeScript changes.
- Error: Invalid YAML schema — log error, skip agent, continue with existing agents
- Edge: New agent's trigger matches existing agent's event — both spawn (parallel validation)

### 4.4 Error Recovery Patterns

| Error Type | Detection | Recovery | Communication |
|-----------|-----------|----------|---------------|
| Agent session crash | No heartbeat for 10 min | Kill session, spawn replacement from checkpoint | Manifest entry, Telegram if 2nd crash |
| Rate limit hit | 429 response or SDK rate_limit_event | Exponential backoff, queue pending work | Log to manifest, continue silently |
| Infrastructure down | Docker/service health check fails | Environment Architect reprovisions | Block dependent agents, notify Mission Controller |
| Quality gate failure | Pipeline Validator reports below threshold | Spawn Quality Iterator, max 3 iterations | Escalate after 3 iterations with analysis |
| External service auth failure | 401/403 response | Immediate escalation — credentials are human problem | Telegram with specific service and error |
| Cross-agent conflict | Git status shows conflicting changes | Upstream agent wins, downstream rebases | Log resolution in manifest |
| Budget threshold hit | Cost tracker exceeds configured limit | Pause non-critical work, report | Telegram with spend breakdown |
| Context gap discovered | Agent can't find expected context file | Research Agent investigates, or escalate | Log gap, continue with documented assumption |

---

## 5. User Stories

### US-001: Scaffold New Project

**As a** solo developer starting a new complex project
**I want to** run `/scaffold` and have a complete project structure created with all the right folders, templates, and conventions
**So that** I have a structured starting point that both I and the agent coalition can work with

**Acceptance Criteria:**
- [ ] Full directory tree created (context/, src/, test-data/, .agents/)
- [ ] Module folders created with specification.md stubs
- [ ] vision.md generated from project description
- [ ] CLAUDE.md generated with project-specific rules
- [ ] Git repository initialized

**Scenarios**: SC-001
**Phase:** Phase 1
**Status:** ⚪ Not Started

### US-002: Discuss and Document Modules

**As a** developer defining system requirements
**I want to** have structured conversations that produce consistent module specifications
**So that** every module is documented with the same completeness and structure, ready for agent consumption

**Acceptance Criteria:**
- [ ] Interactive conversation covers all template sections
- [ ] Output follows specification template exactly
- [ ] Testing scenario seeds are included
- [ ] Module connections and data contracts documented
- [ ] Architecture.md updated with new module

**Scenarios**: SC-002, SC-003
**Phase:** Phase 1
**Status:** ⚪ Not Started

### US-003: Validate Context Completeness

**As a** developer preparing to hand off to agents
**I want to** run a completeness audit that identifies every gap in my context base
**So that** the agent coalition has everything it needs before autonomous execution begins

**Acceptance Criteria:**
- [ ] All modules checked for specifications
- [ ] All slices checked for contexts
- [ ] Technology profile gaps identified
- [ ] Test data requirements verified
- [ ] Actionable checklist produced

**Scenarios**: SC-004
**Phase:** Phase 1
**Status:** ⚪ Not Started

### US-004: Autonomous Parallel Building

**As a** developer with a validated context monorepo
**I want to** run `/go` and have the agent coalition build the system autonomously, with multiple agents working in parallel
**So that** complex multi-module systems are built faster than sequential execution allows

**Acceptance Criteria:**
- [ ] Mission Controller reads dependency graph from architecture.md
- [ ] Independent slices built in parallel by separate Executor agents
- [ ] Dependencies resolved automatically as upstream work completes
- [ ] Each Executor can use Agent Teams for internal parallelism

**Scenarios**: SC-005, SC-006, SC-011
**Phase:** Phase 3
**Status:** ⚪ Not Started

### US-005: Quality Iteration Until Thresholds Met

**As a** developer who defined measurable validation gates
**I want to** agents that don't just report failures but actively fix them and re-validate
**So that** the delivered system meets quality standards without me manually debugging

**Acceptance Criteria:**
- [ ] Pipeline Validator runs all validation gates including agent-discovered tests
- [ ] Failures trigger Quality Iterator with detailed analysis
- [ ] Iterator identifies root causes, applies fixes, triggers re-validation
- [ ] Max 3 iteration cycles before escalation
- [ ] All discovered test scenarios documented in slice context

**Scenarios**: SC-007, SC-012
**Phase:** Phase 3
**Status:** ⚪ Not Started

### US-006: External Service Orchestration

**As a** developer building systems that require GPUs, external APIs, and real-world data
**I want to** agents that can provision, control, and tear down external services autonomously
**So that** complex infrastructure (CV pipelines, geospatial processing, API crawling) is built and tested end-to-end

**Acceptance Criteria:**
- [ ] Environment Architect provisions Docker infrastructure from slice requirements
- [ ] External Service Controller manages GPU instances, API batch jobs, data downloads
- [ ] Cost tracking across all external services with budget thresholds
- [ ] Clean teardown after work completes

**Scenarios**: SC-008
**Phase:** Phase 3
**Status:** ⚪ Not Started

### US-007: Add New Agent Types Without Code Changes

**As a** developer who wants to extend the system's capabilities over time
**I want to** add new specialist agents by creating YAML configuration files
**So that** the framework grows with my needs without requiring orchestrator code changes

**Acceptance Criteria:**
- [ ] Agent YAML schema defined with triggers, capabilities, budget, prompts
- [ ] Mission Controller discovers agents from `.claude/agents/*.yaml`
- [ ] New agents participate in event-driven spawning
- [ ] Invalid YAML fails gracefully without breaking existing agents

**Scenarios**: SC-013
**Phase:** Phase 3
**Status:** ⚪ Not Started

### US-008: Backwards Compatibility with Gen 1

**As a** developer with existing Gen 1 PIV projects
**I want to** all my current projects to keep working without changes
**So that** I can adopt Gen 2 progressively without migrating everything at once

**Acceptance Criteria:**
- [ ] Evolved `/prime` detects classic PRD mode automatically
- [ ] All existing commands work unchanged in classic mode
- [ ] Manifest schema supports both phase-based and module/slice-based tracking
- [ ] Optional migration path from classic to monorepo structure

**Scenarios**: SC-010
**Phase:** Phase 2
**Status:** ⚪ Not Started

---

## 6. Architecture & Patterns

**High-level architecture:** Two-tier agent system. Tier 1 (Mission Controller + Strategic Overseer) handles coordination — planning, scheduling, monitoring, intervening. Tier 2 (7 specialist agents) handles execution — each with a bounded responsibility, full computer access, and ability to spawn Agent Teams for internal parallelism.

**Pipeline flow:**
1. Human runs Context Plugin commands → context monorepo populated
2. `/review-context` confirms completeness → clean handover point (human-to-agent boundary)
3. `/go` launches Mission Controller → reads architecture.md dependency DAG
4. Specialist agents spawned per DAG → Executors build, Validators test, Iterators fix
5. Dependencies resolve as upstream completes → downstream agents unblocked
6. Integration Agent validates cross-slice seams → Strategic Overseer monitors throughout

**Two-level parallelism:**
- **Level 1 — Cross-slice (Mission Controller):** Reads the dependency DAG, spawns separate Agent SDK sessions for independent slices. Each session is a specialist agent with its own system prompt and bounded scope.
- **Level 2 — Intra-agent (Agent Teams):** Within a single specialist session, the agent uses Claude Code's native Task tool to spawn teammates for parallel subtasks (e.g., an Executor building 3 independent API endpoints simultaneously).

**Artifact templates (embedded in discussion commands):**
- **vision.md** — Project purpose, target users, success metrics, constraints. Written during `/scaffold`.
- **architecture.md** — System-wide module map, dependency DAG (Mermaid + YAML), data flow between modules, shared conventions. Updated by `/map-dependencies`.
- **specification.md** — Module-level PRD: purpose, slice breakdown, data contracts, technology requirements, infrastructure needs, testing seeds. Generated by `/discuss-module`.
- **context.md** — Slice-level build spec: technology decisions with rationale, schema design, API design, infrastructure requirements, measurable validation gates, test data needs. Generated by `/discuss-slice`. This is the primary artifact agents consume.
- **domain-knowledge.md** — Domain-specific knowledge shared across the project (industry terminology, data quirks, regulatory constraints). Human-maintained, agent-referenced.

**Key patterns:**
- **Agents are data, not code** — YAML configs in `.claude/agents/` define each specialist. New agents added without framework changes.
- **Event-driven spawning** — Mission Controller emits lifecycle events (`slice_ready`, `execution_complete`, `validation_failed`, `quality_gate_passed`, `integration_ready`). Agent YAMLs declare which events trigger them.
- **Manifest as truth** — all state in `.agents/manifest.yaml`. Module/slice hierarchy replaces flat phases.
- **Context monorepo as persistent brain** — agents read from `context/`, write to `src/`, validate against `test-data/`. Structure survives session crashes.
- **Agent communication** — Agents do not message each other directly. All coordination flows through the Mission Controller via manifest state and the event bus. The Strategic Overseer reads all agent state but communicates instructions through the Mission Controller.

---

## 7. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js + TypeScript | 20+ LTS | Orchestrator, supervisor, agent loader |
| Agent Framework | @anthropic-ai/claude-agent-sdk | 0.2.47+ | Spawning and managing Claude Code sessions |
| Agent Config | YAML (.claude/agents/*.yaml) | — | Declarative agent definitions |
| State Management | YAML (.agents/manifest.yaml) | — | Merge-only project state tracking |
| Task Coordination | Claude Code Agent Teams | Native | Intra-agent parallelism |
| Notifications | Grammy (Telegram Bot API) | 1.35+ | Human escalation and remote control |
| Long-term Memory | SuperMemory.AI | — | Cross-project pattern learning |
| Testing | Vitest | Latest | Framework unit and integration tests |
| Process Management | Node.js child_process | Native | Detached agent session spawning |

**External Services:** No external services required by the framework itself. Individual projects declare their own external service needs in slice context documents.

**⛔ Auth:** OAuth via Claude CLI keychain. No `ANTHROPIC_API_KEY` anywhere.

---

## 8. MVP Scope

**In Scope:**

Context Plugin: `/scaffold`, `/discuss-module`, `/discuss-slice`, `/review-context`, `/map-dependencies`

Evolved Commands: `/prime` (auto-detect monorepo/classic), `/plan-feature` (reads slice context), `/execute` (monorepo-aware), `/validate-implementation` (validation gates), `/preflight` (infrastructure reqs)

Mission Controller: Agent registry + YAML loader, DAG-based planning, parallel spawning + dependency resolution, resource management, event bus

Specialist Agents (YAML): Environment Architect, Executor, Pipeline Validator, Quality Iterator, External Service Controller, Research Agent, Integration Agent — each with Agent Teams support

Evolved Supervisor: Coalition health monitoring, convergence tracking, strategic intervention, cross-agent conflict resolution

**Out of Scope:**
- ❌ GUI/web dashboard for monitoring (Telegram sufficient for MVP)
- ❌ Multi-user collaboration (single developer focus)
- ❌ Custom model fine-tuning for specialist agents (use base Claude)
- ❌ Automated PRD generation from conversations (human-in-the-loop preserved)

---

## 9. Implementation Phases

---

### Phase 1: Context Plugin + Monorepo Structure

**Status:** ⚪ Not Started

**User Stories Addressed:** US-001, US-002, US-003
**Scenarios Validated:** SC-001, SC-002, SC-003, SC-003b, SC-004

**What This Phase Delivers:**
Five new slash commands that scaffold projects into the standardized context monorepo and guide humans through populating it via multi-turn AI-assisted conversations. Defines the monorepo structure, all artifact templates, and conventions that all subsequent phases depend on. The `/discuss-module` and `/discuss-slice` commands are the core innovation — they don't just fill templates but conduct structured dialogues that probe for completeness, recommend approaches with reasoning, and ensure every validation gate is measurable before generating the artifact for human review.

**Prerequisites:**
- None — this is the foundation

**Scope - Included:**
- ✅ `/scaffold` command — creates full directory tree, generates `vision.md` from developer description, initializes git
- ✅ `/discuss-module` command — multi-turn conversation where AI reads architecture context, walks developer through specification template sections, probes for completeness, recommends approaches with reasoning, generates `specification.md`, and revises until developer approves
- ✅ `/discuss-slice` command — multi-turn conversation where AI reads parent specification, asks targeted questions about technology, schema, APIs, infrastructure, and validation gates, pushes for measurable criteria, generates `context.md`, and revises until developer approves
- ✅ `/review-context` command — scans entire monorepo against handover checklist, reports every gap with the specific command to fix it, gives final "ready/not ready" verdict
- ✅ `/map-dependencies` command — reads all specs, extracts declared dependencies, generates dependency graph in `architecture.md` (Mermaid diagram + YAML adjacency list for Mission Controller)
- ✅ Artifact templates embedded in commands — vision.md, architecture.md, specification.md, context.md, domain-knowledge.md all follow standardized structures
- ✅ Monorepo structure definition — `context/modules/`, `context/profiles/`, `context/research/`, `src/`, `test-data/`

**Scope - NOT Included:**
- ❌ Agent coalition execution (Phase 3)
- ❌ Evolved existing commands (Phase 2)
- ❌ Agent YAML registry (Phase 3)

**Technologies Used:**
- Markdown slash commands in `.claude/commands/`
- Filesystem operations for scaffolding
- (Reference: existing command patterns in `.claude/commands/`)

**Key Technical Decisions:**
- Commands live in same `.claude/commands/` folder as existing PIV commands — distributed via `piv init` with zero changes to the distribution mechanism
- Artifact templates are embedded in the command markdown — no external template files to manage
- `/discuss-module` and `/discuss-slice` are conversational, not form-filling — they probe, recommend, and explain

**Discussion Points:**
- Should `/scaffold` support importing structure from existing projects (like the Siphio monorepo)?
- Should `/discuss-module` auto-detect technologies mentioned and suggest `/research-stack` runs?

**Done When:**
- `/scaffold` creates complete monorepo for a new project with N modules
- `/discuss-module` produces a specification matching the template from an interactive conversation
- `/review-context` correctly identifies all gaps in a partially populated monorepo
- SC-001, SC-002, SC-003, SC-003b, SC-004 pass validation
- Siphio Arb Platform successfully scaffolded and Module 0 specification matches existing context
- `/discuss-slice` produces a context.md with measurable validation gates from a multi-turn conversation

---

### Phase 2: Manifest Evolution + Monorepo-Aware Commands

**Status:** ⚪ Not Started

**User Stories Addressed:** US-008
**Scenarios Validated:** SC-010

**What This Phase Delivers:**
Manifest evolves from flat phases to module/slice hierarchy. Existing commands evolve to read from context monorepo while maintaining full backwards compatibility with classic PRD projects.

**Prerequisites:**
- Phase 1 complete (monorepo structure exists to read from)

**Scope - Included:**
- ✅ New manifest schema — `modules.{name}.slices.{name}.{plan|execution|validation}` hierarchy
- ✅ Manifest migration — classic phase-based still loadable, new projects use module/slice
- ✅ Evolved `/prime` — auto-detects monorepo vs classic PRD, loads appropriate context
- ✅ Evolved `/plan-feature` — reads slice `context.md` for technology decisions and schema
- ✅ Evolved `/execute` — writes to `src/` following monorepo structure
- ✅ Evolved `/validate-implementation` — reads validation gates from slice context
- ✅ Evolved `/preflight` — reads infrastructure requirements from slice contexts

**Scope - NOT Included:**
- ❌ Parallel agent execution (Phase 3)
- ❌ Quality iteration loops (Phase 3)
- ❌ Agent YAML registry (Phase 3)

**Technologies Used:**
- manifest-manager.ts evolution (YAML schema change)
- Command markdown updates
- (Reference: `.agents/reference/` for existing profiles)

**Key Technical Decisions:**
- Auto-detection: `modules` key → module/slice mode, `phases` key → classic mode. Both can coexist for migration.
- Monorepo loading order: architecture.md → module spec → slice context → profiles → domain-knowledge.md

**Discussion Points:**
- Should manifest support mixed mode (some modules in monorepo, some in classic phases)?
- What happens to the existing state-machine.ts — does it get a parallel DAG mode or full replacement?

**Done When:**
- Gen 1 projects work identically without changes
- Siphio Module 0 Slice 1 built using evolved commands from context monorepo
- SC-010 passes validation

---

### Phase 3: Mission Controller + Specialist Agents

**Status:** ⚪ Not Started

**User Stories Addressed:** US-004, US-005, US-006, US-007
**Scenarios Validated:** SC-005, SC-006, SC-007, SC-008, SC-009, SC-011, SC-012, SC-013

**What This Phase Delivers:**
The orchestrator becomes a Mission Controller: DAG-based parallel agent allocation, seven specialist agents as YAML configs, and an event bus for extensibility.

**Prerequisites:**
- Phase 2 complete (evolved commands that read monorepo)
- At least one project with validated context monorepo (Siphio Module 0)

**Scope - Included:**
- ✅ Agent registry — `.claude/agents/` directory, YAML schema, agent loader
- ✅ Mission planner — reads architecture.md, builds DAG, identifies parallel work streams
- ✅ Agent spawner — creates Agent SDK sessions with per-agent system prompts and context
- ✅ Dependency resolver — tracks deliverables, unblocks downstream work when upstream completes
- ✅ Resource manager — tracks infrastructure, cost, budget thresholds
- ✅ Event bus — emits lifecycle events, triggers agents based on YAML declarations
- ✅ 7 specialist agent YAML definitions with system prompts, triggers, capabilities, team configs
- ✅ Agent Teams integration — specialists can spawn teammates for internal parallelism

**Scope - NOT Included:**
- ❌ Strategic Overseer enhancements (Phase 4)
- ❌ Cross-project learning (Phase 4)

**Technologies Used:**
- Agent SDK for session management
- YAML for agent definitions
- Event bus (in-process TypeScript EventEmitter or similar)
- (Reference: `.agents/reference/claude-agent-sdk-profile.md`)

**Key Technical Decisions:**
- Mission Controller is NEW modules (`mission-planner.ts`, `agent-loader.ts`, `agent-spawner.ts`, `dependency-resolver.ts`, `resource-manager.ts`, `event-bus.ts`) alongside existing code — not a rewrite
- Agent YAML schema versioned (`schema_version: 1`) for future evolution
- Each specialist session gets: slice context + technology profiles + architecture.md + YAML system prompt, assembled by Mission Controller

**Discussion Points:**
- Should the Mission Controller be a separate process from the existing orchestrator, or an evolution of `piv-runner.ts`?
- What's the concurrency limit for specialist agents? (Rate limit dependent)

**Done When:**
- Mission Controller produces correct DAG from Siphio architecture.md
- Multiple Executors build Slices 2-3 in parallel
- Quality Iterator fixes a failing quality gate autonomously
- New agent YAML discovered and spawned correctly
- SC-005 through SC-013 pass validation

---

### Phase 4: Strategic Supervisor + Coalition Intelligence

**Status:** ⚪ Not Started

**User Stories Addressed:** US-004 (refinement), US-005 (refinement)
**Scenarios Validated:** SC-006, SC-009 (enhanced validation)

**What This Phase Delivers:**
The supervisor evolves from crash detection to coalition-wide strategic oversight: convergence monitoring, cross-agent conflict resolution, resource reallocation, and cross-project learning.

**Prerequisites:**
- Phase 3 complete (agent coalition running, real coalition data to monitor)

**Scope - Included:**
- ✅ Coalition monitor — tracks agent progress, resource usage, convergence trends
- ✅ Convergence tracker — detects spinning vs genuine progress
- ✅ Strategic interventor — reallocates resources, pivots approaches
- ✅ Cross-agent conflict resolution — detects conflicts, determines priority, instructs resolution
- ✅ Cross-project learning — stores patterns in SuperMemory

**Scope - NOT Included:**
- ❌ Web dashboard (Telegram sufficient), multi-user team features

**Technologies Used:**
- Evolved supervisor modules, SuperMemory.AI, existing `supervisor/src/` architecture

**Key Technical Decisions:**
- One-way authority: Overseer → Controller (not reverse). Overseer can reprioritize, Controller cannot override.
- Convergence detection: sliding window — 3 consecutive iterations with <1% improvement = spinning

**Discussion Points:**
- Should the Strategic Overseer have the authority to pause the entire coalition, or only individual agents?
- What metrics define "coalition health" quantitatively?

**Done When:**
- Supervisor detects a stalled agent within a running coalition and successfully recovers
- Cross-agent file conflict detected and resolved without human intervention
- Resource reallocation decision made (deprioritize non-critical work to focus on blocker)
- Siphio Modules 1-3 built autonomously with Strategic Overseer monitoring
- SC-006, SC-009 pass enhanced validation

---

## 10. Current Focus

**Active Phase:** Phase 1 - Context Plugin + Monorepo Structure
**Active Stories:** US-001, US-002, US-003
**Status:** ⚪ Not Started
**Research Status:** Pending — run `/research-stack` for YAML schema design, Agent SDK session management patterns

**Blockers:**
- None

**Session Context:**
- Full architectural discussion completed. All agent roles defined. Artifact templates designed. Extensibility architecture agreed. Ready for Phase 1 implementation.

**Last Updated:** 2026-03-01

---

## 11. Success Criteria

**MVP is successful when:**
1. Context Plugin can scaffold, discuss, and review any greenfield project into the standardized monorepo
2. Evolved commands can build a single slice from context monorepo without regressions on classic PRD projects
3. Mission Controller can coordinate 3+ specialist agents building slices in parallel
4. Quality iteration successfully raises a failing metric above threshold within 3 cycles
5. New agent types can be added via YAML without modifying framework TypeScript
6. Siphio Arb Platform Module 0 (Slices 1-3) built autonomously from context monorepo

**Validation approach:** Phase 1 → scaffold Siphio. Phase 2 → build Siphio Slice 1. Phase 3 → build Slices 2-3 in parallel. Phase 4 → build Modules 1-3 with oversight.

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limits constrain parallel agent count | High | Resource manager queues work, Mission Controller adjusts concurrency |
| Agent coordination overhead exceeds time savings | Medium | Start with 2-3 agents, measure throughput, scale when confirmed |
| Context monorepo too rigid for some projects | Medium | Classic PRD path preserved as fallback |
| Cross-agent file conflicts corrupt work | High | File ownership tracked per agent, Integration Agent validates seams |
| Quality iteration loops don't converge | Medium | Max 3 iterations, escalation with analysis, human available |

---

## 13. Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-01 | 1.0 | Initial PRD — Generation 2 evolution of PIV Dev Kit |
| 2026-03-01 | 1.1 | Strengthened discuss command mechanics, added SC-003b, handover gate decision tree, artifact templates, two-level parallelism, agent communication model |

---

## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: anthropic-agent-sdk,claude-code-agent-teams,yaml-agent-registry
scenarios_count: 14
phases_count: 4
next_suggested_command: research-stack
next_arg: "PRD-gen2.md"
confidence: high
