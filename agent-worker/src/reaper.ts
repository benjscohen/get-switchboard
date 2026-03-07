// ---------------------------------------------------------------------------
// Stale Process Reaper
//
// Runs every 5 minutes, looking for orphaned `claude` CLI processes that have
// outlived their sessions (>4.5 hours). Catches cases where the 4-hour timeout
// never fired due to crash, deploy, etc.
// ---------------------------------------------------------------------------

import { exec } from "node:child_process";

const REAPER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REAPER_MAX_AGE_MS = 4.5 * 60 * 60 * 1000; // 4.5 hours

interface ProcessInfo {
  pid: number;
  etime: number; // elapsed time in seconds
  command: string;
}

/**
 * Parse `ps` output to find claude CLI processes and their elapsed time.
 */
function findClaudeProcesses(): Promise<ProcessInfo[]> {
  return new Promise((resolve) => {
    // etime format: [[dd-]hh:]mm:ss
    exec("ps -eo pid,etime,command", { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }

      const results: ProcessInfo[] = [];
      for (const line of stdout.split("\n").slice(1)) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match lines containing "claude" binary (the SDK spawns this)
        // Avoid matching this reaper process itself or grep
        if (
          !trimmed.includes("claude") ||
          trimmed.includes("reaper") ||
          trimmed.includes("grep")
        ) {
          continue;
        }

        // Only match the actual claude CLI process
        const match = trimmed.match(
          /^\s*(\d+)\s+([\d:.-]+)\s+(.+)$/,
        );
        if (!match) continue;

        const pid = parseInt(match[1], 10);
        const etimeStr = match[2];
        const command = match[3];

        // Only target claude CLI processes (not node processes that import claude)
        if (
          !command.includes("/claude") &&
          !command.match(/\bclaude\s/)
        ) {
          continue;
        }

        // Skip our own PID
        if (pid === process.pid) continue;

        const etime = parseEtime(etimeStr);
        if (etime !== null) {
          results.push({ pid, etime, command });
        }
      }

      resolve(results);
    });
  });
}

/**
 * Parse ps etime format: [[dd-]hh:]mm:ss → seconds
 */
function parseEtime(etime: string): number | null {
  try {
    let days = 0;
    let rest = etime;

    // Handle dd- prefix
    const dashIdx = rest.indexOf("-");
    if (dashIdx !== -1) {
      days = parseInt(rest.slice(0, dashIdx), 10);
      rest = rest.slice(dashIdx + 1);
    }

    const parts = rest.split(":").map((p) => parseInt(p, 10));

    if (parts.length === 3) {
      // hh:mm:ss
      return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      // mm:ss
      return days * 86400 + parts[0] * 60 + parts[1];
    }
    return null;
  } catch {
    return null;
  }
}

async function reap(): Promise<void> {
  try {
    const processes = await findClaudeProcesses();
    const maxAgeSec = REAPER_MAX_AGE_MS / 1000;

    for (const proc of processes) {
      if (proc.etime > maxAgeSec) {
        const ageMin = Math.round(proc.etime / 60);
        console.log(
          `[reaper] killing orphan PID=${proc.pid} age=${ageMin}min cmd=${proc.command.slice(0, 80)}`,
        );
        try {
          process.kill(proc.pid, "SIGTERM");
        } catch (killErr) {
          console.error(`[reaper] failed to kill PID=${proc.pid}:`, killErr);
        }
      }
    }
  } catch (err) {
    console.error("[reaper] error:", err);
  }
}

export function startReaper(): void {
  console.log(
    `[reaper] started — checking every ${REAPER_INTERVAL_MS / 60000}min for processes older than ${REAPER_MAX_AGE_MS / 3600000}h`,
  );
  setInterval(() => { reap().catch((err) => console.error("[reaper] error:", err)); }, REAPER_INTERVAL_MS);
}
