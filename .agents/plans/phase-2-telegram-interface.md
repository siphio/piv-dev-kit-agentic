# Feature: Phase 2 — Telegram Interface

The following plan should be complete, but validate documentation and codebase patterns before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Bidirectional Telegram bot that serves as both a conversation relay for PRD creation and a notification/control channel for autonomous execution. The developer can create PRDs, provide credentials, trigger `/go`, monitor progress, approve Tier 3 validation requests, and pause/resume execution — entirely from Telegram. The bot is stateless; all state lives in the manifest.

## User Story

As a developer away from my desk
I want to receive progress updates, create PRDs, and control autonomous execution via Telegram
So that the PIV orchestrator continues working even when I'm mobile

## Problem Statement

Phase 1 built the core orchestration engine but it has no human communication channel. The orchestrator can run phases autonomously but cannot: (1) relay PRD creation conversations, (2) send progress notifications, (3) request Tier 3 approval, (4) receive `/go`, `/pause`, `/resume`, `/status` commands remotely, or (5) escalate blocking errors. The developer must be at the keyboard.

## Solution Statement

Add a grammY-based Telegram bot embedded in the orchestrator process. It uses long-polling to receive commands and sends HTML-formatted status messages. PRD creation is relayed by bridging Telegram messages to dedicated Claude Agent SDK sessions. Pause/resume uses a shared flag checked between phases.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: index.ts, piv-runner.ts, config.ts, types.ts, new telegram modules
**Dependencies**: grammy, @grammyjs/auto-retry
**Agent Behavior**: Yes — implements SC-003, SC-006, SC-009, SC-010 and decision trees for Telegram routing

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `telegram-bot-api-profile.md` — Used for: all Telegram integration
  - Key endpoints: sendMessage, getUpdates, answerCallbackQuery, editMessageText, setMyCommands
  - Auth method: Bot token via `TELEGRAM_BOT_TOKEN` env var
  - Critical constraints: 4096 char message limit, 1-64 byte callback_data, 1 msg/sec per chat, mutual exclusion of getUpdates/webhooks

- `claude-agent-sdk-profile.md` — Used for: PRD relay sessions
  - Key endpoints: query() with resume for multi-turn PRD conversations
  - Auth method: CLAUDE_CODE_OAUTH_TOKEN (subscription billing via Agent SDK subprocess)
  - Critical constraints: each query() spawns subprocess, settingSources: ["project"] required

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `.claude/orchestrator/src/types.ts` (lines 1-198) — All shared types. New Telegram types go here.
- `.claude/orchestrator/src/config.ts` (lines 1-33) — Config loader. Add Telegram env vars here.
- `.claude/orchestrator/src/index.ts` (lines 1-111) — CLI entry point. Must integrate bot startup.
- `.claude/orchestrator/src/piv-runner.ts` (lines 1-436) — Phase loop. Add pause checks + notification calls.
- `.claude/orchestrator/src/session-manager.ts` (lines 1-121) — Session creation. PRD relay reuses this.
- `.claude/orchestrator/src/manifest-manager.ts` (lines 1-145) — Manifest read/write. No changes needed.
- `.claude/orchestrator/src/response-handler.ts` (lines 1-75) — SDK response parsing. No changes needed.
- `.claude/orchestrator/src/hooks-parser.ts` (lines 1-37) — Hooks extraction. No changes needed.
- `.claude/orchestrator/src/error-classifier.ts` (lines 1-95) — Error classification. No changes needed.
- `.claude/orchestrator/src/git-manager.ts` (lines 1-54) — Git operations. No changes needed.
- `.claude/orchestrator/src/state-machine.ts` (lines 1-206) — State determination. No changes needed.
- `.agents/reference/telegram-bot-api-profile.md` (Appendix A, lines 529-712) — Full bot skeleton, approval flow, message splitting, multi-project tagging
- `.claude/orchestrator/package.json` (lines 1-28) — Add grammy + auto-retry deps

### New Files to Create

- `.claude/orchestrator/src/telegram-bot.ts` — Bot initialization, command handlers, callback routing
- `.claude/orchestrator/src/telegram-formatter.ts` — HTML message formatting, splitting, project tagging
- `.claude/orchestrator/src/telegram-notifier.ts` — Notification dispatch (progress, approvals, escalations)
- `.claude/orchestrator/src/prd-relay.ts` — PRD creation conversation bridge (Telegram ↔ Claude SDK)
- `.claude/orchestrator/tests/telegram-formatter.test.ts` — Unit tests for formatting and splitting
- `.claude/orchestrator/tests/telegram-notifier.test.ts` — Unit tests for notification dispatch (mocked bot)

### Patterns to Follow

**Naming**: kebab-case files, camelCase functions, PascalCase types/interfaces — MIRROR: types.ts
**Error Handling**: try/catch with console.log emoji prefix — MIRROR: piv-runner.ts:311-434
**Config**: Environment vars validated in loadConfig() — MIRROR: config.ts:14-28
**Manifest**: Read → mutate → write pattern — MIRROR: piv-runner.ts:89-116
**Testing**: Vitest with describe/it blocks — MIRROR: tests/hooks-parser.test.ts

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Decision: Telegram vs VS Code Routing (PRD 4.2)**
- IF orchestrator started from Telegram → all human communication via Telegram
- IF orchestrator started from VS Code → blocking escalations go to Telegram, progress visible in both
- ALWAYS → manifest is updated regardless of interface
- Implementation: `notifier.send()` checks if bot is running. If not, skip silently (VS Code-only mode).

**Decision: Validation Failure Response — Tier 3 Approval (PRD 4.2)**
- IF validation reaches Tier 3 endpoint → send approval request via Telegram with inline keyboard
- IF human approves → continue with live call
- IF human selects fixture → load recorded fixture
- IF human selects skip → log as SKIPPED, continue
- IF no response within 30 minutes → send reminder, continue waiting (never auto-approve)
- Implementation: Promise-based wait with callback resolution in `telegram-notifier.ts`

### Scenario Mappings

| Scenario (PRD 4.3) | Agent Workflow | Decision Tree | Success Criteria |
|---|---|---|---|
| SC-003: PRD via Telegram | User sends /create_prd → relay loop starts → each message forwarded to Claude → responses sent back → PRD validated | Context Window Mgmt | PRD written to .agents/PRD.md |
| SC-006: Tier 3 Approval | Validation hits Tier 3 → sendMessage with InlineKeyboard → user presses button → answerCallbackQuery → editMessageText with result | Validation Failure Response | Approval received, live call executed or fixture used |
| SC-009: VS Code ↔ Telegram | User sends /status via Telegram → bot reads manifest → formats status report → sends | Telegram vs VS Code | Current phase and progress returned |
| SC-010: Multi-Instance | Two orchestrators running → both send to same bot → messages tagged with [ProjectName] | Telegram vs VS Code | Messages clearly identify project |

### Error Recovery Patterns

- Telegram 401 (invalid token) → classify as `integration_auth`, escalate immediately, continue orchestration without Telegram
- Telegram 409 (webhook conflict) → call `deleteWebhook`, restart polling
- Telegram 429 (rate limit) → `@grammyjs/auto-retry` handles transparently
- Bot polling failure → log warning, retry connection, orchestrator continues without notifications
- PRD relay session error → classify via existing error-classifier, send error to user, destroy session

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (Types, Config, Dependencies)

Add new types, extend config validation, install grammY dependencies.

### Phase 2: Core Telegram Modules

Build the bot, formatter, and notifier as independent modules with clear interfaces.

### Phase 3: PRD Relay Bridge

Bridge Telegram messages to Claude SDK sessions for conversational PRD creation.

### Phase 4: Orchestrator Integration

Wire the bot and notifier into the existing index.ts and piv-runner.ts.

### Phase 5: Testing

Unit tests for formatter and notifier. Integration patterns for bot commands.

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|---|---|---|---|
| /status command | Bot reads manifest, sends formatted status | Missing manifest → error message | None |
| /go command | Triggers runAllPhases, sends confirmation | Already running → "already in progress" | Manifest updated via piv-runner |
| /pause command | Sets paused flag, confirms | Not running → "nothing to pause" | paused flag set |
| /create_prd relay | Messages forwarded to Claude, responses returned | SDK session error → error message sent | PRD written to disk |
| Tier 3 approval | Inline keyboard sent, user presses approve | Timeout → reminder sent | Validation continues |
| Message splitting | Long status split into chunks | Empty text → no send | None |
| Project tagging | All messages prefixed with [ProjectName] | No prefix env → use directory name | None |

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-003 | Send /create_prd, relay 3 messages, verify PRD created | PRD at .agents/PRD.md, all messages relayed |
| SC-006 | Trigger Tier 3, verify approval keyboard appears, press approve | Callback received, message edited to show result |
| SC-009 | Send /status from Telegram while orchestrator active | Status report with phase and progress returned |
| SC-010 | Two orchestrators with different project prefixes | Messages clearly tagged with project name |

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE package.json — Add grammY dependencies

- **IMPLEMENT**: Add `grammy` and `@grammyjs/auto-retry` to dependencies
- **PATTERN**: MIRROR: package.json dependencies section
- **VALIDATE**: `cd .claude/orchestrator && npm install`

### Task 2: UPDATE types.ts — Add Telegram-related types

- **IMPLEMENT**: Add these types after the existing `OrchestratorConfig` interface:
  ```typescript
  export interface TelegramConfig {
    botToken: string;
    chatId: number;
    projectPrefix: string;
  }

  export interface ApprovalRequest {
    techName: string;
    endpoint: string;
    cost: string;
    effect: string;
    cleanup: string;
  }

  export interface ApprovalResult {
    action: "approve" | "fixture" | "skip";
    techName: string;
  }

  export type OrchestratorMode = "cli" | "telegram";
  ```
- **IMPLEMENT**: Extend `OrchestratorConfig` to include:
  ```typescript
  telegram?: TelegramConfig;
  mode: OrchestratorMode;
  ```
- **PATTERN**: MIRROR: types.ts existing interface style
- **GOTCHA**: Do NOT remove any existing types — append only
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 3: UPDATE config.ts — Add Telegram config loading

- **IMPLEMENT**: Add Telegram env var loading to `loadConfig()`:
  - Read `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_PROJECT_PREFIX`
  - If token AND chatId present → set `telegram` config, set `mode: "telegram"`
  - If either missing → set `mode: "cli"`, log warning that Telegram is disabled
  - `projectPrefix` defaults to basename of `projectDir` if not set
- **PATTERN**: MIRROR: config.ts:14-28 — same env var validation style
- **PROFILE**: Telegram profile Section 1 — env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_PROJECT_PREFIX
- **IMPORTS**: Add `import { basename } from "node:path";`
- **GOTCHA**: Do NOT throw if Telegram vars are missing — it's optional. Only SDK auth is required.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 4: CREATE telegram-formatter.ts — Message formatting utilities

- **IMPLEMENT**: Core formatting functions:
  - `escapeHtml(text: string): string` — escape `<`, `>`, `&`
  - `tagMessage(projectPrefix: string, message: string): string` — prepend `[ProjectName]`
  - `splitMessage(text: string, maxLength?: number): string[]` — split at 4000 chars on paragraph boundaries (double newline), fall back to single newline, then hard split
  - `formatStatusMessage(manifest: Manifest): string` — HTML-formatted status with phase table, next action, active failures
  - `formatPhaseStartMessage(phase: number, phaseName: string): string`
  - `formatPhaseCompleteMessage(phase: number, costUsd: number): string`
  - `formatEscalationMessage(phase: number, category: string, details: string, actionTaken: string): string`
  - `formatApprovalMessage(request: ApprovalRequest): string`
  - `formatApprovalResultMessage(techName: string, action: string): string`
- **PROFILE**: Telegram profile gotcha #1 (HTML over MarkdownV2), gotcha #2 (4096 limit), Appendix A message splitting utility, Appendix C parse mode recommendation
- **PATTERN**: Pure functions, no side effects, export individually
- **GOTCHA**: Split at 4000 chars (not 4096) to leave room for HTML tags. Use `parse_mode: "HTML"` in all messages.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 5: CREATE telegram-notifier.ts — Notification dispatch layer

- **IMPLEMENT**: Class `TelegramNotifier` with methods:
  ```typescript
  constructor(bot: Bot, chatId: number, projectPrefix: string)
  async sendStatus(manifest: Manifest): Promise<void>
  async sendPhaseStart(phase: number, phaseName: string): Promise<void>
  async sendPhaseComplete(phase: number, costUsd: number): Promise<void>
  async sendEscalation(phase: number, category: string, details: string, actionTaken: string): Promise<void>
  async requestTier3Approval(request: ApprovalRequest): Promise<ApprovalResult>
  async sendText(text: string): Promise<void>
  ```
- **IMPLEMENT**: `sendText` splits messages via `splitMessage()` and sends each chunk with 1.1s delay between chunks
- **IMPLEMENT**: `requestTier3Approval` sends inline keyboard with 3 buttons (approve/fixture/skip), returns Promise that resolves when callback received. Uses a Map of pending approvals keyed by techName. Include 30-minute reminder timer.
- **PROFILE**: Telegram profile Section 3 (sendMessage, InlineKeyboardMarkup), Section 4 (1 msg/sec per chat), Appendix A (sendApprovalRequest pattern)
- **IMPORTS**: `import { Bot, InlineKeyboard } from "grammy";` and all formatters from telegram-formatter.ts
- **GOTCHA**: Profile gotcha #5 — answerCallbackQuery must be called within 30 seconds. Call it immediately, then process.
- **GOTCHA**: Profile gotcha #4 — callback_data max 64 bytes. Use short prefixes: `t3a_`, `t3f_`, `t3s_`
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 6: CREATE telegram-bot.ts — Bot setup and command handlers

- **IMPLEMENT**: Function `createBot(config: TelegramConfig, orchestratorControls: OrchestratorControls): Bot`
- **IMPLEMENT**: Interface `OrchestratorControls`:
  ```typescript
  interface OrchestratorControls {
    getManifest: () => Promise<Manifest>;
    startExecution: () => void;
    pause: () => void;
    resume: () => void;
    isRunning: () => boolean;
    isPaused: () => boolean;
    startPrdRelay: (chatId: number) => void;
    projectDir: string;
  }
  ```
- **IMPLEMENT**: Auth middleware — silently ignore messages from non-authorized chat IDs (profile Appendix A security filter)
- **IMPLEMENT**: Command handlers:
  - `/status` → read manifest via `getManifest()`, format with `formatStatusMessage()`, reply
  - `/go` → if not running, call `startExecution()`, confirm. If running, reply "already running"
  - `/pause` → if running and not paused, call `pause()`, confirm. Otherwise reply appropriately
  - `/resume` → if paused, call `resume()`, confirm
  - `/create_prd` → call `startPrdRelay(chatId)`
  - `/preflight` → reply with preflight status from manifest
- **IMPLEMENT**: Callback query handler for `t3a_`, `t3f_`, `t3s_` prefixes — route to notifier's pending approval resolution
- **IMPLEMENT**: Catch-all for unhandled callbacks — `ctx.answerCallbackQuery()`
- **IMPLEMENT**: Error handler — `bot.catch()` logs errors, does not crash
- **IMPLEMENT**: Register commands at startup via `bot.api.setMyCommands()` (profile Section 3: setMyCommands)
- **PROFILE**: Telegram profile Appendix A full bot skeleton, Section 3 (setMyCommands endpoint), gotcha #3 (deleteWebhook on startup), gotcha #6 (bot can't initiate conversations), gotcha #10 (single polling instance)
- **GOTCHA**: Call `bot.api.deleteWebhook()` before `bot.start()` to clear stale webhooks — or rely on grammY's built-in handling
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 7: CREATE prd-relay.ts — PRD creation conversation bridge

- **IMPLEMENT**: Class `PrdRelay`:
  ```typescript
  constructor(projectDir: string, notifier: TelegramNotifier)
  async startConversation(): Promise<void>
  async handleUserMessage(text: string): Promise<string>
  async endConversation(): Promise<void>
  isActive(): boolean
  ```
- **IMPLEMENT**: `startConversation` — create new Claude SDK session via `createSession()` with prompt `/create-prd`, capture sessionId
- **IMPLEMENT**: `handleUserMessage` — resume session with user's text via `resumeSession()`, extract assistant response from `SessionResult.output`, return it
- **IMPLEMENT**: `endConversation` — set active = false, session abandoned (no explicit destroy per SDK gotcha #2)
- **IMPLEMENT**: Active flag — only one PRD relay active at a time. If `/create_prd` called while active, send "PRD session already in progress"
- **PATTERN**: MIRROR: session-manager.ts:41-64 (createSession pattern), session-manager.ts:69-74 (resumeSession pattern)
- **GOTCHA**: SDK profile gotcha #2 — no destroySession API. Just stop resuming.
- **GOTCHA**: Long PRD conversations may hit context compaction. This is acceptable per SDK profile gotcha #7.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 8: UPDATE piv-runner.ts — Add notification hooks and pause support

- **IMPLEMENT**: Add optional `notifier` and `pauseCheck` parameters to `runPhase()` and `runAllPhases()`:
  ```typescript
  export async function runPhase(
    phase: number, projectDir: string,
    notifier?: TelegramNotifier,
    pauseCheck?: () => Promise<void>
  ): Promise<void>

  export async function runAllPhases(
    projectDir: string,
    notifier?: TelegramNotifier,
    pauseCheck?: () => Promise<void>
  ): Promise<void>
  ```
- **IMPLEMENT**: In `runAllPhases()` — before each phase iteration, call `await pauseCheck?.()` which blocks if paused
- **IMPLEMENT**: In `runPhase()` — call `notifier?.sendPhaseStart()` at beginning, `notifier?.sendPhaseComplete()` at end
- **IMPLEMENT**: In `handleError()` — add optional `notifier` parameter. When `taxonomy.needsHuman === true`, call `notifier?.sendEscalation()` in addition to existing manifest writes
- **IMPLEMENT**: In `runAllPhases()` — after all phases complete, call `notifier?.sendText("All phases complete!")`
- **IMPORTS**: Add `import type { TelegramNotifier } from "./telegram-notifier.js";`
- **GOTCHA**: All notifier calls are optional (?.operator) — orchestrator works without Telegram (VS Code mode)
- **GOTCHA**: Do NOT change the existing error handling logic or manifest operations — only ADD notification calls alongside them
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit && npm test`

### Task 9: UPDATE index.ts — Wire bot startup and orchestrator controls

- **IMPLEMENT**: After config validation, if `config.telegram` exists:
  1. Create `TelegramNotifier` instance
  2. Create `PrdRelay` instance
  3. Create shared state: `let running = false; let paused = false;`
  4. Create `pauseCheck` function: returns a Promise that resolves when `paused` becomes false (poll every 2s)
  5. Build `OrchestratorControls` object wiring to shared state and existing `runAllPhases`/`runPhase`
  6. Create bot via `createBot(config.telegram, controls)`
  7. Start bot polling: `bot.start()` (fire-and-forget, runs in background)
  8. Register commands via `bot.api.setMyCommands()`
  9. Pass `notifier` and `pauseCheck` to `runPhase()`/`runAllPhases()` calls
- **IMPLEMENT**: Add `/create_prd` handling in controls — when user sends text during active PRD relay, forward to `prdRelay.handleUserMessage()`, send response back
- **IMPLEMENT**: Wire PRD relay message handling into bot's message handler (non-command text while relay is active)
- **IMPLEMENT**: Graceful shutdown — on SIGINT/SIGTERM, call `bot.stop()` before process.exit
- **GOTCHA**: `bot.start()` is non-blocking (returns immediately). The polling runs in the background via the Node.js event loop.
- **GOTCHA**: For `--dry-run` mode, do NOT start the bot — skip Telegram entirely.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit && npm test`

### Task 10: UPDATE .env.example — Add Telegram environment variables

- **IMPLEMENT**: Add to existing .env.example:
  ```
  # Telegram Bot (optional — enables remote control)
  TELEGRAM_BOT_TOKEN=
  TELEGRAM_CHAT_ID=
  TELEGRAM_PROJECT_PREFIX=
  ```
- **VALIDATE**: File exists and contains all env vars

### Task 11: CREATE telegram-formatter.test.ts — Formatter unit tests

- **IMPLEMENT**: Test suite with vitest covering:
  - `escapeHtml`: handles `<`, `>`, `&`, passthrough for safe strings
  - `tagMessage`: prepends `[ProjectName]` with space
  - `splitMessage`: message under 4000 chars returns single chunk; message over 4000 splits on paragraph boundary; message with no newlines hard-splits; empty string returns empty array
  - `formatStatusMessage`: produces HTML with phase table, handles empty manifest fields gracefully
  - `formatPhaseStartMessage`: includes phase number
  - `formatPhaseCompleteMessage`: includes phase number and cost
  - `formatEscalationMessage`: includes category, details, action taken
  - `formatApprovalMessage`: includes all ApprovalRequest fields
  - `formatApprovalResultMessage`: shows action taken
- **PATTERN**: MIRROR: tests/hooks-parser.test.ts (describe/it structure, import pattern)
- **VALIDATE**: `cd .claude/orchestrator && npm test`

### Task 12: CREATE telegram-notifier.test.ts — Notifier unit tests

- **IMPLEMENT**: Test suite with vitest covering:
  - Mock `Bot` class that captures sendMessage calls
  - `sendText`: sends single message for short text, splits for long text
  - `sendPhaseStart`: sends formatted message to correct chatId
  - `sendPhaseComplete`: sends formatted message with cost
  - `sendEscalation`: sends formatted escalation with blocking context
  - `requestTier3Approval`: sends message with InlineKeyboard, resolves when approval callback simulated
  - `sendStatus`: reads manifest and sends formatted status
- **IMPLEMENT**: Create mock bot helper:
  ```typescript
  function createMockBot(): { bot: any; sent: Array<{ chatId: number; text: string; options?: any }> }
  ```
- **PATTERN**: MIRROR: tests/manifest-manager.test.ts (test structure, in-memory data)
- **VALIDATE**: `cd .claude/orchestrator && npm test`

### Task 13: RUN full validation suite

- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`
- **VALIDATE**: `cd .claude/orchestrator && npm test`
- **VALIDATE**: `cd .claude/orchestrator && npx tsx src/index.ts --dry-run` (should still work without Telegram vars)

---

## TESTING STRATEGY

### Unit Tests

**telegram-formatter.test.ts** — Pure function tests. No mocks needed except Manifest type fixture.
- escapeHtml edge cases (nested tags, empty string, already-escaped)
- splitMessage boundary conditions (exactly 4000 chars, 4001 chars, no good split point)
- formatStatusMessage with all phases complete, with failures, with empty manifest

**telegram-notifier.test.ts** — Mock Bot instance. Verify correct messages sent.
- sendText message splitting integration
- requestTier3Approval keyboard structure and callback resolution
- Timeout behavior (30-minute reminder)

### Integration Tests (Manual / Deferred to Validate)

- Start orchestrator with Telegram vars → verify bot responds to /status
- Send /go → verify orchestrator begins execution
- Trigger Tier 3 → verify approval keyboard appears in chat
- Send /create_prd → verify relay conversation works

### Edge Cases

- Telegram token invalid at startup → log warning, continue in CLI mode
- Bot blocked by user (403) → log warning, skip notification, continue
- Message exceeds 4096 after HTML tags → verify splitting accounts for tags
- Concurrent /go commands → second one rejected
- /pause when not running → helpful error message
- PRD relay with empty message → skip
- Callback for unknown approval → answerCallbackQuery with generic response

---

## VALIDATION COMMANDS

### Level 1: Syntax & Types

```bash
cd .claude/orchestrator && npx tsc --noEmit
```

**Expected**: Exit code 0, zero errors

### Level 2: Unit Tests

```bash
cd .claude/orchestrator && npm test
```

**Expected**: All existing tests (50) pass + new tests pass. Zero failures.

### Level 3: Smoke Test

```bash
cd .claude/orchestrator && npx tsx src/index.ts --dry-run
```

**Expected**: Works without Telegram env vars (CLI mode). Shows next action recommendation.

### Level 4: Manual Telegram Validation (Deferred to /validate-implementation)

- Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
- Start orchestrator
- Send /status from Telegram
- Send /go from Telegram
- Verify notifications arrive

---

## ACCEPTANCE CRITERIA

- [ ] grammY dependency installed and types resolve
- [ ] Bot starts polling when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set
- [ ] Bot silently ignores messages from non-authorized chat IDs
- [ ] /status returns formatted phase and progress from manifest
- [ ] /go triggers autonomous execution and sends confirmation
- [ ] /pause stops execution after current step, /resume continues
- [ ] /create_prd starts PRD relay — messages forwarded to Claude, responses returned
- [ ] Progress notifications sent at phase start/complete
- [ ] Tier 3 approval requests sent with inline keyboard (approve/fixture/skip)
- [ ] Callback responses handled — message edited to show result
- [ ] Blocking escalations sent with full failure context
- [ ] All messages tagged with [ProjectName] prefix
- [ ] Messages over 4000 chars split on paragraph boundaries
- [ ] Orchestrator works without Telegram (CLI mode) — all notifier calls are optional
- [ ] TypeScript compiles with zero errors
- [ ] All unit tests pass (existing 50 + new tests)
- [ ] Dry-run mode still works without Telegram vars
- [ ] SC-003, SC-006, SC-009 scenarios addressed in design

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (1-13)
- [ ] Each task validation passed immediately
- [ ] TypeScript compiles cleanly (`tsc --noEmit`)
- [ ] Full test suite passes (`npm test`)
- [ ] Dry-run mode works without Telegram config
- [ ] All acceptance criteria met
- [ ] No regressions in existing Phase 1 tests (50 tests)

---

## NOTES

### Decision Log (from Phase 0 Scope Analysis)

1. **Long-polling over webhooks**: PRD key decision + profile Appendix B. No public URL needed, grammY auto-reconnects. The orchestrator is a local process.

2. **HTML over MarkdownV2**: Profile Appendix C + gotcha #1. The orchestrator outputs file paths and code references with special chars that would require aggressive escaping in MarkdownV2.

3. **grammY over Telegraf**: Profile Section 6. TypeScript-first, better types, tracks latest Bot API, 1.1M+ weekly npm downloads.

4. **Embedded bot (not separate process)**: PRD Section 6 says "standalone Node.js process." Bot is stateless and reads manifest on demand — no need for IPC. Single process simplifies deployment.

5. **Shared pause flag (not event-based)**: The orchestrator's `runAllPhases` loop is sequential. A boolean flag checked between phases is the simplest correct implementation. No race conditions because the flag is only written by the bot handler and read by the phase loop.

6. **PRD relay via session resume**: PRD key decision: "PRD relay creates a dedicated Claude conversation per PRD session." The existing `createSession()`/`resumeSession()` functions handle this exactly.

### Deferred Items

- Tier 3 30-minute timeout reminder — implement but note that blocking wait behavior may need tuning
- Multi-instance coordination (SC-010) — project prefix tagging implemented but PID-based exclusion is Phase 3
- Long message splitting with HTML tag awareness — basic paragraph splitting is sufficient for MVP

### PRD Gap Assumption

PRD does not specify how the bot handles free-text messages outside of PRD relay mode. Assumed: ignore non-command text when PRD relay is not active. If incorrect, this affects Task 6 (telegram-bot.ts message handler).

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 2 from PRD
independent_tasks_count: 4
dependent_chains: 9
technologies_consumed: telegram-bot-api, claude-agent-sdk
next_suggested_command: execute
next_arg: ".agents/plans/phase-2-telegram-interface.md"
estimated_complexity: high
confidence: 8/10
