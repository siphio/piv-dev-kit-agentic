// PIV Orchestrator — Error Taxonomy Classifier

import type { ErrorCategory, ErrorTaxonomyEntry, FailureEntry, FailureSeverity, PivCommand } from "./types.js";

const ERROR_TAXONOMY: Record<ErrorCategory, ErrorTaxonomyEntry> = {
  syntax_error:           { maxRetries: 2, needsHuman: false, recoveryAction: "auto-fix and retry" },
  test_failure:           { maxRetries: 2, needsHuman: false, recoveryAction: "auto-fix and retry" },
  scenario_mismatch:      { maxRetries: 1, needsHuman: false, recoveryAction: "re-read PRD, adjust implementation" },
  integration_auth:       { maxRetries: 0, needsHuman: true,  recoveryAction: "escalate immediately" },
  integration_rate_limit: { maxRetries: 3, needsHuman: false, recoveryAction: "exponential backoff" },
  stale_artifact:         { maxRetries: 1, needsHuman: false, recoveryAction: "research-stack --refresh" },
  prd_gap:                { maxRetries: 0, needsHuman: true,  recoveryAction: "escalate — PRD needs human revision" },
  partial_execution:      { maxRetries: 1, needsHuman: false, recoveryAction: "rollback to checkpoint" },
  line_budget_exceeded:   { maxRetries: 1, needsHuman: false, recoveryAction: "auto-trim and retry" },
  orchestrator_crash:     { maxRetries: 0, needsHuman: false, recoveryAction: "resume from manifest state" },
  manifest_corruption:    { maxRetries: 0, needsHuman: false, recoveryAction: "rebuild manifest via /prime" },
};

interface ClassificationPattern {
  category: ErrorCategory;
  patterns: RegExp[];
}

const CLASSIFICATION_PATTERNS: ClassificationPattern[] = [
  // Higher-specificity patterns first to avoid false matches
  {
    category: "orchestrator_crash",
    patterns: [/crash/i, /orchestrator.*restart/i, /stale.*pid/i],
  },
  {
    category: "manifest_corruption",
    patterns: [/manifest.*corrupt/i, /yaml.*parse/i, /manifest.*invalid/i],
  },
  {
    category: "integration_auth",
    patterns: [/credential/i, /auth/i, /\b401\b/, /unauthorized/i, /forbidden/i, /\b403\b/],
  },
  {
    category: "integration_rate_limit",
    patterns: [/\b429\b/, /rate.?limit/i, /too.?many.?request/i, /throttl/i],
  },
  {
    category: "syntax_error",
    patterns: [/compil/i, /syntax/i, /type.?error/i, /\btsc\b/i, /\blint/i, /parse.?error/i],
  },
  {
    category: "test_failure",
    patterns: [/test.?fail/i, /\bassert/i, /expect.*received/i, /vitest/i, /jest/i],
  },
  {
    category: "scenario_mismatch",
    patterns: [/scenario/i, /mismatch/i, /prd.*does.?n/i],
  },
  {
    category: "stale_artifact",
    patterns: [/stale/i, /outdated/i, /expired.?profile/i],
  },
  {
    category: "line_budget_exceeded",
    patterns: [/line.?budget/i, /too.?long/i, /exceeded.*lines/i],
  },
  {
    category: "prd_gap",
    patterns: [/prd.?gap/i, /missing.?requirement/i, /undefined.?in.?prd/i],
  },
];

/**
 * Classify an error string into a taxonomy category using keyword pattern matching.
 * Falls back to "partial_execution" for unrecognized errors.
 */
export function classifyError(errorText: string, _command: PivCommand): ErrorCategory {
  for (const { category, patterns } of CLASSIFICATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(errorText)) {
        return category;
      }
    }
  }
  return "partial_execution";
}

/**
 * Look up the taxonomy entry for a given error category.
 */
export function getTaxonomy(category: ErrorCategory): ErrorTaxonomyEntry {
  return ERROR_TAXONOMY[category];
}

/**
 * Check if a failure can be retried (retry_count < maxRetries).
 */
export function canRetry(failure: FailureEntry): boolean {
  const taxonomy = getTaxonomy(failure.error_category);
  return failure.retry_count < taxonomy.maxRetries;
}

/**
 * Check if a failure needs human escalation.
 */
export function needsEscalation(failure: FailureEntry): boolean {
  const taxonomy = getTaxonomy(failure.error_category);
  if (taxonomy.needsHuman) return true;
  return failure.retry_count >= taxonomy.maxRetries;
}

// --- F3: Severity Tiers ---

/**
 * Map error categories to severity tiers.
 *
 * Tier 1 (blocking): Stop pipeline, escalate
 * Tier 2 (degraded): Inline retry with bigger budget, continue if fixed
 * Tier 3 (advisory): Log warning, continue
 */
export const SEVERITY_MAP: Record<ErrorCategory, FailureSeverity> = {
  syntax_error: "blocking",
  test_failure: "blocking",
  scenario_mismatch: "blocking",
  integration_auth: "blocking",
  prd_gap: "blocking",
  partial_execution: "blocking",
  orchestrator_crash: "blocking",
  manifest_corruption: "blocking",
  integration_rate_limit: "degraded",
  stale_artifact: "advisory",
  line_budget_exceeded: "advisory",
};

/**
 * Get the severity tier for an error category.
 */
export function getSeverity(category: ErrorCategory): FailureSeverity {
  return SEVERITY_MAP[category] ?? "blocking";
}

/**
 * Get extended taxonomy info including severity.
 */
export function getExtendedTaxonomy(category: ErrorCategory): ErrorTaxonomyEntry & { severity: FailureSeverity } {
  return {
    ...getTaxonomy(category),
    severity: getSeverity(category),
  };
}
