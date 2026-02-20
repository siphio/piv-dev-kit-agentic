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
  type: "restart" | "restart_with_preamble" | "escalate" | "skip";
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
}
