# Feature: Phase 1 — Core Orchestration Engine

The following plan should be complete, but validate documentation, codebase patterns, and task sanity before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Core autonomous orchestration engine that manages Claude Code sessions via the Agent SDK, executes the full PIV loop (plan → execute → validate → commit) for each PRD phase, enforces validation gating, handles error recovery with the PIV error taxonomy, and persists all state to the manifest. This is the engine — no Telegram, no VS Code integration. Triggered via CLI for testing.

## User Story

As a developer who has validated a PRD
I want to trigger the orchestrator and have it build every phase autonomously
So that I get a fully implemented, live-tested codebase without sitting at the keyboard

## Problem Statement

Running the PIV loop manually requires sitting at the keyboard for every `/clear` → `/prime` → `/plan-feature` → `/execute` → `/validate-implementation` → `/commit` cycle. For a 4-phase PRD, this means 20+ manual command invocations with context clearing between each pairing.

## Solution Statement

A Node.js process that reads the manifest, spawns fresh Claude Code sessions via the Agent SDK for each command pairing, parses PIV-Automator-Hooks from responses, updates the manifest, enforces validation gates, classifies errors with retry budgets, and loops through all phases autonomously.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: .claude/orchestrator/ (new), .agents/manifest.yaml (reads/writes)
**Dependencies**: @anthropic-ai/claude-agent-sdk, js-yaml, Node.js 20+
**Agent Behavior**: Yes — implements decision trees from PRD Section 4.2

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `claude-agent-sdk-profile.md` — Session lifecycle management
  - Key operations: query() create, query() resume, AbortController abort
  - Auth: Env var only (CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY), no code-level auth
  - Critical constraints: `permissionMode: "bypassPermissions"` requires `allowDangerouslySkipPermissions: true`, `settingSources: ["project"]` required for slash commands, `systemPrompt: { type: "preset", preset: "claude_code" }` required for CLAUDE.md

- `anthropic-auth-profile.md` — Authentication path selection
  - Primary: CLAUDE_CODE_OAUTH_TOKEN via Agent SDK subprocess (subscription billing)
  - Fallback: ANTHROPIC_API_KEY (pay-per-token, separate billing)
  - Critical: OAuth tokens work ONLY through Agent SDK subprocess, not direct API calls

**Impact on Implementation:**
Session manager wraps V1 `query()` with resume pattern. Auth is environment-variable-only — no code-level token handling. Each session enforces `maxBudgetUsd` and `maxTurns` safety rails. Response handler extracts hooks via regex from result text.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `CLAUDE.md` (lines 190-240) — Error taxonomy categories, retry limits, recovery actions
- `CLAUDE.md` (lines 160-180) — Context Window Pairings table (which commands share sessions)
- `CLAUDE.md` (lines 240-270) — Notification format and lifecycle rules
- `CLAUDE.md` (lines 120-155) — PIV Configuration settings (mode, freshness, checkpoints)
- `.agents/PRD.md` (lines 458-510) — Phase 1 scope, technologies, done criteria
- `.agents/PRD.md` (lines 102-145) — Decision trees (phase advancement, context management, validation failure)
- `.agents/PRD.md` (lines 147-245) — All 12 scenario definitions
- `.agents/reference/claude-agent-sdk-profile.md` (lines 113-227) — query() create, resume, clear, abort patterns
- `.agents/reference/claude-agent-sdk-profile.md` (lines 83-106) — Options configuration object
- `.agents/reference/claude-agent-sdk-profile.md` (lines 54-76) — SDKMessage types and fields
- `.agents/reference/anthropic-auth-profile.md` (lines 26-66) — OAuth via Agent SDK subprocess pattern

### New Files to Create

```
.claude/orchestrator/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── types.ts              — Shared interfaces and type definitions
│   ├── config.ts             — Environment loading, per-command session defaults
│   ├── hooks-parser.ts       — PIV-Automator-Hooks regex extraction
│   ├── manifest-manager.ts   — YAML read/write with merge semantics
│   ├── error-classifier.ts   — Error taxonomy classifier with retry logic
│   ├── git-manager.ts        — Checkpoint creation and rollback via child_process
│   ├── response-handler.ts   — SDKMessage stream accumulation into SessionResult
│   ├── session-manager.ts    — Agent SDK query() wrapper with resume support
│   ├── state-machine.ts      — Manifest-driven next-action determination
│   ├── piv-runner.ts         — Full PIV loop orchestration per phase
│   └── index.ts              — CLI entry point
└── tests/
    ├── hooks-parser.test.ts
    ├── manifest-manager.test.ts
    ├── error-classifier.test.ts
    └── state-machine.test.ts
```

### Patterns to Follow

**Session Creation (agent-sdk-profile.md:119-132):**
```typescript
const q = query({
  prompt: "/prime",
  options: {
    model: "claude-opus-4-6",
    cwd: projectDir,
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write", "WebSearch", "WebFetch", "Task"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    settingSources: ["project"],
    systemPrompt: { type: "preset", preset: "claude_code" },
    maxTurns: 50,
    maxBudgetUsd: 5.00
  }
});
```

**Session Resume (agent-sdk-profile.md:160-177):**
```typescript
for await (const msg of query({
  prompt: "/plan-feature 'Phase 1'",
  options: { resume: savedSessionId, ...baseOptions }
})) { /* process messages */ }
```

**Hooks Regex (CLAUDE.md):** `/^([a-z_]+): (.+)$/gm` — applied after `## PIV-Automator-Hooks` header

**Manifest Merge (CLAUDE.md):** Read before write. Deep merge top-level keys. Append to arrays. ISO 8601 timestamps.

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Phase Advancement (PRD 4.2):**
- IF validation passes all tiers → advance to next phase
- ELSE IF fixable (syntax_error, test_failure) → refactor + re-validate (retry budget)
- ELSE IF retry budget exhausted → rollback to checkpoint, pause execution
- Maps to: state-machine.ts + piv-runner.ts

**Context Window Management (PRD 4.2):**
- Starting new command pairing → new query() call (fresh subprocess = fresh context)
- Command pairing complete → let generator end (subprocess terminates)
- Never clear mid-command; complete current pairing first
- Maps to: session-manager.ts runCommandPairing()

**Validation Failure Response (PRD 4.2):**
- syntax_error/test_failure (≤2 retries) → spawn refactor session, fix, re-validate
- scenario_mismatch (≤1 retry) → re-read PRD, adjust implementation
- integration_auth (0 retries) → escalate immediately, log to manifest
- integration_rate_limit (≤3 retries) → exponential backoff
- Maps to: error-classifier.ts + piv-runner.ts retry loop

### Scenario Mappings

| Scenario | Orchestrator Workflow | Decision Tree | Pass Criteria |
|---|---|---|---|
| SC-001: Full Phase | prime→plan, prime→execute, prime→validate, commit | Phase Advancement | All 4 sessions succeed, manifest shows phase complete |
| SC-002: Multi-Phase | Loop SC-001 for each phase, unique sessions | Phase Advancement ×N | All phases complete, distinct session IDs per phase |
| SC-004: Credentials | prime→research-stack, parse .env from profiles | Credential Request | .env requirements extracted from profile Section 1 |
| SC-005: Auto-Fix | Validation fails → classify → refactor session → re-validate | Validation Failure | Error classified correctly, retry succeeds |
| SC-008: Retries Exhausted | Validation fails N times → rollback → pause | Validation Failure + Rollback | Checkpoint restored, manifest has failure entry |

### Error Recovery Patterns

- Session error (`error_during_execution`) → classify via error-classifier → write to manifest → retry or escalate
- Budget exceeded (`error_max_budget_usd`) → log cost, raise budget 50% for next attempt, cap at 2× original
- Turn limit (`error_max_turns`) → increase maxTurns 50%, log warning
- Process crash → catch in try/catch, write failure to manifest, log session ID for potential resume

---

## STEP-BY-STEP TASKS

### Task 1: CREATE .claude/orchestrator/package.json

- **IMPLEMENT**: Package manifest with dependencies and scripts
- **DEPS**: `@anthropic-ai/claude-agent-sdk` (^0.2.45), `js-yaml` (^4.1.0)
- **DEV DEPS**: `typescript` (^5.7.0), `tsx` (^4.19.0), `vitest` (^3.0.0), `@types/node` (^22.0.0), `@types/js-yaml` (^4.0.9)
- **SCRIPTS**: `"start": "tsx src/index.ts"`, `"build": "tsc"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`
- **GOTCHA**: Pin Agent SDK to ^0.2.45 per profile. Set `"type": "module"` for ESM.
- **VALIDATE**: `cd .claude/orchestrator && npm install`

### Task 2: CREATE .claude/orchestrator/tsconfig.json

- **IMPLEMENT**: TypeScript config targeting ES2022, NodeNext modules
- **OPTIONS**: `strict: true`, `outDir: "dist"`, `rootDir: "src"`, `esModuleInterop: true`, `skipLibCheck: true`, `resolveJsonModule: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`
- **INCLUDE**: `["src/**/*"]`
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 3: CREATE .claude/orchestrator/.env.example

- **IMPLEMENT**: Template showing required and optional env vars
- **VARS**: `CLAUDE_CODE_OAUTH_TOKEN` (primary auth), `ANTHROPIC_API_KEY` (fallback), `PIV_PROJECT_DIR` (target project), `PIV_MODEL` (model override, default claude-opus-4-6)
- **VALIDATE**: File exists and is readable

### Task 4: CREATE .claude/orchestrator/src/types.ts

- **IMPLEMENT**: All shared interfaces — this is the type foundation for everything else
- **KEY TYPES**:
  - `SessionConfig` — prompt, cwd, maxTurns, maxBudgetUsd, resumeSessionId?, model?
  - `SessionResult` — sessionId, output (full text), hooks (Record<string,string>), cost, duration, turns, error?
  - `SessionError` — type (SDK error subtype string), messages (string[])
  - `Manifest` — prd, phases, settings, profiles, plans?, executions?, validations?, checkpoints?, failures?, notifications?, preflight?, next_action?, last_updated
  - `PhaseStatus` — plan: PlanStatus, execution: ExecutionStatus, validation: ValidationStatus
  - `PlanStatus` / `ExecutionStatus` — `"not_started" | "in_progress" | "complete"`
  - `ValidationStatus` — `"not_run" | "pass" | "partial" | "fail"`
  - `NextAction` — command, argument, reason, confidence
  - `FailureEntry` — command, phase, error_category, timestamp, retry_count, max_retries, checkpoint?, resolution, details
  - `CheckpointEntry` — tag, phase, created_before, status (`"active" | "resolved"`)
  - `NotificationEntry` — timestamp, type, severity, category, phase, details, blocking, action_taken, acknowledged?
  - `ErrorCategory` — union of all 9 taxonomy categories
  - `ErrorTaxonomyEntry` — maxRetries, needsHuman, recoveryAction
  - `PivCommand` — `"prime" | "plan-feature" | "execute" | "validate-implementation" | "commit" | "research-stack"`
  - `CommandPairing` — commands: string[], sessionConfig: Partial<SessionConfig>
- **PROFILE REF**: SDKMessage types from agent-sdk-profile.md:54-76 (do NOT re-declare SDK types — import from package)
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 5: CREATE .claude/orchestrator/src/config.ts

- **IMPLEMENT**: Load environment config and define per-command session defaults
- **IMPORTS**: `types.ts`
- **FUNCTIONS**:
  - `loadConfig(): OrchestratorConfig` — reads env vars, validates at least one auth token exists, returns config object
  - `getSessionDefaults(command: PivCommand): { maxTurns: number, maxBudgetUsd: number }` — per-command-type limits
- **SESSION DEFAULTS**: prime (30 turns, $1), plan-feature (100 turns, $8), execute (200 turns, $15), validate (100 turns, $5), commit (10 turns, $0.50), research-stack (100 turns, $5)
- **ENV VARS**: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `PIV_PROJECT_DIR` (default cwd), `PIV_MODEL` (default "claude-opus-4-6")
- **GOTCHA**: Do NOT read or set auth tokens in code — Agent SDK subprocess reads them from environment automatically. Config just validates presence.
- **VALIDATE**: `npx tsc --noEmit`

### Task 6: CREATE .claude/orchestrator/src/hooks-parser.ts

- **IMPLEMENT**: Extract PIV-Automator-Hooks key-value block from text
- **FUNCTION**: `parseHooks(text: string): Record<string, string>`
- **ALGORITHM**:
  1. Find last occurrence of `## PIV-Automator-Hooks` in text
  2. Extract all subsequent lines matching `/^([a-z_]+): (.+)$/`
  3. Stop at next `##` header or end of text
  4. Return key-value map
- **EDGE CASES**: No hooks block → empty object. Multiple blocks → use last one. Malformed lines → skip. Empty text → empty object.
- **VALIDATE**: Unit test (Task 14)

### Task 7: CREATE .claude/orchestrator/src/manifest-manager.ts

- **IMPLEMENT**: YAML-based manifest persistence with merge-only semantics
- **IMPORTS**: `js-yaml`, `types.ts`, `node:fs/promises`, `node:path`
- **FUNCTIONS**:
  - `readManifest(projectDir: string): Promise<Manifest>` — parse .agents/manifest.yaml
  - `writeManifest(projectDir: string, manifest: Manifest): Promise<void>` — dump YAML, update last_updated, create .agents/ if missing
  - `mergeManifest(existing: Manifest, updates: Partial<Manifest>): Manifest` — deep merge objects, concat arrays (plans, executions, validations, failures, notifications)
  - `appendFailure(manifest: Manifest, failure: FailureEntry): Manifest` — push to failures array
  - `appendNotification(manifest: Manifest, notification: NotificationEntry): Manifest`
  - `resolveCheckpoint(manifest: Manifest, tag: string): Manifest` — set checkpoint status to "resolved"
  - `updatePhaseStatus(manifest: Manifest, phase: number, updates: Partial<PhaseStatus>): Manifest`
  - `setNextAction(manifest: Manifest, action: NextAction): Manifest`
- **GOTCHA**: NEVER replace top-level keys. Always read → merge → write. Create `.agents/` dir if missing. Timestamps must be ISO 8601.
- **VALIDATE**: Unit test (Task 14)

### Task 8: CREATE .claude/orchestrator/src/error-classifier.ts

- **IMPLEMENT**: Map error text to taxonomy categories with retry metadata
- **IMPORTS**: `types.ts`
- **TAXONOMY** (from CLAUDE.md):
  ```
  syntax_error:          { maxRetries: 2, needsHuman: false, recovery: "auto-fix and retry" }
  test_failure:          { maxRetries: 2, needsHuman: false, recovery: "auto-fix and retry" }
  scenario_mismatch:     { maxRetries: 1, needsHuman: false, recovery: "re-read PRD, adjust" }
  integration_auth:      { maxRetries: 0, needsHuman: true,  recovery: "escalate immediately" }
  integration_rate_limit:{ maxRetries: 3, needsHuman: false, recovery: "exponential backoff" }
  stale_artifact:        { maxRetries: 1, needsHuman: false, recovery: "research-stack --refresh" }
  prd_gap:               { maxRetries: 0, needsHuman: true,  recovery: "escalate" }
  partial_execution:     { maxRetries: 1, needsHuman: false, recovery: "rollback to checkpoint" }
  line_budget_exceeded:  { maxRetries: 1, needsHuman: false, recovery: "auto-trim and retry" }
  ```
- **FUNCTIONS**:
  - `classifyError(errorText: string, command: PivCommand): ErrorCategory` — keyword pattern matching
  - `getTaxonomy(category: ErrorCategory): ErrorTaxonomyEntry` — lookup from map
  - `canRetry(failure: FailureEntry): boolean` — `failure.retry_count < getTaxonomy(failure.error_category).maxRetries`
  - `needsEscalation(failure: FailureEntry): boolean` — retries exhausted OR needsHuman
- **CLASSIFICATION PATTERNS**: "compil" / "syntax" / "type error" → syntax_error; "test fail" / "assert" → test_failure; "scenario" / "mismatch" → scenario_mismatch; "credential" / "auth" / "401" / "unauthorized" → integration_auth; "429" / "rate limit" / "too many" → integration_rate_limit; "stale" / "outdated" → stale_artifact; unknown → partial_execution (safe default)
- **VALIDATE**: Unit test (Task 14)

### Task 9: CREATE .claude/orchestrator/src/git-manager.ts

- **IMPLEMENT**: Git checkpoint and rollback operations via child_process
- **IMPORTS**: `node:child_process`, `types.ts`
- **FUNCTIONS**:
  - `createCheckpoint(projectDir: string, phase: number): Promise<string>` — creates tag `piv-checkpoint/phase-{N}-{ISO timestamp}`, returns tag name
  - `rollbackToCheckpoint(projectDir: string, tag: string): Promise<void>` — `git reset --hard {tag}` then `git clean -fd`
  - `deleteCheckpointTag(projectDir: string, tag: string): Promise<void>` — `git tag -d {tag}`
  - `hasUncommittedChanges(projectDir: string): Promise<boolean>` — `git status --porcelain`
  - `getCurrentHead(projectDir: string): Promise<string>` — `git rev-parse --short HEAD`
- **EXEC PATTERN**: Use `execFileSync("git", [...args], { cwd: projectDir, encoding: "utf-8" })` — execFileSync avoids shell injection
- **GOTCHA**: All git commands run in the TARGET project directory (cwd param), not the orchestrator directory. Verify project has a git repo before checkpoint.
- **VALIDATE**: Manual test — create checkpoint → verify with `git tag -l 'piv-checkpoint/*'`

### Task 10: CREATE .claude/orchestrator/src/response-handler.ts

- **IMPLEMENT**: Process AsyncGenerator<SDKMessage> into structured SessionResult
- **IMPORTS**: `types.ts`, `hooks-parser.ts`
- **FUNCTION**: `async processSession(generator: AsyncIterable<any>): Promise<SessionResult>`
- **ALGORITHM**:
  1. On `type: "system", subtype: "init"` → capture `session_id`, log model and tools
  2. On `type: "assistant"` → accumulate text from `message.content` blocks where `"text" in block`
  3. On `type: "system", subtype: "compact_boundary"` → log warning (context compaction occurred)
  4. On `type: "result", subtype: "success"` → set output = `result` field, capture `total_cost_usd`, `duration_ms`, `num_turns`
  5. On `type: "result", subtype: error_*` → set error with subtype and `errors` array
  6. After iteration → parse hooks from output text via `parseHooks()`
  7. Return complete `SessionResult`
- **GOTCHA**: Prefer `result.result` text over accumulated assistant text — it's the clean final output. Use accumulated text only for progress logging. The SDK types are complex unions — use defensive checks (`"text" in block`) rather than strict type casts.
- **VALIDATE**: `npx tsc --noEmit`

### Task 11: CREATE .claude/orchestrator/src/session-manager.ts

- **IMPLEMENT**: High-level Agent SDK wrapper for orchestrator sessions
- **IMPORTS**: `@anthropic-ai/claude-agent-sdk` (query), `types.ts`, `config.ts`, `response-handler.ts`
- **FUNCTIONS**:
  - `createSession(config: SessionConfig): Promise<SessionResult>` — calls `query()` with full options, processes via response-handler
  - `resumeSession(sessionId: string, config: SessionConfig): Promise<SessionResult>` — calls `query()` with `resume: sessionId`
  - `runCommandPairing(commands: string[], projectDir: string, commandType: PivCommand): Promise<SessionResult[]>` — runs first command via createSession, subsequent via resumeSession, returns all results
- **BASE OPTIONS BUILDER**: `buildOptions(config, projectDir)` returns object with: model, cwd, allowedTools (all tools), permissionMode "bypassPermissions", allowDangerouslySkipPermissions true, settingSources ["project"], systemPrompt preset "claude_code", maxTurns, maxBudgetUsd, new AbortController with 10min timeout
- **ABORT HANDLING**: Create AbortController per session, setTimeout for configurable timeout, call controller.abort() on timeout. Catch AbortError and return error result.
- **GOTCHA**: `settingSources: ["project"]` is MANDATORY or slash commands are invisible. `systemPrompt` MUST be the preset or CLAUDE.md is ignored. The `allowDangerouslySkipPermissions: true` flag is required alongside `bypassPermissions`.
- **VALIDATE**: `npx tsc --noEmit` (live test requires Agent SDK — deferred to integration testing)

### Task 12: CREATE .claude/orchestrator/src/state-machine.ts

- **IMPLEMENT**: Determine next orchestrator action from manifest state
- **IMPORTS**: `types.ts`
- **FUNCTION**: `determineNextAction(manifest: Manifest): NextAction`
- **PRIORITY LOGIC** (from CLAUDE.md Section 12, highest priority first):
  1. Pending failure with retries remaining → `{ command: failure.command, argument: "retry", reason: "Fix: " + failure.details }`
  2. Pending failure with no retries → `{ command: "rollback", argument: failure.checkpoint, reason: "Retries exhausted" }`
  3. Active checkpoint with no failure → `{ command: "execute", argument: "resume", reason: "Execution interrupted" }`
  4. Stale/missing profiles for next phase → `{ command: "research-stack", argument: "--refresh" }`
  5. No PRD → `{ command: "create-prd" }`
  6. Next phase needs plan → `{ command: "plan-feature", argument: "Phase N: Name" }`
  7. Plan exists, not executed → `{ command: "execute", argument: ".agents/plans/{plan}.md" }`
  8. Executed, not validated → `{ command: "validate-implementation", argument: "--full" }`
  9. Validated → `{ command: "commit" }`
- **HELPERS**:
  - `getNextUnfinishedPhase(manifest): number | null` — first phase where plan/execution/validation incomplete
  - `findPendingFailure(manifest): FailureEntry | null` — first failure with resolution "pending"
  - `findActiveCheckpoint(manifest): CheckpointEntry | null` — first checkpoint with status "active"
  - `getPhaseName(manifest, phase): string` — extract name from PRD hooks or manifest
- **VALIDATE**: Unit test (Task 14)

### Task 13: CREATE .claude/orchestrator/src/piv-runner.ts

- **IMPLEMENT**: Orchestrates the full PIV loop per phase
- **IMPORTS**: All modules — session-manager, manifest-manager, state-machine, error-classifier, git-manager, config
- **COMMAND PAIRINGS** (from CLAUDE.md Context Window Pairings):
  - Plan session: `["/prime", "/plan-feature \"Phase N: Name\""]`
  - Execute session: `["/prime", "/execute .agents/plans/phase-N.md"]`
  - Validate session: `["/prime", "/validate-implementation --full"]`
  - Commit session: `["/commit"]`
- **FUNCTION** `async runPhase(phase: number, projectDir: string): Promise<void>`:
  1. Read manifest → determine next step for this phase
  2. If plan needed: create checkpoint → run plan pairing → parse hooks → update manifest
  3. If execute needed: create checkpoint → run execute pairing → on success update manifest → on failure classify and retry or rollback
  4. If validate needed: run validate pairing → on pass update manifest → on fail classify, spawn refactor session, re-validate
  5. If commit needed: run commit session → resolve checkpoint → update manifest → mark phase complete
- **FUNCTION** `async runAllPhases(projectDir: string): Promise<void>`:
  1. Read manifest → get total phases
  2. Loop: for each phase, call runPhase() until complete or all retries exhausted
  3. After each phase, re-read manifest (state may have changed)
  4. Print cost summary (aggregate total_cost_usd from all sessions)
- **RETRY LOOP** (inside runPhase):
  ```
  while (canRetry(failure)):
    - Increment retry_count in manifest
    - Spawn fresh session (new query) for the failed command
    - If success: clear failure, continue
    - If fail again: update failure, check retry budget
  If retries exhausted: rollback to checkpoint, write escalation to manifest
  ```
- **LOGGING**: Console.log each step — "Session created (id: X)", "Running /prime...", "Hooks parsed: {key: value}", "Phase N plan complete", "Cost: $X.XX"
- **VALIDATE**: `npx tsc --noEmit`

### Task 14: CREATE .claude/orchestrator/src/index.ts

- **IMPLEMENT**: CLI entry point with argument parsing
- **IMPORTS**: `config.ts`, `piv-runner.ts`, `manifest-manager.ts`, `state-machine.ts`
- **USAGE**: `npx tsx src/index.ts [--project <dir>] [--phase <N>] [--dry-run]`
- **FLOW**:
  1. Parse process.argv for flags (simple manual parsing, no library needed)
  2. Call `loadConfig()` — validates auth env var exists, resolves project dir
  3. Read manifest from project dir
  4. If `--dry-run`: call `determineNextAction()`, print recommendation, exit
  5. If `--phase N`: call `runPhase(N, projectDir)`
  6. Else: call `runAllPhases(projectDir)`
  7. Print final cost summary and manifest state
- **ERROR HANDLING**: Wrap main in try/catch. On uncaught error: write failure to manifest, print PIV-Error block, exit 1.
- **GOTCHA**: Validate project dir has `.agents/manifest.yaml` before proceeding. Print helpful error if manifest missing ("Run /prime first").
- **VALIDATE**: `cd .claude/orchestrator && npx tsx src/index.ts --dry-run`

### Task 15: CREATE unit tests

- **FILE** `tests/hooks-parser.test.ts`:
  - Test: valid hooks block → correct key-value map
  - Test: no hooks block → empty object
  - Test: malformed lines → skipped, valid lines extracted
  - Test: multiple hooks blocks → last one used
  - Test: empty input → empty object

- **FILE** `tests/manifest-manager.test.ts`:
  - Test: mergeManifest deep-merges objects without overwriting
  - Test: mergeManifest concatenates arrays (plans, failures)
  - Test: appendFailure adds to failures array
  - Test: resolveCheckpoint sets status to "resolved"
  - Test: updatePhaseStatus updates only specified fields

- **FILE** `tests/error-classifier.test.ts`:
  - Test: "compilation failed" → syntax_error
  - Test: "test failed" → test_failure
  - Test: "unauthorized" / "401" → integration_auth
  - Test: "429" / "rate limit" → integration_rate_limit
  - Test: canRetry returns true when retry_count < maxRetries
  - Test: needsEscalation returns true when needsHuman or retries exhausted

- **FILE** `tests/state-machine.test.ts`:
  - Test: pending failure with retries → retry recommendation
  - Test: pending failure no retries → rollback recommendation
  - Test: all phases complete → null/done
  - Test: phase needs plan → plan-feature recommendation
  - Test: plan complete, needs execution → execute recommendation
  - Test: execution complete, needs validation → validate recommendation
  - Test: validation passed → commit recommendation

- **FRAMEWORK**: vitest with in-memory data (no file I/O in unit tests)
- **VALIDATE**: `cd .claude/orchestrator && npm test`

---

## TESTING STRATEGY

### Unit Tests (vitest)

All utility modules tested with in-memory data:
- hooks-parser: extraction accuracy across edge cases
- manifest-manager: merge semantics, array appending, field updates
- error-classifier: pattern matching for all 9 categories, retry/escalation logic
- state-machine: all 9 priority levels with crafted manifest states

### Integration Tests (Manual — Phase 1)

1. Create minimal test project with PRD, CLAUDE.md, and manifest
2. Run `npx tsx src/index.ts --dry-run --project /path/to/test` → verify correct next action
3. Run `npx tsx src/index.ts --phase 1 --project /path/to/test` → verify full loop
4. Check: unique session IDs logged, manifest updated, hooks parsed, cost tracked

### Edge Cases to Cover

- Empty manifest (no phases defined)
- All phases already complete → orchestrator exits cleanly
- Session timeout during long /execute → AbortError handled
- Budget exceeded mid-session → error result captured, classified
- Git dirty state at checkpoint time → warn and proceed or fail
- Manifest file missing → helpful error message

---

## VALIDATION COMMANDS

### Level 1: Type Check
```bash
cd .claude/orchestrator && npx tsc --noEmit
```

### Level 2: Unit Tests
```bash
cd .claude/orchestrator && npm test
```

### Level 3: Smoke Test
```bash
cd .claude/orchestrator && npx tsx src/index.ts --dry-run
```

### Level 4: Integration (Manual)
```bash
# Requires Agent SDK connection and test project
cd .claude/orchestrator && npx tsx src/index.ts --phase 1 --project /path/to/test
```

---

## ACCEPTANCE CRITERIA

- [ ] TypeScript compiles with zero errors (`tsc --noEmit`)
- [ ] All unit tests pass (`npm test`)
- [ ] Orchestrator completes single phase on test PRD (manual test)
- [ ] Each command pairing gets unique session ID (verified in console logs)
- [ ] Validation failure triggers error classification and retry attempt
- [ ] Manifest updated correctly after every command (read and verify)
- [ ] `maxBudgetUsd` enforced on all sessions (visible in result messages)
- [ ] Error taxonomy correctly classifies sample errors (unit tests prove this)
- [ ] Git checkpoint created before execution, resolved after commit
- [ ] SC-001, SC-002, SC-004, SC-005, SC-008 scenarios addressed in design
- [ ] All PRD Phase 1 "Done When" criteria met

---

## COMPLETION CHECKLIST

- [ ] All 15 tasks completed in order
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] All unit tests pass (`npm test`)
- [ ] `--dry-run` mode works correctly
- [ ] Manifest merge never overwrites existing keys
- [ ] No hardcoded paths — all via config
- [ ] Auth env var validated at startup
- [ ] Cost tracking logged per session
- [ ] AbortController timeout on all sessions

---

## NOTES

### Auth Contradiction Resolution
The claude-agent-sdk-profile.md (Section 1, Gotcha #1) states the Agent SDK does NOT support `CLAUDE_CODE_OAUTH_TOKEN`. The anthropic-auth-profile.md (Section 1, Path A) states it DOES work because the Agent SDK spawns Claude Code as a subprocess, which reads `CLAUDE_CODE_OAUTH_TOKEN` internally. The PRD explicitly specifies `CLAUDE_CODE_OAUTH_TOKEN` as the primary auth method. **Decision:** Use `CLAUDE_CODE_OAUTH_TOKEN` as primary auth per PRD and auth profile. The Agent SDK profile's claim is about the SDK itself — it's correct that the SDK has no `authToken` option, but the subprocess it spawns reads the env var. First Tier 1 integration test will confirm. `ANTHROPIC_API_KEY` remains as fallback. If incorrect, affects: config.ts, session-manager.ts.

### V1 vs V2 Agent SDK API
V2 session API (`unstable_v2_createSession`/`send`/`stream`) is cleaner for multi-turn but marked unstable (agent-sdk-profile.md:249-291). **Decision:** Use V1 `query()` with `resume` for stability. The `session-manager.ts` interface abstracts the SDK — swapping to V2 later requires changing only that module.

### Telegram Not In Scope
Phase 1 has no Telegram integration. Error escalations that `needsHuman: true` are logged to manifest and printed to console. The Telegram notification pathway (Phase 2) will read these from the manifest.

### Phase 0 Validated Decisions Baked In
1. Auth → CLAUDE_CODE_OAUTH_TOKEN primary (PRD aligned, auth profile confirmed)
2. API → V1 query() with resume (stable, production-ready)
3. Budget → Per-command defaults with safety caps (conservative)
4. Hooks → Regex parse from result text (matches CLAUDE.md spec)
5. State → Manifest-driven with merge-only writes (matches existing framework pattern)
6. Errors → Taxonomy-based classification with retry budgets (from CLAUDE.md)

---

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 1 from PRD
independent_tasks_count: 6
dependent_chains: 2
technologies_consumed: claude-agent-sdk, anthropic-auth
next_suggested_command: execute
next_arg: ".agents/plans/phase-1-core-orchestration-engine.md"
estimated_complexity: high
confidence: 7
