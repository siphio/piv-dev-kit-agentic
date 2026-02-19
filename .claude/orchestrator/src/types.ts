// PIV Orchestrator — Shared Type Definitions

// --- Error Taxonomy ---

export type ErrorCategory =
  | "syntax_error"
  | "test_failure"
  | "scenario_mismatch"
  | "integration_auth"
  | "integration_rate_limit"
  | "stale_artifact"
  | "prd_gap"
  | "partial_execution"
  | "line_budget_exceeded";

export interface ErrorTaxonomyEntry {
  maxRetries: number;
  needsHuman: boolean;
  recoveryAction: string;
}

// --- PIV Commands ---

export type PivCommand =
  | "prime"
  | "plan-feature"
  | "execute"
  | "validate-implementation"
  | "commit"
  | "research-stack";

// --- Session Types ---

export interface SessionConfig {
  prompt: string;
  cwd: string;
  maxTurns: number;
  maxBudgetUsd: number;
  resumeSessionId?: string;
  model?: string;
  timeoutMs?: number;
}

export interface SessionError {
  type: string;
  messages: string[];
}

export interface SessionResult {
  sessionId: string;
  output: string;
  hooks: Record<string, string>;
  costUsd: number;
  durationMs: number;
  turns: number;
  error?: SessionError;
}

// --- Command Pairing ---

export interface CommandPairing {
  commands: string[];
  commandType: PivCommand;
  sessionConfig?: Partial<SessionConfig>;
}

// --- Manifest Types ---

export type PlanStatus = "not_started" | "in_progress" | "complete";
export type ExecutionStatus = "not_started" | "in_progress" | "complete";
export type ValidationStatus = "not_run" | "pass" | "partial" | "fail";

export interface PhaseStatus {
  plan: PlanStatus;
  execution: ExecutionStatus;
  validation: ValidationStatus;
}

export interface NextAction {
  command: string;
  argument?: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface FailureEntry {
  command: string;
  phase: number;
  error_category: ErrorCategory;
  timestamp: string;
  retry_count: number;
  max_retries: number;
  checkpoint?: string;
  resolution: "pending" | "auto_fixed" | "rolled_back" | "escalated" | "escalated_blocking" | "auto_rollback_retry";
  details: string;
}

export interface CheckpointEntry {
  tag: string;
  phase: number;
  created_before: string;
  status: "active" | "resolved";
}

export interface NotificationEntry {
  timestamp: string;
  type: "escalation" | "info" | "completion";
  severity: "warning" | "critical" | "info";
  category: string;
  phase: number;
  details: string;
  blocking: boolean;
  action_taken: string;
  acknowledged?: boolean;
}

export interface ProfileEntry {
  path: string;
  generated_at: string;
  status: string;
  freshness: "fresh" | "stale";
  used_in_phases: number[];
}

export interface PlanEntry {
  path: string;
  phase: number;
  status: string;
  generated_at: string;
}

export interface ExecutionEntry {
  phase: number;
  status: "complete" | "partial" | "failed";
  completed_at: string;
  tasks_total: number;
  tasks_done: number;
  tasks_blocked: number;
}

export interface ValidationEntry {
  path: string;
  phase: number;
  status: string;
  scenarios_passed: number;
  scenarios_failed: number;
  scenarios_skipped: number;
}

export interface PreflightEntry {
  status: "passed" | "blocked";
  completed_at: string;
  credentials_verified: number;
  technologies_checked: string[];
  notes?: string;
}

export interface PrdEntry {
  path: string;
  status: string;
  generated_at: string;
  phases_defined: number[];
}

export interface ManifestSettings {
  profile_freshness_window: string;
  checkpoint_before_execute: boolean;
  mode: string;
  reasoning_model: string;
  validation_mode: string;
  agent_teams: string;
}

export interface Manifest {
  prd?: PrdEntry;
  phases: Record<number, PhaseStatus>;
  settings: ManifestSettings;
  profiles: Record<string, ProfileEntry>;
  plans?: PlanEntry[];
  executions?: ExecutionEntry[];
  validations?: ValidationEntry[];
  checkpoints?: CheckpointEntry[];
  failures?: FailureEntry[];
  notifications?: NotificationEntry[];
  preflight?: PreflightEntry;
  next_action?: NextAction;
  last_updated: string;
}

// --- Telegram Types ---

export interface TelegramConfig {
  botToken: string;
  chatId: number;
  projectPrefix: string;
}

export interface ApprovalRequest {
  techName: string;
  endpoint: string;
  cost: string;
  effect: string;
  cleanup: string;
}

export interface ApprovalResult {
  action: "approve" | "fixture" | "skip";
  techName: string;
}

export type OrchestratorMode = "cli" | "telegram";

// --- Config Types ---

export interface OrchestratorConfig {
  projectDir: string;
  model: string;
  hasOAuthToken: boolean;
  hasApiKey: boolean;
  telegram?: TelegramConfig;
  mode: OrchestratorMode;
}
