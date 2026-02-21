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
  | "line_budget_exceeded"
  | "orchestrator_crash"
  | "manifest_corruption";

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
  | "research-stack"
  | "preflight";

// --- Session Types ---

export interface SessionConfig {
  prompt: string;
  cwd: string;
  maxTurns: number;
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
  progress?: SessionProgress;
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

export interface ResearchProfileEntry {
  name: string;
  path: string;
  generated_at: string;
  freshness: "fresh" | "stale";
  used_in_phases?: number[];
}

export interface ResearchEntry {
  pending: string[];
  satisfied: string[];
  profiles?: ResearchProfileEntry[];
}

/**
 * Resolve profiles from either top-level `profiles` (Record) or
 * `research.profiles` (array). Returns a normalized Record<string, ProfileEntry>.
 * Handles the format mismatch between /prime (writes research.profiles as array)
 * and the orchestrator (expects top-level Record).
 */
export function resolveProfiles(manifest: Manifest): Record<string, ProfileEntry> {
  // Prefer top-level profiles if present
  if (manifest.profiles && Object.keys(manifest.profiles).length > 0) {
    return manifest.profiles;
  }
  // Fall back to research.profiles array → convert to Record
  const researchProfiles = manifest.research?.profiles;
  if (!researchProfiles || researchProfiles.length === 0) {
    return {};
  }
  const result: Record<string, ProfileEntry> = {};
  for (const p of researchProfiles) {
    result[p.name] = {
      path: p.path,
      generated_at: p.generated_at,
      status: "complete",
      freshness: p.freshness,
      used_in_phases: p.used_in_phases ?? [],
    };
  }
  return result;
}

export interface Manifest {
  prd?: PrdEntry;
  phases: Record<number, PhaseStatus>;
  settings: ManifestSettings;
  profiles?: Record<string, ProfileEntry>;
  research?: ResearchEntry;
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

// --- Instance Registry Types ---

export interface RegistryInstance {
  prefix: string;
  projectDir: string;
  pid: number;
  startedAt: string;
  manifestPath: string;
  isBotOwner: boolean;
}

export interface InstanceRegistry {
  instances: RegistryInstance[];
  lastUpdated: string;
}

// --- F1: Progress Visibility ---

export type ToolName = "Read" | "Write" | "Edit" | "Bash" | "Glob" | "Grep" | "WebSearch" | "WebFetch" | "Task";

export interface ToolUseEvent {
  turn: number;
  tool: ToolName;
  target: string;
  timestamp: number;
}

export interface SessionProgress {
  turnCount: number;
  toolUses: ToolUseEvent[];
  filesCreated: string[];
  filesModified: string[];
  testsRun: number;
  teamSpawns: number;
  startedAt: number;
  lastActivityAt: number;
}

export type ProgressCallback = (event: ToolUseEvent, progress: SessionProgress) => void;

// --- F2: Adaptive Budgets ---

export interface BudgetContext {
  command: PivCommand;
  projectDir: string;
  phase?: number;
  manifest?: Manifest;
  priorPhaseStats?: PhaseStats;
}

export interface PhaseStats {
  phase: number;
  turnsUsed: number;
  taskCount: number;
  turnsPerTask: number;
}

export interface SessionBudget {
  maxTurns: number;
  timeoutMs: number;
  reasoning: string;
}

// --- F3: Smarter Failures ---

export type FailureSeverity = "blocking" | "degraded" | "advisory";

// --- F4: Context Scoring ---

export interface ContextScore {
  total: number;
  prdPhaseLoaded: boolean;
  profilesFound: string[];
  planReferenced: boolean;
  manifestAccurate: boolean;
  details: string[];
}

// --- F5: Drift Detection ---

export interface DriftResult {
  phase: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  failedTests: string[];
  regressionDetected: boolean;
  durationMs: number;
}

// --- F6: Fidelity ---

export interface FidelityReport {
  phase: number;
  plannedFiles: string[];
  actualFiles: string[];
  matchedFiles: string[];
  missingFiles: string[];
  unplannedFiles: string[];
  fidelityScore: number;
  details: string[];
}

// --- Signal Types ---

export type SignalAction = "go" | "pause" | "resume" | "shutdown";

export interface SignalMessage {
  action: SignalAction;
  timestamp: string;
  from: string; // prefix of the sender (bot owner)
}

// --- Process Management Types ---

export interface ProcessInfo {
  pid: number;
  startedAt: string;
  projectDir: string;
}

// --- Config Types ---

export interface OrchestratorConfig {
  projectDir: string;
  model: string;
  hasOAuthToken: boolean;
  telegram?: TelegramConfig;
  mode: OrchestratorMode;
  registryEnabled: boolean;
}
