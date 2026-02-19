// PIV Orchestrator — Session Progress Tracker (F1)

import type {
  ToolName,
  ToolUseEvent,
  SessionProgress,
  ProgressCallback,
} from "./types.js";
import type { TelegramNotifier } from "./telegram-notifier.js";

const TOOL_EMOJI: Record<ToolName, string> = {
  Read: "\u{1F4D6}",     // 📖
  Write: "\u{270F}\uFE0F", // ✏️
  Edit: "\u{1F527}",      // 🔧
  Bash: "\u{1F4BB}",      // 💻
  Glob: "\u{1F50D}",      // 🔍
  Grep: "\u{1F50E}",      // 🔎
  WebSearch: "\u{1F310}", // 🌐
  WebFetch: "\u{1F310}",  // 🌐
  Task: "\u{1F916}",      // 🤖
};

const KNOWN_TOOLS = new Set<string>([
  "Read", "Write", "Edit", "Bash", "Glob", "Grep",
  "WebSearch", "WebFetch", "Task",
]);

/**
 * Extract tool name and target from an SDK content block.
 * Returns null if the block is not a tool_use or the tool is unrecognized.
 */
export function extractToolEvent(
  block: { type?: string; name?: string; input?: Record<string, unknown> },
  turnCount: number
): ToolUseEvent | null {
  if (block.type !== "tool_use" || !block.name) return null;
  if (!KNOWN_TOOLS.has(block.name)) return null;

  const tool = block.name as ToolName;
  const target = extractToolTarget(tool, block.input ?? {});

  return {
    turn: turnCount,
    tool,
    target,
    timestamp: Date.now(),
  };
}

/**
 * Map tool inputs to human-readable targets.
 */
export function extractToolTarget(
  toolName: ToolName,
  input: Record<string, unknown>
): string {
  switch (toolName) {
    case "Read":
    case "Write":
      return typeof input.file_path === "string" ? input.file_path : "unknown";
    case "Edit":
      return typeof input.file_path === "string" ? input.file_path : "unknown";
    case "Bash": {
      const cmd = typeof input.command === "string" ? input.command : "";
      return cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd || "unknown";
    }
    case "Task":
      return typeof input.description === "string" ? input.description : "agent task";
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : "unknown";
    case "Grep":
      return typeof input.pattern === "string" ? input.pattern : "unknown";
    case "WebSearch":
      return typeof input.query === "string" ? input.query : "search";
    case "WebFetch":
      return typeof input.url === "string" ? input.url : "fetch";
    default:
      return "unknown";
  }
}

/**
 * Format a progress line for terminal output.
 * Example: "[turn 5] 📖 Read src/models/task.py"
 */
export function formatProgressLine(event: ToolUseEvent): string {
  const emoji = TOOL_EMOJI[event.tool] ?? "❓";
  return `[turn ${event.turn}] ${emoji} ${event.tool} ${event.target}`;
}

/**
 * Create a fresh SessionProgress object.
 */
export function createSessionProgress(): SessionProgress {
  const now = Date.now();
  return {
    turnCount: 0,
    toolUses: [],
    filesCreated: [],
    filesModified: [],
    testsRun: 0,
    teamSpawns: 0,
    startedAt: now,
    lastActivityAt: now,
  };
}

/**
 * Update progress state from a tool event.
 */
function updateProgress(progress: SessionProgress, event: ToolUseEvent): void {
  progress.toolUses.push(event);
  progress.lastActivityAt = event.timestamp;
  progress.turnCount = Math.max(progress.turnCount, event.turn);

  if (event.tool === "Write" && event.target !== "unknown") {
    if (!progress.filesCreated.includes(event.target)) {
      progress.filesCreated.push(event.target);
    }
  }
  if (event.tool === "Edit" && event.target !== "unknown") {
    if (!progress.filesModified.includes(event.target)) {
      progress.filesModified.push(event.target);
    }
  }
  if (event.tool === "Task") {
    progress.teamSpawns++;
  }
}

/**
 * Format a progress summary for Telegram (used by throttled sender).
 */
export function formatProgressSummary(
  phase: number | undefined,
  command: string | undefined,
  progress: SessionProgress
): string {
  const phaseStr = phase !== undefined ? `Phase ${phase}` : "Pre-loop";
  const cmdStr = command ?? "session";
  const lines: string[] = [];

  lines.push(`📊 <b>${phaseStr} — ${cmdStr}</b>`);
  lines.push(`Turns: ${progress.turnCount} | Tools: ${progress.toolUses.length}`);

  if (progress.filesCreated.length > 0) {
    lines.push(`Files created: ${progress.filesCreated.length}`);
  }
  if (progress.filesModified.length > 0) {
    lines.push(`Files modified: ${progress.filesModified.length}`);
  }
  if (progress.teamSpawns > 0) {
    lines.push(`Sub-agents spawned: ${progress.teamSpawns}`);
  }

  const elapsed = Math.round((progress.lastActivityAt - progress.startedAt) / 1000);
  lines.push(`Elapsed: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);

  return lines.join("\n");
}

/**
 * Factory: creates a ProgressCallback that logs to terminal and sends
 * throttled summaries to Telegram.
 *
 * Telegram: sends summary every 10 turns OR 2 minutes (whichever first).
 */
export function createProgressCallback(
  notifier?: TelegramNotifier,
  phase?: number,
  command?: string
): { callback: ProgressCallback; progress: SessionProgress } {
  const progress = createSessionProgress();
  let lastTelegramTurn = 0;
  let lastTelegramTime = Date.now();

  const TURN_THRESHOLD = 10;
  const TIME_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

  const callback: ProgressCallback = (event, _progress) => {
    updateProgress(progress, event);
    console.log(`  ${formatProgressLine(event)}`);

    // Throttled Telegram notification
    if (notifier) {
      const turnDelta = event.turn - lastTelegramTurn;
      const timeDelta = Date.now() - lastTelegramTime;

      if (turnDelta >= TURN_THRESHOLD || timeDelta >= TIME_THRESHOLD_MS) {
        lastTelegramTurn = event.turn;
        lastTelegramTime = Date.now();
        const summary = formatProgressSummary(phase, command, progress);
        notifier.sendProgress(phase ?? 0, summary).catch(() => {
          // Best-effort — don't crash on Telegram failure
        });
      }
    }
  };

  return { callback, progress };
}
