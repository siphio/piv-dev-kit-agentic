# PRD: PIV Project Supervisor

**Version:** 1.0
**Date:** 2026-02-20
**Status:** 🟡 In Progress

---

## Status Legend

```
⚪ Not Started | 🟡 In Progress | 🟢 Complete | 🔴 Blocked
```

---

## 1. Executive Summary

The PIV Project Supervisor is an autonomous monitoring and intervention system that manages multiple PIV-powered agent development projects running concurrently. It ensures every project reaches completion without human intervention for fixable issues.

Currently, when the PIV orchestrator develops agents across multiple projects overnight, a single stall — a framework bug, a generated code error, or an agent that stops to ask a question — halts the entire project. The developer wakes up to incomplete work and must manually diagnose, fix, and restart each project. This is the core problem the supervisor solves.

The supervisor operates as a lightweight TypeScript monitor process that checks project health every 15 minutes at zero token cost. When a stall is detected, it spawns an Agent SDK session to diagnose the root cause, classify it (framework bug vs project-specific bug vs agent waiting for input), apply a hot fix, validate the fix, propagate it to affected projects, and restart the orchestrator. It only escalates to the human via Telegram for issues that genuinely require human action — wrong credentials, business decisions, or fixes that exceed the hot-fix boundary.

**Core Value Proposition:** Run multiple agent development projects autonomously 24/7. When something breaks, the supervisor fixes it and gets the project moving again — like a night-shift engineer who never sleeps.

**MVP Goal:** A working supervisor that monitors all registered PIV projects, detects stalls, diagnoses and fixes hot-fixable issues, and restarts orchestrators to completion.

**Agent Type:** Fully Autonomous (with escalation path for human-required issues only)

---

## 2. Agent Identity

**Purpose:** Keep all PIV orchestrators running and all projects progressing toward completion.

**Personality & Tone:** Silent operator. The supervisor produces no output during normal operation. When it intervenes, it logs structured records to the improvement log. When it escalates, Telegram messages are concise and actionable — the problem, what was attempted, what the human needs to do.

**Decision Philosophy:**
- Fix what's fixable, escalate what's not
- Never change methodology or architecture — hot fixes only
- A single-project stall is actionable, not just cross-project patterns
- Prefer killing and restarting a stuck session over trying to unstick it
- If a fix was attempted once and failed, escalate — don't retry the same broken fix

**Autonomy Level:**
- Fully autonomous: monitor, diagnose, hot fix (single file, <30 lines, testable)
- Fully autonomous: restart orchestrators, propagate fixes, recover stuck sessions
- Human required: wrong/missing credentials, business logic questions, architectural changes
- Human required: any fix requiring changes to multiple command files or manifest schema

**Core Competencies:**
1. Stall detection — heartbeat monitoring, PID liveness, classification
2. Root cause diagnosis — reading structured logs, tracing errors to specific files/lines
3. Surgical hot fixes — single-file patches with validation
4. Fix propagation — copying fixed files to projects, version tracking
5. Orchestrator lifecycle management — kill, restart, resume from correct phase

---

## 3. Technology Decisions

#### Anthropic Agent SDK

**What**: Claude Code programmatic API for spawning AI sessions
**Why chosen**: Already used by the orchestrator in every project. Proven pattern. The supervisor needs to open Claude sessions in remote projects for diagnosis and project-specific fixes.
**Agent needs from it**:
- Create sessions in arbitrary project directories (different cwd per project)
- Pass rich context prompts (error details, log contents, fix instructions)
- Receive structured output (hooks, tool results)
**Integration approach**: TypeScript SDK (`@anthropic-ai/claude-agent-sdk`)
**Known constraints**: Token cost per session (~50-100k for a fix), one active query per process

#### SuperMemory.AI

**What**: Semantic memory storage and retrieval service
**Why chosen**: Enables long-term pattern recall across fix history. When diagnosing a new error, the supervisor can query "have I seen this error pattern before?" and retrieve past fixes with context. Well-structured API, designed for AI agent memory.
**Agent needs from it**:
- Write structured fix records with metadata tags (error_category, phase, project)
- Semantic search across fix history ("similar errors to live_test_gate_failure")
- Retrieve past fixes with full context for reference during diagnosis
**Integration approach**: REST API
**Known constraints**: API rate limits, requires API key

#### Telegram Bot API

**What**: Messaging API for human escalation notifications
**Why chosen**: Already integrated in the orchestrator. The supervisor reuses the same notification channel for escalations.
**Agent needs from it**:
- Send escalation messages with structured details (project, phase, error, what was tried)
- Receive acknowledgment (optional — for blocking escalations)
**Integration approach**: Existing `TelegramNotifier` class from orchestrator
**Known constraints**: Already solved in orchestrator — reuse directly

---

## 4. Agent Behavior Specification

### 4.1 Tool Orchestration

| Tool/Capability | Purpose | When Used | Fallback If Unavailable |
|----------------|---------|-----------|------------------------|
| Registry Reader | Read `~/.piv/registry.yaml` | Every 15-minute check cycle | Fail — registry is required |
| PID Checker | Verify orchestrator process alive | When heartbeat is stale | Assume dead after 3 consecutive stale checks |
| Log Reader | Read `piv-log.md` from project | During diagnosis | Read project manifest as fallback |
| Agent SDK Session | Spawn Claude for diagnosis/fix | When intervention needed | Escalate to human |
| File Copier | Propagate fixed files to projects | After validated fix | Manual copy instructions via Telegram |
| Process Spawner | Restart orchestrator in project | After fix propagated | Restart instructions via Telegram |
| SuperMemory Client | Store/recall fix patterns | During diagnosis + after fix | Continue without memory — fix still works |
| Telegram Notifier | Escalate to human | When fix exceeds hot-fix boundary | Log to improvement-log.md, retry next cycle |

### 4.2 Decision Trees

**Decision: Stall Classification**
- IF heartbeat stale AND PID dead → `orchestrator_crashed`
- ELSE IF heartbeat stale AND PID alive AND last output is a question → `agent_waiting_for_input`
- ELSE IF heartbeat stale AND PID alive AND last output is an error → `execution_error`
- ELSE IF heartbeat stale AND PID alive AND no recent output → `session_hung`
- ON FAILURE to classify → escalate to human with full context

**Decision: Bug Location**
- IF same error_category at same phase in 2+ projects → `framework_bug` (high confidence)
- ELSE IF error is in a PIV command file or orchestrator source → `framework_bug`
- ELSE IF error is in generated agent code (src/, tests/) → `project_bug`
- ELSE IF error is credential/auth related → `human_required`
- ON AMBIGUOUS → attempt project-level fix first (lower risk), escalate if it fails

**Decision: Fix or Escalate**
- IF root cause found in single file AND fix is <30 lines AND fix is testable → hot fix
- ELSE IF fix would touch multiple command files → escalate
- ELSE IF fix would change manifest schema or error taxonomy → escalate
- ELSE IF same fix was attempted before and failed → escalate
- ELSE → escalate with diagnosis details

**Decision: Recovery from Agent-Waiting-For-Input**
- IF first occurrence for this phase → kill session, restart with stronger autonomous preamble
- ELSE IF second occurrence same phase → restart with augmented "do not ask" prompt
- ELSE IF third occurrence → escalate ("Phase N keeps requesting human input")

### 4.3 Scenario Definitions

**SC-001: Healthy Monitoring Cycle**
- Given: 3 projects registered, all orchestrators running, heartbeats fresh
- When: Monitor runs 15-minute check
- Then: No intervention triggered, monitor returns to idle
- Error path: Registry file unreadable → log warning, retry next cycle
- Edge case: One project just completed between checks → update status to `complete`

**SC-002: Framework Bug — Single Project Stall**
- Given: Project A stalls with `live_test_failure` at Phase 2
- When: Monitor detects stale heartbeat, interventor diagnoses
- Then: Root cause found in `validate-implementation.md`, fix applied, validated, propagated, orchestrator restarted
- Error path: Fix validation fails → escalate to Telegram with diagnosis
- Edge case: Fix succeeds but orchestrator fails to restart → retry restart once, then escalate

**SC-003: Framework Bug — Multi-Project Pattern**
- Given: Projects A, B, C all stall with same error_category at same phase
- When: Monitor detects 3 stalled projects, interventor finds common pattern
- Then: Single fix applied to framework, validated, propagated to all 3, all orchestrators restarted
- Error path: Fix works for 2/3 projects but not the third → third gets project-specific diagnosis
- Edge case: Projects stall at different times — pattern detected only when second project stalls

**SC-004: Project-Specific Bug**
- Given: Project A stalls with syntax error in generated agent code
- When: Monitor detects stall, interventor classifies as project bug
- Then: Agent SDK session opened in Project A, Claude fixes the code, orchestrator restarted
- Error path: Claude session can't fix the bug → escalate with full diagnosis
- Edge case: Generated code depends on external API that changed → treated as project bug

**SC-005: Agent Waiting for Input**
- Given: Orchestrator running but agent stopped to ask a question
- When: Monitor detects stale heartbeat, PID alive, session output ends with question
- Then: Session killed, orchestrator restarted with autonomous preamble injected
- Error path: Agent asks again after restart → augment prompt, restart again
- Edge case: Agent legitimately hit an ambiguous PRD section → third restart fails, escalate

**SC-006: Orchestrator Process Crashed**
- Given: Orchestrator PID no longer running, no error in log
- When: Monitor detects PID dead
- Then: Check last log entry for phase, restart orchestrator from that phase
- Error path: Log is empty or corrupted → restart from last known phase in registry
- Edge case: Crash was OOM — restart with same config (environment issue, not framework)

**SC-007: Human-Required Escalation**
- Given: Project A fails with `integration_auth` — API key invalid
- When: Monitor detects stall, interventor classifies as human-required
- Then: Telegram message sent with project name, phase, error details, and what human needs to do
- Error path: Telegram API unavailable → log to improvement-log.md, retry notification next cycle
- Edge case: Human resolves credentials but doesn't acknowledge → supervisor retries project on next cycle

**SC-008: Fix Propagation with Version Tracking**
- Given: Framework fix validated, 3 projects registered with outdated command version
- When: Propagator copies fixed files to projects
- Then: `piv_commands_version` updated in registry for each project, orchestrators restarted
- Error path: File copy fails for one project (permissions) → escalate for that project only
- Edge case: Project has local modifications to the command file → overwrite with framework version (framework is canonical)

**SC-009: New Project Bootstrap**
- Given: Developer runs `piv init /path/to/project --name "my-agent"`
- When: Init command executes
- Then: `.claude/commands/`, `.claude/orchestrator/`, `.agents/` created; project registered in `~/.piv/registry.yaml`
- Error path: Path doesn't exist → create it. Path already has `.claude/` → warn and skip existing files
- Edge case: Registry doesn't exist yet → create `~/.piv/` directory and `registry.yaml`

**SC-010: SuperMemory Pattern Recall**
- Given: Supervisor diagnosing a new stall, SuperMemory has 10 past fix records
- When: Interventor queries "similar errors to current error_category + phase"
- Then: Past fix retrieved, applied as reference for current diagnosis
- Error path: SuperMemory unavailable → diagnose without memory (still works, just slower)
- Edge case: Past fix was for a different framework version — supervisor checks if the fix still applies

**SC-011: Hot Fix Validation Failure**
- Given: Supervisor patches a command file, runs validation
- When: Validation fails — the fix didn't resolve the error
- Then: Revert the patch, escalate to Telegram with diagnosis + failed fix details
- Error path: Revert also fails → escalate urgently, log full state
- Edge case: Fix partially works (resolves one error, introduces another) → revert, escalate

### 4.4 Error Recovery Patterns

| Error Type | Detection | Recovery Action | User Communication |
|-----------|-----------|-----------------|-------------------|
| Orchestrator crash | PID dead, heartbeat stale | Restart from last known phase | None (silent recovery) |
| Agent waiting for input | PID alive, no progress, output is question | Kill session, restart with autonomous preamble | Escalate after 3rd attempt |
| Framework bug | Structured error in piv-log.md | Hot fix, validate, propagate, restart | None (silent fix) |
| Project code bug | Error in generated agent code | Open session in project, fix, restart | None (silent fix) |
| Credential/auth failure | `integration_auth` error category | Escalate immediately | Telegram: "Project X needs credentials for Y" |
| Fix validation failed | Validation rejects the patch | Revert patch, escalate | Telegram: "Couldn't auto-fix, here's diagnosis" |
| Registry corrupted | YAML parse error | Rebuild from project filesystem scan | None (auto-recovery) |
| SuperMemory unavailable | API connection failure | Continue without memory | None (graceful degradation) |

---

## 5. User Stories

### US-001: Overnight Project Completion

**As a** developer running multiple agent projects overnight
**I want** a supervisor that fixes stalls and restarts orchestrators automatically
**So that** I wake up to completed, validated agents instead of stalled projects

**Acceptance Criteria:**
- [ ] Supervisor detects stalls within 15 minutes of heartbeat going stale
- [ ] Framework bugs are patched, validated, and propagated without human action
- [ ] Project-specific bugs are fixed via Agent SDK sessions
- [ ] Orchestrators restart from the correct phase after fixes
- [ ] All fix actions logged to improvement-log.md

**Scenarios:** SC-002, SC-003, SC-004, SC-006
**Phase:** 2, 3
**Status:** ⚪ Not Started

### US-002: New Project Bootstrap

**As a** developer starting a new agent project
**I want** a single command that sets up the PIV framework and registers the project
**So that** the supervisor immediately knows about and can manage the new project

**Acceptance Criteria:**
- [ ] `piv init` copies all PIV commands and orchestrator to new project
- [ ] Project auto-registered in `~/.piv/registry.yaml`
- [ ] Command version tracked for future propagation
- [ ] Supervisor detects new project on next monitoring cycle

**Scenarios:** SC-009
**Phase:** 1
**Status:** ⚪ Not Started

### US-003: Agent-Waiting Recovery

**As a** developer whose agents sometimes stop to ask questions during autonomous execution
**I want** the supervisor to detect stuck sessions and restart them with stronger autonomous instructions
**So that** agents don't stall waiting for input that will never come

**Acceptance Criteria:**
- [ ] Stale heartbeat + alive PID + question output detected as "agent waiting"
- [ ] Session killed and restarted with autonomous preamble
- [ ] Escalates after 3 failed restart attempts
- [ ] Different from crash recovery — correct classification

**Scenarios:** SC-005
**Phase:** 2
**Status:** ⚪ Not Started

### US-004: Framework Fix Propagation

**As a** developer running the same PIV framework across multiple projects
**I want** framework fixes to automatically propagate to all projects
**So that** a bug fixed once is fixed everywhere

**Acceptance Criteria:**
- [ ] Registry tracks `piv_commands_version` per project
- [ ] After framework fix validated, files copied to all outdated projects
- [ ] Orchestrators restarted after propagation
- [ ] Version updated in registry

**Scenarios:** SC-008
**Phase:** 3
**Status:** ⚪ Not Started

### US-005: Human Escalation

**As a** developer who can't be at the keyboard 24/7
**I want** the supervisor to escalate only when my input is genuinely needed
**So that** I'm not spammed with notifications but never miss critical blockers

**Acceptance Criteria:**
- [ ] Credential/auth issues escalate immediately
- [ ] Fix validation failures escalate with full diagnosis
- [ ] Successfully auto-fixed issues do NOT notify
- [ ] Telegram messages include project, phase, error, and what action is needed

**Scenarios:** SC-007, SC-011
**Phase:** 2, 3
**Status:** ⚪ Not Started

### US-006: Long-Term Pattern Memory

**As a** developer running many projects over weeks/months
**I want** the supervisor to remember past fixes and apply them faster to similar errors
**So that** diagnosis time decreases as the system encounters more edge cases

**Acceptance Criteria:**
- [ ] Fix records stored in SuperMemory.AI with structured metadata
- [ ] Diagnosis queries past fixes for similar error patterns
- [ ] Past fixes referenced in improvement-log.md entries
- [ ] System works without SuperMemory (graceful degradation)

**Scenarios:** SC-010
**Phase:** 4
**Status:** ⚪ Not Started

---

## 6. Architecture & Patterns

**High-Level Architecture:** The supervisor is a standalone TypeScript process that runs in the PIV Dev Kit codebase. It has two layers: a zero-cost monitor loop (pure TypeScript, no AI) that polls the central registry every 15 minutes, and an on-demand interventor (Agent SDK) that spawns Claude sessions only when a stall is detected and intervention is needed.

**Supervisor Pipeline:**
1. Monitor reads `~/.piv/registry.yaml`
2. For each project: check heartbeat freshness, PID liveness
3. If stall detected → classify (crash / agent-waiting / execution-error / session-hung)
4. Read project's `piv-log.md` for error details
5. Classify bug location (framework / project / human-required)
6. If hot-fixable → patch, validate in this codebase, propagate to projects
7. If project-specific → open Agent SDK session in that project, fix
8. Restart orchestrator from the failed phase
9. Log everything to `improvement-log.md`
10. Store fix record in SuperMemory.AI for future reference

**Directory Structure:**
```
/supervisor/
  src/
    index.ts            # Entry point, monitor loop
    monitor.ts          # Registry polling, heartbeat checks, stall detection
    classifier.ts       # Framework bug vs project bug vs agent-waiting
    interventor.ts      # Agent SDK sessions for diagnosis + fixing
    propagator.ts       # Copy files to projects, spawn orchestrators
    registry.ts         # Read/write ~/.piv/registry.yaml
    memory.ts           # SuperMemory.AI client
    types.ts            # Shared types
  package.json
  tsconfig.json
```

**Key Patterns:**
- Mirror orchestrator structure — same Agent SDK patterns, same session management
- Monitor does zero AI work — pure file reads and process checks
- Interventor sessions are short-lived — diagnose, fix, end
- Registry is the single source of truth — all state flows through it

---

## 7. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 20+ | Supervisor process |
| Language | TypeScript | 5.x | Type-safe monitor + interventor |
| AI Sessions | Agent SDK | Latest | Spawn Claude for diagnosis/fixing |
| Build | tsx | Latest | Direct TS execution |

**External Services:**

| Service | API Type | Auth | Purpose |
|---------|----------|------|---------|
| Anthropic Agent SDK | TS SDK | API key (ANTHROPIC_API_KEY) | AI-powered diagnosis and fixing |
| SuperMemory.AI | REST API | API key | Long-term fix pattern memory |
| Telegram Bot API | REST API | Bot token | Human escalation notifications |

---

## 8. MVP Scope

**In Scope:**
- ✅ **Project Bootstrap**: `piv init` command to scaffold and register new projects
- ✅ **Central Registry**: `~/.piv/registry.yaml` with heartbeat, status, version tracking
- ✅ **Orchestrator Heartbeat**: Each project's orchestrator writes to the central registry
- ✅ **Monitor Loop**: 15-minute polling, stall detection, classification
- ✅ **Framework Hot Fixes**: Diagnose, patch single file, validate, propagate
- ✅ **Project Intervention**: Open Agent SDK session in stalled project to fix generated code
- ✅ **Orchestrator Restart**: Kill stalled processes, restart from correct phase
- ✅ **Agent-Waiting Recovery**: Detect and recover from sessions waiting for human input
- ✅ **Telegram Escalation**: Notify human only for genuinely human-required issues
- ✅ **Improvement Log**: Append-only record of all fixes and interventions
- ✅ **SuperMemory Integration**: Store and recall fix patterns for faster diagnosis

**Out of Scope:**
- ❌ Architectural changes to PIV commands (supervisor fixes bugs, not methodology)
- ❌ Multi-file framework changes (exceeds hot-fix boundary → escalate)
- ❌ Automatic PRD creation for new projects (human-driven)
- ❌ Dashboard UI (registry.yaml is the "dashboard" — CLI readable)
- ❌ Multi-machine distributed monitoring (single machine for MVP)

---

## 9. Implementation Phases

---

## Phase 1: Project Bootstrap & Registry Foundation

**Status:** ⚪ Not Started

**User Stories Addressed:** US-002
**Scenarios Validated:** SC-009

**What This Phase Delivers:**
The `piv init` command for bootstrapping new projects and the central registry that all other phases depend on. Orchestrators in each project write heartbeat and status to the registry. This is the foundation — nothing else works without the registry.

**Prerequisites:**
- PIV Dev Kit codebase (this repo)
- Existing orchestrator code in at least one project (for heartbeat integration)

**Scope — Included:**
- ✅ `piv init` CLI command — scaffolds `.claude/commands/`, `.claude/orchestrator/`, `.agents/` in target project
- ✅ `~/.piv/registry.yaml` schema and read/write utilities
- ✅ Auto-registration on `piv init`
- ✅ Orchestrator heartbeat writes — modify `piv-runner.ts` to write status + heartbeat to registry
- ✅ Command version tracking (`piv_commands_version` from git hash)

**Scope — NOT Included:**
- ❌ Monitor loop (Phase 2)
- ❌ Intervention logic (Phase 3)

**Technologies Used This Phase:**
- Node.js/TypeScript: CLI command and registry utilities
- File system: `~/.piv/` directory creation, YAML read/write

**Key Technical Decisions:**
- Registry lives at `~/.piv/registry.yaml` (user-level, not project-level) so supervisor has single read point
- `piv init` copies files rather than symlinks for portability across environments
- Orchestrator heartbeat interval: every 2 minutes during active execution

**Discussion Points:**
- Should `piv init` also initialize git in the new project if not already a repo?
- Should the orchestrator source be copied or should projects pull from a shared location?

**Done When:**
- `piv init` creates a fully scaffolded project with all PIV commands
- New project appears in `~/.piv/registry.yaml` immediately after init
- Orchestrator writes heartbeat to registry every 2 minutes while running
- SC-009 passes validation

---

## Phase 2: Monitor Loop & Stall Detection

**Status:** ⚪ Not Started

**User Stories Addressed:** US-001, US-003, US-005
**Scenarios Validated:** SC-001, SC-005, SC-006, SC-007

**What This Phase Delivers:**
The persistent monitor process that polls the registry every 15 minutes and detects stalls. Classifies stall type (crash, agent-waiting, execution-error, session-hung). Handles agent-waiting recovery autonomously and sends Telegram escalations for human-required issues.

**Prerequisites:**
- Phase 1 complete (registry exists, orchestrators writing heartbeats)
- Telegram bot token configured

**Scope — Included:**
- ✅ Supervisor `index.ts` — persistent process with 15-minute polling loop
- ✅ `monitor.ts` — registry reading, heartbeat staleness check, PID liveness check
- ✅ `classifier.ts` — stall classification logic (crash/agent-waiting/error/hung)
- ✅ Agent-waiting recovery — kill session, restart with autonomous preamble
- ✅ Crash recovery — restart orchestrator from last known phase
- ✅ Telegram escalation for human-required issues
- ✅ `improvement-log.md` — initial logging for recovery actions

**Scope — NOT Included:**
- ❌ Root cause diagnosis (Phase 3)
- ❌ Framework hot fixes (Phase 3)
- ❌ SuperMemory integration (Phase 4)

**Technologies Used This Phase:**
- Node.js/TypeScript: Monitor loop, process management
- Agent SDK: (minimal — only for agent-waiting recovery restart)
- Telegram Bot API: Escalation notifications

**Key Technical Decisions:**
- 15-minute check interval balances responsiveness with resource usage
- PID liveness checked via `process.kill(pid, 0)` — zero-cost OS signal
- Agent-waiting detection: heartbeat stale + PID alive + last session output ends with question
- Escalation threshold: 3 agent-waiting restarts before human notification

**Discussion Points:**
- Should the monitor interval be configurable per project?
- Should the supervisor process itself have a health endpoint or watchdog?

**Done When:**
- Monitor detects stalls within 15 minutes of heartbeat going stale
- Agent-waiting sessions recovered by kill + restart with preamble
- Crashed orchestrators restarted from correct phase
- Human-required issues escalated to Telegram with actionable details
- SC-001, SC-005, SC-006, SC-007 pass validation

---

## Phase 3: Diagnosis, Hot Fix & Propagation

**Status:** ⚪ Not Started

**User Stories Addressed:** US-001, US-004, US-005
**Scenarios Validated:** SC-002, SC-003, SC-004, SC-008, SC-011

**What This Phase Delivers:**
The intelligent intervention layer. When a stall is detected that isn't a simple crash or agent-waiting, the supervisor opens an Agent SDK session to diagnose the root cause, classify it as framework or project bug, apply a hot fix, validate it, propagate to affected projects, and restart orchestrators.

**Prerequisites:**
- Phase 2 complete (monitor detects stalls and classifies them)
- `piv-log.md` emission added to PIV commands (structured event logging)

**Scope — Included:**
- ✅ `piv-log.md` emission — all PIV commands append structured events during execution
- ✅ `interventor.ts` — Agent SDK sessions for diagnosis and fixing
- ✅ Framework bug diagnosis — read logs, trace error to specific file/line
- ✅ Hot fix implementation — single-file patches, <30 lines, with validation
- ✅ Fix validation — prove the fix resolves the specific error before propagating
- ✅ `propagator.ts` — copy fixed files to projects, update registry versions
- ✅ Project-specific intervention — open session in project, instruct Claude to fix agent code
- ✅ Orchestrator restart after propagation
- ✅ Fix revert on validation failure + escalation

**Scope — NOT Included:**
- ❌ SuperMemory integration (Phase 4)
- ❌ Multi-file fixes (escalate — exceeds hot-fix boundary)

**Technologies Used This Phase:**
- Agent SDK: Diagnosis sessions, project intervention sessions
- Node.js: File copy, process spawning, validation execution

**Key Technical Decisions:**
- Hot fix boundary: single file, <30 lines, testable — anything else escalates
- Fix validation runs within this codebase before propagation to any project
- If fix validation fails, the patch is reverted and the error escalated with full diagnosis
- Project-specific fixes use Agent SDK sessions with targeted prompts ("fix this error in this file")

**Discussion Points:**
- How should `piv-log.md` emission be added to existing commands — inline or via a shared helper?
- Should the supervisor attempt to run the failed phase locally (in a test context) to validate the fix?

**Done When:**
- Framework bugs diagnosed from structured logs and fixed with validated patches
- Project-specific bugs fixed via Agent SDK sessions in the affected project
- Fixes propagated to all outdated projects with version tracking
- Failed fixes reverted and escalated with diagnosis
- SC-002, SC-003, SC-004, SC-008, SC-011 pass validation

---

## Phase 4: SuperMemory Integration & Long-Term Pattern Memory

**Status:** ⚪ Not Started

**User Stories Addressed:** US-006
**Scenarios Validated:** SC-010

**What This Phase Delivers:**
Long-term memory integration via SuperMemory.AI. Every fix is stored with structured metadata. During diagnosis, the supervisor queries past fixes for similar patterns, reducing diagnosis time and improving fix accuracy over time.

**Prerequisites:**
- Phase 3 complete (fixes are being applied and logged)
- SuperMemory.AI API key configured

**Scope — Included:**
- ✅ `memory.ts` — SuperMemory.AI client for write and semantic search
- ✅ Fix record storage — after each fix, write structured record to SuperMemory
- ✅ Pattern recall during diagnosis — query similar errors before attempting fix
- ✅ Graceful degradation — system works fully without SuperMemory

**Scope — NOT Included:**
- ❌ Automatic framework improvement suggestions (beyond hot fixes)
- ❌ Statistical analysis or dashboards

**Technologies Used This Phase:**
- SuperMemory.AI: REST API for memory storage and retrieval
  (Reference: `.agents/reference/supermemory-profile.md`)

**Key Technical Decisions:**
- Memory records tagged with: error_category, phase, project_name, fix_file, fix_outcome
- Semantic search query constructed from current error details
- Past fixes presented as context to the diagnosis session, not auto-applied
- SuperMemory failure is non-blocking — supervisor continues without memory

**Discussion Points:**
- What retention policy for old fix records? Keep all, or prune after N months?
- Should successful fix patterns be "promoted" to permanent framework knowledge (in CLAUDE.md)?

**Done When:**
- Fix records stored in SuperMemory.AI after every intervention
- Diagnosis sessions receive relevant past fixes as context
- System works normally when SuperMemory is unavailable
- SC-010 passes validation

---

## 10. Current Focus

**Active Phase:** Phase 1 — Project Bootstrap & Registry Foundation
**Active Stories:** US-002
**Status:** ⚪ Not Started
**Research Status:** Pending — run `/research-stack` for SuperMemory.AI and Agent SDK profiles

**Blockers:**
- None

**Session Context:**
- PRD created from discussion. Next: `/research-stack` for technology profiles, then `/plan-feature "Phase 1"`.

**Last Updated:** 2026-02-20

---

## 11. Success Criteria

**MVP is successful when:**
1. `piv init` bootstraps a new project and auto-registers it in under 30 seconds
2. Supervisor detects any project stall within 15 minutes
3. Framework hot fixes are applied, validated, and propagated without human intervention
4. Project-specific bugs are fixed via remote Agent SDK sessions
5. Orchestrators restart from the correct phase after any intervention
6. Human is only contacted for genuinely human-required issues
7. All 11 scenarios from Section 4.3 pass validation
8. `improvement-log.md` contains a complete record of every intervention

**Validation Commands:**
```bash
# Validate supervisor against all scenarios
/validate-implementation --full

# Verify registry health
cat ~/.piv/registry.yaml

# Check improvement log
cat improvement-log.md
```

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bad hot fix propagated to all projects | High | Validate every fix before propagation. Revert on failure. |
| Supervisor itself crashes overnight | High | Watchdog process or systemd service restart. |
| Agent SDK session cost for frequent interventions | Medium | Monitor is zero-cost. Only spawn sessions for real stalls. |
| SuperMemory API unavailable | Low | Graceful degradation — supervisor works without it. |
| Orchestrator restart creates duplicate work | Medium | Resume from failed phase using registry phase tracking. |
| Registry YAML corruption from concurrent writes | Medium | File locking on write. Rebuild from filesystem if corrupted. |
| Hot fix boundary too restrictive | Low | Start restrictive, loosen based on real-world confidence. |

---

## 13. Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-20 | 1.0 | Initial PRD — Project Supervisor system |

---

## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: supermemory-ai,anthropic-agent-sdk,telegram-bot-api
scenarios_count: 11
phases_count: 4
next_suggested_command: research-stack
next_arg: "PRD.md"
confidence: high
