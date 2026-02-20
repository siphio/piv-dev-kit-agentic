// PIV Supervisor — Shared Type Definitions

export type ProjectStatus = "idle" | "running" | "stalled" | "complete" | "error";

export interface RegistryProject {
  name: string;
  path: string;
  status: ProjectStatus;
  heartbeat: string;           // ISO 8601
  currentPhase: number | null;
  pivCommandsVersion: string;  // git short hash
  orchestratorPid: number | null;
  registeredAt: string;        // ISO 8601
  lastCompletedPhase: number | null;
}

export interface CentralRegistry {
  projects: Record<string, RegistryProject>;
  lastUpdated: string;
}

export interface InitOptions {
  targetDir: string;
  projectName: string;
  devKitDir: string;
}

export interface InitResult {
  success: boolean;
  projectName: string;
  targetDir: string;
  registryPath: string;
  pivCommandsVersion: string;
  errors: string[];
}

// --- Phase 6: Monitor Loop & Stall Detection ---

export type StallType = "orchestrator_crashed" | "agent_waiting_for_input" | "execution_error" | "session_hung";

export interface StallClassification {
  project: RegistryProject;
  stallType: StallType;
  confidence: "high" | "medium" | "low";
  details: string;
  heartbeatAgeMs: number;
}

export interface MonitorConfig {
  intervalMs: number;
  heartbeatStaleMs: number;
  maxRestartAttempts: number;
  registryPath?: string;
  telegramToken?: string;
  telegramChatId?: number;
  improvementLogPath: string;
  supervisorPidPath: string;
}

export interface RecoveryAction {
  type: "restart" | "restart_with_preamble" | "escalate" | "diagnose" | "skip";
  project: RegistryProject;
  stallType: StallType;
  details: string;
  restartCount: number;
}

export interface ImprovementLogEntry {
  timestamp: string;
  project: string;
  phase: number | null;
  stallType: StallType;
  action: string;
  outcome: string;
  details: string;
  bugLocation?: BugLocation;
  rootCause?: string;
  filePath?: string;
  fixApplied?: boolean;
  propagatedTo?: string[];
  memoryRecordId?: string;
  memoryRetrievedIds?: string[];
}

export interface SupervisorTelegramConfig {
  token: string;
  chatId: number;
}

export interface MonitorCycleResult {
  projectsChecked: number;
  stalled: number;
  recovered: number;
  escalated: number;
  interventionsAttempted: number;
}

// --- Phase 7: Diagnosis, Hot Fix & Propagation ---

export type BugLocation = "framework_bug" | "project_bug" | "human_required";

export interface DiagnosticResult {
  bugLocation: BugLocation;
  confidence: "high" | "medium" | "low";
  rootCause: string;
  filePath: string | null;
  errorCategory: string;
  multiProjectPattern: boolean;
  affectedProjects: string[];
}

export interface HotFixResult {
  success: boolean;
  filePath: string;
  linesChanged: number;
  validationPassed: boolean;
  revertedOnFailure: boolean;
  details: string;
  sessionCostUsd: number;
}

export interface PropagationResult {
  project: string;
  success: boolean;
  filesCopied: string[];
  newVersion: string;
  orchestratorRestarted: boolean;
  error?: string;
}

export interface InterventionResult {
  project: string;
  phase: number | null;
  diagnostic: DiagnosticResult;
  fix: HotFixResult | null;
  propagation: PropagationResult[];
  escalated: boolean;
  totalCostUsd: number;
}

export interface InterventorConfig {
  devKitDir: string;
  diagnosisBudgetUsd: number;
  fixBudgetUsd: number;
  diagnosisMaxTurns: number;
  fixMaxTurns: number;
  timeoutMs: number;
}

// --- Phase 8: SuperMemory Integration ---

export interface MemoryConfig {
  apiKey: string | undefined;
  enabled: boolean;
  containerTagPrefix: string;
  searchThreshold: number;
  searchLimit: number;
  entityContext: string;
}

export interface FixRecord {
  content: string;
  customId: string;
  containerTag: string;
  metadata: {
    error_category: string;
    phase: string;
    project: string;
    fix_type: string;
    severity: string;
    command: string;
    resolved: string;
  };
  entityContext: string;
}

export interface MemorySearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata: Record<string, string>;
}
