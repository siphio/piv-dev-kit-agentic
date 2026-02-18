# Technology Profile: Anthropic Authentication (OAuth / API Auth)

**Generated**: 2026-02-18
**PRD Reference**: Section 3 - OAuth (Anthropic)
**Agent Use Case**: Authenticate the PIV Orchestrator with Anthropic's API using the developer's existing Claude subscription, enabling session creation and destruction via the Claude Agent SDK.

---

## CRITICAL: PRD Assumption vs Reality Gap

The PRD assumes OAuth 2.0 tokens from Claude Code can be used to authenticate the orchestrator with the Anthropic API, providing "single billing source" via the developer's existing subscription. **This assumption is partially correct but requires careful understanding of the two available authentication paths, their trade-offs, and recent restrictions.**

**Summary of findings:**

| PRD Assumption | Reality | Impact |
|---------------|---------|--------|
| OAuth token from Claude Code authenticates API calls | OAuth tokens work ONLY through Claude Agent SDK (subprocess wrapper), NOT through direct Anthropic API calls | Medium - Agent SDK path works; direct API path does not |
| Single billing source via subscription | Confirmed for Agent SDK path only; direct API requires separate pay-per-token billing | High - architecture must use Agent SDK, not raw API |
| Token refresh on expiration | Token refresh exists but is handled internally by Claude Code subprocess | Low - abstracted away by Agent SDK |
| Scoped access to conversation APIs | Agent SDK provides full conversation management (create, send, read, destroy) | None - this works as expected |

**Bottom line:** The orchestrator CAN use the developer's subscription for billing, but ONLY through the Claude Agent SDK (which spawns Claude Code as a subprocess). Direct Anthropic API calls with `x-api-key` require a separate API key with separate pay-per-token billing.

---

## 1. Authentication & Setup

### Authentication Path A: Claude Agent SDK + OAuth Token (RECOMMENDED)

**Auth Type**: OAuth 2.0 Bearer Token (via Claude Code subprocess)
**Auth Location**: Environment variable consumed by Claude Code subprocess internally
**Billing**: Developer's existing Claude Pro/Max subscription

The Claude Agent SDK does NOT make direct HTTP calls to the Anthropic API. It spawns the Claude Code CLI as a subprocess, and Claude Code handles all API communication internally. When `CLAUDE_CODE_OAUTH_TOKEN` is set, Claude Code authenticates against the developer's subscription.

**Setup Steps:**
1. Ensure Claude Code CLI is installed: `npm install -g @anthropic-ai/claude-code`
2. Generate OAuth token: run `claude setup-token` (opens browser for authentication)
3. Copy the displayed token
4. Set environment variable: `CLAUDE_CODE_OAUTH_TOKEN=<token>`
5. Install Agent SDK: `npm install @anthropic-ai/claude-agent-sdk`

**Auth Code Pattern (TypeScript):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// CLAUDE_CODE_OAUTH_TOKEN must be set in environment
// The Agent SDK reads it automatically via the Claude Code subprocess
for await (const message of query({
  prompt: "Your task here",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "bypassPermissions"
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

**Token Details:**
- Format: `sk-ant-oat01-...` (access token)
- Refresh token format: `sk-ant-ort01-...` (handled internally by Claude Code)
- Token lifetime: ~8 hours (28800 seconds) for access token
- Token generated via `claude setup-token` is valid for ~1 year
- Refresh is handled automatically by Claude Code subprocess

### Authentication Path B: Direct API Key (ALTERNATIVE)

**Auth Type**: API Key
**Auth Location**: `x-api-key` HTTP header
**Billing**: Separate pay-per-token billing via Anthropic Console

**Setup Steps:**
1. Go to https://console.anthropic.com/settings/keys
2. Create a new API key (format: `sk-ant-api03-...`)
3. Add billing information to Console account
4. Set environment variable: `ANTHROPIC_API_KEY=<key>`

**Auth Code Pattern (TypeScript - Standard SDK):**
```typescript
import Anthropic from "@anthropic-ai/sdk";

// Uses ANTHROPIC_API_KEY from environment
const client = new Anthropic();

const message = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }]
});
```

**Auth Code Pattern (TypeScript - Agent SDK with API Key):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// ANTHROPIC_API_KEY must be set in environment
for await (const message of query({
  prompt: "Your task here",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "bypassPermissions"
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Authentication Path C: Standard SDK with authToken (EXPERIMENTAL)

**Auth Type**: Bearer Token
**Auth Location**: `Authorization: Bearer` HTTP header
**Billing**: Unclear / unstable

The `@anthropic-ai/sdk` TypeScript package supports an `authToken` parameter that sends an `Authorization: Bearer` header instead of `x-api-key`. This reads from the `ANTHROPIC_AUTH_TOKEN` environment variable.

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  authToken: process.env.ANTHROPIC_AUTH_TOKEN  // Bearer token
});
```

**WARNING:** As of January-February 2026, Anthropic has been actively blocking OAuth tokens (`sk-ant-oat01-*`) from direct API calls by third-party tools. The error message returned is: "This credential is only authorized for use with Claude Code and cannot be used for other API requests." This path is unreliable and NOT recommended.

**Environment Variables:**

| Variable | Purpose | Required | Path |
|----------|---------|----------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for Agent SDK (subscription billing) | Yes (Path A) | A |
| `ANTHROPIC_API_KEY` | API key for direct API or Agent SDK (pay-per-token) | Yes (Path B) | B |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token for standard SDK (experimental) | Yes (Path C) | C |

---

## 2. Core Data Models

### OAuth Token Structure (from `~/.claude/.credentials.json` on Linux)

On macOS, these values are stored in the encrypted Keychain, not in a file.

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `accessToken` | string | `sk-ant-oat01-...` format, used for API auth | Yes |
| `refreshToken` | string | `sk-ant-ort01-...` format, used to renew access | Yes |
| `expiresAt` | number | Unix timestamp when access token expires | Yes |
| `scopes` | string[] | Permission scopes (e.g., `user:inference`, `user:profile`) | Yes |

### Agent SDK Session Model

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `session_id` | string | Unique identifier for a conversation session | Yes |
| `apiKeySource` | `"user" \| "project" \| "org" \| "temporary"` | How auth was resolved | Yes |
| `model` | string | Active model for the session | Yes |
| `permissionMode` | string | Permission level for the session | Yes |

### Agent SDK Account Info

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `email` | string | Authenticated user's email | No |
| `organization` | string | Organization name | No |
| `subscriptionType` | string | Subscription tier (Pro/Max/etc.) | No |
| `tokenSource` | string | How the token was obtained | No |
| `apiKeySource` | string | Source of the API key | No |

---

## 3. Key Endpoints

> Note: When using the Agent SDK (recommended path), the orchestrator does NOT call these endpoints directly. The Agent SDK abstracts all API communication. These are documented for reference and for the alternative direct-API path.

### Session Creation: Agent SDK `query()`

**Method**: Agent SDK function call (not HTTP)
**Interface**: `query({ prompt, options })`

**Request (TypeScript):**
```typescript
const session = query({
  prompt: "Prime this project",
  options: {
    allowedTools: ["Read", "Glob", "Grep", "Bash"],
    permissionMode: "bypassPermissions",
    cwd: "/path/to/project"
  }
});
```

**Response**: AsyncGenerator yielding `SDKMessage` objects including `SDKSystemMessage` with `session_id` on init.

**Notes**: Each `query()` call creates a fresh conversation. Session persistence is via `resume: sessionId` option.

### Session Destruction: Letting the generator complete

**Method**: Allow the async generator to complete or call `abort()`
**Notes**: There is no explicit "destroy session" call. Letting the query complete or aborting it ends the session. For the orchestrator's `/clear` equivalent, simply start a new `query()` without resuming.

### Session Resume: `resume` option

**Method**: Pass `resume: sessionId` in options
**Interface**:
```typescript
const resumed = query({
  prompt: "Continue the task",
  options: { resume: previousSessionId }
});
```

**Notes**: Maintains full context from the original session.

### Direct API: Messages (Path B only)

**Method**: POST
**URL**: `https://api.anthropic.com/v1/messages`

**Request:**
```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Hello, Claude" }
  ]
}
```

**Headers:**
```
x-api-key: sk-ant-api03-...
anthropic-version: 2023-06-01
content-type: application/json
```

**Response:**
```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "Hello! How can I assist you today?" }],
  "model": "claude-opus-4-6",
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 12, "output_tokens": 8 }
}
```

---

## 4. Rate Limits & Throttling

### Agent SDK (Path A - Subscription)

| Scope | Limit | Window | Retry Strategy |
|-------|-------|--------|----------------|
| Subscription usage | Shared with Claude web/desktop/mobile and Claude Code | Resets every 5 hours | Wait for reset window |
| Concurrent sessions | Limited by subscription tier | Per account | Queue sessions sequentially |
| Model availability | Priority access with Pro/Max | Continuous | Retry with exponential backoff |

**Important:** Subscription usage limits are shared across ALL Claude usage (web, desktop, mobile, Claude Code, Agent SDK). Heavy orchestrator usage will consume the same quota as interactive Claude usage. Usage limits are influenced by message length, conversation duration, file attachments, parallel sessions, and codebase complexity.

### Direct API (Path B - Pay-per-token)

| Scope | Limit | Window | Retry Strategy |
|-------|-------|--------|----------------|
| Requests per minute (RPM) | Tier-dependent (starts ~60 RPM) | Per minute | Exponential backoff with jitter |
| Tokens per minute (TPM) | Tier-dependent (starts ~60K TPM) | Per minute | Reduce message size, queue |
| Monthly spend | Tier-dependent ($100-$5,000+) | Per month | Monitor via Console |

**Rate limit detection:**
- HTTP 429 status code
- `retry-after` header indicates wait time
- Response headers include current usage vs. limits

**Recommended throttle implementation:**
- Sequential phase execution (one session at a time) avoids contention
- Monitor subscription usage via the Query's `accountInfo()` method
- Implement exponential backoff: 1s, 2s, 4s, 8s, max 60s

---

## 5. Error Handling

| Status/Error | Meaning | Agent Should |
|-------------|---------|-------------|
| OAuth token expired | Access token lifetime exceeded | Agent SDK handles refresh automatically via Claude Code subprocess |
| "This credential is only authorized for use with Claude Code" | OAuth token used in direct API call (blocked) | Switch to Agent SDK path or use API key |
| "OAuth authentication is currently not supported" | Direct API rejects bearer token | Do not use OAuth tokens with direct API; use Agent SDK path |
| 401 Unauthorized | Invalid or expired credentials | Re-run `claude setup-token` to generate new token |
| 429 Rate Limited | Subscription or API rate limit hit | Back off per Section 4 strategy |
| 500 Server Error | Anthropic service issue | Retry with exponential backoff, max 3 attempts |
| `error_max_budget_usd` | Agent SDK budget exceeded | Raise budget or halt execution |
| `error_max_turns` | Agent SDK turn limit hit | Increase maxTurns or split task |

**Error Response Format (Direct API):**
```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "This credential is only authorized for use with Claude Code and cannot be used for other API requests."
  }
}
```

**Error Response Format (Agent SDK):**
```typescript
// SDKResultMessage with error subtype
{
  type: "result",
  subtype: "error_during_execution",
  errors: ["Error description"],
  total_cost_usd: 0.15,
  usage: { input_tokens: 5000, output_tokens: 2000 }
}
```

---

## 6. SDK / Library Recommendation

**Recommended (Primary):** `@anthropic-ai/claude-agent-sdk` (latest)
**Install:** `npm install @anthropic-ai/claude-agent-sdk`
**Why:** This IS the orchestrator's runtime. It handles OAuth internally, provides session management, built-in tools, subagents, hooks, and MCP support. This is the only path that supports subscription billing.

**Recommended (Supplementary):** `@anthropic-ai/sdk` (latest)
**Install:** `npm install @anthropic-ai/sdk`
**Why:** For lightweight API calls outside the agent loop (e.g., token counting, model listing) if needed. Requires separate API key.

**NOT Recommended:** `anthropic-auth` (Rust crate by querymt)
**Why:** Third-party reverse-engineered OAuth library. Implements PKCE flow against `console.anthropic.com/oauth/authorize` and can exchange tokens and create API keys. While technically functional, it relies on undocumented endpoints and could break at any time. Anthropic has actively blocked third-party OAuth usage since January 2026.

---

## 7. Integration Gotchas

1. **OAuth tokens are NOT portable to direct API calls:** As of January 2026, Anthropic actively blocks `sk-ant-oat01-*` tokens from being used outside the Claude Code process. Tools that previously extracted and reused these tokens (Clawdbot, OpenCode, Oh My OpenCode) were all blocked. The Agent SDK works because it spawns Claude Code as a subprocess, which handles auth internally.

2. **Subscription billing is shared across all Claude usage:** The Pro/Max subscription quota is shared between Claude web, desktop, mobile, Claude Code CLI, and the Agent SDK. Running the orchestrator heavily will reduce available quota for interactive Claude usage. There is no way to get dedicated API-like limits on a subscription.

3. **Agent SDK spawns a subprocess, not direct API calls:** The Claude Agent SDK is a wrapper around the Claude Code CLI binary. Every `query()` call spawns a subprocess. This has implications for memory usage, startup time, and process management. The orchestrator should not spawn dozens of concurrent sessions.

4. **`CLAUDE_CODE_OAUTH_TOKEN` silently overrides credential files:** When this environment variable is set, Claude Code uses it instead of credentials stored in `~/.claude/.credentials.json` or macOS Keychain. There is no warning. If the token is for a different account than the stored credentials, billing goes to the token's account.

5. **Token from `claude setup-token` has ~1 year validity:** The token generated by `claude setup-token` is long-lived (~1 year) and includes a refresh token. Claude Code handles refresh internally. However, if the subscription lapses, the token becomes useless regardless of its expiry date.

6. **macOS stores credentials in Keychain, not files:** On macOS, `~/.claude/.credentials.json` does not exist. OAuth tokens, API keys, and other credentials are stored in the encrypted macOS Keychain. You cannot directly read them from files. The `claude setup-token` command is the supported way to extract a portable token.

7. **Environment variable rename broke configurations:** In Claude Code 2.0.0 (September 2025), `ANTHROPIC_AUTH_TOKEN` was renamed to `CLAUDE_CODE_OAUTH_TOKEN`. Old configurations using the former variable silently fail with 401 errors. Always use `CLAUDE_CODE_OAUTH_TOKEN`.

8. **The Agent SDK does not expose auth configuration in its Options type:** There is no `apiKey` or `authToken` parameter in the Agent SDK's `Options` interface. Authentication is entirely handled via environment variables read by the Claude Code subprocess: either `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`.

9. **Anthropic's official stance prohibits third-party subscription usage:** The Agent SDK documentation explicitly states: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." The orchestrator (being a personal tool, not a product offered to others) should be fine, but this is worth noting for any future distribution.

10. **Two billing systems, no bridge:** Claude subscriptions (Pro $20/mo, Max $100-200/mo) and API credits (pay-per-token via Console) are completely separate billing systems. There is no way to "top up" API credits from a subscription or vice versa. Choose one path and design around it.

---

## 8. PRD Capability Mapping

| PRD Capability (from Section 3) | Implementation Path | Notes |
|--------------------------------|-------------------|-------|
| Token acquisition from Claude Code OAuth flow | `claude setup-token` generates portable token | One-time setup, ~1 year validity |
| Token refresh on expiration | Handled internally by Claude Code subprocess | No orchestrator code needed |
| Scoped access to conversation APIs | Agent SDK `query()` with full tool access | Session create/read/destroy via SDK |
| Create new conversations (fresh session) | `query({ prompt, options })` | Each call = fresh context window |
| Send messages within conversations | `prompt` parameter or streaming input mode | Supports string or async iterable |
| Read conversation responses | Async generator yields `SDKMessage` objects | Filter by message type |
| Destroy conversations (/clear equivalent) | Let generator complete, start new `query()` | No explicit destroy needed |
| OAuth token management | Environment variable `CLAUDE_CODE_OAUTH_TOKEN` | Set once, Claude Code handles lifecycle |

---

## 9. Live Integration Testing Specification

### 9.1 Testing Tier Classification

#### Tier 1: Auto-Live (No Approval Needed)

| Endpoint | Method | Purpose | Expected Response Shape | Failure Means |
|----------|--------|---------|------------------------|---------------|
| Agent SDK `query()` | SDK call | Verify auth and connectivity | `SDKSystemMessage` with `session_id` | Auth broken or Claude Code not installed |
| Agent SDK `accountInfo()` | SDK call | Verify subscription type | `AccountInfo` with `subscriptionType` | Token invalid or expired |

**Health Check Command (TypeScript):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function healthCheck(): Promise<boolean> {
  try {
    const q = query({
      prompt: "Reply with exactly: HEALTH_OK",
      options: {
        allowedTools: [],
        maxTurns: 1,
        maxBudgetUsd: 0.01
      }
    });

    for await (const message of q) {
      if (message.type === "system" && message.subtype === "init") {
        console.log(`Session: ${message.session_id}`);
        console.log(`Auth source: ${message.apiKeySource}`);
        console.log(`Model: ${message.model}`);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Health check failed:", error);
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
    typeof msg.apiKeySource === "string" &&
    typeof msg.model === "string" &&
    Array.isArray(msg.tools)
  );
}
```

#### Tier 2: Auto-Live with Test Data (No Approval Needed)

| Endpoint | Action | Test Data | Cleanup Action | Why Safe |
|----------|--------|-----------|----------------|----------|
| Agent SDK `query()` with tools | Create session, use Read tool | Read a known test file | Session auto-ends | Read-only, no side effects |
| Agent SDK session resume | Resume a previous session | Resume ID from Tier 1 test | Session auto-ends | Read-only continuation |
| Agent SDK `accountInfo()` | Retrieve account details | None required | None needed | Read-only introspection |

**Test Data Configuration:**
```typescript
const TEST_CONFIG = {
  test_file: "package.json",  // Known file in project root
  test_prompt: "Read package.json and report the project name. Reply with only the name.",
  max_budget: 0.02,  // Strict budget cap for test
  max_turns: 3
};
```

**Cleanup Procedure:**
```typescript
// No cleanup needed - Agent SDK sessions are stateless
// Each query() creates a fresh subprocess that terminates on completion
```

#### Tier 3: Approval-Required Live (Human in the Loop)

| Endpoint | Action | Estimated Cost | Side Effect | Fallback Fixture |
|----------|--------|---------------|-------------|-----------------|
| Agent SDK `query()` with Write tool | Write a test file | ~$0.01-0.05 subscription usage | Creates file on disk | `.agents/fixtures/anthropic-auth-write-test.json` |
| Agent SDK full agent loop | Multi-turn with Read+Edit+Bash | ~$0.10-0.50 subscription usage | May modify files | `.agents/fixtures/anthropic-auth-agent-loop.json` |

**Approval Prompt Format:**
```
Tier 3 Approval Required: Anthropic Auth

To validate Agent SDK write capability, I need to:
  Call: query() with allowedTools: ["Read", "Write"]
  With: Write a test file to /tmp/piv-test-auth.txt
  Cost: ~$0.01-0.05 subscription usage
  Effect: Creates temporary file, consumes subscription quota
  Cleanup: Auto-delete /tmp/piv-test-auth.txt after test

Options:
  [1] Approve - run live test
  [2] Use recorded fixture (last recorded: none)
  [3] Skip this test
```

**Fixture Format:**
```json
{
  "recorded_at": "2026-02-18T00:00:00Z",
  "endpoint": "Agent SDK query() with Write",
  "request": {
    "prompt": "Write 'PIV_TEST_OK' to /tmp/piv-test-auth.txt",
    "options": { "allowedTools": ["Write"], "maxTurns": 2 }
  },
  "response": {
    "type": "result",
    "subtype": "success",
    "result": "File written successfully",
    "total_cost_usd": 0.02
  },
  "status_code": null,
  "notes": "Agent SDK does not use HTTP status codes; success indicated by result subtype"
}
```

#### Tier 4: Mock Only (Never Live)

| Endpoint | Why Mock Only | Fixture File | Mock Strategy |
|----------|--------------|-------------|---------------|
| Token refresh flow | Cannot force token expiry | `.agents/fixtures/anthropic-auth-token-refresh.json` | Simulate expired token response, verify orchestrator handles gracefully |
| Subscription quota exhaustion | Would block all Claude usage | `.agents/fixtures/anthropic-auth-quota-exhausted.json` | Simulate rate limit response, verify backoff behavior |

**Mock Implementation:**
```typescript
// Mock subscription quota exhaustion
function mockQuotaExhausted(): SDKResultMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    uuid: "mock-uuid",
    session_id: "mock-session",
    duration_ms: 500,
    duration_api_ms: 200,
    is_error: true,
    num_turns: 0,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: ["Rate limit exceeded. Please wait before making more requests."]
  };
}
```

**Fixture Data (Token Refresh):**
```json
{
  "recorded_at": "2026-02-18T00:00:00Z",
  "scenario": "token_refresh_during_session",
  "initial_error": {
    "type": "error",
    "error": { "type": "authentication_error", "message": "Token expired" }
  },
  "expected_behavior": "Claude Code subprocess handles refresh internally; orchestrator sees no interruption",
  "notes": "Token refresh is invisible to the Agent SDK consumer. If refresh fails, the session errors out with auth error."
}
```

### 9.2 Test Environment Configuration

**Environment Variables Required for Testing:**

| Variable | Purpose | Tier | Example |
|----------|---------|------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token from `claude setup-token` | All tiers (Path A) | `sk-ant-oat01-...` |
| `ANTHROPIC_API_KEY` | API key from Console (alternative) | All tiers (Path B) | `sk-ant-api03-...` |

**Sandbox Availability:**
- [x] The Agent SDK has a budget control mechanism: `maxBudgetUsd` option
- Use `maxBudgetUsd: 0.01` for Tier 1 tests, `0.02` for Tier 2 tests
- No formal sandbox mode; use budget caps and restricted tool sets for safety
- Production and test use the same API; differentiate via budget and tool restrictions

### 9.3 Testing Sequence

```
1. Tier 1 (auto-live) → Verify Agent SDK auth and connectivity
   ├── Create minimal query with empty tools and maxTurns: 1
   ├── Verify SDKSystemMessage received with session_id
   ├── Call accountInfo() to verify subscription type
   ├── If FAIL → Stop. Auth is broken. Check CLAUDE_CODE_OAUTH_TOKEN.
   └── If PASS → Continue

2. Tier 2 (auto-live with test data) → Verify session management
   ├── Create query with Read tool, read package.json
   ├── Verify response contains expected file content
   ├── Test session resume with previous session_id
   └── If FAIL → WARN, continue (resume is optional for orchestrator)

3. Tier 3 (approval-required) → Verify write operations
   ├── Present approval prompt
   ├── If approved → Create query with Write tool, write test file
   ├── Verify file was created, clean up
   └── If "skip" → Log as SKIPPED

4. Tier 4 (mock only) → Verify error handling
   ├── Load quota exhaustion fixture
   ├── Feed to orchestrator's error handler
   ├── Verify exponential backoff behavior
   └── Verify error classification matches PIV error taxonomy
```

---

## PIV-Automator-Hooks
tech_name: anthropic-auth
research_status: complete
endpoints_documented: 5
tier_1_count: 2
tier_2_count: 3
tier_3_count: 2
tier_4_count: 2
gotchas_count: 10
confidence: high
