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
