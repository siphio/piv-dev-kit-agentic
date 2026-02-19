---
description: Start the PIV orchestrator as a background process
---

# Start PIV Orchestrator

Launch the orchestrator as a detached background Node.js process. It reads the manifest to determine what to do next and runs autonomously.

## Process

### 1. Verify Orchestrator Exists

Check that `.claude/orchestrator/package.json` exists in the project. If not, report that the PIV orchestrator is not installed and exit.

### 2. Install Dependencies (if needed)

If `.claude/orchestrator/node_modules/` does not exist, run:

```bash
cd .claude/orchestrator && npm install
```

### 3. Build TypeScript

Compile the orchestrator to JavaScript:

```bash
cd .claude/orchestrator && npm run build
```

If the build fails, report the error and stop.

### 4. Check for Running Instance

Check if `.agents/orchestrator.pid` exists. If it does:
- Read the PID from the file
- Check if the process is alive: `kill -0 <pid> 2>/dev/null`
- If alive: report "Orchestrator already running (PID: <pid>)" and exit
- If dead: remove the stale PID file and continue

### 5. Resolve Project Directory

Determine the absolute project root directory (where `.claude/` lives). Store as `PROJECT_DIR`.

### 6. Start Orchestrator

Run the orchestrator as a detached background process with output logged:

```bash
cd .claude/orchestrator && PIV_PROJECT_DIR="$PROJECT_DIR" nohup node dist/index.js > "$PROJECT_DIR/.agents/orchestrator.log" 2>&1 &
```

Note: If a `.claude/orchestrator/.env` file exists, source it first to pick up `CLAUDE_CODE_OAUTH_TOKEN` and Telegram credentials.

### 7. Confirm Startup

After spawning:
1. Wait 2 seconds for the process to initialize
2. Read and display the PID from `.agents/orchestrator.pid`
3. Show the first 10 lines of `.agents/orchestrator.log` to confirm startup
4. Report:
   ```
   ✅ Orchestrator started (PID: <pid>)
   📄 Log: .agents/orchestrator.log
   🔒 PID: .agents/orchestrator.pid

   To stop: kill <pid>
   To monitor: tail -f .agents/orchestrator.log
   ```

## Error Handling

- If `CLAUDE_CODE_OAUTH_TOKEN` is not set and no `.env` file provides it, warn the user that the orchestrator needs an OAuth token
- If the build fails, show the TypeScript errors
- If the process fails to start within 5 seconds, show the log tail and report the error
