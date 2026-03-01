// PIV Orchestrator — Mission Controller
//
// Top-level coordinator for DAG-based parallel agent execution.
// Reads architecture.md, builds dependency DAG, spawns specialist agents,
// and resolves dependencies as work completes. Falls back to sequential
// runner for classic (non-monorepo) projects.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readManifest, writeManifest, mergeManifest } from "./manifest-manager.js";
import { getWorkUnits } from "./monorepo-resolver.js";
import { MissionEventBus } from "./event-bus.js";
import { loadAgents, getAgentForEvent } from "./agent-loader.js";
import { parseDependencyGraph, buildDAG } from "./mission-planner.js";
import { createResolver, DependencyResolver } from "./dependency-resolver.js";
import { createResourceManager, ResourceManager } from "./resource-manager.js";
import { spawnAgent, assembleContext } from "./agent-spawner.js";
import { getMissionConfig } from "./config.js";
import { writeHeartbeat } from "./heartbeat.js";
import { basename } from "node:path";
import type { TelegramNotifier } from "./telegram-notifier.js";
import type {
  AgentYamlConfig,
  AgentSession,
  DAGNode,
  DependencyEdge,
  LifecycleEvent,
  MissionPlan,
  WorkUnit,
} from "./types.js";

const MAX_AGENT_RETRIES = 2;
const HEARTBEAT_INTERVAL_MS = 2 * 60_000;
const RESCAN_INTERVAL_MS = 60_000;

interface ActiveWork {
  node: DAGNode;
  agentConfig: AgentYamlConfig;
  workUnit: WorkUnit;
  promise: Promise<AgentSession>;
  sessionId: string;
}

/**
 * Re-read the manifest to detect newly added modules/slices and merge
 * them into the live DAG. Returns the number of nodes added.
 */
async function rescanForNewWork(
  projectDir: string,
  resolver: DependencyResolver,
  knownUnitKeys: Set<string>,
  workUnitMap: Map<string, WorkUnit>,
  architecturePath: string
): Promise<number> {
  const freshManifest = await readManifest(projectDir);
  const freshUnits = getWorkUnits(freshManifest);

  // Find new incomplete units not already tracked
  const newUnits = freshUnits.filter((wu) => {
    const key = `${wu.module}/${wu.slice}`;
    if (knownUnitKeys.has(key)) return false;
    return (
      wu.sliceStatus.plan !== "complete" ||
      wu.sliceStatus.execution !== "complete" ||
      wu.sliceStatus.validation !== "pass"
    );
  });

  if (newUnits.length === 0) return 0;

  // Re-read architecture.md for updated edges
  let freshEdges: DependencyEdge[] = [];
  if (existsSync(architecturePath)) {
    const content = readFileSync(architecturePath, "utf-8");
    freshEdges = parseDependencyGraph(content);
  }

  // Build DAGNode stubs for new units
  const newNodes: DAGNode[] = newUnits.map((wu) => ({
    module: wu.module,
    slice: wu.slice,
    dependencies: [],
    dependents: [],
    status: "ready" as const,
    assignedAgent: undefined,
  }));

  // Filter edges to only those involving at least one new node
  const newKeys = new Set(newUnits.map((wu) => `${wu.module}/${wu.slice}`));
  const relevantEdges = freshEdges.filter((e) => {
    const fromKey = `${e.from.module}/${e.from.slice}`;
    const toKey = `${e.to.module}/${e.to.slice}`;
    return newKeys.has(fromKey) || newKeys.has(toKey);
  });

  const addedKeys = resolver.mergeNewWork(newNodes, relevantEdges);

  // Track the new units
  for (const wu of newUnits) {
    const key = `${wu.module}/${wu.slice}`;
    if (addedKeys.includes(key)) {
      knownUnitKeys.add(key);
      workUnitMap.set(key, wu);
    }
  }

  return addedKeys.length;
}

/**
 * Run the Mission Controller for a monorepo project.
 * Reads DAG from architecture.md, spawns specialist agents in parallel,
 * and resolves dependencies as work completes.
 */
export async function runMission(
  projectDir: string,
  notifier?: TelegramNotifier,
  pauseCheck?: () => Promise<void>
): Promise<void> {
  console.log("\n🎯 Mission Controller — Starting\n");

  // --- Step 1: Load manifest and agents ---
  const manifest = await readManifest(projectDir);
  const missionConfig = getMissionConfig(manifest);
  const agentsDir = join(projectDir, ".claude", "agents");
  const agents = loadAgents(agentsDir);

  if (agents.length === 0) {
    console.log("  ⚠️ No agent YAML files found — cannot run mission");
    return;
  }

  // --- Step 2: Read architecture.md and parse DAG ---
  const architecturePath = join(projectDir, "context", "architecture.md");
  let edges = [] as ReturnType<typeof parseDependencyGraph>;

  if (existsSync(architecturePath)) {
    const architectureContent = readFileSync(architecturePath, "utf-8");
    edges = parseDependencyGraph(architectureContent);
    console.log(`  📊 Parsed ${edges.length} dependency edge(s) from architecture.md`);
  } else {
    console.log("  ℹ️ No architecture.md found — treating all slices as independent");
  }

  // --- Step 3: Build DAG from work units ---
  const workUnits = getWorkUnits(manifest);
  const workUnitMap = new Map<string, WorkUnit>();
  for (const wu of workUnits) {
    if (
      wu.sliceStatus.plan !== "complete" ||
      wu.sliceStatus.execution !== "complete" ||
      wu.sliceStatus.validation !== "pass"
    ) {
      workUnitMap.set(`${wu.module}/${wu.slice}`, wu);
    }
  }

  if (workUnitMap.size === 0) {
    console.log("  ✅ All slices complete — nothing to do");
    return;
  }

  const knownUnitKeys = new Set(workUnitMap.keys());

  let plan: MissionPlan;
  try {
    plan = buildDAG(edges, Array.from(workUnitMap.values()));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ DAG construction failed: ${msg}`);
    return;
  }

  console.log(`  📋 Mission plan: ${plan.totalSlices} slices, max parallelism: ${plan.maxParallelism}`);

  // --- Step 4: Initialize components ---
  const eventBus = new MissionEventBus();
  const resolver = createResolver(plan);
  const resourceManager = createResourceManager(
    missionConfig.maxConcurrentAgents,
    missionConfig.missionBudgetUsd
  );

  console.log(`  ⚙️ Concurrency limit: ${missionConfig.maxConcurrentAgents}, Budget: $${missionConfig.missionBudgetUsd}`);

  // Read architecture excerpt for context assembly
  const architectureExcerpt = existsSync(architecturePath)
    ? readFileSync(architecturePath, "utf-8").slice(0, 3000)
    : undefined;

  // Profile paths from manifest
  let profilePaths = Object.values(manifest.profiles ?? {}).map((p) => p.path);

  // Heartbeat setup
  const projectName = basename(projectDir);
  const heartbeatTimer = setInterval(() => {
    try {
      writeHeartbeat(projectDir, projectName, null, "running");
    } catch { /* best effort */ }
  }, HEARTBEAT_INTERVAL_MS);

  await notifier?.sendText(`🎯 <b>Mission Controller</b> — ${plan.totalSlices} slices, max ${plan.maxParallelism} parallel`);

  // --- Step 5: Main loop ---
  const activeWork = new Map<string, ActiveWork>();
  let lastRescanAt = Date.now();

  try {
    while (!resolver.isComplete()) {
      // Respect pause/resume signals
      if (pauseCheck) await pauseCheck();

      // --- Periodic rescan for new work ---
      if (Date.now() - lastRescanAt >= RESCAN_INTERVAL_MS) {
        try {
          const added = await rescanForNewWork(
            projectDir,
            resolver,
            knownUnitKeys,
            workUnitMap,
            architecturePath
          );
          if (added > 0) {
            // Refresh profile paths in case manifest changed
            const freshManifest = await readManifest(projectDir);
            profilePaths = Object.values(freshManifest.profiles ?? {}).map((p) => p.path);

            console.log(`  🔍 Rescan: discovered ${added} new work unit(s)`);
            await notifier?.sendText(`🔍 Mid-build rescan: added ${added} new work unit(s)`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  ⚠️ Rescan error (non-fatal): ${msg}`);
        }
        lastRescanAt = Date.now();
      }

      // Check budget
      if (resourceManager.isBudgetExceeded()) {
        console.log(`  ⚠️ Budget exceeded ($${resourceManager.getState().totalCostUsd.toFixed(2)}) — pausing mission`);
        await notifier?.sendText("⚠️ Mission budget exceeded — pausing");
        break;
      }

      // Spawn agents for ready nodes
      const readyNodes = resolver.getUnblockedNodes().filter(
        (n) => n.status === "ready"
      );

      for (const node of readyNodes) {
        if (!resourceManager.canSpawn()) {
          resourceManager.queueWork(node);
          continue;
        }

        // Find matching agent config (default to executor)
        const agentConfig = getAgentForEvent(agents, "slice_ready")
          ?? agents.find((a) => a.type === "executor")
          ?? agents[0];

        // Find matching work unit
        const workUnit = workUnitMap.get(`${node.module}/${node.slice}`);
        if (!workUnit) continue;

        // Assemble context and spawn
        const context = assembleContext(workUnit, projectDir, architectureExcerpt, profilePaths);
        const promise = spawnAgent(agentConfig, workUnit, projectDir, context);
        const sessionId = `${node.module}/${node.slice}`;

        resolver.markRunning(node.module, node.slice, sessionId);
        resourceManager.registerAgent({
          id: sessionId,
          agentType: agentConfig.type,
          module: node.module,
          slice: node.slice,
          startedAt: Date.now(),
          status: "running",
          costUsd: 0,
          retryCount: 0,
        });

        activeWork.set(sessionId, {
          node,
          agentConfig,
          workUnit,
          promise,
          sessionId,
        });

        eventBus.emit("slice_ready", {
          module: node.module,
          slice: node.slice,
          agentType: agentConfig.type,
          timestamp: Date.now(),
        });
      }

      // Wait for any active agent to complete
      if (activeWork.size === 0) {
        // No work in progress and no ready nodes — check for deadlock
        const stats = resolver.getStats();
        if (stats.blocked > 0 && stats.running === 0 && stats.ready === 0) {
          console.log("  ❌ Deadlock: blocked nodes with no running or ready work");
          break;
        }
        // Nothing to do — brief sleep
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Race all active promises
      const entries = Array.from(activeWork.entries());
      const results = entries.map(([id, work]) =>
        work.promise.then((result) => ({ id, result, work }))
      );

      const completed = await Promise.race(results);
      activeWork.delete(completed.id);

      const { result, work } = completed;
      resourceManager.releaseAgent(completed.id, result.costUsd);

      if (result.status === "complete") {
        // Success — mark complete and emit event
        resolver.markSliceComplete(work.node.module, work.node.slice);
        eventBus.emit("execution_complete", {
          module: work.node.module,
          slice: work.node.slice,
          agentType: work.agentConfig.type,
          details: `cost: $${result.costUsd.toFixed(2)}`,
          timestamp: Date.now(),
        });

        // Check if all slices in the module are now complete
        const moduleSlices = plan.nodes.filter((n) => n.module === work.node.module);
        const allModuleComplete = moduleSlices.every(
          (n) => resolver.getPlan().nodes.find(
            (rn) => rn.module === n.module && rn.slice === n.slice
          )?.status === "complete"
        );
        if (allModuleComplete) {
          eventBus.emit("module_complete", {
            module: work.node.module,
            slice: "",
            timestamp: Date.now(),
          });
        }

        // Dequeue waiting work
        while (resourceManager.canSpawn()) {
          const queued = resourceManager.dequeueWork();
          if (!queued) break;
          // Re-add to ready processing on next loop iteration
          // (the node should now show as ready in the resolver)
        }
      } else {
        // Failure — check retry budget
        if (result.retryCount < MAX_AGENT_RETRIES) {
          console.log(`  🔄 Retrying ${work.node.module}/${work.node.slice} (attempt ${result.retryCount + 1})`);
          const retryContext = assembleContext(work.workUnit, projectDir, architectureExcerpt, profilePaths);
          const retryPromise = spawnAgent(work.agentConfig, work.workUnit, projectDir, retryContext);
          const retrySessionId = `${work.node.module}/${work.node.slice}`;

          resourceManager.registerAgent({
            id: retrySessionId,
            agentType: work.agentConfig.type,
            module: work.node.module,
            slice: work.node.slice,
            startedAt: Date.now(),
            status: "running",
            costUsd: 0,
            retryCount: result.retryCount + 1,
          });

          activeWork.set(retrySessionId, {
            ...work,
            promise: retryPromise,
            sessionId: retrySessionId,
          });

          eventBus.emit("agent_crash", {
            module: work.node.module,
            slice: work.node.slice,
            agentType: work.agentConfig.type,
            details: "Retrying after failure",
            timestamp: Date.now(),
          });
        } else {
          // Max retries exhausted — mark failed and cascade-block
          resolver.markSliceFailed(work.node.module, work.node.slice);
          eventBus.emit("agent_crash", {
            module: work.node.module,
            slice: work.node.slice,
            agentType: work.agentConfig.type,
            details: "Max retries exhausted — slice failed",
            timestamp: Date.now(),
          });

          await notifier?.sendText(
            `❌ <b>${work.node.module}/${work.node.slice}</b> failed after ${MAX_AGENT_RETRIES} retries`
          );
        }
      }
    }
  } finally {
    clearInterval(heartbeatTimer);
  }

  // --- Step 6: Summary ---
  const stats = resolver.getStats();
  const resourceState = resourceManager.getState();

  console.log("\n📊 Mission Complete");
  console.log(`  Total slices: ${stats.total}`);
  console.log(`  Complete: ${stats.complete}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Blocked: ${stats.blocked}`);
  console.log(`  Total cost: $${resourceState.totalCostUsd.toFixed(2)}`);

  // Update manifest
  const updatedManifest = await readManifest(projectDir);
  const merged = mergeManifest(updatedManifest, {
    last_updated: new Date().toISOString(),
  });
  await writeManifest(projectDir, merged);

  await notifier?.sendText(
    `📊 <b>Mission Complete</b>\n` +
    `Slices: ${stats.complete}/${stats.total} complete, ${stats.failed} failed\n` +
    `Cost: $${resourceState.totalCostUsd.toFixed(2)}`
  );
}
