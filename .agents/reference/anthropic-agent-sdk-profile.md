# Technology Profile: Anthropic Agent SDK

**Generated**: 2026-02-20
**PRD Reference**: Section 3 - Anthropic Agent SDK
**Agent Use Case**: Spawn Claude Code sessions programmatically for remote diagnosis and fixing of stalled projects

---

## 1. Authentication & Setup

### Auth Type
API key authentication via the `ANTHROPIC_API_KEY` environment variable. Third-party providers (AWS Bedrock, Google Vertex AI, Microsoft Azure) are also supported via their respective env vars.

**Important**: The SDK requires API key authentication. Using claude.ai subscription billing (Pro/Max) is explicitly prohibited by Anthropic for third-party SDK applications.

### Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

**Requirements**: Node.js 18+

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (unless using third-party) | Anthropic API key from Console |
| `CLAUDE_CODE_USE_BEDROCK` | No | Set to `1` to use AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | No | Set to `1` to use Google Vertex AI |
| `CLAUDE_CODE_USE_FOUNDRY` | No | Set to `1` to use Microsoft Azure |

### Minimal Working Example

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "What files are in this directory?",
  options: { allowedTools: ["Bash", "Glob"] }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Package History

The SDK was renamed from `@anthropic-ai/claude-code` to `@anthropic-ai/claude-agent-sdk` in early 2026. The old package name is deprecated. Import paths changed but the API surface is mostly the same, with three breaking changes documented in Section 7.

---

## 2. Core Data Models

### Options (query configuration)

```typescript
interface Options {
  abortController?: AbortController;          // Cancel operations
  additionalDirectories?: string[];           // Extra dirs Claude can access
  agents?: Record<string, AgentDefinition>;   // Programmatic subagents
  allowedTools?: string[];                    // Whitelist of tool names
  allowDangerouslySkipPermissions?: boolean;  // Required for bypassPermissions
  betas?: SdkBeta[];                          // e.g. ['context-1m-2025-08-07']
  canUseTool?: CanUseTool;                    // Custom permission callback
  continue?: boolean;                         // Continue most recent conversation
  cwd?: string;                               // Working directory (default: process.cwd())
  disallowedTools?: string[];                 // Blacklist of tool names
  enableFileCheckpointing?: boolean;          // Track file changes for rewind
  env?: Dict<string>;                         // Environment variables (default: process.env)
  fallbackModel?: string;                     // Model if primary fails
  forkSession?: boolean;                      // Fork instead of continue on resume
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  includePartialMessages?: boolean;           // Stream partial messages
  maxBudgetUsd?: number;                      // USD budget cap
  maxThinkingTokens?: number;                 // Thinking token limit
  maxTurns?: number;                          // Conversation turn limit
  mcpServers?: Record<string, McpServerConfig>;
  model?: string;                             // Claude model to use
  outputFormat?: { type: 'json_schema'; schema: JSONSchema }; // Structured output
  pathToClaudeCodeExecutable?: string;        // Custom executable path
  permissionMode?: PermissionMode;            // 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  resume?: string;                            // Session ID to resume
  resumeSessionAt?: string;                   // Resume at specific message UUID
  sandbox?: SandboxSettings;                  // Sandbox configuration
  settingSources?: SettingSource[];           // ['user','project','local'] or [] (default: [])
  stderr?: (data: string) => void;            // stderr callback
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
}
```

### SDKMessage (union of all message types)

```typescript
type SDKMessage =
  | SDKAssistantMessage    // Assistant responses with tool use
  | SDKUserMessage         // User inputs
  | SDKUserMessageReplay   // Replayed user messages (resume)
  | SDKResultMessage       // Final result with cost/usage
  | SDKSystemMessage       // System init with session_id, tools, model
  | SDKPartialAssistantMessage  // Streaming partial (when includePartialMessages: true)
  | SDKCompactBoundaryMessage;  // Conversation compaction marker
```

### SDKResultMessage (the message that matters most for our use case)

```typescript
type SDKResultMessage =
  | {
      type: "result";
      subtype: "success";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;              // <-- Final text output
      total_cost_usd: number;      // <-- Actual cost of session
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      structured_output?: unknown; // <-- If outputFormat was used
    }
  | {
      type: "result";
      subtype: "error_max_turns" | "error_during_execution"
            | "error_max_budget_usd" | "error_max_structured_output_retries";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      errors: string[];            // <-- Error details
    };
```

### SDKSystemMessage (init message with session ID)

```typescript
type SDKSystemMessage = {
  type: "system";
  subtype: "init";
  uuid: UUID;
  session_id: string;        // <-- Capture this for session resume
  apiKeySource: ApiKeySource;
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
};
```

### Query (return type of query())

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(userMessageUuid: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
}
```

### AgentDefinition (for subagents)

```typescript
type AgentDefinition = {
  description: string;              // When to use this agent
  tools?: string[];                 // Allowed tools (inherits if omitted)
  prompt: string;                   // Agent system prompt
  model?: "sonnet" | "opus" | "haiku" | "inherit";
};
```

---

## 3. Key Endpoints

The SDK has a single primary function: `query()`. All interaction happens through this function and the async generator it returns.

### 3.1 Basic Query — Run a Task in a Remote Directory

This is the core pattern for the supervisor: spawn a session in a specific project directory, pass diagnostic context, and get results back.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function runDiagnosticSession(
  projectDir: string,
  diagnosticPrompt: string
): Promise<{ result: string; cost: number; sessionId: string }> {
  let sessionId = "";
  let result = "";
  let cost = 0;

  const q = query({
    prompt: diagnosticPrompt,
    options: {
      cwd: projectDir,
      model: "claude-sonnet-4-6",
      maxTurns: 30,
      maxBudgetUsd: 2.0,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
      settingSources: ["project"],  // Load the project's CLAUDE.md
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "You are a diagnostic agent. Focus on identifying and fixing the issue described."
      },
    },
  });

  for await (const message of q) {
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        result = message.result;
        cost = message.total_cost_usd;
      } else {
        result = `ERROR [${message.subtype}]: ${message.errors?.join(", ")}`;
        cost = message.total_cost_usd;
      }
    }
  }

  return { result, cost, sessionId };
}
```

### 3.2 Session Resume — Continue a Previous Conversation

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function resumeSession(
  sessionId: string,
  followUpPrompt: string
): Promise<string> {
  let result = "";

  for await (const message of query({
    prompt: followUpPrompt,
    options: {
      resume: sessionId,
      model: "claude-sonnet-4-6",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "result" && message.subtype === "success") {
      result = message.result;
    }
  }

  return result;
}
```

### 3.3 Session Fork — Branch from a Previous Session

```typescript
const forkedQuery = query({
  prompt: "Try an alternative fix approach",
  options: {
    resume: originalSessionId,
    forkSession: true,  // New session ID, original preserved
    model: "claude-sonnet-4-6",
  },
});
```

### 3.4 Structured Output — Get Parseable Results

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

interface DiagnosticResult {
  issue_found: boolean;
  root_cause: string;
  files_modified: string[];
  fix_applied: boolean;
  fix_description: string;
  confidence: "high" | "medium" | "low";
}

const diagnosticSchema = {
  type: "object",
  properties: {
    issue_found: { type: "boolean" },
    root_cause: { type: "string" },
    files_modified: { type: "array", items: { type: "string" } },
    fix_applied: { type: "boolean" },
    fix_description: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["issue_found", "root_cause", "fix_applied", "confidence"],
};

for await (const message of query({
  prompt: "Diagnose why the tests are failing and fix the issue.",
  options: {
    cwd: "/path/to/project",
    outputFormat: { type: "json_schema", schema: diagnosticSchema },
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
  },
})) {
  if (message.type === "result" && message.subtype === "success") {
    const diag = message.structured_output as DiagnosticResult;
    console.log(`Issue found: ${diag.issue_found}`);
    console.log(`Root cause: ${diag.root_cause}`);
    console.log(`Fix applied: ${diag.fix_applied}`);
    console.log(`Files modified: ${diag.files_modified?.join(", ")}`);
  }
}
```

### 3.5 Abort a Running Query

```typescript
const controller = new AbortController();

// Set a 5-minute timeout
setTimeout(() => controller.abort(), 5 * 60 * 1000);

const q = query({
  prompt: "Long-running diagnostic task",
  options: {
    abortController: controller,
    cwd: "/path/to/project",
  },
});

try {
  for await (const message of q) {
    // Process messages...
  }
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    console.log("Session timed out and was aborted");
  }
}
```

### 3.6 Custom Environment Variables Per Session

```typescript
const q = query({
  prompt: "Run the integration tests",
  options: {
    cwd: "/path/to/project",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://localhost:5432/testdb",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
  },
});
```

### 3.7 Read-Only Diagnostic Session (No File Modifications)

```typescript
const q = query({
  prompt: "Analyze the codebase and report on the current state of the authentication module.",
  options: {
    cwd: "/path/to/project",
    allowedTools: ["Read", "Glob", "Grep"],  // Read-only tools only
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    maxTurns: 15,
    maxBudgetUsd: 0.50,
  },
});
```

### 3.8 Subagent Delegation

```typescript
const q = query({
  prompt: "Use the diagnostics agent to analyze the test failures, then use the fixer agent to apply corrections.",
  options: {
    cwd: "/path/to/project",
    allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write", "Task"],
    agents: {
      "diagnostics": {
        description: "Analyzes test failures and identifies root causes",
        prompt: "You are a diagnostic specialist. Read test output, trace failures to source code, and report root causes.",
        tools: ["Read", "Glob", "Grep", "Bash"],
        model: "sonnet",
      },
      "fixer": {
        description: "Applies targeted code fixes based on diagnostic reports",
        prompt: "You are a code fixer. Apply minimal, targeted fixes based on the diagnostic report provided.",
        tools: ["Read", "Edit", "Write", "Bash"],
        model: "sonnet",
      },
    },
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  },
});
```

### 3.9 Hooks — Monitor Tool Usage During Session

```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";

const logToolUse: HookCallback = async (input) => {
  if (input.hook_event_name === "PostToolUse") {
    console.log(`Tool used: ${input.tool_name}`);
  }
  return {};
};

const sessionEnd: HookCallback = async (input) => {
  if (input.hook_event_name === "SessionEnd") {
    console.log(`Session ended. Reason: ${(input as any).reason}`);
  }
  return {};
};

const q = query({
  prompt: "Fix the failing tests",
  options: {
    cwd: "/path/to/project",
    hooks: {
      PostToolUse: [{ hooks: [logToolUse] }],
      SessionEnd: [{ hooks: [sessionEnd] }],
    },
  },
});
```

---

## 4. Rate Limits & Throttling

### Token Pricing (Claude API, per million tokens)

| Model | Input | Output | Cache Hits | 5m Cache Write | 1h Cache Write |
|-------|-------|--------|------------|----------------|----------------|
| Claude Opus 4.6 | $5.00 | $25.00 | $0.50 | $6.25 | $10.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 | $3.75 | $6.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | $1.25 | $2.00 |

### Long Context Pricing (>200K input tokens with 1M beta enabled)

| Model | Input (>200K) | Output (>200K) |
|-------|---------------|----------------|
| Opus 4.6 | $10.00/MTok | $37.50/MTok |
| Sonnet 4.6/4.5/4 | $6.00/MTok | $22.50/MTok |

### Per-Session Cost Estimates (for supervisor use case)

| Session Type | Estimated Tokens | Estimated Cost (Sonnet 4.6) | Estimated Cost (Opus 4.6) |
|-------------|------------------|----------------------------|--------------------------|
| Read-only diagnosis | ~20-40K total | $0.10 - $0.30 | $0.20 - $0.60 |
| Simple fix (edit 1-3 files) | ~50-80K total | $0.30 - $0.80 | $0.60 - $1.60 |
| Complex fix (multi-file) | ~80-150K total | $0.80 - $2.00 | $1.60 - $4.00 |
| Full diagnostic + fix | ~100-200K total | $1.00 - $3.00 | $2.00 - $6.00 |

### Cost Controls

- `maxBudgetUsd`: Hard cap on session cost. Session stops with `error_max_budget_usd` result subtype when exceeded.
- `maxTurns`: Limit conversation turns. Session stops with `error_max_turns` when exceeded.
- `maxThinkingTokens`: Limit thinking/reasoning tokens.

### Rate Limits

Rate limits are per-organization, per-model, measured in RPM (requests per minute), ITPM (input tokens per minute), and OTPM (output tokens per minute). Limits vary by usage tier (1-4). The SDK does not add rate limits beyond what the Claude API enforces. Multiple concurrent `query()` calls from different processes share the same organization rate limits.

### Concurrency

- One active `query()` per process is the recommended pattern
- Multiple processes can run concurrent sessions (different project directories)
- Known issue: Running multiple agents on the same machine can cause connection conflicts (GitHub Issue #24631)

---

## 5. Error Handling

### Error Result Subtypes

When a query completes abnormally, the `SDKResultMessage` includes a `subtype` indicating the failure mode:

| Subtype | Meaning | Retry Strategy |
|---------|---------|----------------|
| `success` | Completed normally | N/A |
| `error_max_turns` | Hit maxTurns limit | Increase maxTurns or simplify prompt |
| `error_during_execution` | Runtime error during session | Inspect `errors[]`, retry with adjusted prompt |
| `error_max_budget_usd` | Hit maxBudgetUsd cap | Increase budget or use cheaper model |
| `error_max_structured_output_retries` | Failed to produce valid structured output | Simplify schema or prompt |

### Process-Level Errors

The SDK subprocess can fail before returning messages. These must be caught at the async generator level:

```typescript
try {
  for await (const message of query({ prompt, options })) {
    // Process messages
  }
} catch (error) {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      // Session was aborted (timeout or manual abort)
    } else if (error.message.includes("ENOENT")) {
      // Claude Code executable not found
    } else if (error.message.includes("exit code")) {
      // Process crashed — check stderr callback for details
    } else {
      // Unknown error
    }
  }
}
```

### Known Error Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | General error (check stderr for details) |
| 14 | SDK execution error (reported in GitHub Actions contexts) |
| -15 (SIGTERM) | Process was terminated (timeout/abort) |

### Recommended Error Handling Pattern for Supervisor

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

interface SessionResult {
  success: boolean;
  result: string;
  cost: number;
  sessionId: string;
  errorCategory?: string;
}

async function safeQuery(
  projectDir: string,
  prompt: string,
  budgetUsd: number = 2.0,
  maxTurns: number = 30,
  timeoutMs: number = 300_000  // 5 minutes
): Promise<SessionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let sessionId = "";
  let stderrOutput = "";

  try {
    const q = query({
      prompt,
      options: {
        cwd: projectDir,
        model: "claude-sonnet-4-6",
        maxTurns,
        maxBudgetUsd: budgetUsd,
        abortController: controller,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
        settingSources: ["project"],
        stderr: (data) => { stderrOutput += data; },
      },
    });

    for await (const message of q) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
      }

      if (message.type === "result") {
        clearTimeout(timeout);

        if (message.subtype === "success") {
          return {
            success: true,
            result: message.result,
            cost: message.total_cost_usd,
            sessionId,
          };
        } else {
          return {
            success: false,
            result: message.errors?.join("\n") ?? "Unknown error",
            cost: message.total_cost_usd,
            sessionId,
            errorCategory: message.subtype,
          };
        }
      }
    }

    // Generator finished without result message (shouldn't happen)
    clearTimeout(timeout);
    return {
      success: false,
      result: "Session ended without result message",
      cost: 0,
      sessionId,
      errorCategory: "error_during_execution",
    };
  } catch (error) {
    clearTimeout(timeout);
    const errMsg = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof Error && error.name === "AbortError";

    return {
      success: false,
      result: isAbort
        ? `Session timed out after ${timeoutMs}ms`
        : `Process error: ${errMsg}\nStderr: ${stderrOutput}`,
      cost: 0,
      sessionId,
      errorCategory: isAbort ? "timeout" : "process_error",
    };
  }
}
```

---

## 6. SDK / Library Recommendation

### Package

| Field | Value |
|-------|-------|
| Package name | `@anthropic-ai/claude-agent-sdk` |
| Current version | `0.2.49` (as of 2026-02-20) |
| Previous name (deprecated) | `@anthropic-ai/claude-code` |
| Install command | `npm install @anthropic-ai/claude-agent-sdk` |
| Runtime requirement | Node.js 18+ |
| TypeScript support | Built-in type definitions |
| Repository | `github.com/anthropics/claude-agent-sdk-typescript` |
| Total releases | 41 |
| Stars | 818 |

### Imports

```typescript
// Primary function
import { query } from "@anthropic-ai/claude-agent-sdk";

// With MCP tools and helpers
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

// Types (for TypeScript usage)
import type {
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  Options,
  HookCallback,
  HookCallbackMatcher,
  PermissionMode,
  AgentDefinition,
} from "@anthropic-ai/claude-agent-sdk";
```

### V2 Preview API

A simplified V2 interface with `send()` and `receive()` patterns is available in preview but has known issues (see Section 7). Recommendation: **Use the stable V1 `query()` API for production.**

---

## 7. Integration Gotchas

### Critical Issues (must account for)

1. **Settings sources default changed**: The SDK no longer loads CLAUDE.md, settings.json, or slash commands by default. You MUST pass `settingSources: ["project"]` to load project configuration. Without this, the session operates without project context.

2. **System prompt default changed**: The SDK no longer uses Claude Code's system prompt by default. You MUST pass `systemPrompt: { type: "preset", preset: "claude_code" }` or a custom string to get useful behavior. Without this, the agent uses a minimal system prompt.

3. **bypassPermissions requires flag pair**: Setting `permissionMode: "bypassPermissions"` also requires `allowDangerouslySkipPermissions: true`. Without both, the session will error.

4. **Connection conflicts with concurrent local agents**: Running multiple Claude agents on the same machine can cause API connection conflicts (GitHub Issue #24631). The supervisor should serialize sessions or use separate processes.

5. **SDKRateLimitEvent type not exported**: In v0.2.45+, the `SDKRateLimitEvent` type is referenced but not exported, causing `SDKMessage` to resolve to `any` in TypeScript. Workaround: use explicit type narrowing on `message.type` (GitHub Issues #181, #184).

6. **Missing dependency on @anthropic-ai/sdk**: The package references but does not properly declare the dependency on `@anthropic-ai/sdk` (GitHub Issue #179). May need to install it separately.

### Important Behavioral Notes

7. **sessions-index.json not updated by SDK**: Only the CLI updates the session index file. SDK-created sessions do not appear in `sessions-index.json` (GitHub Issue #164). Track session IDs in your own state (manifest).

8. **Subagent tool restrictions not enforced on child processes**: The `tools` and `disallowedTools` options on `AgentDefinition` are not enforced for subagent child processes (GitHub Issue #172). Do not rely on subagent tool restrictions for security.

9. **Agent SDK defaults to 1-hour cache TTL**: Instead of the expected 5-minute TTL, the SDK defaults to 1-hour prompt caching (GitHub Issue #188). This affects cost calculations — cache writes are 2x vs 1.25x base input price.

10. **Docker/container ENOENT errors**: The SDK fails to find the Claude Code executable inside Docker containers even with `pathToClaudeCodeExecutable` set (GitHub Issue #865). Container deployment requires special setup.

11. **Large tool results get truncated**: When MCP or tool results exceed a threshold, the agent offloads them to a file. If file-system tools (Read) are not in `allowedTools`, the agent cannot read its own truncated output (GitHub Issue #175). Always include `Read` in `allowedTools`.

12. **V2 Session API issues**: The `unstable_v2_createSession` ignores `permissionMode`, `cwd`, `settingSources`, and `allowedTools` options (GitHub Issue #176). The `close()` method breaks session persistence (GitHub Issue #177). **Avoid V2 API for production use.**

---

## 8. PRD Capability Mapping

| PRD Requirement | SDK Feature | Implementation Notes |
|----------------|-------------|---------------------|
| Create sessions in arbitrary project directories | `options.cwd` | Pass absolute path to target project. Each query() can use a different cwd. |
| Pass rich context prompts (error details, log contents) | `prompt` parameter (string) | Concatenate error details, log excerpts, and fix instructions into the prompt string. No size limit beyond model context window. |
| Receive structured output (hooks, tool results) | `outputFormat` with JSON schema | Define a schema for diagnostic results. Use `message.structured_output` on success result. |
| Phase 1 — Minimal integration | `query()` with simple prompt | Single call, capture result string. No session management needed. |
| Phase 2 — Agent-waiting recovery restart | `query()` with `cwd` + `permissionMode: "bypassPermissions"` | Spawn session in stalled project dir, pass restart instructions, capture success/failure. |
| Phase 3 — Diagnosis sessions | `query()` with read-only tools + structured output | Use `allowedTools: ["Read", "Glob", "Grep"]` for diagnosis, then separate session with write tools for fix. |
| Phase 3 — Project intervention | `query()` with full tool access + `settingSources: ["project"]` | Full-power session with project context loaded. Use `maxBudgetUsd` to cap costs. |
| SC-002 — Framework bug fix | `query()` targeting framework project dir | `cwd: "/path/to/piv-dev-kit-agentic"` with edit tools enabled. |
| SC-003 — Multi-project pattern | Sequential `query()` calls with different `cwd` values | Serialize to avoid connection conflicts. Use `maxBudgetUsd` per session. |
| SC-004 — Project-specific bug | `query()` targeting specific project dir | Load project settings with `settingSources: ["project"]` to get project-specific CLAUDE.md. |
| SC-005 — Agent-waiting recovery | `query()` with Bash tool + restart instructions | Pass the stalled session context and restart command as prompt. |
| Token cost per session (~50-100K) | `maxBudgetUsd` option | Set to $1-3 for typical diagnostic sessions. Monitor via `result.total_cost_usd`. |
| One active query per process | SDK limitation | Use sequential execution in the supervisor. For parallel diagnosis, spawn child processes. |

---

## 9. Live Integration Testing Specification

### 9.1 Testing Tier Classification

**Tier 1: Health Check (no tokens consumed)**
- Verify SDK import succeeds
- Verify Claude Code executable can be found
- Verify API key is valid via `accountInfo()`

**Tier 2: Simple Query (minimal tokens, ~$0.01-0.05)**
- Run a minimal query with `maxTurns: 1` and `maxBudgetUsd: 0.10`
- Verify SDKSystemMessage with session_id is received
- Verify SDKResultMessage with success subtype is received
- Verify `total_cost_usd` is populated

**Tier 3: Full Diagnostic Session (real tokens, ~$0.50-2.00)**
- Run a diagnostic query against a test project directory
- Verify structured output matches expected schema
- Verify session resume works with captured session_id
- Verify `cwd` option correctly sets working directory
- Verify `allowedTools` restriction is enforced
- Verify `maxBudgetUsd` cap is respected

**Tier 4: N/A for SDK**
- No external service integration beyond the Claude API itself

### 9.2 Test Environment Configuration

```typescript
// test/agent-sdk.test.ts
const TEST_CONFIG = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  testProjectDir: "/tmp/agent-sdk-test-project",
  model: "claude-haiku-4-5",       // Cheapest model for testing
  maxBudgetUsd: 0.10,              // Hard cap per test
  maxTurns: 3,                     // Minimal turns
  timeoutMs: 60_000,               // 1 minute timeout per test
};
```

### 9.3 Testing Sequence

```typescript
// Tier 1: Import and health check
import { query } from "@anthropic-ai/claude-agent-sdk";

async function tier1HealthCheck(): Promise<boolean> {
  try {
    const q = query({
      prompt: "respond with 'ok'",
      options: {
        model: "claude-haiku-4-5",
        maxTurns: 1,
        maxBudgetUsd: 0.01,
        permissionMode: "plan",  // Plan mode = no execution
      },
    });

    for await (const message of q) {
      if (message.type === "system" && message.subtype === "init") {
        console.log("Tier 1 PASS: SDK initialized, session created");
        console.log(`  Model: ${message.model}`);
        console.log(`  Tools: ${message.tools.join(", ")}`);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Tier 1 FAIL:", error);
    return false;
  }
}

// Tier 2: Simple query with result capture
async function tier2SimpleQuery(): Promise<boolean> {
  try {
    let gotInit = false;
    let gotResult = false;

    for await (const message of query({
      prompt: "List the files in the current directory using Glob",
      options: {
        model: "claude-haiku-4-5",
        maxTurns: 3,
        maxBudgetUsd: 0.10,
        allowedTools: ["Glob"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: TEST_CONFIG.testProjectDir,
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        gotInit = true;
      }
      if (message.type === "result") {
        gotResult = true;
        console.log(`Tier 2: Cost $${message.total_cost_usd.toFixed(4)}, Turns: ${message.num_turns}`);
        if (message.subtype === "success") {
          console.log("Tier 2 PASS: Query completed successfully");
          return true;
        }
      }
    }

    if (!gotInit) console.error("Tier 2 FAIL: No init message");
    if (!gotResult) console.error("Tier 2 FAIL: No result message");
    return false;
  } catch (error) {
    console.error("Tier 2 FAIL:", error);
    return false;
  }
}

// Tier 3: Full diagnostic with structured output and session resume
async function tier3DiagnosticSession(): Promise<boolean> {
  const schema = {
    type: "object",
    properties: {
      files_found: { type: "number" },
      summary: { type: "string" },
    },
    required: ["files_found", "summary"],
  };

  let sessionId = "";

  try {
    // Phase A: Initial query with structured output
    for await (const message of query({
      prompt: "Count the files in this directory and provide a summary.",
      options: {
        model: "claude-haiku-4-5",
        maxTurns: 5,
        maxBudgetUsd: 0.50,
        allowedTools: ["Glob", "Read", "Bash"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: TEST_CONFIG.testProjectDir,
        outputFormat: { type: "json_schema", schema },
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
      }
      if (message.type === "result" && message.subtype === "success") {
        const output = message.structured_output as any;
        if (output && typeof output.files_found === "number") {
          console.log("Tier 3a PASS: Structured output received");
        } else {
          console.error("Tier 3a FAIL: Invalid structured output");
          return false;
        }
      }
    }

    // Phase B: Session resume
    if (!sessionId) {
      console.error("Tier 3b FAIL: No session ID captured");
      return false;
    }

    for await (const message of query({
      prompt: "What was the file count from before?",
      options: {
        resume: sessionId,
        model: "claude-haiku-4-5",
        maxTurns: 2,
        maxBudgetUsd: 0.20,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        console.log("Tier 3b PASS: Session resume successful");
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Tier 3 FAIL:", error);
    return false;
  }
}
```

---

## PIV-Automator-Hooks
tech_name: anthropic-agent-sdk
research_status: complete
endpoints_documented: 9
tier_1_count: 1
tier_2_count: 1
tier_3_count: 2
tier_4_count: 0
gotchas_count: 12
confidence: high
