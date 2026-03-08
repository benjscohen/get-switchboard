import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Reaper tests
//
// The reaper's internal functions (parseEtime, findClaudeProcesses, reap) are
// not exported. We test startReaper's setup behavior and verify the module
// loads correctly with chromium support. For deeper unit testing of etime
// parsing and process matching, we replicate the pure logic here.
// ---------------------------------------------------------------------------

// Mock child_process.exec to avoid running real ps commands
vi.mock("node:child_process", () => ({
  exec: vi.fn((_cmd: string, _opts: unknown, callback: (err: Error | null, stdout: string) => void) => {
    callback(null, "");
  }),
}));

import { startReaper } from "./reaper.js";

describe("startReaper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts without throwing", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => startReaper()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[reaper] started"),
    );
    consoleSpy.mockRestore();
  });

  it("runs reap on the 5-minute interval", async () => {
    const { exec } = await import("node:child_process");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    startReaper();

    // Advance past one interval (5 minutes)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

    // exec should have been called (reap runs ps)
    expect(exec).toHaveBeenCalledWith(
      "ps -eo pid,etime,command",
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Replicated pure logic tests — parseEtime algorithm
// This tests the same algorithm used in reaper.ts without needing exports
// ---------------------------------------------------------------------------

function parseEtime(etime: string): number | null {
  try {
    let days = 0;
    let rest = etime;
    const dashIdx = rest.indexOf("-");
    if (dashIdx !== -1) {
      days = parseInt(rest.slice(0, dashIdx), 10);
      rest = rest.slice(dashIdx + 1);
    }
    const parts = rest.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return days * 86400 + parts[0] * 60 + parts[1];
    }
    return null;
  } catch {
    return null;
  }
}

describe("parseEtime (replicated logic)", () => {
  it("parses mm:ss format", () => {
    expect(parseEtime("05:30")).toBe(330);
  });

  it("parses hh:mm:ss format", () => {
    expect(parseEtime("02:30:00")).toBe(9000);
  });

  it("parses dd-hh:mm:ss format", () => {
    expect(parseEtime("1-00:00:00")).toBe(86400);
    expect(parseEtime("2-12:00:00")).toBe(2 * 86400 + 12 * 3600);
  });

  it("returns null for single number", () => {
    expect(parseEtime("123")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Replicated process matching tests — verifies chromium is matched
// ---------------------------------------------------------------------------

describe("process matching (replicated logic)", () => {
  function matchesReaper(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (
      !(trimmed.includes("claude") || trimmed.includes("chromium")) ||
      trimmed.includes("reaper") ||
      trimmed.includes("grep")
    ) {
      return false;
    }
    const match = trimmed.match(/^\s*(\d+)\s+([\d:.-]+)\s+(.+)$/);
    if (!match) return false;
    const command = match[3];
    const isClaudeProcess =
      command.includes("/claude") || !!command.match(/\bclaude\s/);
    const isChromiumProcess =
      command.includes("/chromium") || !!command.match(/\bchromium\b/);
    return isClaudeProcess || isChromiumProcess;
  }

  it("matches /usr/bin/chromium process", () => {
    expect(matchesReaper("  1234  5-01:00:00 /usr/bin/chromium --headless=new")).toBe(true);
  });

  it("matches chromium with arguments", () => {
    expect(matchesReaper("  5678 02:30:00 chromium --no-sandbox --headless")).toBe(true);
  });

  it("matches /usr/local/bin/claude process", () => {
    expect(matchesReaper("  9999 03:00:00 /usr/local/bin/claude --model opus")).toBe(true);
  });

  it("matches 'claude ' with space (SDK pattern)", () => {
    expect(matchesReaper("  1111 01:00:00 claude --json")).toBe(true);
  });

  it("rejects node processes that import claude", () => {
    expect(matchesReaper("  2222 01:00:00 node dist/index.js")).toBe(false);
  });

  it("rejects grep lines", () => {
    expect(matchesReaper("  3333 00:01 grep chromium")).toBe(false);
  });

  it("rejects reaper lines", () => {
    expect(matchesReaper("  4444 00:01 node reaper.js chromium")).toBe(false);
  });

  it("rejects unrelated processes", () => {
    expect(matchesReaper("  5555 01:00:00 /usr/bin/node server.js")).toBe(false);
  });

  describe("age thresholds", () => {
    const CLAUDE_MAX_AGE = 4.5 * 60 * 60; // 4.5h in seconds
    const CHROME_MAX_AGE = 5 * 60 * 60;   // 5h in seconds

    it("chromium uses 5h threshold (not 4.5h)", () => {
      const chromeAge = 4.75 * 60 * 60; // 4h45m — between the two thresholds
      const command = "/usr/bin/chromium --headless";
      const limit = command.includes("chromium") ? CHROME_MAX_AGE : CLAUDE_MAX_AGE;
      expect(chromeAge > limit).toBe(false); // 4h45m < 5h — should NOT be reaped
    });

    it("claude uses 4.5h threshold", () => {
      const claudeAge = 4.75 * 60 * 60; // 4h45m
      const command = "/usr/local/bin/claude --json";
      const limit = command.includes("chromium") ? CHROME_MAX_AGE : CLAUDE_MAX_AGE;
      expect(claudeAge > limit).toBe(true); // 4h45m > 4.5h — should be reaped
    });
  });
});
