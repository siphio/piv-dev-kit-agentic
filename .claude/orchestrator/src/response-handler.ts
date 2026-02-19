// PIV Orchestrator — SDK Response Stream Handler

import type { SessionResult, SessionError, ProgressCallback, SessionProgress } from "./types.js";
import { parseHooks } from "./hooks-parser.js";
import { extractToolEvent, createSessionProgress } from "./progress-tracker.js";

/**
 * Process an AsyncIterable of SDK messages into a structured SessionResult.
 *
 * Handles message types:
 * - system/init: captures session_id, logs model and tools
 * - assistant: accumulates text from content blocks
 * - system/compact_boundary: logs context compaction warning
 * - result/success: captures final output, cost, duration, turns
 * - result/error_*: captures error with subtype and messages
 */
export async function processSession(
  generator: AsyncIterable<any>,
  onProgress?: ProgressCallback
): Promise<SessionResult> {
  let sessionId = "";
  let accumulatedText = "";
  let output = "";
  let costUsd = 0;
  let durationMs = 0;
  let turns = 0;
  let error: SessionError | undefined;
  let turnCount = 0;
  const progress: SessionProgress | undefined = onProgress ? createSessionProgress() : undefined;

  for await (const message of generator) {
    if (message.type === "system") {
      if (message.subtype === "init") {
        sessionId = message.session_id ?? "";
        console.log(`  Session initialized (id: ${sessionId}, model: ${message.model ?? "unknown"})`);
      } else if (message.subtype === "compact_boundary") {
        console.log("  ⚠️ Context compaction occurred — some early context may be summarized");
      }
    }

    // Rate limit events arrive between system/init and first assistant message.
    // Log for observability but don't treat as errors — the SDK handles backoff.
    if (message.type === "rate_limit_event") {
      const info = message.rate_limit_info;
      if (info?.status === "allowed") {
        console.log(`  Rate limit: allowed (resets at ${new Date((info.resetsAt ?? 0) * 1000).toISOString()})`);
      } else {
        console.log(`  ⚠️ Rate limit: ${info?.status ?? "unknown"} (type: ${info?.rateLimitType ?? "unknown"})`);
      }
    }

    if (message.type === "assistant" && message.message?.content) {
      turnCount++;
      for (const block of message.message.content) {
        if ("text" in block) {
          accumulatedText += block.text + "\n";
        }
        // F1: Extract tool_use events for progress tracking
        if (onProgress && progress && block.type === "tool_use") {
          const event = extractToolEvent(block, turnCount);
          if (event) {
            onProgress(event, progress);
          }
        }
      }
    }

    if (message.type === "result") {
      costUsd = message.total_cost_usd ?? 0;
      durationMs = message.duration_ms ?? 0;
      turns = message.num_turns ?? 0;

      if (message.subtype === "success") {
        output = message.result ?? accumulatedText;
      } else {
        // Error result: error_max_turns, error_during_execution, error_max_budget_usd, etc.
        error = {
          type: message.subtype ?? "unknown_error",
          messages: message.errors ?? [],
        };
        output = accumulatedText;
      }
    }
  }

  const hooks = parseHooks(output);

  return {
    sessionId,
    output,
    hooks,
    costUsd,
    durationMs,
    turns,
    error,
    progress,
  };
}
