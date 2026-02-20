# Feature: Phase 6 — Monitor Loop & Stall Detection

The following plan should be complete, but validate documentation and codebase patterns before implementing.

## Feature Description

Build the supervisor's persistent monitor loop that polls `~/.piv/registry.yaml` every 15 minutes, detects stalled orchestrators, classifies stall type (crash, agent-waiting, session-hung), recovers from simple stalls autonomously, and escalates human-required issues via Telegram. This is the core runtime of the PIV Supervisor — everything after Phase 5's bootstrap depends on this loop running.

## User Story

As a developer running multiple agent projects overnight,
I want a supervisor that detects stalls and restarts orchestrators automatically,
So that I wake up to completed agents instead of stuck pipelines.

## Problem Statement

When orchestrators stall (crash, hang, or wait for input), the entire project stops until a human notices and intervenes. Overnight or during long runs, this means hours of wasted time.

## Solution Statement

A zero-cost polling loop (no AI tokens) that reads the central registry, checks heartbeat freshness and PID liveness, classifies stalls, kills stuck processes, restarts orchestrators from the correct phase, and sends Telegram notifications only for genuinely human-required issues.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: `supervisor/src/`, `~/.piv/registry.yaml`
**Dependencies**: Phase 5 (registry + heartbeat), Telegram Bot API (escalation)
**Agent Behavior**: Yes — implements decision trees from PRD Section 4.2

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `telegram-bot-api-profile.md` — Used for: Escalation notifications to human operator
  - Key endpoints: `getMe` (health check), `sendMessage` (escalation), `getUpdates` + `answerCallbackQuery` (acknowledgment)
  - Auth method: Bot token via `TELEGRAM_BOT_TOKEN`
  - Critical constraints: 4096 char message limit, 1 msg/sec per chat, HTML parse mode (not MarkdownV2)
  - Implementation: Direct HTTP via `fetch` + `@grammyjs/types` for type safety (profile Section 6 recommendation)

- `anthropic-agent-sdk-profile.md` — Referenced but NOT used in Phase 6
  - Phase 6 scope excludes diagnosis sessions. Agent SDK sessions are Phase 7.
  - Restart mechanism uses `child_process.spawn()` not SDK `query()`.

**Impact on Implementation:**
Telegram is the only external service. The monitor loop itself is pure TypeScript — zero network calls during healthy monitoring. Telegram calls happen only on escalation.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `supervisor/src/registry.ts` (lines 1-151) — Central registry CRUD. MIRROR `readCentralRegistry()`, `isProcessAlive()`, `pruneDeadProjects()` patterns.
- `supervisor/src/types.ts` (lines 1-36) — Existing types: `ProjectStatus`, `RegistryProject`, `CentralRegistry`. Extend here.
- `supervisor/src/index.ts` (lines 1-131) — CLI entry point. Add `monitor` subcommand here.
- `.claude/orchestrator/src/heartbeat.ts` (lines 90-175) — How orchestrator writes heartbeats. Monitor reads what this writes.
- `.claude/orchestrator/src/process-manager.ts` (lines 68-99) — `isProcessAlive()` pattern (already duplicated in registry.ts).
- `.claude/orchestrator/src/telegram-notifier.ts` (lines 1-183) — Orchestrator's Telegram pattern. Supervisor uses direct HTTP instead.
- `.claude/orchestrator/src/telegram-formatter.ts` (lines 1-16) — `escapeHtml()` utility. Reimplement in supervisor (no cross-package import).
- `.claude/orchestrator/src/piv-runner.ts` (lines 484-589) — `runAllPhases()` shows how orchestrator is started and how it handles restart.
- `supervisor/tests/registry.test.ts` (lines 1-229) — Test patterns: tmpDir setup, `makeProject()` fixture, afterEach cleanup.

### New Files to Create

- `supervisor/src/monitor.ts` — Registry polling loop, heartbeat staleness check
- `supervisor/src/classifier.ts` — Stall type classification (4 categories)
- `supervisor/src/recovery.ts` — Kill process, restart orchestrator, agent-waiting recovery
- `supervisor/src/telegram.ts` — Direct HTTP Telegram client (sendMessage, getMe, getUpdates, answerCallbackQuery)
- `supervisor/src/improvement-log.ts` — Append-only log of all interventions
- `supervisor/src/config.ts` — Supervisor configuration (env vars, defaults)
- `supervisor/tests/monitor.test.ts` — Monitor loop unit tests
- `supervisor/tests/classifier.test.ts` — Stall classification tests
- `supervisor/tests/recovery.test.ts` — Recovery action tests
- `supervisor/tests/telegram.test.ts` — Telegram client tests
- `supervisor/tests/improvement-log.test.ts` — Log writer tests

### Patterns to Follow

**Naming**: camelCase functions, PascalCase types/interfaces, kebab-case files. MIRROR: `supervisor/src/registry.ts`
**Error Handling**: Never throw from monitor loop. All I/O wrapped in try/catch. MIRROR: `heartbeat.ts:128-131`
**Testing**: Vitest, tmpDir fixtures, `beforeEach`/`afterEach` cleanup. MIRROR: `supervisor/tests/registry.test.ts`
**Exports**: Named exports, no default exports. MIRROR: all existing supervisor modules.
**Config**: Read from `process.env` with sensible defaults. MIRROR: `.claude/orchestrator/src/config.ts`

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Decision: Stall Classification** (PRD Section 4.2)
- IF heartbeat stale AND PID dead → `orchestrator_crashed`
- ELSE IF heartbeat stale AND PID alive AND manifest has blocking notification → `agent_waiting_for_input`
- ELSE IF heartbeat stale AND PID alive AND manifest `last_updated` stale → `session_hung`
- ELSE IF heartbeat stale AND PID alive AND manifest shows error → `execution_error`
- ON FAILURE to classify → escalate with full context

**Decision: Recovery from Agent-Waiting-For-Input** (PRD Section 4.2)
- IF first occurrence for this phase → kill session, restart with autonomous preamble
- ELSE IF second occurrence same phase → restart with augmented "do not ask" prompt
- ELSE IF third occurrence → escalate ("Phase N keeps requesting human input")

**Decision: Fix or Escalate** (PRD Section 4.2 — Phase 6 subset)
- IF stall is `orchestrator_crashed` → restart from last known phase (silent recovery)
- ELSE IF stall is `agent_waiting_for_input` → kill + restart with preamble (escalate after 3)
- ELSE IF stall is `session_hung` → kill + restart (escalate after 2)
- ELSE IF stall is `execution_error` → log details, escalate to Telegram (Phase 7 adds diagnosis)

### Scenario Mappings

| Scenario | Agent Workflow | Decision Tree | Success Criteria |
|---|---|---|---|
| SC-001: Healthy Monitoring | Read registry, check all heartbeats, all fresh → return to idle | None (no stall) | No intervention triggered |
| SC-005: Agent Waiting | Detect stale heartbeat + PID alive, classify as waiting, kill + restart with preamble | Stall Classification → Agent-Waiting Recovery | Session restarted, escalate after 3 |
| SC-006: Orchestrator Crash | Detect PID dead, restart from last phase in registry | Stall Classification → Crash Recovery | Orchestrator restarted at correct phase |
| SC-007: Human Escalation | Detect `integration_auth`, send Telegram with details | Fix or Escalate | Telegram message sent with actionable details |

### Error Recovery Patterns

- Telegram unavailable → Log to improvement-log.md, retry next cycle
- Registry file corrupted → Rebuild from filesystem scan (existing `readCentralRegistry()` returns empty on parse failure)
- Kill signal fails (EPERM) → Escalate to Telegram: "Cannot kill PID {pid}, manual intervention needed"
- Spawn fails → Log error, escalate, retry next cycle

---

## FOUNDATION

**Generation:** 2 | **Active PRD:** `PRD.md`

### What Gen 1 Already Implemented

| Phase | Name | Delivered |
|-------|------|-----------|
| 1 | Core Orchestration Engine | Session management, state machine, manifest, error classifier, git checkpoints |
| 2 | Telegram Interface | Grammy bot, formatter, notifier, approval flow, message chunking |
| 3 | VS Code Integration & Resilience | Signal handling, process manager, PID file, heartbeat |
| 4 | Multi-Instance Polish | Instance registry, context scoring, drift detection, fidelity, budgets |

### Key Existing Files (Do Not Recreate)

- `supervisor/src/registry.ts` — Central registry CRUD + PID liveness
- `supervisor/src/init.ts` — `piv init` bootstrapper
- `supervisor/src/version.ts` — Git version computation
- `supervisor/src/types.ts` — Extend, don't replace

### Architecture Established in Gen 1

- TypeScript + Vitest + js-yaml across all packages
- Central registry at `~/.piv/registry.yaml` as single state source
- Orchestrator writes heartbeats every 2 min via `startHeartbeat()`
- Manifest-driven state machine for phase progression
- PID liveness via `process.kill(pid, 0)`

### Gen 2 Adds (This Plan's Scope)

- Persistent supervisor monitor loop (15-min polling)
- Stall classification (4 types)
- Autonomous crash + agent-waiting recovery
- Telegram escalation for human-required issues
- Improvement log for intervention history

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Types, Config, Telegram Client

Set up shared types, configuration, and the Telegram HTTP client that all other modules depend on.

### Phase 2: Core — Monitor Loop, Classifier, Recovery

Implement the monitor polling loop, stall classification, and recovery actions (kill, restart, escalate).

### Phase 3: Integration — CLI, Improvement Log, Orchestrator Spawn

Wire everything into the CLI entry point, add the improvement log writer, and implement orchestrator process spawning.

### Phase 4: Testing & Validation

Unit tests for all modules, integration test for full monitor cycle.

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| Monitor cycle | Read registry, all fresh → idle | Registry missing, YAML corrupt | None |
| Crash detection | PID dead → restart orchestrator | Restart fails, spawn error | Registry status → running |
| Agent-waiting | PID alive + stale → kill + restart | Kill fails (EPERM) | Restart count incremented |
| Escalation | Send Telegram message | 401/403/429 errors | improvement-log.md appended |
| 3rd agent-waiting | Escalate to Telegram after 3 | Telegram unreachable | Log + retry next cycle |

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-001 | Register 3 projects, all fresh heartbeats, run monitor cycle | Zero interventions triggered |
| SC-005 | Register project with stale heartbeat + alive PID, run monitor | Session killed, restart spawned |
| SC-006 | Register project with dead PID, run monitor | Orchestrator restarted from correct phase |
| SC-007 | Register project with `integration_auth` error, run monitor | Telegram escalation sent |

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `supervisor/src/types.ts` — Add Phase 6 Types

- **IMPLEMENT**: Add `StallType`, `StallClassification`, `MonitorConfig`, `RecoveryAction`, `ImprovementLogEntry`, `TelegramConfig`, `TelegramResponse` types
- **PATTERN**: MIRROR existing type style in `supervisor/src/types.ts:1-36`
- **IMPORTS**: None (pure type definitions)
- **GOTCHA**: Export `ProjectStatus` type is already `"idle" | "running" | "stalled" | "complete" | "error"` — the stall types are separate from project status
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

```typescript
// Add these types:
export type StallType = "orchestrator_crashed" | "agent_waiting_for_input" | "execution_error" | "session_hung";

export interface StallClassification {
  project: RegistryProject;
  stallType: StallType;
  confidence: "high" | "medium" | "low";
  details: string;
  heartbeatAgeMs: number;
}

export interface MonitorConfig {
  intervalMs: number;             // default: 15 * 60 * 1000
  heartbeatStaleMs: number;       // default: 15 * 60 * 1000
  maxRestartAttempts: number;     // default: 3
  registryPath?: string;
  telegramToken?: string;
  telegramChatId?: number;
  improvementLogPath: string;     // default: ~/.piv/improvement-log.md
  supervisorPidPath: string;      // default: ~/.piv/supervisor.pid
}

export interface RecoveryAction {
  type: "restart" | "restart_with_preamble" | "escalate" | "skip";
  project: RegistryProject;
  stallType: StallType;
  details: string;
  restartCount: number;           // how many times this project+phase has been restarted
}

export interface ImprovementLogEntry {
  timestamp: string;
  project: string;
  phase: number | null;
  stallType: StallType;
  action: string;
  outcome: string;
  details: string;
}

export interface SupervisorTelegramConfig {
  token: string;
  chatId: number;
}
```

### Task 2: CREATE `supervisor/src/config.ts` — Supervisor Configuration

- **IMPLEMENT**: Read env vars `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PIV_MONITOR_INTERVAL_MS`. Return `MonitorConfig` with defaults.
- **PATTERN**: MIRROR `.claude/orchestrator/src/config.ts` style
- **IMPORTS**: `homedir` from `node:os`, `join` from `node:path`
- **GOTCHA**: Never read `ANTHROPIC_API_KEY` (CLAUDE.md rule). Telegram config is optional — monitor works without it (just can't escalate).
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 3: CREATE `supervisor/src/telegram.ts` — Direct HTTP Telegram Client

- **IMPLEMENT**: Thin wrapper over `fetch` for Telegram Bot API. Functions: `telegramGetMe()`, `telegramSendMessage()`, `telegramSendEscalation()`, `escapeHtml()`. No framework dependency.
- **PROFILE**: Telegram profile Section 3.1 (getMe), 3.2 (sendMessage), Section 6 (thin wrapper pattern), Section 7 Gotcha 1 (use HTML not MarkdownV2), Gotcha 3 (4096 char limit), Gotcha 7 (escape dynamic content)
- **IMPORTS**: `SupervisorTelegramConfig` from types. `@grammyjs/types` for type safety (install in Task 4).
- **GOTCHA**: Message text > 4096 chars → split at newline boundaries. Always escape dynamic content with `escapeHtml()`. Parse mode fallback: if HTML parse fails (400), retry without parse_mode.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

Template for escalation message:
```html
<b>🔴 Supervisor Escalation</b>

<b>Project:</b> {name}
<b>Phase:</b> {phase}
<b>Stall Type:</b> {stallType}
<b>Details:</b> {details}
<b>Action Taken:</b> {actionTaken}
<b>Restarts:</b> {count}/{max}
```

### Task 4: UPDATE `supervisor/package.json` — Add @grammyjs/types

- **IMPLEMENT**: Add `"@grammyjs/types": "^3.16.0"` to devDependencies
- **GOTCHA**: This is types-only — zero runtime footprint. Do NOT add `grammy` itself.
- **VALIDATE**: `cd supervisor && npm install && npx tsc --noEmit`

### Task 5: CREATE `supervisor/src/classifier.ts` — Stall Classification

- **IMPLEMENT**: `classifyStall(project, config)` function implementing PRD Section 4.2 "Stall Classification" decision tree.
- **PATTERN**: MIRROR `isProcessAlive()` from `supervisor/src/registry.ts:123-132`
- **IMPORTS**: `RegistryProject`, `StallClassification`, `StallType`, `MonitorConfig` from types. `readFileSync`, `existsSync` from `node:fs`.
- **GOTCHA**: Heartbeat string is ISO 8601 — parse with `new Date(heartbeat).getTime()` and compare to `Date.now()`. Handle missing heartbeat (never written) as stale.

Logic:
1. Parse heartbeat → compute age in ms
2. If age < staleMs → not stalled (return null)
3. Check PID liveness via `process.kill(pid, 0)`
4. PID dead → `orchestrator_crashed` (high confidence)
5. PID alive → read project manifest for clues:
   - Manifest has `failures[]` with `resolution: pending` → `execution_error`
   - Manifest `last_updated` also stale (>15 min) → `session_hung`
   - Default → `session_hung` (Phase 7 adds log-based agent_waiting detection)
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 6: CREATE `supervisor/src/recovery.ts` — Recovery Actions

- **IMPLEMENT**: `determineRecovery(classification, restartHistory)` and `executeRecovery(action, config)` functions.
- **PATTERN**: MIRROR orchestrator's process management in `.claude/orchestrator/src/process-manager.ts`
- **IMPORTS**: `RecoveryAction`, `StallClassification`, `MonitorConfig` from types. `spawn` from `node:child_process`. `existsSync`, `readFileSync` from `node:fs`.

`determineRecovery()` logic (PRD Section 4.2):
- `orchestrator_crashed` → `restart` (always, from last known phase)
- `session_hung` → `restart` (escalate after 2 attempts at same phase)
- `agent_waiting_for_input` → `restart_with_preamble` (escalate after 3)
- `execution_error` → `escalate` (Phase 7 adds diagnosis)

`executeRecovery()` logic:
- `restart`: Kill PID via SIGTERM, wait 2s, verify dead, spawn new orchestrator via `npx tsx .claude/orchestrator/src/index.ts` with `detached: true`, `stdio: 'ignore'`. Unref child so supervisor doesn't wait.
- `restart_with_preamble`: Same as restart but set env var `PIV_AUTONOMOUS_PREAMBLE=strict` that orchestrator can read.
- `escalate`: Call `telegramSendEscalation()` if config has Telegram, else log only.
- `skip`: Do nothing (for non-stalled projects).

- **GOTCHA**: `process.kill(pid, 'SIGTERM')` can throw if PID doesn't exist — wrap in try/catch. After kill, `setTimeout` 2s then verify PID is dead before spawning new process. Use `spawn()` with `cwd` set to project path.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 7: CREATE `supervisor/src/improvement-log.ts` — Intervention Logger

- **IMPLEMENT**: `appendToImprovementLog(entry, logPath)` that appends markdown entries to `~/.piv/improvement-log.md`.
- **IMPORTS**: `ImprovementLogEntry` from types. `appendFileSync`, `existsSync`, `mkdirSync` from `node:fs`.
- **FORMAT**:
```markdown
### {timestamp} — {project} (Phase {phase})
- **Stall:** {stallType}
- **Action:** {action}
- **Outcome:** {outcome}
- **Details:** {details}
```
- **GOTCHA**: Create parent directory if missing. Never throw — wrap in try/catch (best-effort logging).
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 8: CREATE `supervisor/src/monitor.ts` — Main Monitor Loop

- **IMPLEMENT**: `runMonitorCycle(config)` (single cycle) and `startMonitor(config)` (persistent loop with setInterval).
- **IMPORTS**: `readCentralRegistry`, `writeCentralRegistry` from registry. `classifyStall` from classifier. `determineRecovery`, `executeRecovery` from recovery. `appendToImprovementLog` from improvement-log. `telegramSendMessage` from telegram. `MonitorConfig`, `StallClassification` from types.

`runMonitorCycle()` logic:
1. Read registry via `readCentralRegistry(config.registryPath)`
2. For each project where `status === "running"`:
   a. Call `classifyStall(project, config)` → returns null (healthy) or StallClassification
   b. If null → skip (healthy)
   c. Track restart count from in-memory `Map<string, { phase: number; count: number }>`
   d. Call `determineRecovery(classification, restartCount)`
   e. Call `executeRecovery(action, config)`
   f. Call `appendToImprovementLog()` with result
   g. Update registry project status (stalled/running/error)
   h. Write registry back
3. Prune dead projects (PID dead + not stalled-by-monitor → set idle)
4. Log cycle summary to stdout: "Monitor cycle complete: N projects, N stalled, N recovered"

`startMonitor()` logic:
1. Check supervisor PID file — if another monitor is running, exit with error
2. Write supervisor PID file
3. Run initial cycle immediately
4. Set up `setInterval(runMonitorCycle, config.intervalMs)`
5. Handle SIGINT/SIGTERM: clean up PID file, clear interval, exit gracefully

- **GOTCHA**: Restart count map is in-memory — resets when supervisor restarts. This is acceptable: if supervisor restarts, escalation counts reset, giving the system a fresh chance. Phase 7 can persist counts to registry.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 9: UPDATE `supervisor/src/index.ts` — Add `monitor` Subcommand

- **IMPLEMENT**: Add `monitor` command to CLI that calls `startMonitor()`.
- **PATTERN**: MIRROR existing `handleInit()` and `handleStatus()` pattern in `supervisor/src/index.ts`
- **IMPORTS**: `startMonitor` from monitor, `loadMonitorConfig` from config.

Add to CLI:
```
piv monitor                    Start the supervisor monitor loop
piv monitor --once             Run a single monitoring cycle and exit
```

Update `printUsage()` and main command dispatch.

- **GOTCHA**: `--once` flag useful for testing — runs `runMonitorCycle()` once then exits.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 10: CREATE `supervisor/tests/classifier.test.ts` — Classification Tests

- **IMPLEMENT**: Test all 4 stall types + healthy (no stall) case.
- **PATTERN**: MIRROR `supervisor/tests/registry.test.ts` fixture pattern
- Tests:
  - Healthy project (fresh heartbeat) → returns null
  - Dead PID + stale heartbeat → `orchestrator_crashed`
  - Alive PID + stale heartbeat + no manifest clues → `session_hung`
  - Alive PID + stale heartbeat + pending failure in manifest → `execution_error`
  - Missing heartbeat (never written) → `orchestrator_crashed`
  - Heartbeat exactly at threshold boundary → not stalled
- **VALIDATE**: `cd supervisor && npx vitest run tests/classifier.test.ts`

### Task 11: CREATE `supervisor/tests/recovery.test.ts` — Recovery Tests

- **IMPLEMENT**: Test recovery determination and action execution (mock spawn/kill).
- Tests:
  - `orchestrator_crashed` → `restart` action
  - `session_hung` first occurrence → `restart` action
  - `session_hung` third occurrence → `escalate` action
  - `agent_waiting` first occurrence → `restart_with_preamble`
  - `agent_waiting` third occurrence → `escalate`
  - `execution_error` → always `escalate`
  - Kill PID that doesn't exist → no throw, logs warning
- **GOTCHA**: Mock `child_process.spawn()` and `process.kill()` in tests. Use `vi.mock()`.
- **VALIDATE**: `cd supervisor && npx vitest run tests/recovery.test.ts`

### Task 12: CREATE `supervisor/tests/telegram.test.ts` — Telegram Client Tests

- **IMPLEMENT**: Test message formatting, HTML escaping, message chunking, error handling.
- Tests:
  - `escapeHtml()` escapes `<`, `>`, `&`
  - Escalation message format matches expected HTML template
  - Message > 4096 chars gets split at newline boundaries
  - Each chunk ≤ 4096 chars
  - `getMe()` with mock fetch returns bot info
  - `sendMessage()` with mock fetch returns message_id
  - 429 response triggers retry logic
  - 401 response treated as fatal (no retry)
- **GOTCHA**: Mock `global.fetch` in tests with `vi.fn()`.
- **VALIDATE**: `cd supervisor && npx vitest run tests/telegram.test.ts`

### Task 13: CREATE `supervisor/tests/monitor.test.ts` — Monitor Loop Tests

- **IMPLEMENT**: Test full monitor cycle with mock registry, mock processes, mock Telegram.
- Tests:
  - Healthy cycle: 3 projects all fresh → no interventions, log "0 stalled"
  - One crashed: 3 projects, 1 dead PID → restart triggered, log updated
  - One stalled + Telegram configured → escalation sent
  - Empty registry → clean cycle, no errors
  - Corrupt registry → handled gracefully, no throw
  - PID file prevents duplicate supervisor instances
  - SIGINT cleans up PID file
  - `--once` flag runs single cycle
- **GOTCHA**: Use `vi.useFakeTimers()` for interval tests. Mock `readCentralRegistry`, `spawn`, `process.kill`.
- **VALIDATE**: `cd supervisor && npx vitest run tests/monitor.test.ts`

### Task 14: CREATE `supervisor/tests/improvement-log.test.ts` — Log Writer Tests

- **IMPLEMENT**: Test append-only log writing.
- Tests:
  - Creates log file if missing
  - Creates parent directory if missing
  - Appends entry in correct markdown format
  - Multiple entries accumulate (don't overwrite)
  - Never throws even with invalid path (try/catch swallows)
- **VALIDATE**: `cd supervisor && npx vitest run tests/improvement-log.test.ts`

### Task 15: Run Full Test Suite

- **VALIDATE**: `cd supervisor && npx vitest run`
- **EXPECTED**: All existing tests (Phase 5) + all new tests pass
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`
- **EXPECTED**: Zero type errors

---

## TESTING STRATEGY

### Unit Tests

Vitest with tmpDir fixtures for filesystem tests, `vi.mock()` for process/network mocks.
- classifier.test.ts: 6+ tests covering all stall types + edge cases
- recovery.test.ts: 7+ tests covering all recovery paths + error handling
- telegram.test.ts: 8+ tests covering formatting, splitting, API calls, error codes
- monitor.test.ts: 8+ tests covering full cycle, edge cases, PID file, signals
- improvement-log.test.ts: 5+ tests covering file creation, append, error handling

### Integration Tests

- Run `piv monitor --once` against a mock registry with pre-configured projects
- Verify intervention actions were taken and improvement-log.md was written

### Edge Cases

- Heartbeat timestamp in the future (clock skew) → treat as fresh
- PID reuse (OS assigned same PID to different process) → acceptable false-negative risk
- Registry file locked by another process → read failure handled gracefully
- Orchestrator spawns but immediately crashes → detected on next cycle as `orchestrator_crashed`
- Telegram bot token revoked mid-operation → 401 logged, monitor continues without escalation

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd supervisor && npx tsc --noEmit
```

**Expected**: Exit code 0, zero type errors

### Level 2: Unit Tests

```bash
cd supervisor && npx vitest run
```

**Expected**: All tests pass (existing Phase 5 tests + new Phase 6 tests)

### Level 3: Live Integration Tests

```bash
# Tier 1: Telegram connectivity (from telegram-bot-api profile Section 9.3)
cd supervisor && npx tsx -e "
import { telegramGetMe } from './src/telegram.js';
const config = { token: process.env.TELEGRAM_BOT_TOKEN!, chatId: Number(process.env.TELEGRAM_CHAT_ID!) };
const res = await telegramGetMe(config);
console.log('Tier 1:', res.ok ? 'PASS' : 'FAIL', JSON.stringify(res.result ?? res));
"

# Tier 2: Send test message (from telegram-bot-api profile Section 9.3)
cd supervisor && npx tsx -e "
import { telegramSendMessage } from './src/telegram.js';
const config = { token: process.env.TELEGRAM_BOT_TOKEN!, chatId: Number(process.env.TELEGRAM_CHAT_ID!) };
const res = await telegramSendMessage(config, '🧪 Supervisor Phase 6 integration test');
console.log('Tier 2:', res.ok ? 'PASS' : 'FAIL');
"

# Tier 2b: Verify monitor reads real registry
cd supervisor && npx tsx -e "
import { readCentralRegistry } from './src/registry.js';
const reg = readCentralRegistry();
console.log('Registry read:', Object.keys(reg.projects).length, 'projects');
console.log('Tier 2b: PASS');
"
```

### Level 4: Live Integration Validation

```bash
# End-to-end: Run single monitor cycle against real registry
cd supervisor && npx tsx -e "
import { runMonitorCycle } from './src/monitor.js';
import { loadMonitorConfig } from './src/config.js';
const config = loadMonitorConfig();
config.intervalMs = 0; // don't loop
const result = await runMonitorCycle(config);
console.log('Monitor cycle result:', result);
console.log('Tier 4: PASS');
"

# Verify improvement log was created (even if empty cycle)
ls -la ~/.piv/improvement-log.md 2>/dev/null || echo "No interventions logged (clean cycle)"
```

---

## ACCEPTANCE CRITERIA

- [ ] Monitor detects stalls within 15 minutes of heartbeat going stale
- [ ] Agent-waiting sessions recovered by kill + restart
- [ ] Crashed orchestrators restarted from correct phase
- [ ] Human-required issues escalated to Telegram with actionable details
- [ ] SC-001 passes: healthy monitoring cycle triggers no intervention
- [ ] SC-005 passes: agent-waiting detected and recovered
- [ ] SC-006 passes: crash detected and orchestrator restarted
- [ ] SC-007 passes: human-required issue escalated to Telegram
- [ ] All validation commands pass with zero errors
- [ ] Existing Phase 5 tests still pass (no regressions)
- [ ] TypeScript compiles cleanly (`tsc --noEmit`)
- [ ] Improvement log entries written for every intervention

---

## COMPLETION CHECKLIST

- [ ] All 15 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed (Level 1-4)
- [ ] Full test suite passes (unit + integration)
- [ ] No type checking errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] All acceptance criteria met
- [ ] SC-001, SC-005, SC-006, SC-007 validated

---

## NOTES

**Decisions from Phase 0 Scope Analysis:**

1. **Fixed 15-min interval** — PRD explicitly specifies this. Per-project customization deferred.
2. **No Agent SDK in Phase 6** — Recovery is kill-and-restart only. Diagnosis sessions are Phase 7.
3. **Direct HTTP for Telegram** — Avoids 409 Conflict with orchestrator's grammy polling. Uses `@grammyjs/types` for type safety only.
4. **Agent-waiting detection is heuristic in Phase 6** — Full detection requires session output reading (Phase 7). For now, PID alive + stale = `session_hung` default.
5. **Restart count is in-memory** — Resets when supervisor restarts. Acceptable for MVP; Phase 7 can persist to registry.
6. **Supervisor PID file** at `~/.piv/supervisor.pid` prevents duplicate instances.

**PRD Gap (documented assumption):**
PRD Section 4.2 specifies agent-waiting detection via "last output is a question" — but session output reading requires `piv-log.md` emission (Phase 7 scope). For Phase 6, we classify PID-alive + stale as `session_hung` and treat recovery the same (kill + restart). This is conservative and safe — the distinction becomes meaningful when Phase 7 adds targeted diagnosis.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 6 from PRD
independent_tasks_count: 5
dependent_chains: 3
technologies_consumed: telegram-bot-api
next_suggested_command: execute
next_arg: ".agents/plans/phase-6-monitor-loop-stall-detection.md"
estimated_complexity: high
confidence: 8/10
