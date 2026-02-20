# Technology Profile: Telegram Bot API

**Generated**: 2026-02-20
**PRD Reference**: Section 3 - Telegram Bot API
**Agent Use Case**: Send structured escalation messages to human operator and receive acknowledgment for blocking issues

---

## 1. Authentication & Setup

### BotFather Registration

1. Open Telegram, search for `@BotFather`, send `/newbot`
2. Provide a display name and a unique username (must end with `bot`)
3. BotFather returns a token in the format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
4. Store the token securely -- never commit to version control

### Token Format

```
<bot_id>:<secret_hash>
```

The `bot_id` portion is the bot's numeric user ID. The full token authenticates every HTTP request to `https://api.telegram.org/bot<TOKEN>/<method>`.

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot authentication token from BotFather | `123456789:ABCdef...` |
| `TELEGRAM_CHAT_ID` | Target chat ID for escalation messages | `987654321` |

### Obtaining Chat ID

The supervisor needs the operator's `chat_id`. Two approaches:

1. **Manual**: Send any message to the bot, then call `getUpdates` -- the `message.chat.id` field contains it
2. **Programmatic**: On first `/start` command, store `ctx.chat.id` to config

### Base URL

All Bot API requests go to:
```
https://api.telegram.org/bot<TOKEN>/<METHOD>
```

Supports both GET (query params) and POST (JSON body or form-data). **Always use POST with JSON body** for consistency and to avoid URL-encoding issues.

### Token Revocation

If a token is compromised, message `@BotFather` with `/revoke` and select the bot. All existing sessions are immediately invalidated. Generate a new token with `/token`.

---

## 2. Core Data Models

Only the fields relevant to the supervisor's escalation use case are documented here.

### Update

```typescript
interface Update {
  update_id: number;          // Sequential ID; use as offset for getUpdates
  message?: Message;          // New incoming message
  callback_query?: CallbackQuery; // Button press from inline keyboard
}
```

### Message

```typescript
interface Message {
  message_id: number;         // Unique within the chat
  from?: User;                // Sender (absent for channel posts)
  chat: Chat;                 // Conversation the message belongs to
  date: number;               // Unix timestamp
  text?: string;              // Message text (up to 4096 chars)
  entities?: MessageEntity[]; // Formatting entities in text
  reply_to_message?: Message; // Original message if this is a reply
}
```

### Chat

```typescript
interface Chat {
  id: number;                 // Unique chat identifier (use as chat_id param)
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;             // Group/channel title
  username?: string;          // Private chat or channel username
  first_name?: string;        // Private chat first name
}
```

### CallbackQuery

```typescript
interface CallbackQuery {
  id: string;                 // Unique ID for answering
  from: User;                 // User who pressed the button
  message?: Message;          // Message containing the pressed button
  data?: string;              // Callback data from the button (up to 64 bytes)
}
```

### User

```typescript
interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}
```

### ResponseParameters

Returned in error responses to help with automated handling:

```typescript
interface ResponseParameters {
  retry_after?: number;       // Seconds to wait before retrying (on 429)
  migrate_to_chat_id?: number; // New chat ID if group upgraded to supergroup
}
```

---

## 3. Key Endpoints

### 3.1 getMe -- Verify Bot Token

**Request:**
```
POST https://api.telegram.org/bot<TOKEN>/getMe
```

No parameters required.

**Response (success):**
```json
{
  "ok": true,
  "result": {
    "id": 123456789,
    "is_bot": true,
    "first_name": "PIV Supervisor",
    "username": "piv_supervisor_bot",
    "can_join_groups": true,
    "can_read_all_group_messages": false,
    "supports_inline_queries": false
  }
}
```

**Use case**: Tier 1 connectivity test. Call on startup to verify the token is valid.

### 3.2 sendMessage -- Primary Escalation Method

**Request:**
```
POST https://api.telegram.org/bot<TOKEN>/sendMessage
Content-Type: application/json

{
  "chat_id": 987654321,
  "text": "<b>Escalation: integration_auth</b>\n\nProject: social-media-leads-agent\nPhase: 2\nError: Twitter API credentials missing\n\n<b>Action needed:</b> Add TWITTER_API_KEY to .env\n\nTap <b>Acknowledge</b> to confirm you've seen this.",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [[
      {"text": "Acknowledge", "callback_data": "ack_escalation_1708444800"}
    ]]
  }
}
```

**Response (success):**
```json
{
  "ok": true,
  "result": {
    "message_id": 42,
    "from": {
      "id": 123456789,
      "is_bot": true,
      "first_name": "PIV Supervisor"
    },
    "chat": {
      "id": 987654321,
      "first_name": "Marley",
      "type": "private"
    },
    "date": 1708444800,
    "text": "Escalation: integration_auth\n\nProject: social-media-leads-agent\nPhase: 2\nError: Twitter API credentials missing\n\nAction needed: Add TWITTER_API_KEY to .env\n\nTap Acknowledge to confirm you've seen this.",
    "entities": [
      {"offset": 0, "length": 32, "type": "bold"},
      {"offset": 131, "length": 14, "type": "bold"},
      {"offset": 181, "length": 11, "type": "bold"}
    ]
  }
}
```

**Response (error -- bot blocked by user):**
```json
{
  "ok": false,
  "error_code": 403,
  "description": "Forbidden: bot was blocked by the user"
}
```

**Key parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chat_id` | Integer or String | Yes | Target chat ID |
| `text` | String | Yes | Message text, 1-4096 characters |
| `parse_mode` | String | No | `HTML`, `MarkdownV2`, or `Markdown` |
| `reply_markup` | InlineKeyboardMarkup | No | Inline keyboard for acknowledgment buttons |
| `disable_notification` | Boolean | No | Send silently (default false) |
| `protect_content` | Boolean | No | Prevent forwarding/saving |
| `message_thread_id` | Integer | No | Topic ID for forum supergroups |

### 3.3 getUpdates -- Receive Acknowledgment

**Request (long polling):**
```
POST https://api.telegram.org/bot<TOKEN>/getUpdates
Content-Type: application/json

{
  "offset": 123456790,
  "timeout": 30,
  "limit": 100,
  "allowed_updates": ["callback_query"]
}
```

**Response (user pressed Acknowledge button):**
```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456790,
      "callback_query": {
        "id": "4382bfdwdsb323b2d9",
        "from": {
          "id": 987654321,
          "is_bot": false,
          "first_name": "Marley"
        },
        "message": {
          "message_id": 42,
          "chat": {
            "id": 987654321,
            "type": "private"
          },
          "date": 1708444800,
          "text": "Escalation: integration_auth..."
        },
        "data": "ack_escalation_1708444800"
      }
    }
  ]
}
```

**Key parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `offset` | Integer | No | ID of first update to return. Set to `last_update_id + 1` to confirm receipt of previous updates. |
| `limit` | Integer | No | Max updates to return (1-100, default 100) |
| `timeout` | Integer | No | Long polling timeout in seconds (0 = short polling, recommend 30) |
| `allowed_updates` | String[] | No | Filter to specific update types |

**Important**: `getUpdates` and webhooks are mutually exclusive. If a webhook is set, `getUpdates` returns an error. Delete the webhook first with `deleteWebhook`.

### 3.4 answerCallbackQuery -- Dismiss Button Loading State

After receiving a `callback_query`, you **must** call this to dismiss the loading indicator on the client. If not called, the client shows a spinning indicator for up to 60 seconds.

**Request:**
```
POST https://api.telegram.org/bot<TOKEN>/answerCallbackQuery
Content-Type: application/json

{
  "callback_query_id": "4382bfdwdsb323b2d9",
  "text": "Escalation acknowledged. Resuming after you resolve the issue."
}
```

**Response:**
```json
{
  "ok": true,
  "result": true
}
```

### 3.5 sendDocument -- Send Log Files

**Request (multipart form-data):**
```
POST https://api.telegram.org/bot<TOKEN>/sendDocument
Content-Type: multipart/form-data

chat_id: 987654321
document: <binary file data>
caption: "Validation failure log - Phase 3"
parse_mode: "HTML"
```

**Response:** Same structure as sendMessage, with an additional `document` field in the result.

**Limits**: Files up to 50 MB for upload, 20 MB for download via `getFile`.

### 3.6 editMessageReplyMarkup -- Remove Buttons After Acknowledgment

After the user acknowledges an escalation, remove the inline keyboard to prevent double-clicks:

**Request:**
```
POST https://api.telegram.org/bot<TOKEN>/editMessageReplyMarkup
Content-Type: application/json

{
  "chat_id": 987654321,
  "message_id": 42,
  "reply_markup": {
    "inline_keyboard": []
  }
}
```

---

## 4. Rate Limits & Throttling

### Official Limits

| Scope | Limit | Source |
|-------|-------|--------|
| Per private chat | ~1 msg/sec sustained; short bursts tolerated | Telegram Bots FAQ |
| Per group chat | 20 msg/min | Telegram Bots FAQ |
| Global broadcast | ~30 msg/sec across all chats | Telegram Bots FAQ |
| Message text length | 4096 UTF-8 characters | Bot API docs |
| Caption length | 1024 characters | Bot API docs |
| Callback data | 64 bytes | Bot API docs |
| File upload | 50 MB | Bot API docs |
| File download (getFile) | 20 MB | Bot API docs |
| Inline keyboard buttons per row | 8 | Bot API docs |

### Supervisor Impact

The supervisor sends **low-volume** notifications -- typically 1-5 messages per phase transition, plus occasional escalations. The 1 msg/sec private chat limit will never be hit in normal operation. Even worst case (rapid error + retry + escalation sequence), the supervisor sends at most ~10 messages in a burst, well within the tolerance window.

### Retry Strategy for Rate Limits

When a 429 response is received:
1. Parse `parameters.retry_after` from the response body
2. Sleep for `retry_after + 1` seconds (add buffer)
3. Retry the same request
4. If the second attempt also gets 429, log the error and queue the message for later delivery
5. **Never** tight-loop retry without respecting `retry_after`

### Message Chunking

For messages exceeding 4096 characters (e.g., detailed error logs):
1. Split at newline boundaries, keeping chunks under 4096 chars
2. Send chunks sequentially with a 100ms delay between them
3. Alternatively, send as a document attachment for very long content

---

## 5. Error Handling

### Error Response Format

All API errors return JSON with this structure:

```json
{
  "ok": false,
  "error_code": <HTTP_STATUS_CODE>,
  "description": "<human-readable error message>",
  "parameters": {
    "retry_after": <seconds>,
    "migrate_to_chat_id": <new_chat_id>
  }
}
```

The `parameters` field is optional and only present for specific error types.

### Error Code Reference

| HTTP Code | Error | Cause | Recovery | Supervisor Action |
|-----------|-------|-------|----------|-------------------|
| 401 | Unauthorized | Invalid or revoked bot token | Regenerate token via BotFather | Fatal -- log and halt |
| 400 | Bad Request: chat not found | Unknown `chat_id` | Verify chat ID | Fatal -- config error |
| 400 | Bad Request: message text is empty | Empty `text` parameter | Provide non-empty text | Bug -- fix message template |
| 400 | Bad Request: can't parse entities | Malformed HTML/MarkdownV2 | Fix formatting | Retry with `parse_mode: null` (plain text fallback) |
| 403 | Forbidden: bot was blocked by the user | User blocked the bot | Cannot recover programmatically | Log warning; queue messages for later |
| 403 | Forbidden: bot can't initiate conversation | User never sent `/start` | Wait for user to start bot | Log and notify via alternate channel |
| 409 | Conflict | Two processes polling same token | Ensure single instance | Fatal -- architecture error |
| 429 | Too Many Requests | Rate limit exceeded | Wait `retry_after` seconds | Sleep and retry (see Section 4) |
| 502/504 | Bad Gateway / Gateway Timeout | Telegram server issue | Retry with exponential backoff | Retry up to 3 times |

### Retry Classification for Supervisor

```typescript
function isRetryable(errorCode: number): boolean {
  // 429 = rate limit, 5xx = server errors
  return errorCode === 429 || errorCode >= 500;
}

function isFatal(errorCode: number, description: string): boolean {
  // Token invalid, chat not found, bot blocked
  return errorCode === 401
    || (errorCode === 400 && description.includes("chat not found"))
    || (errorCode === 403 && description.includes("blocked"));
}
```

### Parse Mode Fallback Pattern

If HTML formatting causes a parse error (400), retry the same message with `parse_mode` omitted. The message renders as plain text but still gets delivered:

```typescript
async function sendWithFallback(
  token: string,
  chatId: number,
  text: string,
): Promise<Response> {
  let res = await sendMessage(token, chatId, text, "HTML");
  if (!res.ok && res.description?.includes("can't parse entities")) {
    // Strip HTML tags and retry as plain text
    const plain = text.replace(/<[^>]+>/g, "");
    res = await sendMessage(token, chatId, plain, undefined);
  }
  return res;
}
```

---

## 6. SDK / Library Recommendation

### Recommendation: Direct HTTP (fetch) with Type Definitions from @grammyjs/types

For the supervisor's narrow use case (send messages, receive callback queries), a full bot framework is overkill. The supervisor should use **native `fetch`** with **type definitions from `@grammyjs/types`** for type safety.

**Why not a full framework (grammY / Telegraf / NTBA)?**

| Consideration | Direct HTTP | grammY | Telegraf | NTBA |
|---------------|-------------|--------|----------|------|
| Dependencies | 0 (fetch is built-in) | ~5 packages | ~10 packages | ~8 packages |
| TypeScript support | Via @grammyjs/types | Native | Partial (complex types) | None |
| Bundle size | Minimal | ~100KB | ~200KB | ~150KB |
| Learning curve | None (just HTTP) | Low | Medium | Low |
| Maintenance | Self-maintained thin wrapper | Active (latest Bot API 9.4) | Slower updates | Stale |
| Fits use case | Perfectly -- 3-4 methods | Overpowered | Overpowered | No TS |

### Installation

```bash
npm install @grammyjs/types
```

The `@grammyjs/types` package provides all Telegram Bot API TypeScript interfaces without any runtime code. It tracks the latest Bot API version (currently 9.4, February 2026).

### Thin Wrapper Pattern

```typescript
import type { Message, Update, ApiResponse, User } from "@grammyjs/types";

const BASE_URL = "https://api.telegram.org/bot";

interface TelegramConfig {
  token: string;
  chatId: number;
}

async function callApi<T>(
  config: TelegramConfig,
  method: string,
  params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${config.token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return response.json() as Promise<ApiResponse<T>>;
}

// Typed convenience methods
async function sendMessage(
  config: TelegramConfig,
  text: string,
  options: { parse_mode?: string; reply_markup?: unknown } = {},
): Promise<ApiResponse<Message.TextMessage>> {
  return callApi(config, "sendMessage", {
    chat_id: config.chatId,
    text,
    ...options,
  });
}

async function getMe(config: TelegramConfig): Promise<ApiResponse<User>> {
  return callApi(config, "getMe");
}

async function getUpdates(
  config: TelegramConfig,
  offset?: number,
  timeout: number = 30,
): Promise<ApiResponse<Update[]>> {
  return callApi(config, "getUpdates", {
    offset,
    timeout,
    allowed_updates: ["callback_query"],
  });
}

async function answerCallbackQuery(
  config: TelegramConfig,
  callbackQueryId: string,
  text?: string,
): Promise<ApiResponse<boolean>> {
  return callApi(config, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}
```

### If a Full Framework Is Later Needed

If requirements grow beyond simple notifications (e.g., interactive menus, complex conversation flows), migrate to **grammY** (`npm install grammy`):

- Written in TypeScript from the ground up
- Tracks latest Bot API version promptly
- Lightweight (~100KB), minimal dependencies
- Active maintenance and comprehensive documentation
- Middleware architecture scales well
- Supports both long polling and webhooks

**Do not use**: `node-telegram-bot-api` (no TypeScript, stale maintenance), or `telegraf` (complex types in v4, slower Bot API updates).

---

## 7. Integration Gotchas

### Gotcha 1: MarkdownV2 Escaping is Painful -- Use HTML

MarkdownV2 requires escaping 18 special characters outside entities: `_ * [ ] ( ) ~ ` > # + - = | { } . !`

Missing a single escape causes a 400 error. **Always use `parse_mode: "HTML"` instead.** HTML is simpler, more predictable, and already proven in the existing Python orchestrator.

```typescript
// HTML -- straightforward
const text = `<b>Escalation</b>\nProject: ${escapeHtml(project)}`;

// MarkdownV2 -- error-prone
const text = `*Escalation*\nProject: ${escapeMarkdownV2(project)}`;
// Must escape: . - ( ) ! in the project name
```

HTML escaping requires only `& < >`:
```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

### Gotcha 2: Bot Must Receive /start Before Sending

A bot cannot initiate a conversation. The user must send `/start` first. If `sendMessage` returns 403 "bot can't initiate conversation", the user has never interacted with the bot.

**Mitigation**: The supervisor setup instructions must include "message the bot with /start" as a prerequisite. The Tier 1 test verifies this.

### Gotcha 3: Message Length -- 4096 Character Hard Limit

The API rejects messages over 4096 UTF-8 characters with a 400 error. Escalation messages should be kept concise, but if error details are long, implement chunking or send as a document:

```typescript
async function sendLongMessage(
  config: TelegramConfig,
  text: string,
  parseMode: string = "HTML",
): Promise<void> {
  if (text.length <= 4096) {
    await sendMessage(config, text, { parse_mode: parseMode });
    return;
  }
  // Split at newline boundaries
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > 4096) {
      if (current) chunks.push(current);
      current = line.length > 4096 ? line.slice(0, 4096) : line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  for (const chunk of chunks) {
    await sendMessage(config, chunk, { parse_mode: parseMode });
  }
}
```

### Gotcha 4: getUpdates Conflict -- Single Consumer Only

Two processes calling `getUpdates` on the same token causes a 409 Conflict error. The supervisor must ensure only one polling loop runs at a time. If the orchestrator already polls for updates, the supervisor must either:
- Reuse the orchestrator's polling loop and filter for its own callback data prefix
- Use a separate bot token for the supervisor

**Recommendation for our architecture**: The TypeScript supervisor should use its own bot token (or share the token but coordinate via a single polling consumer that dispatches to both orchestrator and supervisor).

### Gotcha 5: Callback Data Limited to 64 Bytes

`callback_data` on inline keyboard buttons is limited to 64 bytes. Encode escalation IDs compactly:

```typescript
// Good: "ack_1708444800" (15 bytes)
// Bad: "acknowledge_escalation_project_social-media-leads_phase_2_1708444800" (69 bytes -- REJECTED)
```

### Gotcha 6: Long Polling Timeout and Node.js

When using `getUpdates` with `timeout: 30`, the HTTP request stays open for 30 seconds. Ensure the `fetch` call has a timeout greater than the long-polling timeout:

```typescript
const controller = new AbortController();
const fetchTimeout = setTimeout(() => controller.abort(), 35000); // 5s buffer

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ offset, timeout: 30, allowed_updates: ["callback_query"] }),
  signal: controller.signal,
});
clearTimeout(fetchTimeout);
```

### Gotcha 7: HTML Entities in Dynamic Content

User-generated strings (project names, error messages) can contain `<`, `>`, or `&` which break HTML formatting. **Always escape dynamic content** before embedding in HTML templates:

```typescript
const text = `<b>Error in ${escapeHtml(projectName)}</b>\n${escapeHtml(errorDetails)}`;
```

---

## 8. PRD Capability Mapping

### SC-007: Human-Required Escalation

**Trigger**: Error with `integration_auth` category or `partial_execution` after retry exhaustion.

**API flow**:
1. `sendMessage` with HTML-formatted escalation details and inline keyboard `[Acknowledge]` button
2. Start `getUpdates` polling loop (or integrate with existing poll) filtered to `callback_query`
3. When `callback_data` matches escalation ID:
   - Call `answerCallbackQuery` to dismiss loading indicator
   - Call `editMessageReplyMarkup` to remove the button
   - Update manifest `notifications[].acknowledged = true`
   - Resume the paused pipeline

**Message template**:
```html
<b>Escalation: {category}</b>

<b>Project:</b> {project_name}
<b>Phase:</b> {phase_number}
<b>Command:</b> /{failed_command}
<b>Error:</b> {error_details}
<b>Attempts:</b> {retries_used}/{max_retries}

<b>Action needed:</b> {action_description}
```

### SC-011: Hot Fix Validation Failure

**Trigger**: `/validate-implementation` fails after `/execute` retry.

**API flow**:
1. `sendMessage` with failure details and two buttons: `[Acknowledge]` and `[Send Logs]`
2. If user taps `[Send Logs]`, call `sendDocument` with the validation log file
3. On `[Acknowledge]`, update manifest and await manual fix

### Phase 2 -- Standard Notifications

Non-blocking status updates use `sendMessage` without inline keyboards:
- Phase start/complete
- Command start/complete
- Error with auto-retry (informational)
- Budget alerts

### Phase 3 -- Fix Failure Escalation

Same pattern as SC-007 but triggered by the fix-and-retry cycle exhausting its budget. The escalation message includes what was tried and why it failed.

### Capability Summary

| PRD Need | API Method(s) | Blocking? |
|----------|---------------|-----------|
| Send escalation with details | `sendMessage` (HTML + inline keyboard) | No (fire and forget) |
| Receive acknowledgment | `getUpdates` + `answerCallbackQuery` | Yes (polls until ack) |
| Send log files | `sendDocument` | No |
| Remove buttons after ack | `editMessageReplyMarkup` | No |
| Verify connectivity | `getMe` | No |
| Status notifications | `sendMessage` (HTML, no keyboard) | No |

---

## 9. Live Integration Testing Specification

### 9.1 Testing Tier Classification

| Tier | Tests | Side Effects | Automated? |
|------|-------|--------------|------------|
| Tier 1 | Token validation, connectivity | None | Yes |
| Tier 2 | Send/receive messages to own chat | Messages sent (reversible) | Yes |
| Tier 3 | N/A | N/A | N/A |
| Tier 4 | Full escalation flow with acknowledgment | Messages + callbacks | Manual |

### 9.2 Test Environment Configuration

**Prerequisites:**
- Valid `TELEGRAM_BOT_TOKEN` in environment
- Valid `TELEGRAM_CHAT_ID` in environment (operator's chat ID)
- Operator has sent `/start` to the bot at least once
- No other process polling `getUpdates` on the same token during tests

**Test isolation:**
- Tier 1 tests can run in CI (no side effects)
- Tier 2 tests send real messages to the operator's chat -- run only in pre-deployment validation
- Tier 4 tests require a human to tap buttons -- manual only

### 9.3 Testing Sequence

#### Tier 1: Connectivity (Automated, No Side Effects)

| ID | Test | Method | Assertion |
|----|------|--------|-----------|
| T1-01 | Verify bot token | `getMe` | `result.is_bot === true`, `result.username` is non-empty |
| T1-02 | Verify token format | Parse token | Matches `\d+:[A-Za-z0-9_-]+` pattern |

```typescript
// T1-01
const res = await callApi<User>(config, "getMe");
assert(res.ok === true);
assert(res.result.is_bot === true);
assert(res.result.username !== undefined);
```

#### Tier 2: Functional (Sends Messages, Reversible)

| ID | Test | Method | Assertion |
|----|------|--------|-----------|
| T2-01 | Send plain text | `sendMessage` | `result.text` matches sent text |
| T2-02 | Send HTML formatted | `sendMessage` with `parse_mode: "HTML"` | `result.entities` contains bold entity |
| T2-03 | Send with inline keyboard | `sendMessage` with `reply_markup` | `result.reply_markup.inline_keyboard` has 1 button |
| T2-04 | Message chunking | `sendLongMessage` with >4096 chars | Multiple messages sent, each <= 4096 chars |
| T2-05 | HTML escape safety | `sendMessage` with `<script>` in text | No parse error, text rendered safely |
| T2-06 | Parse mode fallback | `sendWithFallback` with broken HTML | Falls back to plain text, message delivered |

```typescript
// T2-01
const res = await sendMessage(config, "Integration test: plain text");
assert(res.ok === true);
assert(res.result.text === "Integration test: plain text");

// T2-02
const res = await sendMessage(config, "<b>Bold test</b>", { parse_mode: "HTML" });
assert(res.ok === true);
assert(res.result.entities?.some(e => e.type === "bold"));

// T2-03
const res = await sendMessage(config, "Button test", {
  parse_mode: "HTML",
  reply_markup: {
    inline_keyboard: [[{ text: "Test Button", callback_data: "test_btn" }]],
  },
});
assert(res.ok === true);
assert(res.result.reply_markup?.inline_keyboard?.[0]?.[0]?.text === "Test Button");
```

#### Tier 4: Full Escalation Flow (Manual)

| ID | Test | Steps | Assertion |
|----|------|-------|-----------|
| T4-01 | Escalation send + acknowledge | 1. Send escalation with Ack button. 2. Human taps Ack. 3. Bot receives callback. 4. Bot answers callback and removes button. | Callback received, button removed, message edited |
| T4-02 | Escalation timeout behavior | 1. Send escalation. 2. Do NOT tap button for 60s. | Bot continues polling, no crash or timeout |
| T4-03 | Send document attachment | 1. Send a test log file via sendDocument. | Document received, caption correct |

```typescript
// T4-01 (manual test script)
const escalation = await sendMessage(config, escalationTemplate, {
  parse_mode: "HTML",
  reply_markup: {
    inline_keyboard: [[
      { text: "Acknowledge", callback_data: "ack_test_123" },
    ]],
  },
});
console.log("Sent escalation message_id:", escalation.result.message_id);
console.log("Tap the Acknowledge button in Telegram...");

// Poll for callback
let offset: number | undefined;
while (true) {
  const updates = await getUpdates(config, offset, 30);
  if (!updates.ok) break;
  for (const update of updates.result) {
    offset = update.update_id + 1;
    if (update.callback_query?.data === "ack_test_123") {
      await answerCallbackQuery(config, update.callback_query.id, "Acknowledged!");
      await callApi(config, "editMessageReplyMarkup", {
        chat_id: config.chatId,
        message_id: escalation.result.message_id,
        reply_markup: { inline_keyboard: [] },
      });
      console.log("Acknowledgment received and button removed.");
      return;
    }
  }
}
```

---

## PIV-Automator-Hooks
tech_name: telegram-bot-api
research_status: complete
endpoints_documented: 6
tier_1_count: 2
tier_2_count: 6
tier_3_count: 0
tier_4_count: 3
gotchas_count: 7
confidence: high
