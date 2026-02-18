# Technology Profile: Telegram Bot API

**Generated**: 2026-02-18
**PRD Reference**: Section 3 - Telegram Bot API
**Agent Use Case**: Bidirectional human-agent communication — send status updates, receive commands (/go, /pause, /status), relay conversational PRD creation, and handle inline approval for Tier 3 live validation tests.

---

## 1. Authentication & Setup

**Auth Type**: Bot Token (static bearer token issued by BotFather)
**Auth Location**: URL path segment — `https://api.telegram.org/bot<TOKEN>/METHOD_NAME`

**Setup Steps:**
1. Open Telegram, search for `@BotFather`, send `/newbot`
2. Choose a display name (e.g., "PIV Orchestrator") and a username (must end in `bot`, e.g., `piv_orchestrator_bot`)
3. BotFather returns the HTTP API token — save immediately, treat as a password
4. Set bot commands via BotFather: `/mybots` > select bot > Edit Bot > Edit Commands
5. Set environment variable `TELEGRAM_BOT_TOKEN` with the token value
6. Send a message to your bot from your personal Telegram account, then call `getUpdates` to discover your `chat_id`
7. Set environment variable `TELEGRAM_CHAT_ID` with your personal chat ID

**Auth Code Pattern:**
```typescript
import { Bot } from "grammy";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
```

**Environment Variables:**
| Variable | Purpose | Required |
|----------|---------|----------|
| TELEGRAM_BOT_TOKEN | Bot API authentication token from BotFather | Yes |
| TELEGRAM_CHAT_ID | Authorized user's chat ID for message filtering | Yes |
| TELEGRAM_PROJECT_PREFIX | Project name tag for multi-instance messages (e.g., "ProjectA") | No (default: project dir name) |

**Discovering Your Chat ID:**
After creating the bot and sending it any message from your account, call:
```
GET https://api.telegram.org/bot<TOKEN>/getUpdates
```
The response contains `result[0].message.from.id` — that is your chat ID. This is a one-time setup step.

---

## 2. Core Data Models

> Only models relevant to the orchestrator's use case.

**Update:**
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| update_id | Integer | Unique identifier for this update, incrementing | Yes |
| message | Message | New incoming message (text, commands) | No |
| callback_query | CallbackQuery | Callback from inline keyboard button press | No |

**Message:**
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| message_id | Integer | Unique message identifier within the chat | Yes |
| from | User | Sender of the message | No |
| chat | Chat | Chat the message belongs to | Yes |
| date | Integer | Unix timestamp of when the message was sent | Yes |
| text | String | Actual UTF-8 text of the message (0-4096 chars) | No |
| entities | Array of MessageEntity | Special entities in the text (commands, mentions, etc.) | No |

**CallbackQuery:**
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| id | String | Unique identifier for this callback query | Yes |
| from | User | User who pressed the button | Yes |
| message | Message | Message with the callback button that was pressed | No |
| data | String | Data associated with the callback button (1-64 bytes) | No |
| chat_instance | String | Global identifier for the chat | Yes |

**InlineKeyboardMarkup:**
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| inline_keyboard | Array of Array of InlineKeyboardButton | Rows of button rows | Yes |

**InlineKeyboardButton:**
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| text | String | Label text on the button | Yes |
| callback_data | String | Data sent in callback when button pressed (1-64 bytes) | No |
| url | String | HTTP/HTTPS URL to open on button press | No |

---

## 3. Key Endpoints

> Only endpoints the orchestrator needs based on PRD capabilities.

### Send Status Updates / Notifications: sendMessage

**Method**: POST
**URL**: `https://api.telegram.org/bot<TOKEN>/sendMessage`

**Request:**
```json
{
  "chat_id": 123456789,
  "text": "*Phase 2 Complete*\n\n✅ All 14 tests passing\n✅ Live validation Tier 1-2 passed\n⏳ Tier 3 approval pending",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [[
      {"text": "View Details", "callback_data": "details_phase_2"}
    ]]
  }
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "message_id": 42,
    "from": {"id": 987654321, "is_bot": true, "first_name": "PIV Orchestrator"},
    "chat": {"id": 123456789, "type": "private"},
    "date": 1708300000,
    "text": "Phase 2 Complete..."
  }
}
```

**Notes**: Maximum text length is 4096 UTF-8 characters after entity parsing. Messages exceeding this must be split. Returns the sent Message object on success.

### Receive Commands & Messages: getUpdates (Long Polling)

**Method**: GET
**URL**: `https://api.telegram.org/bot<TOKEN>/getUpdates`

**Request:**
```json
{
  "offset": 123456790,
  "limit": 100,
  "timeout": 30,
  "allowed_updates": ["message", "callback_query"]
}
```

**Response:**
```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456789,
      "message": {
        "message_id": 43,
        "from": {"id": 123456789, "first_name": "Developer"},
        "chat": {"id": 123456789, "type": "private"},
        "date": 1708300100,
        "text": "/status",
        "entities": [{"offset": 0, "length": 7, "type": "bot_command"}]
      }
    }
  ]
}
```

**Notes**: Set `timeout` to 30 seconds for long polling. The `offset` parameter should be set to `last_update_id + 1` to acknowledge previous updates. This method will NOT work if a webhook is set — call `deleteWebhook` first. Returns up to `limit` Update objects.

### Tier 3 Approval Inline Keyboards: sendMessage with InlineKeyboardMarkup

**Method**: POST
**URL**: `https://api.telegram.org/bot<TOKEN>/sendMessage`

**Request:**
```json
{
  "chat_id": 123456789,
  "text": "<b>Tier 3 Approval Required: Instantly API</b>\n\nTo validate campaign creation, I need to:\n→ Call: POST /api/v1/campaign/launch\n→ Cost: Free but creates visible record\n→ Effect: Test campaign appears in dashboard\n→ Cleanup: Auto-delete after validation\n\nChoose an option:",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [
      [{"text": "✅ Approve — make live call", "callback_data": "tier3_approve_instantly_campaign"}],
      [{"text": "📋 Use recorded fixture", "callback_data": "tier3_fixture_instantly_campaign"}],
      [{"text": "⏭ Skip this test", "callback_data": "tier3_skip_instantly_campaign"}]
    ]
  }
}
```

**Notes**: `callback_data` is limited to 1-64 bytes. Use structured prefixes (e.g., `tier3_approve_`, `tier3_fixture_`, `tier3_skip_`) for routing. After the user presses a button, Telegram shows a loading spinner until `answerCallbackQuery` is called.

### Handle Approval Response: answerCallbackQuery

**Method**: POST
**URL**: `https://api.telegram.org/bot<TOKEN>/answerCallbackQuery`

**Request:**
```json
{
  "callback_query_id": "unique_callback_id",
  "text": "Approved — executing live call...",
  "show_alert": false
}
```

**Notes**: Must be called within 30 seconds of the callback or Telegram shows an error. `show_alert: false` shows a brief toast notification; `show_alert: true` shows a modal dialog.

### Update Message After Approval: editMessageText

**Method**: POST
**URL**: `https://api.telegram.org/bot<TOKEN>/editMessageText`

**Request:**
```json
{
  "chat_id": 123456789,
  "message_id": 42,
  "text": "<b>Tier 3 Approved: Instantly API</b>\n\n✅ Live call executed successfully\n📋 Response recorded to fixtures",
  "parse_mode": "HTML"
}
```

**Notes**: Use this to replace the approval buttons with a result summary after the user acts. Cannot edit a message to be identical to its current content (throws error). Removes the inline keyboard unless a new `reply_markup` is provided.

### Register Bot Commands: setMyCommands

**Method**: POST
**URL**: `https://api.telegram.org/bot<TOKEN>/setMyCommands`

**Request:**
```json
{
  "commands": [
    {"command": "go", "description": "Start autonomous execution from current phase"},
    {"command": "pause", "description": "Pause autonomous execution after current step"},
    {"command": "resume", "description": "Resume paused autonomous execution"},
    {"command": "status", "description": "Show current phase, progress, and next action"},
    {"command": "create_prd", "description": "Start PRD creation conversation"},
    {"command": "preflight", "description": "Run credential and environment checks"}
  ]
}
```

**Notes**: Command names must be 1-32 characters, lowercase letters, digits, and underscores only. Descriptions must be 3-256 characters. These appear in the bot's command menu in Telegram UI. Can also be set via BotFather chat (`/setcommands`).

---

## 4. Rate Limits & Throttling

| Endpoint/Scope | Limit | Window | Retry Strategy |
|----------------|-------|--------|----------------|
| Global (all methods) | 30 requests | Per second per bot token | Auto-retry with `retry_after` |
| Per private chat | 1 message | Per second (bursts tolerated) | Queue with 1s minimum gap |
| Per group chat | 20 messages | Per minute | Queue with 3s minimum gap |
| Bulk broadcast | ~30 messages | Per second (different users) | Sequential with auto-retry |
| getUpdates | No explicit limit | Continuous long-poll | 30s timeout per request |

**Recommended throttle implementation:**
- Install `@grammyjs/auto-retry` transformer plugin — it catches 429 responses, reads `retry_after`, waits, and retries automatically
- For the orchestrator's use case (single private chat), rate limits are effectively never hit — one status message per phase step is well under 1/second
- The only risk scenario is rapid error cascades where multiple commands fail and try to notify simultaneously — queue notifications and send sequentially
- 429 responses include a `retry_after` field (seconds) — respect it exactly, do not implement fixed delays

**How to detect rate limiting:**
- HTTP status 429 with JSON body: `{"ok": false, "error_code": 429, "parameters": {"retry_after": 5}}`
- The `retry_after` value is in seconds

---

## 5. Error Handling

| Status Code | Meaning | Agent Should |
|-------------|---------|-------------|
| 200 | Success | Process `result` field from JSON response |
| 400 | Bad Request (malformed params, invalid chat_id) | Log error, fix params, retry once |
| 401 | Unauthorized (invalid bot token) | Classify as `integration_auth`, escalate immediately |
| 403 | Forbidden (bot blocked by user, no access to chat) | Log warning, skip notification, continue execution |
| 404 | Not Found (invalid method name) | Bug in code — log and fix |
| 409 | Conflict (webhook already set, or another getUpdates running) | Call `deleteWebhook`, restart polling |
| 429 | Rate limited | Wait `retry_after` seconds, retry (auto-retry plugin handles this) |
| 500+ | Telegram server error | Retry with exponential backoff, max 3 attempts |

**Error Response Format:**
```json
{
  "ok": false,
  "error_code": 429,
  "description": "Too Many Requests: retry after 5",
  "parameters": {
    "retry_after": 5
  }
}
```

**Critical error: 409 Conflict on getUpdates**
This happens when two processes call `getUpdates` simultaneously or when a webhook is still registered. The orchestrator must ensure only one polling instance runs per bot token. Call `deleteWebhook` at startup to clear any stale webhook configuration.

---

## 6. SDK / Library Recommendation

**Recommended**: grammY v1.40.x
**Install**: `npm install grammy @grammyjs/auto-retry`
**Why**:
- TypeScript-first design with excellent type inference and editor support — Telegraf v4's types are notoriously complex and hard to understand
- Always tracks the latest Telegram Bot API version (Telegraf frequently falls behind)
- Active maintenance: 1.1M+ weekly npm downloads, 3,200+ GitHub stars, regular releases
- Built-in `InlineKeyboard` class with fluent API — perfect for approval buttons
- `callbackQuery()` method with string and regex matching for routing callback data
- `auto-retry` plugin handles 429 errors transparently
- Comprehensive plugin ecosystem: menus, sessions, conversations, rate limiting
- Excellent documentation with multi-language guides
- Supports both long polling (`bot.start()`) and webhooks (`webhookCallback()`)
- Middleware pattern identical to Express/Koa — familiar for Node.js developers

**Alternative**: Telegraf v4 (`npm install telegraf`)
- Only consider if the project already uses Telegraf elsewhere
- Slower to adopt new Bot API features, type complexity issues

**If no framework needed**: Raw HTTP with `fetch()` — the Bot API is simple REST:
```typescript
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId: number, text: string, options?: object): Promise<any> {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}
```

---

## 7. Integration Gotchas

> Practical issues discovered from community research that official docs don't cover.

1. **MarkdownV2 escaping is brutal**: 19 special characters must be backslash-escaped outside entities: `_*[]()~` `` ` `` `>#+-=|{}.!\`. Use HTML `parse_mode` instead — it is dramatically simpler for dynamic content. HTML uses standard tags (`<b>`, `<i>`, `<code>`, `<a href="">`) and only requires escaping `<`, `>`, and `&`. The orchestrator should default to `parse_mode: "HTML"` for all messages.

2. **4096-character message limit is hard**: Messages exceeding 4096 UTF-8 characters after entity parsing are rejected with a 400 error. The orchestrator must implement message splitting for long status reports. Split on paragraph boundaries (double newline), not mid-sentence. Send multiple messages sequentially with 1-second gaps.

3. **getUpdates and webhooks are mutually exclusive**: If a webhook is registered (even from a previous dev session), `getUpdates` returns a 409 Conflict. Always call `deleteWebhook` at bot startup. grammY's `bot.start()` handles this automatically.

4. **callback_data is 1-64 bytes, not characters**: Multi-byte UTF-8 characters eat into the limit faster. Use short ASCII prefixes: `t3a_` (Tier 3 approve), `t3f_` (fixture), `t3s_` (skip). Keep technology identifiers short.

5. **answerCallbackQuery must be called within ~30 seconds**: After a user presses an inline button, Telegram shows a loading spinner. If you don't call `answerCallbackQuery` within the timeout, the client shows an error. Call it immediately, then do the actual work asynchronously.

6. **Bot can't initiate conversations**: A bot can only send messages to users who have started a conversation with it (sent `/start`). The developer must message the bot first during setup. This is by Telegram design, not a bug.

7. **editMessageText fails if content is identical**: Attempting to edit a message to the same text throws a 400 error. When updating approval messages, always change the text (e.g., append a timestamp or change the status line).

8. **Long polling connection drops silently**: Network interruptions during long polling don't always throw errors — the request just hangs. Set a reasonable timeout (30s) and handle reconnection gracefully. grammY's `bot.start()` handles reconnection automatically.

9. **Bot token in URL is the only auth**: There are no scoped permissions or API keys. Anyone with the token has full bot control. Store in `.env`, never commit to git, never log the full token. Consider adding the token to `.gitignore` patterns.

10. **Multiple polling instances cause update theft**: If two processes poll the same bot token, updates are split randomly between them. The orchestrator MUST ensure exactly one polling instance per bot token. Use a PID file or port lock.

---

## 8. PRD Capability Mapping

> Maps PRD requirements to specific implementation paths.

| PRD Capability (from Section 3) | Endpoints/Methods | Notes |
|--------------------------------|-------------------|-------|
| Send messages (status updates, approval requests, error escalations) | `sendMessage` with `parse_mode: "HTML"` | Split messages > 4096 chars |
| Receive messages (human responses, /go, /pause, /status) | `getUpdates` (long polling) + command parsing | Filter by `TELEGRAM_CHAT_ID` |
| Relay conversational PRD creation flow | `sendMessage` (relay Claude output) + `getUpdates` (capture human input) | Back-and-forth relay loop |
| Handle inline approval for Tier 3 tests | `sendMessage` with `InlineKeyboardMarkup` + `callbackQuery` handler + `answerCallbackQuery` + `editMessageText` | Three-button pattern: Approve/Fixture/Skip |
| SC-003: PRD creation via Telegram | Command handler for `/create_prd` + message relay loop | Long-running conversation, relay each message |
| SC-006: Tier 3 approval | Inline keyboard with 3 options + callback routing | `callback_data` prefixed by action type |
| SC-009: VS Code to Telegram handoff | `/status` command handler reads manifest, formats report | One-way status read — no state mutation |
| SC-010: Multiple simultaneous instances | Project-name prefix in all messages | Tag format: `[ProjectA]` prefix in every message |
| Register bot commands | `setMyCommands` at startup | /go, /pause, /resume, /status, /create_prd, /preflight |
| Update approval message after action | `editMessageText` to replace buttons with result | Remove inline keyboard, show outcome |

---

## 9. Live Integration Testing Specification

> This section drives `/validate-implementation` Phase 3.

### 9.1 Testing Tier Classification

#### Tier 1: Auto-Live (No Approval Needed)

> Read-only, zero cost, zero side effects. Runs automatically every validation.

| Endpoint | Method | Purpose | Expected Response Shape | Failure Means |
|----------|--------|---------|------------------------|---------------|
| `getMe` | GET | Verify bot token is valid and bot is accessible | `{ "ok": true, "result": { "id": N, "is_bot": true, "first_name": "..." } }` | Token invalid or Telegram API down |
| `getUpdates` (limit:0) | GET | Verify polling connectivity | `{ "ok": true, "result": [] }` | Network issue or webhook conflict |
| `getMyCommands` | GET | Verify commands are registered | `{ "ok": true, "result": [{ "command": "...", "description": "..." }] }` | Commands not set up |

**Health Check Command:**
```typescript
import { Bot } from "grammy";

async function healthCheck(token: string): Promise<{ ok: boolean; botName: string }> {
  const bot = new Bot(token);
  const me = await bot.api.getMe();
  return { ok: true, botName: me.first_name };
}
```

**Schema Validation:**
```typescript
function validateGetMeResponse(result: any): boolean {
  return (
    typeof result.id === "number" &&
    result.is_bot === true &&
    typeof result.first_name === "string" &&
    typeof result.username === "string"
  );
}
```

#### Tier 2: Auto-Live with Test Data (No Approval Needed)

> Controlled side effects with pre-defined test data. Includes automatic cleanup.

| Endpoint | Action | Test Data | Cleanup Action | Why Safe |
|----------|--------|-----------|----------------|----------|
| `sendMessage` | Send test message to developer's own chat | Text: `[PIV_TEST] Validation ping — {timestamp}` | None needed — message to self | Only affects developer's own chat |
| `sendMessage` with inline keyboard | Send test approval prompt | Buttons with `piv_test_` callback prefixes | `editMessageText` to remove buttons after test | Buttons auto-removed, only in developer's chat |
| `setMyCommands` | Register orchestrator commands | Standard command list from Section 3 | None needed — commands are idempotent | Overwriting is the expected behavior |
| `editMessageText` | Edit the test message sent above | Append " — EDITED" to test message | None needed | Modifies own test message only |

**Test Data Configuration:**
```typescript
const TEST_CONFIG = {
  chat_id: Number(process.env.TELEGRAM_CHAT_ID),
  test_prefix: "[PIV_TEST]",
  test_callback_prefix: "piv_test_",
  test_identifiers: [] as number[], // message_ids for cleanup
};
```

**Cleanup Procedure:**
```typescript
async function cleanupTier2Tests(bot: Bot, config: typeof TEST_CONFIG): Promise<void> {
  // Edit test messages to remove inline keyboards
  for (const messageId of config.test_identifiers) {
    try {
      await bot.api.editMessageText(
        config.chat_id,
        messageId,
        `${config.test_prefix} Test complete — cleaned up at ${new Date().toISOString()}`
      );
    } catch {
      // Message may already be edited or deleted — safe to ignore
    }
  }
}
```

**Important:** The `TELEGRAM_CHAT_ID` environment variable must point to the developer's personal chat. All Tier 2 tests send messages exclusively to this chat.

#### Tier 3: Approval-Required Live (Human in the Loop)

> Not applicable for Telegram Bot API. All bot operations affect only the developer's own chat and are fully reversible (messages can be edited/deleted). No operations consume metered resources or have non-trivial side effects.

There are no Tier 3 endpoints for this technology.

#### Tier 4: Mock Only (Never Live)

> Not applicable for Telegram Bot API. There are no irreversible operations or operations affecting real users/customers beyond the developer.

There are no Tier 4 endpoints for this technology.

### 9.2 Test Environment Configuration

**Environment Variables Required for Testing:**
| Variable | Purpose | Tier | Example |
|----------|---------|------|---------|
| TELEGRAM_BOT_TOKEN | Bot authentication | All tiers | `7123456789:AAH...` |
| TELEGRAM_CHAT_ID | Developer's chat for test messages | Tier 2 | `123456789` |

**Sandbox Availability:**
- [x] This API has a sandbox/test mode: **No** — Telegram has no sandbox environment
- All testing uses the production Bot API with real messages to the developer's own chat
- Tier 1 tests are read-only and have zero side effects
- Tier 2 tests send messages only to the developer — this IS the safe testing strategy

### 9.3 Testing Sequence

```
1. Tier 1 (auto-live) — Verify connectivity and auth
   ├── getMe → Verify token validity, extract bot username
   ├── getUpdates (limit:0) → Verify polling works, no webhook conflict
   ├── getMyCommands → Verify command registration
   ├── If ANY FAIL → Stop. Bot token is invalid or network is down.
   └── If ALL PASS → Continue

2. Tier 2 (auto-live with test data) — Verify write operations
   ├── sendMessage → Send test ping to developer's chat
   ├── sendMessage with inline keyboard → Send test approval buttons
   ├── editMessageText → Edit the first test message
   ├── setMyCommands → Register orchestrator commands
   ├── Verify all responses match expected schemas
   ├── Run cleanup (edit test messages to remove keyboards)
   └── If cleanup FAILS → WARN user, continue

3. Tier 3 — N/A (no approval-required endpoints)

4. Tier 4 — N/A (no mock-only endpoints)
```

---

## Profile Quality Checklist

- [x] Follows exact structure (commands expect this format)
- [x] Includes ONLY capabilities relevant to this agent's PRD
- [x] Has working code examples (not pseudocode)
- [x] Includes actual request/response examples from docs
- [x] Documents rate limits with retry strategies
- [x] Maps every PRD capability to specific endpoints
- [x] Includes community-sourced gotchas (not just official docs)
- [x] Classifies every endpoint into a testing tier (1-4)
- [x] Provides test data and cleanup procedures for Tier 2
- [x] Documents cost estimates and approval prompts for Tier 3 (N/A — no Tier 3)
- [x] Includes realistic fixture data for Tier 3 fallbacks and Tier 4 (N/A — no Tier 3/4)
- [x] Specifies environment variables needed for testing

---

## Appendix A: Recommended grammY Setup for Orchestrator

> Complete reference for the orchestrator's Telegram integration layer.

### Installation

```bash
npm install grammy @grammyjs/auto-retry
```

### Full Bot Skeleton

```typescript
import { Bot, InlineKeyboard } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";

// --- Initialize ---
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const AUTHORIZED_CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID!);
const PROJECT_NAME = process.env.TELEGRAM_PROJECT_PREFIX || "default";

// --- Auto-retry on 429 ---
bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 30,
}));

// --- Security: restrict to authorized chat ---
bot.use(async (ctx, next) => {
  if (ctx.chat?.id !== AUTHORIZED_CHAT_ID) {
    return; // Silently ignore unauthorized messages
  }
  await next();
});

// --- Command handlers ---
bot.command("status", async (ctx) => {
  // Read manifest, format status report
  const status = await readManifestStatus();
  await ctx.reply(formatStatusMessage(status), { parse_mode: "HTML" });
});

bot.command("go", async (ctx) => {
  await ctx.reply(`[${PROJECT_NAME}] Starting autonomous execution...`);
  // Trigger orchestrator start
});

bot.command("pause", async (ctx) => {
  await ctx.reply(`[${PROJECT_NAME}] Pausing after current step completes...`);
  // Set pause flag
});

// --- Callback query handler (approval buttons) ---
bot.callbackQuery(/^tier3_(approve|fixture|skip)_(.+)$/, async (ctx) => {
  const [, action, testId] = ctx.match!;
  await ctx.answerCallbackQuery({ text: `${action} selected` });

  // Update the original message to show result
  await ctx.editMessageText(
    `<b>Tier 3 ${action === "approve" ? "Approved" : action === "fixture" ? "Using Fixture" : "Skipped"}: ${testId}</b>`,
    { parse_mode: "HTML" }
  );

  // Signal the orchestrator about the decision
  emitApprovalDecision(testId, action);
});

// --- Catch-all for unhandled callbacks ---
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();
});

// --- Error handler ---
bot.catch((err) => {
  console.error("[Telegram Bot Error]", err);
});

// --- Start polling ---
bot.start();
```

### Sending Approval Request

```typescript
async function sendApprovalRequest(
  bot: Bot,
  chatId: number,
  techName: string,
  endpoint: string,
  cost: string,
  effect: string,
  cleanup: string,
): Promise<number> {
  const keyboard = new InlineKeyboard()
    .text("Approve - make live call", `tier3_approve_${techName}`)
    .row()
    .text("Use recorded fixture", `tier3_fixture_${techName}`)
    .row()
    .text("Skip this test", `tier3_skip_${techName}`);

  const message = await bot.api.sendMessage(chatId, [
    `<b>Tier 3 Approval Required: ${techName}</b>`,
    "",
    `To validate, I need to:`,
    `  Call: <code>${endpoint}</code>`,
    `  Cost: ${cost}`,
    `  Effect: ${effect}`,
    `  Cleanup: ${cleanup}`,
  ].join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  return message.message_id;
}
```

### Message Splitting Utility

```typescript
const MAX_MESSAGE_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split on double newline (paragraph boundary)
    let splitIndex = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH * 0.5) {
      // Fall back to single newline
      splitIndex = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH * 0.5) {
      // Last resort: hard split at limit
      splitIndex = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

async function sendLongMessage(
  bot: Bot,
  chatId: number,
  text: string,
  options?: { parse_mode?: string },
): Promise<void> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    await bot.api.sendMessage(chatId, chunk, options);
    // Respect per-chat rate limit
    if (chunks.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
}
```

### Multi-Project Message Tagging (SC-010)

```typescript
function tagMessage(projectName: string, message: string): string {
  return `[${projectName}] ${message}`;
}

// Usage: every outgoing message gets tagged
await bot.api.sendMessage(
  chatId,
  tagMessage(PROJECT_NAME, "Phase 2 validation passed — advancing to Phase 3"),
  { parse_mode: "HTML" }
);
```

---

## Appendix B: Long Polling vs Webhooks — Decision for Orchestrator

**Decision: Long Polling**

| Factor | Long Polling | Webhooks |
|--------|-------------|----------|
| Setup complexity | `bot.start()` — one line | Need public URL, SSL cert, domain |
| Local development | Works immediately | Requires ngrok or similar tunnel |
| Infrastructure | None — runs in-process | Web server (Express/Fastify) |
| Latency | 30s worst case (timeout cycle) | Instant push |
| Reliability | grammY auto-reconnects | Must handle Telegram's 10s timeout |
| Orchestrator fit | Background process on dev machine | Overkill for single-user bot |

**Justification:** The orchestrator runs as a local background process on the developer's machine. There is no public server, no domain, no SSL certificate. Long polling works out of the box with zero infrastructure. The orchestrator talks to a single user — latency of up to 30 seconds for receiving a `/status` command is acceptable. grammY's `bot.start()` handles connection management, reconnection, and webhook cleanup automatically.

**If the orchestrator is later deployed to a server:** Switch to webhooks using `webhookCallback(bot, "express")` — grammY supports both modes with the same bot instance. The message handling code does not change.

---

## Appendix C: Parse Mode Recommendation

**Decision: HTML over MarkdownV2**

MarkdownV2 requires escaping 19 special characters in any dynamic content. Since the orchestrator formats messages containing file paths (with dots, dashes, parentheses), code references (with underscores, backticks), and status indicators (with exclamation marks), every message would need aggressive escaping.

HTML parse mode requires escaping only `<`, `>`, and `&` — and these rarely appear in the orchestrator's output. The formatting tags are explicit and unambiguous:

| Format | HTML | MarkdownV2 |
|--------|------|------------|
| Bold | `<b>text</b>` | `*text*` |
| Italic | `<i>text</i>` | `_text_` |
| Code | `<code>text</code>` | `` `text` `` |
| Code block | `<pre>text</pre>` | ` ```text``` ` |
| Link | `<a href="url">text</a>` | `[text](url)` |
| Underline | `<u>text</u>` | `__text__` (conflicts with italic) |
| Strikethrough | `<s>text</s>` | `~text~` |

**HTML escape utility:**
```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

---

## PIV-Automator-Hooks
tech_name: telegram-bot-api
research_status: complete
endpoints_documented: 7
tier_1_count: 3
tier_2_count: 4
tier_3_count: 0
tier_4_count: 0
gotchas_count: 10
confidence: high
generated_at: 2026-02-18
