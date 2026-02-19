// PIV Orchestrator — CLI Entry Point

import { loadConfig } from "./config.js";
import { runPhase, runAllPhases } from "./piv-runner.js";
import { readManifest, writeManifest, appendFailure } from "./manifest-manager.js";
import { determineNextAction } from "./state-machine.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface CliArgs {
  projectDir?: string;
  phase?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" && argv[i + 1]) {
      args.projectDir = argv[++i];
    } else if (arg === "--phase" && argv[i + 1]) {
      args.phase = parseInt(argv[++i], 10);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

async function main(): Promise<void> {
  console.log("🤖 PIV Orchestrator v0.1.0\n");

  const cliArgs = parseArgs(process.argv);

  // Load and validate config
  const config = loadConfig();
  const projectDir = cliArgs.projectDir ?? config.projectDir;

  console.log(`📁 Project: ${projectDir}`);
  console.log(`🔑 Auth: ${config.hasOAuthToken ? "OAuth (subscription)" : "API Key (pay-per-token)"}`);
  console.log(`🧠 Model: ${config.model}`);

  // Verify manifest exists
  const manifestPath = join(projectDir, ".agents/manifest.yaml");
  if (!existsSync(manifestPath)) {
    console.error("\n❌ No manifest found at .agents/manifest.yaml");
    console.error("   Run /prime first to create the manifest.");
    process.exit(1);
  }

  const manifest = await readManifest(projectDir);

  // Dry run mode: show recommendation and exit
  if (cliArgs.dryRun) {
    const action = determineNextAction(manifest);
    console.log("\n📋 Dry Run — Recommended Next Action:");
    console.log(`   Command:    ${action.command}`);
    console.log(`   Argument:   ${action.argument ?? "(none)"}`);
    console.log(`   Reason:     ${action.reason}`);
    console.log(`   Confidence: ${action.confidence}`);
    return;
  }

  // Execute
  try {
    if (cliArgs.phase !== undefined) {
      console.log(`\n🎯 Running Phase ${cliArgs.phase} only\n`);
      await runPhase(cliArgs.phase, projectDir);
    } else {
      await runAllPhases(projectDir);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n💥 Uncaught error: ${errorMsg}`);

    // Write failure to manifest
    try {
      const currentManifest = await readManifest(projectDir);
      const updated = appendFailure(currentManifest, {
        command: "orchestrator",
        phase: cliArgs.phase ?? 0,
        error_category: "partial_execution",
        timestamp: new Date().toISOString(),
        retry_count: 0,
        max_retries: 1,
        resolution: "pending",
        details: errorMsg,
      });
      await writeManifest(projectDir, updated);
    } catch {
      console.error("  (Could not write failure to manifest)");
    }

    console.error("\n## PIV-Error");
    console.error(`error_category: partial_execution`);
    console.error(`command: orchestrator`);
    console.error(`phase: ${cliArgs.phase ?? 0}`);
    console.error(`details: "${errorMsg}"`);
    console.error(`retry_eligible: true`);
    console.error(`retries_remaining: 1`);
    console.error(`checkpoint: none`);

    process.exit(1);
  }
}

main();
