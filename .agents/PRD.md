# PIV Orchestrator — Product Requirements Document

**Version:** 1.1
**Date:** 2026-02-18
**Status:** 🟢 Validated

---

## 1. Executive Summary

The PIV Orchestrator is an autonomous development agent that manages the full PIV (Prime-Implement-Validate) loop lifecycle without human intervention after initial setup. It replaces the human developer who currently sits at the keyboard running `/clear` → `/prime` → `/plan-feature` → `/execute` → `/validate-implementation --full` → `/commit` for every implementation phase.

The orchestrator is built as a standalone Node.js background process on the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). It authenticates via `CLAUDE_CODE_OAUTH_TOKEN`, billing against the developer's existing Anthropic Max subscription through the Agent SDK subprocess. It manages literal context window clearing by spawning fresh Claude Code subprocesses via `query()` — each command pairing gets a fresh subprocess with a fresh `/prime`, exactly as a human would work.

The product has two interfaces that provide identical experiences: VS Code (where the developer works at their desk) and Telegram (where the developer works on the go). Both interfaces support the same slash commands and conversational flows. During PRD creation and credential provisioning, the human drives the conversation. After the human triggers `/go`, the orchestrator takes full autonomous control and builds, validates, and ships every phase — messaging the human on Telegram only when it hits a blocking issue it cannot resolve.

**Core value proposition:** Turn a validated PRD into a fully implemented, live-tested, committed codebase — autonomously — while maintaining the same quality a human developer would achieve by running each PIV command manually.

**MVP goal:** A working orchestrator that can take a validated PRD, run research-stack through all phases autonomously with full live validation, and deliver committed code — controllable from both VS Code and Telegram.

**Agent type:** Autonomous (post-`/go`), Semi-autonomous (pre-`/go` — human drives PRD and credentials)

---

## 2. Agent Identity

**Purpose:** Autonomously execute the PIV development loop — planning, implementing, validating, and committing each phase of a project — exactly as a skilled human developer would, but without requiring their presence after setup.

**Personality & Tone:** Direct and status-oriented. During human-in-the-loop phases (PRD creation, credential requests), the agent is conversational and collaborative — asking questions, iterating on answers, and confirming understanding. During autonomous execution, communications are concise status updates: what phase it's on, what passed, what failed, what it needs.

**Decision Philosophy:**
- Never advance to the next phase until the current phase passes full live validation
- When validation fails, attempt to refactor and fix before escalating to the human
- Exhaust retry budgets before interrupting the human
- Prefer asking for credentials upfront (via research-stack analysis) over discovering missing credentials mid-execution
- Treat the manifest as the single source of truth — if it's not in the manifest, it didn't happen

**Autonomy Level:**
- **Human required:** PRD creation, PRD validation, providing .env credentials, triggering `/go`
- **Fully autonomous:** Everything after `/go` — research-stack, plan-feature, execute, validate, commit, refactor on failure, retry on error, phase advancement

**Core Competencies:**
1. Session lifecycle management — creating, priming, and destroying Claude conversations
2. Phase gating — enforcing full live validation before advancement
3. Error classification and autonomous recovery within retry budgets
4. Bidirectional human communication via Telegram for blocking escalations
5. State persistence via manifest across context window clears

---

## 3. Technology Decisions

#### Claude Agent SDK

**What:** Anthropic's official SDK (`@anthropic-ai/claude-agent-sdk` v0.2.45) that wraps Claude Code as a managed subprocess. Each `query()` call spawns a fresh Claude Code process with its own context window — this IS the literal context clearing mechanism.
**Why chosen:** The only supported way to programmatically manage Claude sessions using subscription billing. Each `query()` = fresh subprocess = fresh context window. Supports `CLAUDE_CODE_OAUTH_TOKEN` for Max/Pro subscription billing through the subprocess. Provides built-in tools (Read, Edit, Bash, Glob, Grep), session resume via `sessionId`, and custom slash command loading via `settingSources: ["project"]`.
**Agent needs from it:**
- Create fresh sessions via `query()` (each call = new subprocess = literal `/clear`)
- Send slash commands as prompt strings (e.g., `"/prime"`, `"/plan-feature Phase 1"`)
- Stream responses via async generator yielding `SDKMessage` objects
- Resume sessions via `resume: sessionId` for multi-turn command pairings (e.g., `/prime` then `/plan-feature` in same session)
- Load `.claude/commands/` and `CLAUDE.md` via `settingSources: ["project"]`
**Integration approach:** TypeScript SDK — spawns Claude Code subprocess (not direct HTTP API calls)
**Known constraints:** 200K token context window per session (auto-compaction at ~95%), Opus 4.6 pricing at $5/$25 per MTok in/out (~$4-18 per full PIV cycle), `bypassPermissions` requires `allowDangerouslySkipPermissions: true` safety gate

#### Telegram Bot API

**What:** Messaging platform API for bidirectional human-agent communication.
**Why chosen:** Developer needs to manage projects on the go — Telegram provides a mobile-accessible interface for both PRD creation conversations and autonomous execution monitoring. The bot acts as dumb transport during human-in-the-loop phases and as a notification/approval channel during autonomous phases.
**Agent needs from it:**
- Send messages (status updates, approval requests, error escalations)
- Receive messages (human responses, commands like `/go`, `/pause`, `/status`)
- Relay conversational PRD creation flow (back-and-forth with Claude)
- Handle inline approval for Tier 3 live validation tests
**Integration approach:** Bot API via HTTP
**Known constraints:** Message length limits (4096 chars), rate limits on bot messages

#### Authentication (Anthropic)

**What:** Subscription-based authentication via `CLAUDE_CODE_OAUTH_TOKEN` environment variable, consumed by the Agent SDK subprocess. Anthropic blocks OAuth tokens from direct API calls (since January 2026) — the Agent SDK subprocess is the only supported programmatic path for subscription billing.
**Why chosen:** Developer has an Anthropic Max subscription. Setting `CLAUDE_CODE_OAUTH_TOKEN` lets the Agent SDK subprocess bill against that subscription — single billing source, no separate API key management, no API credits to purchase.
**Agent needs from it:**
- One-time token generation via `claude setup-token` CLI command
- Set `CLAUDE_CODE_OAUTH_TOKEN` env var — Agent SDK subprocess handles token lifecycle internally
- Fallback: `ANTHROPIC_API_KEY` for pay-per-token billing (separate from subscription)
**Integration approach:** Environment variable — the Agent SDK subprocess reads `CLAUDE_CODE_OAUTH_TOKEN` automatically, no code-level OAuth flow needed
**Known constraints:** Token is ~1 year validity (generated via `claude setup-token`), subscription usage is shared across all Claude products (Code, web, API via SDK), Anthropic may revoke tokens used outside sanctioned tools

#### Manifest YAML

**What:** File-based state persistence using YAML format at `.agents/manifest.yaml`.
**Why chosen:** Already the standard state tracking mechanism in the PIV framework. Every existing command reads and writes to manifest. The orchestrator adopts the same pattern — manifest is the memory that survives context window clears.
**Agent needs from it:**
- Read phase progress, profile freshness, failure history, next-action recommendations
- Write execution results, validation outcomes, error classifications, notifications
- Merge writes (never overwrite existing sections)
**Integration approach:** Direct YAML file read/write
**Known constraints:** No concurrent write protection (single instance per project mitigates this)

---

## 4. Agent Behavior Specification

### 4.1 Tool Orchestration

| Tool/Capability | Purpose | When Used | Fallback If Unavailable |
|----------------|---------|-----------|------------------------|
| Claude Agent SDK | Create/manage Claude conversations | Every PIV command execution | Cannot proceed — SDK is core dependency |
| Telegram Bot | Human communication (relay + notifications) | PRD creation, credential requests, blocking escalations | VS Code only mode (no remote access) |
| Manifest YAML | State persistence across sessions | After every command, before every decision | Error — manifest is required for state |
| PIV Slash Commands | Execute development loop steps | Each phase iteration (prime, plan, execute, validate, commit) | Cannot proceed — commands are core dependency |
| Git | Checkpointing and committing | Before execute (checkpoint), after validate passes (commit) | Error — git required for safe execution |

### 4.2 Decision Trees

**Decision: Phase Advancement**
- IF current phase validation passes all tiers (1-4) AND all scenarios pass → advance to next phase
- ELSE IF validation fails with fixable errors (syntax_error, test_failure) → refactor and re-validate (up to retry budget)
- ELSE IF validation fails with Tier 3 approval needed → request approval via Telegram, await response
- ELSE IF retry budget exhausted → escalate to human via Telegram with full failure context
- ON FAILURE (unexpected) → rollback to checkpoint, notify human, pause

**Decision: Credential Request Timing**
- IF research-stack complete AND profiles contain auth requirements → extract all .env needs, present to human in single request
- ELSE IF research-stack incomplete → run research-stack first, then extract
- ELSE IF profile missing auth section → flag as gap, ask human directly
- ON FAILURE (research-stack fails) → classify error, retry once, escalate if still failing

**Decision: Context Window Management**
- IF starting a new PIV command pairing → create new conversation via Agent SDK
- IF command pairing complete → end conversation (literal clear)
- IF mid-command and context growing large → never clear mid-command; complete current pairing first
- ALWAYS → prime immediately after creating new conversation, before any other command

**Decision: Validation Failure Response**
- IF error is syntax_error or test_failure (retries ≤ 2) → spawn refactor session, fix, re-validate
- ELSE IF error is scenario_mismatch (retries ≤ 1) → re-read PRD, adjust implementation, re-validate
- ELSE IF error is integration_auth → escalate immediately (human provides credentials)
- ELSE IF error is integration_rate_limit → wait with exponential backoff, retry (up to 3)
- ELSE IF all retries exhausted → rollback to checkpoint, escalate to human

**Decision: Telegram vs VS Code Routing**
- IF orchestrator started from Telegram → all human communication via Telegram
- IF orchestrator started from VS Code → blocking escalations go to Telegram, progress visible in both
- ALWAYS → manifest is updated regardless of interface (both can read state)

### 4.3 Scenario Definitions

**SC-001: Happy Path — Full Phase Completion**
- Given: PRD validated, credentials provided, `/go` triggered
- When: Orchestrator begins Phase 1
- Then: Runs plan-feature → execute → validate-full → commit, all pass, advances to Phase 2
- Error path: If any step fails, follows retry budget before escalating
- Edge case: Phase has zero technologies (pure logic) — skips Tier 1-3 validation, runs Tier 4 + scenarios only

**SC-002: Happy Path — Multi-Phase Completion**
- Given: 4-phase PRD, all credentials available
- When: Orchestrator runs all phases sequentially
- Then: Each phase planned, executed, validated with full live tests, committed. Final notification sent.
- Error path: Phase 3 fails validation — orchestrator refactors, re-validates, continues
- Edge case: Final phase has no scenarios defined — orchestrator flags gap but completes with code-level validation

**SC-003: Happy Path — PRD Creation via Telegram**
- Given: Developer on mobile, sends project description to Telegram bot
- When: Developer runs `/create-prd` via Telegram
- Then: Bot relays conversation to Claude, developer iterates, PRD generated and validated
- Error path: Telegram message exceeds 4096 chars — bot splits into multiple messages
- Edge case: Developer switches from Telegram to VS Code mid-PRD — state persists in manifest

**SC-004: Happy Path — Credential Provisioning**
- Given: PRD validated, research-stack complete with 3 technology profiles
- When: Orchestrator extracts .env requirements from profiles
- Then: Presents consolidated list of required credentials to human, human provides all, preflight passes
- Error path: Human provides wrong credential — preflight health check fails, orchestrator reports which one and why
- Edge case: Technology has no auth requirement — skipped in credential request

**SC-005: Error Recovery — Validation Failure with Auto-Fix**
- Given: Phase 2 execution complete, validation running
- When: Tier 2 tests fail (test data validation error)
- Then: Orchestrator classifies as test_failure, spawns refactor session, fixes code, re-validates — passes on retry
- Error path: Fix introduces new failure — second retry also fails, escalates to human
- Edge case: Failure is in test setup, not application code — orchestrator identifies and fixes test fixture

**SC-006: Error Recovery — Tier 3 Approval Required**
- Given: Phase 1 validation reaches Tier 3 (real API calls with cost)
- When: Orchestrator encounters Tier 3 endpoint requiring human approval
- Then: Sends Telegram message with endpoint details and cost estimate, waits for approval
- Error path: Human rejects — orchestrator skips Tier 3 for this endpoint, documents in manifest
- Edge case: Human doesn't respond within 30 minutes — orchestrator sends reminder, continues waiting (never auto-approves Tier 3)

**SC-007: Error Recovery — Credential Missing Mid-Execution**
- Given: Orchestrator running autonomously, reaches API call requiring credential not in .env
- When: Preflight didn't catch this (profile gap or new dependency)
- Then: Classifies as integration_auth, escalates immediately to Telegram with specific variable needed
- Error path: Human provides credential but it's invalid — re-run preflight for that specific credential
- Edge case: Dependency was added by execute step itself (not in original profiles) — orchestrator detects, requests, resumes

**SC-008: Error Recovery — Exhausted Retries**
- Given: Phase 3 validation failing, refactor attempted twice
- When: Third validation attempt also fails
- Then: Orchestrator rolls back to checkpoint, sends detailed failure report to Telegram, pauses execution
- Error path: Rollback fails (git issue) — escalate with higher severity
- Edge case: Failure is in infrastructure, not code — orchestrator identifies pattern and suggests environment fix

**SC-009: Edge Case — VS Code to Telegram Handoff**
- Given: Developer starts PRD creation in VS Code, needs to leave
- When: Developer sends `/status` via Telegram
- Then: Bot reads manifest, reports current state (PRD in progress, at Section 4), developer continues PRD discussion via Telegram
- Error path: Manifest not yet created (very early in PRD) — bot reports "PRD creation in progress, no manifest yet"
- Edge case: Developer returns to VS Code — picks up exactly where they left off via manifest

**SC-010: Edge Case — Multiple Simultaneous Instances**
- Given: Developer running orchestrator on Project A and Project B
- When: Both are in autonomous execution mode
- Then: Each instance manages its own manifest, conversations, and Telegram notifications (tagged by project name)
- Error path: Both hit Tier 3 approval at same time — Telegram messages clearly identify which project
- Edge case: Same technology credential needed by both — .env is per-project, no sharing

**SC-011: Edge Case — Orchestrator Restart After Crash**
- Given: Orchestrator process terminates unexpectedly mid-execution
- When: Developer restarts orchestrator (or it auto-restarts)
- Then: Reads manifest, identifies last completed step, resumes from next uncompleted step
- Error path: Manifest corrupted — orchestrator creates fresh manifest by scanning filesystem (same as /prime first-run behavior)
- Edge case: Crash during git commit — orchestrator detects uncommitted changes, validates state, continues or rolls back

**SC-012: Edge Case — Empty Phase (No Implementation Needed)**
- Given: PRD phase is documentation-only or configuration-only
- When: Orchestrator reaches this phase
- Then: Plans and executes as normal, validation confirms deliverables exist, commits
- Error path: Validation has nothing to test — orchestrator documents "no testable deliverables" in report
- Edge case: Phase only generates files (no code) — Tier 1-3 skipped, scenario validation confirms file contents

### 4.4 Error Recovery Patterns

| Error Type | Detection | Recovery Action | User Communication |
|-----------|-----------|-----------------|-------------------|
| syntax_error | Lint/type check fails in validation L1 | Auto-fix in refactor session, re-validate (2 retries) | None unless retries exhausted |
| test_failure | Unit/component tests fail in validation L2 | Auto-fix in refactor session, re-validate (2 retries) | None unless retries exhausted |
| scenario_mismatch | PRD scenario doesn't match implementation behavior | Re-read PRD, adjust implementation (1 retry) | Telegram if retry fails |
| integration_auth | Missing or invalid API credential | Escalate immediately | Telegram: specific credential needed + why |
| integration_rate_limit | API returns 429 or equivalent | Exponential backoff, retry (3 retries) | None unless retries exhausted |
| partial_execution | Execute fails midway through tasks | Rollback to checkpoint, retry once | Telegram after auto-retry fails |
| orchestrator_crash | Process terminates unexpectedly | Resume from manifest state on restart | Telegram: "Orchestrator restarted, resuming from Phase N" |
| manifest_corruption | YAML parse error on manifest read | Rebuild manifest from filesystem scan | Telegram: "Manifest rebuilt from filesystem" |

---

## 5. User Stories

### US-001: Autonomous Phase Execution

**As a** developer who has validated a PRD
**I want to** trigger `/go` and have the orchestrator build every phase autonomously
**So that** I get a fully implemented, live-tested codebase without sitting at the keyboard

**Acceptance Criteria:**
- [ ] Each phase follows the full PIV loop: plan → execute → validate → commit
- [ ] Context window is literally cleared between command pairings (new API conversations)
- [ ] Every phase passes `/validate-implementation --full` with all tiers before advancing
- [ ] Failed validations trigger automatic refactoring within retry budgets
- [ ] Manifest tracks all progress, failures, and state changes

**Scenarios:** SC-001, SC-002, SC-005, SC-008
**Phase:** Phase 1
**Status:** ⚪ Not Started

### US-002: PRD Creation via Any Interface

**As a** developer
**I want to** create and iterate on a PRD using the same slash commands whether I'm in VS Code or Telegram
**So that** I can start projects from anywhere without learning a different workflow

**Acceptance Criteria:**
- [ ] `/create-prd` works identically in VS Code and Telegram
- [ ] Conversational iteration supported in both (back-and-forth discussion)
- [ ] PRD is written to `.agents/PRD.md` regardless of interface
- [ ] Human explicitly validates PRD before any autonomous action

**Scenarios:** SC-003, SC-009
**Phase:** Phase 2
**Status:** ⚪ Not Started

### US-003: Intelligent Credential Provisioning

**As a** developer
**I want the** orchestrator to research all technologies and tell me exactly what credentials it needs
**So that** I provide everything upfront instead of getting blocked mid-execution

**Acceptance Criteria:**
- [ ] Research-stack runs autonomously after PRD validation
- [ ] .env requirements extracted from technology profile Section 1 (Authentication)
- [ ] Single consolidated credential request presented to human
- [ ] Preflight verifies all credentials with live health checks before `/go`

**Scenarios:** SC-004, SC-007
**Phase:** Phase 1
**Status:** ⚪ Not Started

### US-004: Full Live Validation Every Phase

**As a** developer
**I want** every implementation phase to pass full live validation including all tiers
**So that** I never build Phase N+1 on top of broken Phase N code

**Acceptance Criteria:**
- [ ] Tier 1 (health checks) runs automatically every phase
- [ ] Tier 2 (test data) runs automatically every phase
- [ ] Tier 3 (real API calls) requests approval via Telegram, runs after approval
- [ ] Tier 4 (mock fixtures) runs automatically every phase
- [ ] All PRD scenarios validated against live implementation
- [ ] Phase does not advance until all validation passes

**Scenarios:** SC-001, SC-005, SC-006
**Phase:** Phase 1
**Status:** ⚪ Not Started

### US-005: Telegram Monitoring and Control

**As a** developer away from my desk
**I want to** receive progress updates and respond to blocking requests via Telegram
**So that** autonomous execution continues even when I'm mobile

**Acceptance Criteria:**
- [ ] Phase start/completion notifications sent to Telegram
- [ ] Tier 3 approval requests sent with endpoint details and cost estimates
- [ ] Blocking error escalations include full context and what the agent tried
- [ ] `/status`, `/pause`, `/resume` commands work via Telegram
- [ ] Project name tagged in all messages (for multi-project clarity)

**Scenarios:** SC-006, SC-009, SC-010
**Phase:** Phase 2
**Status:** ⚪ Not Started

### US-006: Crash Recovery

**As a** developer
**I want the** orchestrator to resume from where it left off after an unexpected restart
**So that** no progress is lost and I don't have to manually figure out what completed

**Acceptance Criteria:**
- [ ] Orchestrator reads manifest on startup to determine current state
- [ ] Resumes from the next uncompleted step (not from the beginning)
- [ ] Detects uncommitted changes and validates state before continuing
- [ ] Sends notification on restart with resume context

**Scenarios:** SC-011, SC-008
**Phase:** Phase 3
**Status:** ⚪ Not Started

### US-007: Drop-in Distribution

**As a** developer starting a new project
**I want to** drop the `.claude/` folder into my project and immediately have orchestration capabilities
**So that** setup is copying a folder, not configuring infrastructure

**Acceptance Criteria:**
- [ ] Orchestrator lives in `.claude/orchestrator/` alongside existing commands
- [ ] `npm install` inside orchestrator directory installs all dependencies
- [ ] No external infrastructure required (runs locally as background process)
- [ ] Works alongside existing PIV slash commands without conflict

**Scenarios:** SC-010
**Phase:** Phase 3
**Status:** ⚪ Not Started

---

## 6. Architecture & Patterns

**High-level architecture:** The orchestrator is a standalone Node.js process that spawns Claude Code subprocesses via the Agent SDK's `query()` function. It reads the PIV manifest to determine what to do next, spawns a fresh subprocess for each command pairing (literal context clear), sends slash commands as prompt strings, streams responses via async generator, parses PIV-Automator-Hooks from output, updates the manifest, and loops. For human communication, it runs a grammY-based Telegram bot using long-polling that either relays conversation (during PRD creation) or sends HTML-formatted notifications (during autonomous execution).

**Agent pipeline flow:**
1. Read manifest → determine current state and next action
2. Spawn fresh Claude Code subprocess via `query()` with `settingSources: ["project"]` (literal context clear)
3. Send `/prime` as prompt string (subprocess ingests codebase fresh)
4. For multi-command pairings, resume same session via `resume: sessionId`
5. Send target command (plan-feature, execute, validate, etc.)
6. Stream `SDKMessage` objects via async generator — extract hooks, detect errors, capture output
7. Update manifest with results
8. Evaluate phase gate — did validation pass? Are retries needed?
9. Loop or advance to next phase

**Directory structure:**
```
.claude/
├── commands/                  # Existing PIV slash commands
├── orchestrator/              # NEW — Agent SDK orchestration engine
│   ├── src/                   # TypeScript source
│   ├── package.json           # Dependencies (Agent SDK, Telegram, YAML)
│   └── tsconfig.json
└── settings.json
```

**Key patterns:**
- **Conversation-per-pairing:** Each context window pairing (e.g., prime + execute) gets its own Claude conversation. No conversation reuse.
- **Manifest-as-memory:** All state survives context clears via manifest YAML. If it's not in the manifest, the orchestrator doesn't know about it.
- **Parse-don't-assume:** Orchestrator reads PIV-Automator-Hooks from every command response rather than assuming success. Hook values drive next-action decisions.
- **Escalate-late:** Exhaust all autonomous recovery options (retries, refactoring, rollbacks) before messaging the human.

---

## 7. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 20+ LTS | TypeScript execution environment |
| Language | TypeScript | 5.x | Type safety for orchestration logic |
| Agent Framework | @anthropic-ai/claude-agent-sdk | 0.2.45+ | Subprocess lifecycle — spawns Claude Code per session |
| State | YAML (js-yaml) | Latest | Manifest read/write |
| Bot Framework | grammY | 1.40+ | Telegram bot — long-polling, inline keyboards, auto-retry |
| Process Manager | Node built-in | — | Background process with graceful shutdown |

**External Services:**

| Service | API Type | Auth | Purpose |
|---------|----------|------|---------|
| Anthropic (via Agent SDK) | Subprocess | CLAUDE_CODE_OAUTH_TOKEN | Spawn Claude Code sessions, subscription billing |
| Telegram Bot API | HTTP | Bot token | Bidirectional human communication |
| Git | CLI | SSH/HTTPS (existing) | Checkpointing and committing code |

---

## 8. MVP Scope

**In Scope:**

Agent Core:
- ✅ Session lifecycle management (spawn subprocess via `query()`, prime, execute commands, end session)
- ✅ Manifest-driven state machine (read state → decide action → update state)
- ✅ Phase gating with full live validation enforcement
- ✅ Error classification and autonomous retry logic
- ✅ Git checkpointing before execution, resolution after commit

Interfaces:
- ✅ Telegram bot — PRD conversation relay, `/go` trigger, progress notifications, approval requests
- ✅ VS Code — `/go` slash command spawns background orchestrator process
- ✅ Shared command set (`/go`, `/status`, `/pause`, `/resume`)

Orchestration:
- ✅ Research-stack execution with .env extraction
- ✅ Credential request and preflight verification
- ✅ Full PIV loop per phase (plan → execute → validate-full → commit)
- ✅ Crash recovery from manifest state

**Out of Scope:**
- ❌ Web dashboard (Telegram + VS Code is sufficient for MVP)
- ❌ Multi-user collaboration (single developer per instance)
- ❌ Cloud hosting (runs locally on developer's machine)
- ❌ Automatic PRD generation (human always drives PRD creation)
- ❌ Custom model selection per command (uses configured reasoning_model from PIV settings)

---

## 9. Implementation Phases

---

## Phase 1: Core Orchestration Engine

**Status:** ⚪ Not Started

**User Stories Addressed:** US-001, US-003, US-004
**Scenarios Validated:** SC-001, SC-002, SC-004, SC-005, SC-008

**What This Phase Delivers:**
The core orchestrator process that can manage Claude conversations via the Agent SDK, execute the full PIV loop for each phase, enforce validation gating, and handle error recovery autonomously. This is the engine — no Telegram, no VS Code integration yet. Triggered manually for testing.

**Prerequisites:**
- Anthropic Agent SDK access with OAuth support
- Existing PIV slash commands (already complete)

**Scope — Included:**
- ✅ Agent SDK session manager (create, prime, send commands, parse responses, destroy conversations)
- ✅ OAuth authentication using Claude Code token
- ✅ Manifest reader/writer with merge semantics
- ✅ PIV-Automator-Hooks parser (regex-based extraction from responses)
- ✅ Phase state machine (determine next action from manifest state)
- ✅ Full PIV loop execution: plan-feature → execute → validate-full → commit
- ✅ Research-stack execution with .env requirement extraction
- ✅ Preflight integration (verify credentials before autonomous loop)
- ✅ Error taxonomy classifier with retry budget tracking
- ✅ Git checkpoint creation and rollback capability
- ✅ Validation gate enforcement (all tiers must pass)
- ✅ Refactor-and-retry loop for failed validations

**Scope — NOT Included:**
- ❌ Telegram bot (Phase 2)
- ❌ VS Code /go command (Phase 3)
- ❌ Crash recovery (Phase 3)

**Technologies Used This Phase:**
- Claude Agent SDK: Conversation lifecycle, OAuth authentication
- js-yaml: Manifest read/write
- Node.js child_process: Git operations

**Key Technical Decisions:**
- Each command pairing runs in its own Agent SDK conversation for true context isolation
- Hooks are parsed via regex (matching `^([a-z_]+): (.+)$` pattern) not YAML, keeping it lightweight
- Manifest writes always merge via deep-merge — never replace top-level keys

**Discussion Points:**
- Agent SDK conversation API shape — how does response streaming work for long command outputs?
- OAuth token refresh strategy — how often does the Claude Code token expire?

**Done When:**
- Orchestrator can execute all phases of a test PRD from command line
- Each phase gets a fresh conversation (verified via conversation IDs)
- Validation failures trigger refactor + re-validate cycle
- Manifest reflects accurate state after full run
- SC-001, SC-002, SC-004, SC-005, SC-008 pass

---

## Phase 2: Telegram Interface

**Status:** ⚪ Not Started

**User Stories Addressed:** US-002, US-005
**Scenarios Validated:** SC-003, SC-006, SC-009, SC-010

**What This Phase Delivers:**
Bidirectional Telegram bot that serves as both a conversation relay for PRD creation and a notification/control channel for autonomous execution. Developer can create PRDs, provide credentials, trigger `/go`, and monitor progress entirely from Telegram.

**Prerequisites:**
- Phase 1 complete (core engine running)
- Telegram bot token created via BotFather

**Scope — Included:**
- ✅ Telegram bot setup with command handlers (`/go`, `/status`, `/pause`, `/resume`)
- ✅ PRD creation relay (forward messages to Claude conversation, return responses)
- ✅ Slash command relay (same commands work via Telegram as VS Code)
- ✅ Progress notifications (phase start, phase complete, validation results)
- ✅ Tier 3 approval requests with endpoint details and cost estimates
- ✅ Blocking escalation messages with full failure context
- ✅ Project name tagging on all messages (for multi-project clarity)
- ✅ Credential request formatting (consolidated .env list from profiles)

**Scope — NOT Included:**
- ❌ Rich media (images, charts) — text-only for MVP
- ❌ Group chat support — single developer DM only

**Technologies Used This Phase:**
- Telegram Bot API: Message send/receive, command handling
- grammy or telegraf: Bot framework for Node.js
- Claude Agent SDK: Conversation relay for PRD creation

**Key Technical Decisions:**
- Bot is stateless — all state lives in manifest, bot reads it on demand
- Long messages split at 4000 chars (Telegram limit is 4096) with "continued..." markers
- PRD relay creates a dedicated Claude conversation per PRD session, destroyed on validation

**Discussion Points:**
- Bot deployment — long-polling (simpler) vs webhook (more responsive)?
- Message formatting — Markdown or plain text for Telegram messages?

**Done When:**
- PRD can be created entirely via Telegram conversation
- `/go` from Telegram starts autonomous execution
- Tier 3 approval requests arrive on Telegram with actionable approve/reject
- `/status` returns current phase and progress from manifest
- SC-003, SC-006, SC-009 pass

---

## Phase 3: VS Code Integration & Resilience

**Status:** ⚪ Not Started

**User Stories Addressed:** US-006, US-007
**Scenarios Validated:** SC-011, SC-012

**What This Phase Delivers:**
VS Code `/go` command that spawns the orchestrator as a background process, crash recovery from manifest state, and the drop-in distribution model. After this phase, the orchestrator is production-ready for daily use.

**Prerequisites:**
- Phase 2 complete (Telegram interface working)

**Scope — Included:**
- ✅ `/go` slash command for VS Code (spawns orchestrator as background Node process)
- ✅ Crash recovery — read manifest on startup, resume from last completed step
- ✅ Uncommitted change detection on restart (validate git state before resuming)
- ✅ Graceful shutdown handling (SIGTERM, SIGINT)
- ✅ Drop-in packaging (`.claude/orchestrator/` self-contained with package.json)
- ✅ Process health monitoring (detect if orchestrator is already running)

**Scope — NOT Included:**
- ❌ VS Code extension sidebar (just the `/go` command for MVP)
- ❌ Auto-update mechanism

**Technologies Used This Phase:**
- Node.js: Process management, signal handling, child_process for spawning
- Git CLI: State detection on restart

**Key Technical Decisions:**
- `/go` command spawns orchestrator via `node .claude/orchestrator/dist/index.js` as detached process
- PID file at `.agents/orchestrator.pid` prevents duplicate instances per project
- On crash recovery, orchestrator creates a new conversation and primes fresh before resuming

**Discussion Points:**
- Should `/go` from VS Code also connect the Telegram bot, or assume it's already running?
- Log file location — `.agents/orchestrator.log` for debugging?

**Done When:**
- `/go` in VS Code spawns orchestrator, which runs autonomously
- Killing and restarting the process resumes from manifest state
- Drop-in to a fresh project works with just `npm install` in orchestrator dir
- SC-011, SC-012 pass

---

## Phase 4: Multi-Instance & Polish

**Status:** ⚪ Not Started

**User Stories Addressed:** US-007 (extended)
**Scenarios Validated:** SC-010

**What This Phase Delivers:**
Support for running multiple orchestrator instances simultaneously across different projects, with clear Telegram message routing and process isolation. Plus hardening from real-world usage.

**Prerequisites:**
- Phase 3 complete

**Scope — Included:**
- ✅ Project-scoped Telegram messages (project name prefix on all notifications)
- ✅ Multi-instance process isolation (each project has its own PID, manifest, conversations)
- ✅ `/status` across projects — Telegram command lists all active orchestrators
- ✅ Edge case hardening from Phase 1-3 usage feedback

**Scope — NOT Included:**
- ❌ Cross-project dependency management
- ❌ Shared credential vault across projects

**Technologies Used This Phase:**
- Same as Phases 1-3 (no new technologies)

**Key Technical Decisions:**
- Each instance is fully isolated — separate process, separate manifest, separate conversations
- Telegram bot is shared (single bot token) but routes messages by project identifier
- `/status all` lists all running instances with their current phase

**Discussion Points:**
- Project identifier in Telegram — use directory name or allow custom naming?

**Done When:**
- Two orchestrator instances run simultaneously on different projects
- Telegram messages clearly identify which project each notification is for
- Killing one instance doesn't affect the other
- SC-010 passes

---

## 10. Current Focus

**Active Phase:** Phase 1 — Core Orchestration Engine
**Active Stories:** US-001, US-003, US-004
**Status:** ⚪ Not Started
**Research Status:** Pending — `/research-stack` needed for Agent SDK, Telegram Bot API

**Blockers:**
- Agent SDK OAuth documentation needed (research-stack will produce profile)

**Session Context:**
- PRD created from design discussion
- Architecture solidified: standalone background process, Agent SDK, manifest-driven
- Next step: Human validates this PRD, then `/research-stack` for technology profiles

**Last Updated:** 2026-02-18

---

## 11. Success Criteria

**MVP is successful when:**
1. Orchestrator autonomously completes all phases of a test PRD with full live validation
2. Every phase passes `/validate-implementation --full` (all 4 tiers + scenarios) before advancing
3. Failed validations are automatically refactored and retried within budget
4. PRD creation works identically via VS Code and Telegram
5. Blocking escalations arrive on Telegram with actionable context
6. Crash recovery resumes from manifest state without data loss
7. Drop-in to a new project requires only copying `.claude/` and running `npm install`
8. All 12 scenarios from Section 4.3 pass validation

**Validation Commands:**
```bash
npm run test                    # Unit tests for orchestrator logic
npm run test:integration        # Integration tests with Agent SDK
npm run test:e2e                # End-to-end: full PIV loop on test project
```

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent SDK API changes | High | Pin SDK version, abstract behind session interface |
| OAuth token expiration mid-execution | Medium | Token refresh logic, checkpoint before long operations |
| Telegram rate limits during heavy progress reporting | Low | Batch notifications, minimum 5s between messages |
| Large codebase exceeds conversation context | High | Trust `/prime` to prioritize relevant context; phases are scoped |
| Validation flakiness causing false failures | Medium | Retry budget absorbs transient failures; fixture recording for Tier 3 |
| Manifest corruption from crash during write | Medium | Atomic write (write to temp file, rename) |
| Long-running autonomous execution with no human oversight | Medium | Periodic "heartbeat" messages to Telegram every 30 minutes |

---

## 13. Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-18 | 1.0 | Initial PRD from design discussion |
| 2026-02-18 | 1.1 | Updated Section 3 post-research: Agent SDK subprocess model, CLAUDE_CODE_OAUTH_TOKEN auth, grammY, accurate session lifecycle |

---

## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: claude-agent-sdk, telegram-bot-api, anthropic-oauth
scenarios_count: 12
phases_count: 4
next_suggested_command: research-stack
next_arg: ".agents/PRD.md"
confidence: high
