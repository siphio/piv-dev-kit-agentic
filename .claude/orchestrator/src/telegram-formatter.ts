// PIV Orchestrator — Telegram Message Formatting Utilities

import type { Manifest, ApprovalRequest } from "./types.js";

const MAX_MESSAGE_LENGTH = 4000; // Leave room for HTML tags (Telegram limit is 4096)

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 * Only <, >, and & need escaping.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Prepend project name tag to message for multi-instance clarity (SC-010).
 */
export function tagMessage(projectPrefix: string, message: string): string {
  return `[${projectPrefix}] ${message}`;
}

/**
 * Split long messages at paragraph boundaries to stay within Telegram's 4096 limit.
 * Splits at 4000 chars to leave headroom for HTML tags.
 */
export function splitMessage(text: string, maxLength: number = MAX_MESSAGE_LENGTH): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split on double newline (paragraph boundary)
    let splitIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      // Fall back to single newline
      splitIndex = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      // Last resort: hard split at limit
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * Format manifest status as HTML for /status command (SC-009).
 */
export function formatStatusMessage(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push("<b>PIV Orchestrator Status</b>");
  lines.push("");

  // Phase table
  lines.push("<b>Phases:</b>");
  const phaseNumbers = Object.keys(manifest.phases)
    .map(Number)
    .sort((a, b) => a - b);

  for (const phase of phaseNumbers) {
    const s = manifest.phases[phase];
    const planIcon = s.plan === "complete" ? "✅" : s.plan === "in_progress" ? "🟡" : "⚪";
    const execIcon = s.execution === "complete" ? "✅" : s.execution === "in_progress" ? "🟡" : "⚪";
    const valIcon = s.validation === "pass" ? "✅" : s.validation === "partial" ? "🟡" : s.validation === "fail" ? "🔴" : "⚪";
    lines.push(`  Phase ${phase}: ${planIcon} Plan ${execIcon} Exec ${valIcon} Val`);
  }

  // Next action
  if (manifest.next_action) {
    lines.push("");
    lines.push(`<b>Next:</b> ${escapeHtml(manifest.next_action.command)} ${escapeHtml(manifest.next_action.argument ?? "")}`);
    lines.push(`<i>${escapeHtml(manifest.next_action.reason)}</i>`);
  }

  // Active failures
  const pendingFailures = manifest.failures?.filter((f) => f.resolution === "pending") ?? [];
  if (pendingFailures.length > 0) {
    lines.push("");
    lines.push("<b>Active Failures:</b>");
    for (const f of pendingFailures) {
      lines.push(`  🔴 Phase ${f.phase} (${escapeHtml(f.error_category)}): ${escapeHtml(f.details)}`);
    }
  }

  // Last updated
  lines.push("");
  lines.push(`<i>Updated: ${manifest.last_updated}</i>`);

  return lines.join("\n");
}

/**
 * Format phase start notification.
 */
export function formatPhaseStartMessage(phase: number, phaseName: string): string {
  return `🚀 <b>Phase ${phase} Starting</b>: ${escapeHtml(phaseName)}`;
}

/**
 * Format phase completion notification.
 */
export function formatPhaseCompleteMessage(phase: number, costUsd: number): string {
  return `✅ <b>Phase ${phase} Complete</b> (cost: $${costUsd.toFixed(2)})`;
}

/**
 * Format blocking escalation message with full failure context.
 */
export function formatEscalationMessage(
  phase: number,
  category: string,
  details: string,
  actionTaken: string
): string {
  const lines: string[] = [];
  lines.push(`🔴 <b>Escalation — Phase ${phase}</b>`);
  lines.push("");
  lines.push(`<b>Category:</b> ${escapeHtml(category)}`);
  lines.push(`<b>Details:</b> ${escapeHtml(details)}`);
  lines.push(`<b>Action taken:</b> ${escapeHtml(actionTaken)}`);
  lines.push("");
  lines.push("<i>Execution paused — awaiting your response.</i>");
  return lines.join("\n");
}

/**
 * Format Tier 3 approval request with endpoint details and cost (SC-006).
 */
export function formatApprovalMessage(request: ApprovalRequest): string {
  const lines: string[] = [];
  lines.push(`<b>Tier 3 Approval Required: ${escapeHtml(request.techName)}</b>`);
  lines.push("");
  lines.push("To validate, I need to:");
  lines.push(`  Call: <code>${escapeHtml(request.endpoint)}</code>`);
  lines.push(`  Cost: ${escapeHtml(request.cost)}`);
  lines.push(`  Effect: ${escapeHtml(request.effect)}`);
  lines.push(`  Cleanup: ${escapeHtml(request.cleanup)}`);
  lines.push("");
  lines.push("Choose an option:");
  return lines.join("\n");
}

/**
 * Format approval result after user presses inline keyboard button.
 */
export function formatApprovalResultMessage(techName: string, action: string): string {
  const actionLabel =
    action === "approve" ? "Approved — executing live call"
    : action === "fixture" ? "Using recorded fixture"
    : "Skipped";
  return `<b>Tier 3 ${actionLabel}: ${escapeHtml(techName)}</b>`;
}
