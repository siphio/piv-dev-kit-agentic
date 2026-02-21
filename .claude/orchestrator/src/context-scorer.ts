// PIV Orchestrator — Context Quality Scorer (F4)

import { resolveProfiles, type ContextScore, type Manifest } from "./types.js";

/**
 * Score /prime output against manifest expectations (0-10).
 *
 * Rubric:
 * - PRD phase mentioned: +3
 * - Profiles found: +2
 * - Plan referenced: +2
 * - Manifest status mentioned: +1
 * - No errors in output: +2
 */
export function scoreContext(
  primeOutput: string,
  manifest: Manifest,
  expectedPhase?: number
): ContextScore {
  const details: string[] = [];
  let total = 0;

  // PRD phase mentioned (+3)
  let prdPhaseLoaded = false;
  if (expectedPhase !== undefined) {
    const phasePattern = new RegExp(`Phase\\s+${expectedPhase}`, "i");
    if (phasePattern.test(primeOutput)) {
      prdPhaseLoaded = true;
      total += 3;
      details.push(`PRD Phase ${expectedPhase} loaded (+3)`);
    } else {
      details.push(`PRD Phase ${expectedPhase} NOT found in output (+0)`);
    }
  } else {
    // No expected phase — check for any phase mention
    if (/Phase\s+\d/i.test(primeOutput)) {
      prdPhaseLoaded = true;
      total += 3;
      details.push("PRD phase reference found (+3)");
    } else {
      details.push("No PRD phase reference found (+0)");
    }
  }

  // Profiles found (+2)
  const profileNames = Object.keys(resolveProfiles(manifest));
  const profilesFound: string[] = [];
  for (const name of profileNames) {
    if (primeOutput.toLowerCase().includes(name.toLowerCase())) {
      profilesFound.push(name);
    }
  }
  if (profilesFound.length > 0) {
    total += 2;
    details.push(`Profiles found: ${profilesFound.join(", ")} (+2)`);
  } else if (profileNames.length > 0) {
    details.push(`No profiles found in output (expected: ${profileNames.join(", ")}) (+0)`);
  } else {
    total += 2; // No profiles expected — count as OK
    details.push("No profiles expected (+2)");
  }

  // Plan referenced (+2)
  let planReferenced = false;
  const planPaths = manifest.plans?.map((p) => p.path) ?? [];
  for (const planPath of planPaths) {
    if (primeOutput.includes(planPath)) {
      planReferenced = true;
      break;
    }
  }
  // Also check generic plan references
  if (!planReferenced && /plan|\.md/i.test(primeOutput)) {
    planReferenced = true;
  }
  if (planReferenced) {
    total += 2;
    details.push("Plan referenced (+2)");
  } else {
    details.push("Plan NOT referenced (+0)");
  }

  // Manifest status mentioned (+1)
  let manifestAccurate = false;
  if (/manifest/i.test(primeOutput) || /status/i.test(primeOutput)) {
    manifestAccurate = true;
    total += 1;
    details.push("Manifest/status mentioned (+1)");
  } else {
    details.push("Manifest/status NOT mentioned (+0)");
  }

  // No errors (+2)
  const hasErrors = /error|fail|missing|not found/i.test(primeOutput) &&
    !/no errors?/i.test(primeOutput);
  if (!hasErrors) {
    total += 2;
    details.push("No errors detected (+2)");
  } else {
    details.push("Errors detected in output (+0)");
  }

  return {
    total,
    prdPhaseLoaded,
    profilesFound,
    planReferenced,
    manifestAccurate,
    details,
  };
}

/**
 * Check if score meets threshold (default: 5).
 */
export function isContextSufficient(score: ContextScore, threshold: number = 5): boolean {
  return score.total >= threshold;
}

/**
 * Format context score for terminal display.
 */
export function formatContextScore(score: ContextScore): string {
  const lines: string[] = [];
  lines.push(`  Context Score: ${score.total}/10`);
  for (const detail of score.details) {
    lines.push(`    ${detail}`);
  }
  return lines.join("\n");
}
