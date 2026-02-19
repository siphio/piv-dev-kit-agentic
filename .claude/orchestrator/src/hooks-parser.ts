// PIV Orchestrator — PIV-Automator-Hooks Parser

const HOOKS_HEADER = "## PIV-Automator-Hooks";
const HOOK_LINE_RE = /^([a-z_]+): (.+)$/;

/**
 * Extract PIV-Automator-Hooks key-value block from text.
 *
 * Finds the LAST occurrence of `## PIV-Automator-Hooks` and extracts
 * all subsequent lines matching the `key: value` pattern until the next
 * `##` header or end of text.
 */
export function parseHooks(text: string): Record<string, string> {
  if (!text) return {};

  const lastIdx = text.lastIndexOf(HOOKS_HEADER);
  if (lastIdx === -1) return {};

  const afterHeader = text.slice(lastIdx + HOOKS_HEADER.length);
  const lines = afterHeader.split("\n");
  const hooks: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Stop at next markdown header
    if (trimmed.startsWith("## ")) break;

    const match = HOOK_LINE_RE.exec(trimmed);
    if (match) {
      hooks[match[1]] = match[2];
    }
  }

  return hooks;
}
