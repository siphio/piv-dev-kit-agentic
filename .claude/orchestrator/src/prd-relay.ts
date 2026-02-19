// PIV Orchestrator — PRD Creation Conversation Bridge (Telegram ↔ Claude SDK)

import { createSession, resumeSession } from "./session-manager.js";
import type { SessionConfig } from "./types.js";
import type { TelegramNotifier } from "./telegram-notifier.js";

const PRD_SESSION_DEFAULTS: Partial<SessionConfig> = {
  maxTurns: 50,
};

/**
 * Bridges Telegram messages to a dedicated Claude Agent SDK session
 * for conversational PRD creation (SC-003).
 *
 * Creates one Claude session per PRD conversation. Each user message
 * is forwarded via session resume; Claude's response is returned
 * for the bot to send back to Telegram.
 */
export class PrdRelay {
  private projectDir: string;
  private notifier: TelegramNotifier;
  private sessionId: string | null = null;
  private active = false;

  constructor(projectDir: string, notifier: TelegramNotifier) {
    this.projectDir = projectDir;
    this.notifier = notifier;
  }

  /**
   * Start a new PRD creation conversation.
   * Creates a fresh Claude session with /create-prd prompt.
   */
  async startConversation(): Promise<void> {
    if (this.active) {
      throw new Error("PRD session already in progress");
    }

    this.active = true;

    try {
      const config: SessionConfig = {
        prompt: "/create-prd",
        cwd: this.projectDir,
        ...PRD_SESSION_DEFAULTS,
      } as SessionConfig;

      const result = await createSession(config);

      if (result.error) {
        this.active = false;
        throw new Error(`PRD session failed to start: ${result.error.messages.join("; ")}`);
      }

      this.sessionId = result.sessionId;

      // Send Claude's initial response back to the user
      if (result.output) {
        await this.notifier.sendText(result.output);
      }
    } catch (err) {
      this.active = false;
      throw err;
    }
  }

  /**
   * Forward a user message to the active Claude session and return the response.
   */
  async handleUserMessage(text: string): Promise<string> {
    if (!this.active || !this.sessionId) {
      throw new Error("No active PRD session");
    }

    const config: SessionConfig = {
      prompt: text,
      cwd: this.projectDir,
      resumeSessionId: this.sessionId,
      ...PRD_SESSION_DEFAULTS,
    } as SessionConfig;

    const result = await resumeSession(this.sessionId, config);

    if (result.error) {
      // End the session on error
      this.active = false;
      this.sessionId = null;
      throw new Error(`PRD relay error: ${result.error.messages.join("; ")}`);
    }

    return result.output || "(No response from Claude)";
  }

  /**
   * End the PRD conversation. Session is abandoned (no explicit destroy API).
   */
  async endConversation(): Promise<void> {
    this.active = false;
    this.sessionId = null;
  }

  /**
   * Check if a PRD relay conversation is currently active.
   */
  isActive(): boolean {
    return this.active;
  }
}
