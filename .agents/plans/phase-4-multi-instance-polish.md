# Feature: Phase 4 — Multi-Instance & Polish

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Add multi-instance support so multiple orchestrator processes can run simultaneously across different projects while sharing a single Telegram bot token. A global instance registry enables cross-project status reporting and command routing. Edge case hardening adds heartbeat messages, atomic manifest writes, and graceful bot ownership handoff.

## User Story

As a developer running multiple projects simultaneously
I want each project's orchestrator to run independently with clear Telegram routing
So that I can manage multiple autonomous agents from a single Telegram conversation

## Problem Statement

Currently each orchestrator instance starts its own Telegram bot polling connection. Telegram only allows one long-polling connection per bot token — running two instances with the same token causes one to lose its connection. There's no cross-project visibility (`/status all`) and no way to route commands to a specific instance.

## Solution Statement

Introduce a bot ownership protocol: the first instance claims the Telegram polling connection (bot owner), while other instances send notifications directly via the Bot API without polling. A global instance registry at `~/.piv-orchestrator/registry.json` tracks all running instances. The bot owner reads other instances' manifests for cross-project commands. Inter-instance control uses signal files at `.agents/orchestrator.signal`. Edge cases from PRD Section 12 are hardened.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: telegram-bot, telegram-notifier, process-manager, index (entry point)
**Dependencies**: No new libraries — all file-based IPC
**Agent Behavior**: No new decision trees — extends existing orchestration

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `telegram-bot-api-profile.md` — Used for: Bot API constraints on long-polling, sendMessage without polling
  - Key constraint: Only one `getUpdates` connection per bot token at a time
  - sendMessage works independently of polling (stateless HTTP POST)
  - Rate limit: 1 msg/sec per chat (already handled by INTER_MESSAGE_DELAY_MS)

- `anthropic-auth-profile.md` — Used for: No changes — auth is per-instance already
- `claude-agent-sdk-profile.md` — Used for: No changes — sessions are per-instance already

**Impact on Implementation:**
The one-polling-connection constraint is the core driver for the bot ownership protocol. All other tech integrations remain per-instance and unchanged.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `.claude/orchestrator/src/types.ts` (full file) — All type definitions; add registry types here
- `.claude/orchestrator/src/config.ts` (lines 15-48) — Config loading; add registry path
- `.claude/orchestrator/src/index.ts` (full file) — Entry point; major refactor for registry + bot ownership
- `.claude/orchestrator/src/telegram-bot.ts` (full file) — Bot setup; add routing by project prefix
- `.claude/orchestrator/src/telegram-notifier.ts` (full file) — Notification dispatch; add notification-only mode
- `.claude/orchestrator/src/process-manager.ts` (full file) — PID lifecycle; MIRROR for registry
- `.claude/orchestrator/src/telegram-formatter.ts` (lines 63-105) — `formatStatusMessage`; add multi-project format
- `.claude/orchestrator/src/manifest-manager.ts` (lines 34-45) — `writeManifest`; make atomic
- `.claude/orchestrator/src/piv-runner.ts` (lines 90-261) — `runPhase`; add heartbeat

### New Files to Create

- `.claude/orchestrator/src/instance-registry.ts` — Global registry CRUD + bot ownership claims
- `.claude/orchestrator/src/signal-handler.ts` — Signal file write/watch for cross-instance IPC
- `.claude/orchestrator/tests/instance-registry.test.ts` — Registry unit tests
- `.claude/orchestrator/tests/signal-handler.test.ts` — Signal handler unit tests

### Patterns to Follow

**File-based state (MIRROR: process-manager.ts)**:
- JSON read/write with error handling and stale detection
- PID liveness check via `process.kill(pid, 0)` — reuse `isProcessAlive()`
- Create directory if missing, silent on delete failure

**Test pattern (MIRROR: process-manager.test.ts)**:
- `mkdtempSync` for isolated temp dirs per test
- `beforeEach`/`afterEach` with `rmSync` cleanup
- Direct filesystem assertions (`existsSync`, `readFileSync`)

**Mock bot pattern (MIRROR: telegram-notifier.test.ts)**:
- `createMockBot()` factory capturing `sendMessage` calls
- `vi.fn()` for async mock methods

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Types & Registry

Add type definitions and the global instance registry module.

### Phase 2: Core — Bot Ownership & Routing

Refactor Telegram bot to support shared-token multi-instance with routing.

### Phase 3: Integration — Signal Files & Hardening

Add cross-instance IPC via signal files, heartbeat, and atomic writes.

### Phase 4: Testing & Validation

Full test coverage for new modules and updated behavior.

---

## STEP-BY-STEP TASKS

### Task 1: ADD types.ts — Registry and Signal Types

- **IMPLEMENT**: Add to bottom of `types.ts`:
  ```typescript
  // --- Instance Registry Types ---
  export interface RegistryInstance {
    prefix: string;
    projectDir: string;
    pid: number;
    startedAt: string;
    manifestPath: string;
    isBotOwner: boolean;
  }
  export interface InstanceRegistry {
    instances: RegistryInstance[];
    lastUpdated: string;
  }
  // --- Signal Types ---
  export type SignalAction = "go" | "pause" | "resume" | "shutdown";
  export interface SignalMessage {
    action: SignalAction;
    timestamp: string;
    from: string; // prefix of the sender (bot owner)
  }
  ```
- **PATTERN**: Follow existing type grouping with `// --- Section ---` comments
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 2: CREATE instance-registry.ts — Global Registry Manager

- **IMPLEMENT**: New file at `src/instance-registry.ts`
- **Registry path**: `~/.piv-orchestrator/registry.json` (use `os.homedir()`)
- **Functions**:
  - `getRegistryPath(): string` — returns `~/.piv-orchestrator/registry.json`
  - `readRegistry(): InstanceRegistry` — read + parse JSON, return empty if missing/invalid
  - `writeRegistry(registry: InstanceRegistry): void` — write JSON, create dir if needed
  - `pruneStaleInstances(registry: InstanceRegistry): InstanceRegistry` — remove entries where PID is dead (reuse `isProcessAlive` from process-manager)
  - `registerInstance(instance: RegistryInstance): InstanceRegistry` — prune stale first, add or update entry (match by projectDir), write
  - `deregisterInstance(projectDir: string): InstanceRegistry` — remove entry by projectDir, write
  - `findBotOwner(registry: InstanceRegistry): RegistryInstance | null` — find entry with `isBotOwner: true`
  - `claimBotOwnership(projectDir: string): boolean` — prune stale, check if current bot owner is alive; if not, claim ownership, return true; if alive, return false
  - `listActiveInstances(): RegistryInstance[]` — read, prune, return instances
- **PATTERN**: MIRROR `process-manager.ts` for file I/O (sync read/write, try/catch, directory creation)
- **IMPORTS**: `isProcessAlive` from `./process-manager.js`, `os`, `fs`, `path`
- **GOTCHA**: Use `writeFileSync` with `{ flag: 'w' }` and create parent dir with `mkdirSync({ recursive: true })`
- **GOTCHA**: Multiple instances may start simultaneously — `claimBotOwnership` should re-read registry immediately before claiming to minimize race window
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 3: CREATE signal-handler.ts — File-Based IPC

- **IMPLEMENT**: New file at `src/signal-handler.ts`
- **Signal file**: `.agents/orchestrator.signal` in each project dir
- **Functions**:
  - `signalPath(projectDir: string): string` — returns `.agents/orchestrator.signal`
  - `writeSignal(projectDir: string, signal: SignalMessage): void` — write JSON to signal file
  - `readSignal(projectDir: string): SignalMessage | null` — read + parse, return null if missing/invalid
  - `clearSignal(projectDir: string): void` — delete signal file
  - `startSignalWatcher(projectDir: string, onSignal: (signal: SignalMessage) => void, intervalMs?: number): NodeJS.Timeout` — poll signal file every `intervalMs` (default 2000ms). When found, call `onSignal`, then `clearSignal`.
  - `stopSignalWatcher(timer: NodeJS.Timeout): void` — `clearInterval(timer)`
- **PATTERN**: MIRROR `process-manager.ts` — sync file I/O, silent on missing file
- **IMPORTS**: `fs`, `path`, `SignalMessage` from types
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 4: UPDATE config.ts — Add Registry Configuration

- **IMPLEMENT**: Add to `OrchestratorConfig` and `loadConfig()`:
  - `registryEnabled: boolean` — defaults to `true`
  - No new env vars needed — registry path is always `~/.piv-orchestrator/registry.json`
- **PATTERN**: Follow existing env var loading pattern in `loadConfig()`
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 5: UPDATE telegram-notifier.ts — Notification-Only Mode

- **IMPLEMENT**: Modify `TelegramNotifier` constructor to accept a `Bot | null`:
  - When bot is non-null: use `this.bot.api.sendMessage()` as currently (notification-only mode also uses this)
  - The class already only uses `this.bot.api.sendMessage()` — no polling dependency
  - Add a static factory: `static createNotificationOnly(botToken: string, chatId: number, prefix: string): TelegramNotifier` — creates a standalone `Bot` instance (never started) purely for its API
  - This allows non-bot-owner instances to send notifications without conflicting on polling
- **PATTERN**: MIRROR existing constructor, add factory method
- **GOTCHA**: The `Bot` instance created for notification-only does NOT need `bot.start()` — just `new Bot(token)` + use `bot.api`
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 6: UPDATE telegram-bot.ts — Project-Prefix Command Routing

- **IMPLEMENT**: Modify command handlers to support multi-instance routing:
  1. Add `listActiveInstances` import from `instance-registry.ts`
  2. **`/status` handler**:
     - If argument is "all": read registry, read each instance's manifest, format combined status
     - If argument is a prefix: read that instance's manifest, format status
     - If no argument: show current instance status (existing behavior)
  3. **`/go` handler**:
     - If argument is a prefix AND that prefix is not this instance: write signal file to target project dir
     - If no argument and multiple instances: list instances and ask which one
     - If no argument and one instance: start this instance (existing behavior)
  4. **`/pause` and `/resume` handlers**: Same routing logic as `/go`
  5. Add new helper: `formatMultiStatusMessage(instances: RegistryInstance[]): string` in `telegram-formatter.ts`
  6. Update `BOT_COMMANDS` descriptions to mention project prefix support
- **IMPORTS**: `listActiveInstances, findBotOwner` from `./instance-registry.js`, `writeSignal` from `./signal-handler.js`, `readManifest` from `./manifest-manager.js`
- **PATTERN**: MIRROR existing command handlers — `bot.command()` + `controls` pattern
- **GOTCHA**: When routing `/go <prefix>` to another instance, send confirmation to Telegram. Don't start local execution.
- **GOTCHA**: Parse command argument from `ctx.match` — grammY provides `ctx.match` as the text after the command
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 7: UPDATE telegram-formatter.ts — Multi-Project Status Format

- **IMPLEMENT**: Add new function `formatMultiStatusMessage`:
  ```typescript
  export function formatMultiStatusMessage(
    instances: Array<{ prefix: string; manifest: Manifest | null; pid: number }>
  ): string
  ```
  - Format: table showing each project prefix, current phase, and status
  - Include PID for identification
  - Handle cases where manifest can't be read (instance running but manifest inaccessible)
- **PATTERN**: MIRROR `formatStatusMessage` — HTML formatting, escapeHtml
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 8: UPDATE index.ts — Registry Integration & Bot Ownership

- **IMPLEMENT**: Major refactor of the entry point:
  1. **On startup** (after loadConfig, before PID check):
     - Import registry functions
     - If Telegram is configured: call `claimBotOwnership(projectDir)`
     - If claimed: start bot with polling (`bot.start()`)
     - If not claimed: create notification-only notifier via `TelegramNotifier.createNotificationOnly()`
  2. **Register instance** (after PID file write):
     - Call `registerInstance({ prefix, projectDir, pid, startedAt, manifestPath, isBotOwner })`
  3. **Start signal watcher** (if NOT bot owner):
     - Call `startSignalWatcher(projectDir, handleSignal)` where `handleSignal` maps actions to `state.paused`, `state.running`, etc.
  4. **On shutdown** (in `shutdown` handler):
     - `deregisterInstance(projectDir)`
     - `stopSignalWatcher(timer)` if active
     - If was bot owner: other instances will detect on their next `claimBotOwnership` check
  5. **On uncaughtException handler**: also deregister from registry
- **PATTERN**: Follow existing startup sequence in `main()`
- **GOTCHA**: Bot ownership check must happen BEFORE `bot.start()` — if another instance owns it, skip polling
- **GOTCHA**: Signal watcher is only needed for non-bot-owner instances. Bot owner handles commands directly.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 9: UPDATE manifest-manager.ts — Atomic Writes

- **IMPLEMENT**: Change `writeManifest` to use atomic write pattern:
  ```typescript
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
  ```
  - Import `rename` from `node:fs/promises`
  - Wrap in try/catch: if rename fails, fall back to direct write
- **PATTERN**: Standard atomic write pattern (write temp, rename)
- **GOTCHA**: `rename` is atomic on same filesystem (guaranteed on POSIX). The temp file is in the same directory, so this is safe.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit && npm test`

### Task 10: UPDATE piv-runner.ts — Heartbeat Timer

- **IMPLEMENT**: Add heartbeat notification during autonomous execution:
  1. In `runAllPhases()`, start a 30-minute interval timer at the beginning:
     ```typescript
     const heartbeatInterval = notifier ? setInterval(async () => {
       const m = await readManifest(projectDir);
       const phase = getNextUnfinishedPhase(m);
       await notifier.sendText(`💓 Still running — Phase ${phase ?? "?"} in progress`);
     }, 30 * 60 * 1000) : null;
     ```
  2. Clear the interval at the end of `runAllPhases()` (both success and error paths):
     ```typescript
     if (heartbeatInterval) clearInterval(heartbeatInterval);
     ```
  3. Also clear on the `break` path (when stopping due to pending failure)
- **PATTERN**: MIRROR the existing `pauseCheck` pattern — optional, only when notifier exists
- **GOTCHA**: Don't send heartbeat while paused — check `pauseCheck` state. Actually, simplest: the heartbeat function is lightweight and informational. Sending it while paused is acceptable (human wants to know it's alive).
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 11: UPDATE telegram-bot.ts — Bot Ownership Awareness in Handlers

- **IMPLEMENT**: Add `OrchestratorControls.registryEnabled` boolean and `OrchestratorControls.projectPrefix` string to the interface so handlers can check multi-instance state
- Update `/status` to use `ctx.match` for argument parsing:
  ```typescript
  bot.command("status", async (ctx) => {
    const arg = ctx.match?.trim();
    if (arg === "all") {
      // Multi-project status
      const instances = listActiveInstances();
      // Read each manifest...
    } else if (arg) {
      // Specific project status
    } else {
      // Current project (existing behavior)
    }
  });
  ```
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 12: CREATE tests/instance-registry.test.ts

- **IMPLEMENT**: Unit tests for all registry functions:
  - `readRegistry` returns empty when file missing
  - `registerInstance` adds entry and writes file
  - `registerInstance` updates entry when projectDir matches
  - `deregisterInstance` removes entry by projectDir
  - `pruneStaleInstances` removes entries with dead PIDs (use PID 999999999)
  - `claimBotOwnership` returns true when no current owner
  - `claimBotOwnership` returns false when alive owner exists
  - `claimBotOwnership` returns true when owner PID is dead (claims ownership)
  - `listActiveInstances` returns pruned list
  - `findBotOwner` returns correct entry
- **PATTERN**: MIRROR `process-manager.test.ts` — temp dirs, beforeEach/afterEach cleanup
- **GOTCHA**: Override registry path in tests — either mock `os.homedir()` or add an optional `registryPath` param to functions for testability
- **VALIDATE**: `cd .claude/orchestrator && npm test`

### Task 13: CREATE tests/signal-handler.test.ts

- **IMPLEMENT**: Unit tests:
  - `writeSignal` creates JSON file at correct path
  - `readSignal` returns null when file missing
  - `readSignal` returns parsed signal when file exists
  - `clearSignal` removes the file
  - `startSignalWatcher` calls onSignal when signal file appears
  - `startSignalWatcher` clears signal after processing
  - `stopSignalWatcher` stops polling
- **PATTERN**: MIRROR `process-manager.test.ts` — temp dirs
- **GOTCHA**: Use `vi.useFakeTimers()` for testing the polling interval, or use short intervals (50ms) for real-time tests
- **VALIDATE**: `cd .claude/orchestrator && npm test`

### Task 14: UPDATE tests/telegram-formatter.test.ts — Multi-Status

- **IMPLEMENT**: Add test suite for `formatMultiStatusMessage`:
  - Formats HTML with multiple project entries
  - Shows phase status per project
  - Handles null manifest (instance running but manifest unreadable)
  - Escapes HTML in project prefixes
- **PATTERN**: MIRROR existing `formatStatusMessage` tests
- **VALIDATE**: `cd .claude/orchestrator && npm test`

### Task 15: UPDATE tests/state-machine.test.ts — All Phases Done

- **IMPLEMENT**: Verify `determineNextAction` returns `"done"` when all 4 phases complete (current tests only use 2 phases). Add test with 4-phase manifest matching production state.
- **VALIDATE**: `cd .claude/orchestrator && npm test`

### Task 16: UPDATE .env.example — Document Multi-Instance

- **IMPLEMENT**: Add comment section explaining multi-instance behavior:
  ```
  # Multi-instance: When running multiple projects with the same bot token,
  # the first instance to start owns the Telegram polling connection.
  # Other instances can still SEND notifications.
  # Use /status all in Telegram to see all running instances.
  # Set unique TELEGRAM_PROJECT_PREFIX per project for clarity.
  ```
- **VALIDATE**: Read the file and verify it's clear

### Task 17: ADD .gitignore — Registry and Signal Files

- **IMPLEMENT**: Add to `.gitignore`:
  ```
  # PIV Orchestrator runtime artifacts
  .agents/orchestrator.pid
  .agents/orchestrator.signal
  .agents/orchestrator.log
  ```
  - Verify these aren't already tracked by git
- **VALIDATE**: `git status` — confirm no untracked runtime files

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| Single instance startup | Registers in registry, claims bot ownership, starts polling | Registry dir missing → creates it | Registry updated, PID file written |
| Second instance startup | Registers, notification-only mode, starts signal watcher | Bot owner alive → skip polling | Registry has 2 entries, only 1 bot owner |
| `/status all` | Returns both instances' phase status | Manifest unreadable → shows "unavailable" | None (read-only) |
| `/go project-b` from Telegram | Writes signal to project-b's dir | Instance not in registry → error message | Signal file created, cleared after read |
| Instance shutdown | Deregisters from registry, removes PID | Crash without deregister → pruned on next startup | Registry entry removed |
| Bot owner shutdown | Deregisters, stops bot | Next instance claims ownership on restart | Bot ownership transfers |
| Heartbeat | Message every 30 min during execution | Telegram send fails → logged, continues | None |
| Atomic manifest write | Writes temp file, renames | Rename fails → falls back to direct write | Manifest updated atomically |

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-010: Multiple Simultaneous Instances | Start 2 instances on different projects. Verify both register, messages are tagged, `/status all` shows both, killing one doesn't affect other | Both instances run independently, Telegram messages clearly tagged, registry accurate |

### Acceptance Criteria

- [ ] Two orchestrator instances run simultaneously on different projects
- [ ] Only one instance polls Telegram (bot owner)
- [ ] Both instances send Telegram notifications with correct project prefix
- [ ] `/status all` from Telegram shows all running instances with their phase status
- [ ] `/go <prefix>` routes to the correct instance via signal file
- [ ] `/pause <prefix>` and `/resume <prefix>` route correctly
- [ ] Killing one instance doesn't affect the other
- [ ] Killed instance is pruned from registry on next operation
- [ ] Heartbeat messages sent every 30 minutes during autonomous execution
- [ ] Manifest writes are atomic (temp file + rename)
- [ ] All existing tests continue to pass
- [ ] SC-010 scenario passes

---

## TESTING STRATEGY

### Unit Tests

New test files:
- `tests/instance-registry.test.ts` — Registry CRUD, bot ownership claims, stale pruning
- `tests/signal-handler.test.ts` — Signal file write/read/watch/clear

Updated test files:
- `tests/telegram-formatter.test.ts` — Multi-project status formatting
- `tests/state-machine.test.ts` — 4-phase completion

Framework: vitest (existing). Mocking: `vi.fn()`, `vi.useFakeTimers()`.

### Integration Tests

- Start registry with two mock instances, verify bot ownership protocol
- Write signal, verify watcher picks it up and clears it
- Verify atomic manifest write survives concurrent reads

### Edge Cases

- Two instances start simultaneously (race on bot ownership) → first to write wins
- Bot owner crashes without deregistering → next startup prunes stale entry
- Signal file written while instance is shutting down → file left on disk, cleared on next startup
- Registry file corrupted → fallback to empty registry
- Instance directory deleted while registered → pruned by manifest read failure
- Telegram rate limit on multi-instance notifications → existing auto-retry handles this

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd .claude/orchestrator && npx tsc --noEmit
```

**Expected**: Exit code 0, no type errors

### Level 2: Unit Tests

```bash
cd .claude/orchestrator && npm test
```

**Expected**: All tests pass including new registry and signal tests

### Level 3: Integration Test

```bash
# Manual: Start instance A
cd /tmp/test-project-a && PIV_PROJECT_DIR=/tmp/test-project-a node .claude/orchestrator/dist/index.js --dry-run

# Manual: Verify registry
cat ~/.piv-orchestrator/registry.json
```

### Level 4: SC-010 Verification

Start two instances, verify:
1. Both registered in `~/.piv-orchestrator/registry.json`
2. Only one has `isBotOwner: true`
3. Both can send Telegram messages (check Telegram chat)
4. `/status all` shows both
5. Kill one → other unaffected, registry cleaned on next operation

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No type checking errors (npx tsc --noEmit)
- [ ] Build succeeds (npm run build)
- [ ] All acceptance criteria met
- [ ] SC-010 scenario passes
- [ ] Existing Phases 1-3 tests unaffected

---

## NOTES

### Decision Log (from Phase 0 Scope Analysis)

1. **Project identifier**: Keep existing `TELEGRAM_PROJECT_PREFIX` (defaults to `basename(projectDir)`). Already implemented in `config.ts:39`. No change needed.

2. **Bot sharing strategy**: Bot ownership protocol chosen over alternatives:
   - ❌ Multiple bot tokens (PRD says "single bot token")
   - ❌ Webhook mode (needs HTTP server infrastructure — violates "no external infrastructure")
   - ❌ Centralized gateway process (too complex for MVP)
   - ✅ Bot ownership + notification-only mode (minimal new code, file-based, matches patterns)

3. **IPC mechanism**: Signal files chosen over alternatives:
   - ❌ Unix sockets (platform-specific, stateful, more complex)
   - ❌ HTTP server per instance (infrastructure overhead)
   - ✅ Signal files (file-based, matches manifest pattern, simple polling)

4. **Registry location**: `~/.piv-orchestrator/registry.json` (home dir, not project dir) because the registry is cross-project by definition. Using home dir prevents any project's `.gitignore` from affecting discovery.

5. **Atomic writes**: Using POSIX `rename()` which is guaranteed atomic on same filesystem. Temp file is written to same directory as manifest (`.agents/manifest.yaml.tmp`) so rename is always same-fs.

6. **PRD gap**: PRD does not specify what happens when the bot-owning instance shuts down and other instances are still running. Assumed: other instances continue in notification-only mode. The next instance to START (or an existing instance on its next registry check) will claim bot ownership. If no instance claims ownership, Telegram command receiving stops but notification sending continues.

### Risk Assessment

- **Race condition on bot ownership**: Two instances starting simultaneously. Minimized by re-reading registry before claiming. Worst case: both claim, one gets disconnected by Telegram — grammY's error handler catches this, and the instance falls back to notification-only.
- **Stale registry entries**: Handled identically to stale PID files — PID liveness check prunes dead entries.
- **Signal file timing**: 2-second polling delay for pause/resume commands. Acceptable for human-initiated operations.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 4 from PRD
independent_tasks_count: 7
dependent_chains: 3
technologies_consumed: telegram-bot-api,anthropic-auth,claude-agent-sdk
next_suggested_command: execute
next_arg: ".agents/plans/phase-4-multi-instance-polish.md"
estimated_complexity: medium
confidence: 8/10
