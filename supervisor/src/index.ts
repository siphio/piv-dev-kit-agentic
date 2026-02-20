#!/usr/bin/env node
// PIV Supervisor — CLI Entry Point

import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pivInit } from "./init.js";
import { listProjects, pruneDeadProjects, getRegistryPath } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function printUsage(): void {
  console.log(`
PIV Supervisor v0.1.0

Usage:
  piv init <path> [--name <name>]   Bootstrap a new PIV project
  piv status                        Show all registered projects
  piv list                          Alias for status

Options:
  --name <name>   Project name (defaults to directory basename)
  --help          Show this help message
`);
}

function formatStatus(status: string): string {
  const icons: Record<string, string> = {
    idle: "⚪",
    running: "🟢",
    stalled: "🟡",
    complete: "🔵",
    error: "🔴",
  };
  return `${icons[status] ?? "⚪"} ${status}`;
}

function handleInit(args: string[]): void {
  let targetPath: string | undefined;
  let projectName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) {
      projectName = args[++i];
    } else if (!args[i].startsWith("--")) {
      targetPath = args[i];
    }
  }

  if (!targetPath) {
    console.error("Error: <path> is required for piv init");
    console.error("Usage: piv init <path> [--name <name>]");
    process.exit(1);
  }

  const resolvedPath = resolve(targetPath);
  const name = projectName ?? basename(resolvedPath);

  // Default devKitDir: two levels up from supervisor/src/ (or supervisor/dist/)
  const devKitDir = resolve(__dirname, "..", "..");

  console.log(`\n🚀 Initializing PIV project: ${name}`);
  console.log(`   Target: ${resolvedPath}`);
  console.log(`   Dev Kit: ${devKitDir}`);

  const result = pivInit({ targetDir: resolvedPath, projectName: name, devKitDir });

  if (result.success) {
    console.log(`\n✅ Project "${result.projectName}" initialized successfully`);
    console.log(`   📁 Location: ${result.targetDir}`);
    console.log(`   📋 Registry: ${result.registryPath}`);
    console.log(`   🏷️  Version: ${result.pivCommandsVersion}`);
    console.log(`\n   Next steps:`);
    console.log(`   1. cd ${result.targetDir}`);
    console.log(`   2. cd .claude/orchestrator && npm install`);
    console.log(`   3. Run /prime to get started`);
  } else {
    console.error(`\n❌ Initialization failed with ${result.errors.length} error(s):`);
    for (const err of result.errors) {
      console.error(`   - ${err}`);
    }
    process.exit(1);
  }
}

function handleStatus(): void {
  const projects = listProjects();

  if (projects.length === 0) {
    console.log("\nNo projects registered.");
    console.log(`Registry: ${getRegistryPath()}`);
    console.log("\nRun 'piv init <path>' to bootstrap a project.");
    return;
  }

  // Prune dead processes first
  pruneDeadProjects();
  const freshProjects = listProjects();

  console.log(`\n📋 PIV Projects (${freshProjects.length} registered)\n`);
  console.log("  Name                 Status       Phase    Version    Heartbeat");
  console.log("  " + "─".repeat(75));

  for (const p of freshProjects) {
    const name = p.name.padEnd(20);
    const status = formatStatus(p.status).padEnd(16);
    const phase = (p.currentPhase !== null ? `Phase ${p.currentPhase}` : "—").padEnd(8);
    const version = p.pivCommandsVersion.padEnd(10);
    const heartbeat = p.heartbeat ? new Date(p.heartbeat).toLocaleTimeString() : "—";
    console.log(`  ${name} ${status} ${phase} ${version} ${heartbeat}`);
  }

  console.log(`\n  Registry: ${getRegistryPath()}`);
}

// --- Main ---

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help") {
  printUsage();
} else if (command === "init") {
  handleInit(args.slice(1));
} else if (command === "status" || command === "list") {
  handleStatus();
} else {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}
