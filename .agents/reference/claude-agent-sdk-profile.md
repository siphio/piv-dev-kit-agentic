# Technology Profile: Claude Agent SDK

**Generated**: 2026-02-18
**PRD Reference**: Section 3 - Claude Agent SDK
**Agent Use Case**: Programmatic conversation lifecycle management — create, send messages, read responses, and destroy Claude sessions with full context isolation for the PIV Orchestrator.

---

## 1. Authentication & Setup

**Auth Type**: OAuth via subprocess (Claude Max subscription)
**Auth Location**: The `claude` CLI reads the OAuth token from the macOS Keychain automatically — no env var required.

**⛔ CORRECTION — OAuth via subprocess WORKS (confirmed 2026-02-19):** The Claude Agent SDK spawns the `claude` CLI as a subprocess. The CLI handles its own authentication using the developer's OAuth token from their Claude Max subscription (stored in macOS Keychain). `ANTHROPIC_API_KEY` is NOT required and MUST NOT be used. This is subscription billing, not pay-per-token API billing.

**Setup Steps:**
1. Install Claude Code CLI (`claude`)
2. Log in via `claude login` (stores OAuth token in Keychain)
3. No env var needed — the SDK subprocess reads auth from Keychain automatically

**Auth Code Pattern:**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// SDK spawns `claude` CLI — auth handled by CLI's own OAuth token
// No ANTHROPIC_API_KEY needed
for await (const message of query({
  prompt: "Hello",
  options: { model: "claude-opus-4-6" }
})) {
  console.log(message);
}
```

**Critical Implementation Notes:**
- The `CLAUDECODE` env var MUST be unset when spawning the subprocess (nesting guard kills it with exit code 1)
- Set `allowDangerouslySkipPermissions: true` alongside `permissionMode: "bypassPermissions"`
- SDK emits `rate_limit_event` between `system/init` and first `assistant` message

**Environment Variables:**
| Variable | Purpose | Required |
|----------|---------|----------|
| ~~`ANTHROPIC_API_KEY`~~ | ~~API authentication~~ | **NO — NEVER USE. Auth handled by CLI subprocess via OAuth.** |
| `CLAUDE_CODE_USE_BEDROCK` | Enable Bedrock provider (alternative) | No |
| `CLAUDE_CODE_USE_VERTEX` | Enable Vertex AI provider (alternative) | No |
| `CLAUDE_CODE_USE_FOUNDRY` | Enable Azure Foundry provider (alternative) | No |

---

## 2. Core Data Models

> Only models relevant to the PIV Orchestrator's session management needs.

**SDKMessage (Union Type):**
| Variant | Type Field | Description | Key Fields |
|---------|-----------|-------------|------------|
| SDKSystemMessage | `"system"` | Session init message with metadata | `session_id`, `tools`, `model`, `slash_commands` |
| SDKAssistantMessage | `"assistant"` | Claude's response | `message.content` (text blocks, tool use blocks) |
| SDKResultMessage | `"result"` | Final result when agent completes | `result` (text), `total_cost_usd`, `usage`, `duration_ms` |
| SDKUserMessage | `"user"` | User input message | `message.content` |
| SDKCompactBoundaryMessage | `"system"` (subtype `"compact_boundary"`) | Context compaction occurred | `compact_metadata.pre_tokens` |
| SDKPartialAssistantMessage | `"stream_event"` | Streaming partial (if enabled) | `event` |

**SDKResultMessage (Success):**
| Field | Type | Description |
|-------|------|-------------|
| `subtype` | `"success"` | Completion status |
| `session_id` | `string` | Session identifier |
| `result` | `string` | Text output from agent |
| `total_cost_usd` | `number` | Total cost of this query |
| `duration_ms` | `number` | Wall clock duration |
| `num_turns` | `number` | Number of conversation turns |
| `usage` | `NonNullableUsage` | Token usage breakdown |
| `modelUsage` | `Record<string, ModelUsage>` | Per-model usage stats |
| `structured_output` | `unknown` | Structured output if schema provided |

**SDKResultMessage (Error):**
| Field | Type | Description |
|-------|------|-------------|
| `subtype` | `"error_max_turns" \| "error_during_execution" \| "error_max_budget_usd" \| "error_max_structured_output_retries"` | Error type |
| `errors` | `string[]` | Error descriptions |
| `total_cost_usd` | `number` | Cost incurred before failure |

**Options (Configuration Object):**
| Field | Type | Default | Orchestrator Relevance |
|-------|------|---------|----------------------|
| `model` | `string` | CLI default | Set to `"claude-opus-4-6"` |
| `resume` | `string` | undefined | Session ID to resume conversation |
| `forkSession` | `boolean` | false | Fork session instead of continue |
| `continue` | `boolean` | false | Continue most recent conversation |
| `maxTurns` | `number` | unlimited | Safety cap on conversation turns |
| `maxBudgetUsd` | `number` | unlimited | Safety cap on cost per query |
| `allowedTools` | `string[]` | all tools | Restrict available tools |
| `permissionMode` | `PermissionMode` | `"default"` | Use `"bypassPermissions"` for automation |
| `systemPrompt` | `string \| preset` | minimal | Custom or Claude Code preset |
| `settingSources` | `SettingSource[]` | `[]` | Must include `"project"` to load CLAUDE.md and custom commands |
| `cwd` | `string` | `process.cwd()` | Working directory for agent |
| `abortController` | `AbortController` | new | For cancelling operations |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | MCP server connections |
| `hooks` | `Record<HookEvent, HookCallbackMatcher[]>` | `{}` | Lifecycle hooks |
| `agents` | `Record<string, AgentDefinition>` | undefined | Subagent definitions |
| `betas` | `SdkBeta[]` | `[]` | Enable beta features like 1M context |
| `outputFormat` | `{ type: 'json_schema', schema: JSONSchema }` | undefined | Structured output schema |
| `enableFileCheckpointing` | `boolean` | false | Track file changes for rewind |
| `includePartialMessages` | `boolean` | false | Stream partial messages |

---

## 3. Key Endpoints

> The Claude Agent SDK is not a REST API — it is a TypeScript/Python SDK that spawns a local Claude Code subprocess. All interaction is through the `query()` function and session objects. The term "endpoints" here maps to SDK operations.

### Create New Conversation: `query()`

**Method**: TypeScript async generator function
**Import**: `import { query } from "@anthropic-ai/claude-agent-sdk";`

**Request (Creating a new session):**
```typescript
const q = query({
  prompt: "/prime",
  options: {
    model: "claude-opus-4-6",
    cwd: "/path/to/target/project",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write", "WebSearch", "WebFetch", "Task"],
    permissionMode: "bypassPermissions",
    settingSources: ["project"],
    systemPrompt: { type: "preset", preset: "claude_code" },
    maxTurns: 50,
    maxBudgetUsd: 5.00
  }
});
```

**Response (Streaming messages):**
```typescript
let sessionId: string | undefined;

for await (const message of q) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
    // message.tools, message.model, message.slash_commands available
  }
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if ("text" in block) console.log(block.text);
    }
  }
  if (message.type === "result") {
    console.log("Cost:", message.total_cost_usd);
    console.log("Result:", message.result);
  }
}
```

**Notes**: The `query()` function returns a `Query` object extending `AsyncGenerator<SDKMessage>`. Session ID is available on the first `system` init message. All subsequent messages include `session_id`.

### Resume Conversation: `query()` with `resume`

**Method**: Same `query()` function with `resume` option

**Request (Resuming an existing session):**
```typescript
for await (const message of query({
  prompt: "/plan-feature 'Phase 1: Core Engine'",
  options: {
    resume: savedSessionId,
    model: "claude-opus-4-6",
    permissionMode: "bypassPermissions",
    settingSources: ["project"],
    maxTurns: 100,
    maxBudgetUsd: 10.00
  }
})) {
  // Process messages — full context from previous session is restored
}
```

**Notes**: The SDK automatically loads conversation history and context when resuming. Claude continues exactly where it left off. The `forkSession: true` option creates a new branch instead of modifying the original.

### Send Slash Commands: Prompt prefixed with `/`

**Method**: Include slash command as the prompt string

**Request (Sending /prime):**
```typescript
for await (const message of query({
  prompt: "/prime",
  options: {
    resume: sessionId,
    settingSources: ["project"],
    systemPrompt: { type: "preset", preset: "claude_code" },
    maxTurns: 30
  }
})) {
  // /prime executes as if typed in interactive Claude Code
}
```

**Notes**: Custom slash commands from `.claude/commands/` are loaded when `settingSources` includes `"project"`. The init message's `slash_commands` array lists all available commands. Arguments work: `"/plan-feature Phase 1: Core Engine"`.

### Destroy/Clear Conversation

**Method**: Send `/clear` command OR simply stop iterating the generator

**Request (Clearing via slash command within session):**
```typescript
for await (const message of query({
  prompt: "/clear",
  options: { resume: sessionId, maxTurns: 1 }
})) {
  if (message.type === "system" && message.subtype === "init") {
    console.log("Cleared. New session:", message.session_id);
  }
}
```

**Request (Destroying by not resuming — preferred for orchestrator):**
```typescript
// Simply don't resume the session. Start a fresh query() call.
// There is no explicit "destroy" API — sessions are abandoned.
// The orchestrator achieves context isolation by creating new query() calls.
```

**Notes**: There is no explicit `destroySession()` API. Context isolation is achieved by starting a new `query()` without `resume`. The process subprocess terminates when the generator completes. For the orchestrator's use case, this is equivalent to closing a terminal and opening a new one.

### Abort In-Progress Query: `AbortController`

**Method**: Pass `AbortController` in options, call `.abort()`

**Request:**
```typescript
const controller = new AbortController();

// Set timeout
setTimeout(() => controller.abort(), 300_000); // 5 minute timeout

for await (const message of query({
  prompt: "Long running task...",
  options: {
    abortController: controller,
    model: "claude-opus-4-6"
  }
})) {
  // Process messages until abort or completion
}
```

### V2 Interface (Preview — Simpler Multi-Turn)

**Method**: `createSession()` / `send()` / `stream()` pattern

**Request (Multi-turn conversation):**
```typescript
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

await using session = unstable_v2_createSession({
  model: "claude-opus-4-6",
  allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
  permissionMode: "bypassPermissions",
  settingSources: ["project"],
  systemPrompt: { type: "preset", preset: "claude_code" }
});

// Turn 1: Prime
await session.send("/prime");
for await (const msg of session.stream()) {
  if (msg.type === "result") console.log("Prime complete");
}

// Turn 2: Plan (same session, full context preserved)
await session.send("/plan-feature 'Phase 1: Core Engine'");
for await (const msg of session.stream()) {
  if (msg.type === "result") console.log("Plan complete:", msg.result);
}

// Session auto-closes via `await using`, or call session.close() manually
```

**Resume with V2:**
```typescript
import { unstable_v2_resumeSession } from "@anthropic-ai/claude-agent-sdk";

await using session = unstable_v2_resumeSession(savedSessionId, {
  model: "claude-opus-4-6"
});
await session.send("Continue where we left off");
for await (const msg of session.stream()) { /* ... */ }
```

**Notes**: V2 is currently **unstable preview** — APIs may change. Not all V1 features are available (e.g., session forking). However, the `send()`/`stream()` pattern is significantly cleaner for the orchestrator's multi-turn workflow. The V2 session `close()` method provides explicit cleanup.

---

## 4. Rate Limits & Throttling

Rate limits are per-organization (not per API key) and use the token bucket algorithm.

**Tier Requirements:**
| Tier | Credit Purchase | Max Monthly Spend |
|------|----------------|-------------------|
| Tier 1 | $5 | $100 |
| Tier 2 | $40 | $500 |
| Tier 3 | $200 | $1,000 |
| Tier 4 | $400 | $5,000 |

**Rate Limits by Tier (Claude Opus 4.x — shared across Opus 4, 4.1, 4.5, 4.6):**
| Tier | RPM | ITPM | OTPM |
|------|-----|------|------|
| Tier 1 | 50 | 30,000 | 8,000 |
| Tier 2 | 1,000 | 450,000 | 90,000 |
| Tier 3 | 2,000 | 800,000 | 160,000 |
| Tier 4 | 4,000 | 2,000,000 | 400,000 |

**Rate Limits by Tier (Claude Sonnet 4.x — shared across Sonnet 4, 4.5, 4.6):**
| Tier | RPM | ITPM | OTPM |
|------|-----|------|------|
| Tier 1 | 50 | 30,000 | 8,000 |
| Tier 2 | 1,000 | 450,000 | 90,000 |
| Tier 3 | 2,000 | 800,000 | 160,000 |
| Tier 4 | 4,000 | 2,000,000 | 400,000 |

**Important caching optimization**: Only uncached input tokens count toward ITPM limits (for Claude 4.x models). Prompt caching effectively multiplies your rate limit. With 80% cache hit rate, a 2M ITPM limit yields 10M effective ITPM.

**Long Context Rate Limits (>200K tokens, 1M beta, Tier 4 only):**
| ITPM | OTPM |
|------|------|
| 1,000,000 | 200,000 |

**Recommended throttle implementation for PIV Orchestrator:**
- The orchestrator runs sequential sessions, not parallel API calls. Rate limits are unlikely to be the bottleneck.
- Each PIV session (prime + plan, or prime + execute) is a single long-running `query()` call. Internal API calls are managed by the SDK.
- The SDK handles retry logic for its internal API calls. The orchestrator should handle 429 errors at the session level with exponential backoff.
- **Monitor `total_cost_usd` in result messages** to track spend against budget.
- Use `maxBudgetUsd` option to prevent runaway costs per session.

**Rate limit detection:**
- HTTP 429 response with `retry-after` header
- Response headers: `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-tokens-remaining`

---

## 5. Error Handling

| Error Condition | SDK Behavior | Orchestrator Should |
|----------------|-------------|-------------------|
| API key invalid/missing | Throws on first query | Validate key before starting orchestration |
| Rate limited (429) | SDK retries internally | Monitor; if persistent, add delay between sessions |
| `error_max_turns` | Returns result with `subtype: "error_max_turns"` | Increase maxTurns or break task into smaller chunks |
| `error_max_budget_usd` | Returns result with `subtype: "error_max_budget_usd"` | Log cost, potentially increase budget for complex phases |
| `error_during_execution` | Returns result with `subtype: "error_during_execution"`, `errors[]` | Parse errors, log to manifest, retry session |
| Context window exceeded | Auto-compaction triggers at ~95% capacity | Monitor `compact_boundary` messages; if compaction fails, start fresh session |
| Abort signal | Throws `AbortError` | Catch and handle gracefully; log partial results |
| Process crash | Subprocess exits | Catch in try/catch; resume from last known session ID if possible |

**Error Response Format (SDKResultMessage error):**
```typescript
{
  type: "result",
  subtype: "error_during_execution",
  session_id: "abc-123",
  is_error: true,
  errors: ["Tool execution failed: Bash command timed out"],
  total_cost_usd: 0.45,
  duration_ms: 120000,
  num_turns: 15,
  usage: { input_tokens: 50000, output_tokens: 12000 }
}
```

---

## 6. SDK / Library Recommendation

**Recommended**: `@anthropic-ai/claude-agent-sdk` v0.2.45 (latest as of 2026-02-17)
**Install**: `npm install @anthropic-ai/claude-agent-sdk`
**Why**: Official SDK from Anthropic. Provides the complete Claude Code agent loop with built-in tools, session management, context compaction, and subagent support. This is not a thin API wrapper — it is the full Claude Code runtime as a library.

**Requirements**: Node.js 18+, Zod ^3.24.1

**TypeScript GitHub**: https://github.com/anthropics/claude-agent-sdk-typescript (811 stars, 39 releases)
**Python Alternative**: `pip install claude-agent-sdk` (Python 3.10+)

**Important distinction from Anthropic Client SDK (`@anthropic-ai/sdk`)**:
- The **Client SDK** gives you raw Messages API access — you implement the tool loop yourself.
- The **Agent SDK** gives you Claude Code's full agent loop — tools execute automatically.
- The orchestrator needs the **Agent SDK** because it needs Claude to autonomously read files, run commands, edit code, and execute slash commands.

---

## 7. Integration Gotchas

1. **OAuth via Subprocess Works (Confirmed 2026-02-19)**: The Agent SDK spawns the `claude` CLI as a subprocess. The CLI reads the developer's OAuth token from the macOS Keychain automatically — no `ANTHROPIC_API_KEY` needed. Billing goes through the Claude Max subscription. `ANTHROPIC_API_KEY` MUST NOT be used.

2. **No Explicit Session Destruction API**: There is no `destroySession()` or `closeSession()` method in V1. Sessions are "destroyed" by simply not resuming them. The subprocess terminates when the generator completes. The V2 preview adds `session.close()` but this is unstable. For the orchestrator, this means "context clearing" = "start a new `query()` call without `resume`".

3. **The SDK Spawns a Subprocess**: The Agent SDK does not make direct API calls to Anthropic. It spawns a Claude Code subprocess (the same binary as the CLI) and communicates via IPC. This means: (a) Claude Code must be installed/bundled, (b) each `query()` call has process startup overhead, (c) the subprocess manages its own API calls, retries, and context.

4. **`settingSources` Must Include `"project"` for Slash Commands**: By default, the SDK loads NO filesystem settings. If the orchestrator needs PIV commands (`/prime`, `/plan-feature`, etc.) from `.claude/commands/`, it MUST set `settingSources: ["project"]`. Without this, custom commands are invisible.

5. **`systemPrompt` Preset Required for CLAUDE.md**: To have the agent read and respect the target project's `CLAUDE.md`, you must set BOTH `settingSources: ["project"]` AND `systemPrompt: { type: "preset", preset: "claude_code" }`. A plain string `systemPrompt` replaces the Claude Code system prompt entirely.

6. **V2 Interface Is Unstable Preview**: The cleaner `send()`/`stream()` pattern is marked as `unstable_v2_*`. It may have breaking changes. For production orchestrator code, V1 `query()` with `resume` is the stable choice, despite being more verbose.

7. **Automatic Context Compaction**: The SDK auto-compacts at ~95% context window capacity (configurable via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` env var). Compaction summarizes conversation history, which means some context detail is lost. For the orchestrator, this is generally acceptable — but extremely long sessions (e.g., complex /execute runs) may lose important early context after compaction.

8. **`maxBudgetUsd` Is Essential for Automation**: Without a budget cap, a runaway agent (e.g., stuck in a loop) will consume unlimited API credits. Always set `maxBudgetUsd` for automated orchestrator sessions.

9. **`bypassPermissions` Requires `allowDangerouslySkipPermissions: true`**: To use `permissionMode: "bypassPermissions"`, you must also set `allowDangerouslySkipPermissions: true` in the options object. This is a safety gate.

10. **Cost Tracking via Result Messages**: The `total_cost_usd` and `modelUsage` fields in `SDKResultMessage` provide precise cost tracking per query. The orchestrator should aggregate these for per-phase and per-run cost reporting.

11. **1M Context Window Requires Tier 4 + Beta Flag**: The 1M token context window is only available to Tier 4 organizations ($400+ credit purchase). Enable via `betas: ["context-1m-2025-08-07"]` in options. Premium pricing applies (2x input, 1.5x output for >200K tokens).

12. **Anthropic Third-Party Policy Note**: Anthropic's policy on third-party developer use of claude.ai login applies to products offered to external users. For personal/internal orchestration (PIV loop), the developer's own Claude Max subscription via OAuth subprocess is the correct auth method — no `ANTHROPIC_API_KEY` needed.

---

## 8. PRD Capability Mapping

| PRD Capability | SDK Method | Implementation Notes |
|---------------|-----------|---------------------|
| Create new conversation (fresh Claude Code session) | `query({ prompt, options })` without `resume` | New subprocess, fresh context window |
| Send messages within conversations (type commands) | `query({ prompt: "/command args", options: { resume: sessionId } })` | Slash commands work as prompts. V2: `session.send("/command")` |
| Read conversation responses (read terminal output) | Iterate `for await (const msg of query(...))` | Filter by `msg.type`: `"assistant"` for text, `"result"` for final output |
| Destroy conversations (context clearing) | Start new `query()` without `resume` | No explicit destroy API; subprocess terminates on generator completion |
| OAuth token management | CLI subprocess reads OAuth from Keychain | No env var needed. Subscription billing via Claude Max. |
| SC-001: Full phase completion | Create query with `/prime` prompt, resume with `/plan-feature`, parse result | Two `query()` calls sharing session via `resume`, or V2 multi-turn |
| SC-002: Multi-phase iteration | New `query()` for each phase (no resume between phases) | Achieves context isolation. Each phase starts fresh. |
| SC-004: Credential provisioning | `query()` with `/research-stack`, parse structured output | Use `outputFormat` with JSON schema for structured parsing |
| SC-011: Crash recovery | `query()` with `resume: lastKnownSessionId` | SDK restores full context. If session is too old/corrupted, start fresh. |
| Cost tracking per session | Read `total_cost_usd` from SDKResultMessage | Aggregate in manifest for per-phase cost reporting |
| Agent abort/timeout | Pass `AbortController`, call `.abort()` on timeout | Catch `AbortError` and handle gracefully |

---

## 9. Live Integration Testing Specification

### 9.1 Testing Tier Classification

#### Tier 1: Auto-Live (No Approval Needed)

| Endpoint | Method | Purpose | Expected Response Shape | Failure Means |
|----------|--------|---------|------------------------|---------------|
| `query()` with trivial prompt | SDK call | Verify API key, model access, SDK setup | `SDKResultMessage` with `subtype: "success"` | API key invalid, SDK not installed, or model unavailable |
| `query()` with `maxTurns: 1` | SDK call | Verify session creation and message streaming | `SDKSystemMessage` with `session_id` present | Subprocess spawn failure or API connectivity issue |
| `query()` checking `slash_commands` | SDK call | Verify custom commands loaded | `SDKSystemMessage.slash_commands` includes custom commands | `settingSources` not set to `["project"]` |

**Health Check Command:**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function healthCheck(): Promise<boolean> {
  try {
    for await (const message of query({
      prompt: "Respond with exactly: HEALTH_OK",
      options: {
        model: "claude-opus-4-6",
        maxTurns: 1,
        maxBudgetUsd: 0.05
      }
    })) {
      if (message.type === "result" && message.subtype === "success") {
        return message.result.includes("HEALTH_OK");
      }
    }
    return false;
  } catch (e) {
    console.error("Health check failed:", e);
    return false;
  }
}
```

**Schema Validation:**
```typescript
function validateInitMessage(msg: any): boolean {
  return (
    msg.type === "system" &&
    msg.subtype === "init" &&
    typeof msg.session_id === "string" &&
    Array.isArray(msg.tools) &&
    typeof msg.model === "string"
  );
}
```

#### Tier 2: Auto-Live with Test Data (No Approval Needed)

| Endpoint | Action | Test Data | Cleanup Action | Why Safe |
|----------|--------|-----------|----------------|----------|
| `query()` with file read | Read a known test file | PIV_TEST_FILE in target project | None needed | Read-only |
| `query()` with `/prime` command | Execute prime in test project | Test project with CLAUDE.md | None needed | Read-only analysis |
| `query()` with resume | Resume a session | Session ID from Tier 1 test | None needed | Continues existing session |
| `query()` with `maxTurns` guard | Verify turn limit works | Set maxTurns: 2 | None needed | Self-limiting |
| `query()` with `maxBudgetUsd` guard | Verify budget limit works | Set maxBudgetUsd: 0.01 | None needed | Self-limiting |

**Test Data Configuration:**
```typescript
const TEST_CONFIG = {
  test_project_dir: process.env.PIV_TEST_PROJECT_DIR || "/tmp/piv-test-project",
  test_prompt: "List the files in this directory using Glob",
  max_budget: 0.10,
  max_turns: 5,
  session_ids: [] as string[]  // Populated during test, used for resume tests
};
```

**Cleanup Procedure:**
```typescript
// No cleanup needed — Tier 2 tests are read-only or self-contained.
// Session state is ephemeral and does not persist on disk beyond
// the SDK's internal session storage in ~/.claude/
```

#### Tier 3: Approval-Required Live (Human in the Loop)

| Endpoint | Action | Estimated Cost | Side Effect | Fallback Fixture |
|----------|--------|---------------|-------------|-----------------|
| `query()` with `/plan-feature` | Full plan generation | ~$1-5 per plan (Opus 4.6) | Creates plan.md file in target project | `.agents/fixtures/agent-sdk-plan-output.json` |
| `query()` with `/execute` | Full code execution | ~$2-10 per execution (Opus 4.6) | Modifies files in target project | `.agents/fixtures/agent-sdk-execute-output.json` |
| Multi-turn session (V1 resume) | Resume and continue conversation | ~$0.50-2 per turn | Accumulates context and cost | `.agents/fixtures/agent-sdk-multiturn.json` |

**Approval Prompt Format:**
```
Tier 3 Approval Required: Claude Agent SDK

To validate [session lifecycle management], I need to:
> Call: query() with /plan-feature prompt
> With: Test PRD phase targeting test project
> Cost: ~$1-5 (Claude Opus 4.6 API usage)
> Effect: Creates plan file in test project directory
> Cleanup: Delete generated plan file after validation

Options:
  [1] Approve - make live call
  [2] Use recorded fixture (last recorded: [date or "none"])
  [3] Skip this test
```

**Fixture Format:**
```json
{
  "recorded_at": "2026-02-18T10:00:00Z",
  "operation": "query() with /plan-feature",
  "request": {
    "prompt": "/plan-feature 'Phase 1: Test Phase'",
    "options": {
      "model": "claude-opus-4-6",
      "maxTurns": 50,
      "maxBudgetUsd": 5.0,
      "settingSources": ["project"]
    }
  },
  "response": {
    "type": "result",
    "subtype": "success",
    "session_id": "test-session-id",
    "result": "[Plan output text...]",
    "total_cost_usd": 2.34,
    "duration_ms": 45000,
    "num_turns": 23
  },
  "notes": "Recorded during Phase 1 validation of orchestrator"
}
```

#### Tier 4: Mock Only (Never Live)

| Endpoint | Why Mock Only | Fixture File | Mock Strategy |
|----------|--------------|-------------|---------------|
| `query()` with `permissionMode: "bypassPermissions"` + destructive Bash | Could delete files or run dangerous commands | `.agents/fixtures/agent-sdk-destructive.json` | Return pre-recorded result showing successful destructive operation |

**Mock Implementation:**
```typescript
// Mock the query function for Tier 4 tests
function mockQuery(fixture: string) {
  const data = JSON.parse(readFileSync(fixture, "utf-8"));
  return (async function* () {
    yield data.init_message;
    for (const msg of data.assistant_messages) {
      yield msg;
    }
    yield data.result_message;
  })();
}
```

### 9.2 Test Environment Configuration

**Environment Variables Required for Testing:**
| Variable | Purpose | Tier | Example |
|----------|---------|------|---------|
| ~~`ANTHROPIC_API_KEY`~~ | ~~API authentication~~ | — | **NOT NEEDED — CLI subprocess reads OAuth from Keychain** |
| `PIV_TEST_PROJECT_DIR` | Test project directory | Tier 2-3 | `/tmp/piv-test-project` |
| `PIV_TEST_MAX_BUDGET` | Maximum test budget | Tier 3 | `5.00` |

**Sandbox Availability:**
- [x] This SDK does not have a sandbox/test mode
- The SDK makes real API calls to Anthropic's production API
- Cost is controlled via `maxBudgetUsd` and `maxTurns` options
- Tier 1-2 tests use production API with safe, read-only operations and budget caps

### 9.3 Testing Sequence

```
1. Tier 1 (auto-live) -> Verify SDK installed, CLI auth valid (OAuth via Keychain), model accessible
   |-- If FAIL -> Stop. SDK or auth is broken.
   +-- If PASS -> Continue

2. Tier 2 (auto-live with test data) -> Verify session lifecycle
   |-- Create session, verify init message
   |-- Send prompt, verify assistant messages stream
   |-- Verify result message with cost/usage
   |-- Resume session, verify context preserved
   |-- Verify maxTurns and maxBudgetUsd limits
   +-- If any FAIL -> WARN, log specifics

3. Tier 3 (approval-required) -> Verify command execution
   |-- Present approval for /plan-feature test
   |-- If approved -> Execute, record response, validate
   |-- If "use fixture" -> Load fixture, validate format
   +-- If "skip" -> Log as SKIPPED

4. Tier 4 (mock only) -> Verify orchestrator handles edge cases
   |-- Load destructive operation fixtures
   |-- Feed to orchestrator's response parsing logic
   +-- Verify orchestrator behavior matches expected handling
```

---

## Appendix A: Pricing Reference

**Claude Opus 4.6 (recommended for PIV Orchestrator):**
| Category | Cost per MTok |
|----------|--------------|
| Base Input | $5.00 |
| Cache Write (5min) | $6.25 |
| Cache Write (1hr) | $10.00 |
| Cache Hit/Refresh | $0.50 |
| Output | $25.00 |
| Batch Input | $2.50 |
| Batch Output | $12.50 |

**Claude Sonnet 4.6 (cost-effective alternative for simpler tasks):**
| Category | Cost per MTok |
|----------|--------------|
| Base Input | $3.00 |
| Output | $15.00 |
| Cache Hit/Refresh | $0.30 |

**Estimated orchestrator costs per PIV session:**
- `/prime` (read-only analysis): ~$0.10-0.50 (mostly input tokens from codebase reading)
- `/plan-feature` (generation): ~$1.00-5.00 (heavy output generation)
- `/execute` (code writing): ~$2.00-10.00 (many tool calls, file edits, command execution)
- `/validate-implementation` (testing): ~$0.50-3.00 (analysis and test execution)
- Full phase cycle: ~$4.00-18.00 estimated

## Appendix B: Context Window Sizes

| Model | Standard | 1M Beta (Tier 4+) |
|-------|----------|-------------------|
| Claude Opus 4.6 | 200K tokens | 1M tokens |
| Claude Sonnet 4.6 | 200K tokens | 1M tokens |
| Claude Sonnet 4.5 | 200K tokens | 1M tokens |
| Claude Haiku 4.5 | 200K tokens | N/A |

**Auto-compaction**: Triggers at ~95% capacity by default. Override with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` env var (e.g., set to 50 for earlier compaction).

**Context awareness**: Claude Sonnet 4.6, 4.5, and Haiku 4.5 receive explicit token budget tracking (`<budget:token_budget>200000</budget:token_budget>`) and per-turn usage updates. This helps the agent manage long sessions efficiently.

## Appendix C: Community Libraries & Orchestration Patterns

**Official Demos**: https://github.com/anthropics/claude-agent-sdk-demos
- `research-agent`: Multi-agent orchestration with subagent coordination
- `simple-chatapp`: Multi-turn session handling
- `email-agent`: External service integration pattern

**Community Orchestrators:**
- **claude-flow** (github.com/ruvnet/claude-flow): Multi-agent swarm orchestration platform with enterprise architecture and MCP support
- **ccswarm** (github.com/nwiizo/ccswarm): Git worktree isolation with specialized agents
- **claude-code-by-agents** (github.com/baryhuang/claude-code-by-agents): Desktop app for multi-agent coordination via @mentions
- **Microsoft Agent Framework integration**: Compose Claude agents with other frameworks in sequential, concurrent, handoff, and group chat workflows

**Key community pattern for orchestrators**: Spawn separate `query()` calls per task, capture session IDs for resume, aggregate costs from result messages, and use `maxBudgetUsd` + `maxTurns` as safety rails.

---

## PIV-Automator-Hooks
tech_name: claude-agent-sdk
research_status: complete
endpoints_documented: 6
tier_1_count: 3
tier_2_count: 5
tier_3_count: 3
tier_4_count: 1
gotchas_count: 12
confidence: high
