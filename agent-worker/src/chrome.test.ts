import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Controllable mock state
// ---------------------------------------------------------------------------

let shouldSpawnFail = false;
const mockKill = vi.fn();
let latestChildProc: (EventEmitter & { kill: typeof mockKill; stderr: EventEmitter; stdout: EventEmitter; pid: number }) | null = null;

// CDP auto-response config — controls what http.get returns
let cdpAutoResponse: unknown | null = { Browser: "Chrome/test" };
// Track CDP calls for assertions
let cdpCallUrls: string[] = [];

// ---------------------------------------------------------------------------
// Mocks — http.get auto-responds synchronously based on cdpAutoResponse
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  spawn: vi.fn((..._args: unknown[]) => {
    if (shouldSpawnFail) throw new Error("spawn failed");

    const proc = new EventEmitter() as EventEmitter & {
      kill: typeof mockKill;
      stderr: EventEmitter;
      stdout: EventEmitter;
      pid: number;
      unref: () => void;
    };
    proc.stderr = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.kill = mockKill;
    proc.pid = 12345;
    proc.unref = vi.fn();
    latestChildProc = proc;
    return proc;
  }),
  execSync: vi.fn(),
}));

// Mock fs for Xvfb lock file checks
let mockExistsSync = false;
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => mockExistsSync),
  },
}));

vi.mock("node:http", () => ({
  default: {
    get: vi.fn((url: string, _opts: unknown, callback: (res: EventEmitter) => void) => {
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = vi.fn();

      cdpCallUrls.push(url);

      // Auto-respond on next microtask
      queueMicrotask(() => {
        if (cdpAutoResponse !== null) {
          const res = new EventEmitter();
          callback(res);
          res.emit("data", Buffer.from(JSON.stringify(cdpAutoResponse)));
          res.emit("end");
        } else {
          // Simulate connection refused
          req.emit("error", new Error("ECONNREFUSED"));
        }
      });

      return req;
    }),
  },
}));

import { ensureChromeRunning, cleanupTabs, killChrome, chromeMcpArgs, ensureXvfb, _resetForTesting } from "./chrome.js";
import { spawn } from "node:child_process";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chrome lifecycle manager", () => {
  beforeEach(() => {
    // Reset mock tracking first
    mockKill.mockReset();
    vi.clearAllMocks();

    // Reset controllable state
    shouldSpawnFail = false;
    latestChildProc = null;
    cdpAutoResponse = { Browser: "Chrome/test" };
    cdpCallUrls = [];
    mockExistsSync = true; // Default: pretend Xvfb lock exists (skip Xvfb startup)

    // Reset all singleton state (chrome process + xvfb flag)
    _resetForTesting();
    mockKill.mockReset();
    cdpCallUrls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureChromeRunning", () => {
    it("spawns chromium with correct flags and returns true when CDP responds", async () => {
      const result = await ensureChromeRunning();

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          "--headless=new",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--remote-debugging-port=9222",
          "--remote-debugging-address=127.0.0.1",
          "about:blank",
        ]),
        expect.objectContaining({
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    });

    it("returns true immediately on second call when Chrome is healthy", async () => {
      // First call starts Chrome
      expect(await ensureChromeRunning()).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);

      // Second call health-checks via CDP — no re-spawn
      expect(await ensureChromeRunning()).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);

      // Should have made /json/version health check calls
      expect(cdpCallUrls.some((u) => u.includes("/json/version"))).toBe(true);
    });

    it("re-launches Chrome when process exited", async () => {
      expect(await ensureChromeRunning()).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);

      // Simulate Chrome crashing — exit handler resets state
      latestChildProc!.emit("exit", 1, null);

      // Next call should re-spawn
      expect(await ensureChromeRunning()).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it("returns false when spawn throws", async () => {
      shouldSpawnFail = true;
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await ensureChromeRunning();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[chrome] failed to start:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it("returns false when CDP never becomes ready", async () => {
      // Make CDP never respond (connection refused)
      cdpAutoResponse = null;
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await ensureChromeRunning();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[chrome] failed to start:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    }, 15_000);

    it("re-launches when health check fails on existing process", async () => {
      // Start Chrome normally
      expect(await ensureChromeRunning()).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);

      // Simulate Chrome crashing via exit handler
      latestChildProc!.emit("exit", 1, null);

      // Next ensureChromeRunning should detect the dead process and re-launch
      expect(await ensureChromeRunning()).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanupTabs", () => {
    it("closes non-blank tabs via CDP HTTP API", async () => {
      // Set up auto-response to return tab list, then "closing" for close calls
      const tabs = [
        { id: "tab1", url: "https://example.com" },
        { id: "tab2", url: "about:blank" },
        { id: "tab3", url: "https://google.com" },
      ];
      cdpAutoResponse = tabs;

      await cleanupTabs();

      // Should have called /json/list and then /json/close for non-blank tabs
      expect(cdpCallUrls.some((u) => u.includes("/json/list"))).toBe(true);
      expect(cdpCallUrls.some((u) => u.includes("/json/close/tab1"))).toBe(true);
      expect(cdpCallUrls.some((u) => u.includes("/json/close/tab3"))).toBe(true);
      // Should NOT have closed about:blank
      expect(cdpCallUrls.every((u) => !u.includes("/json/close/tab2"))).toBe(true);
    });

    it("skips about:blank tabs", async () => {
      cdpAutoResponse = [{ id: "tab1", url: "about:blank" }];

      await cleanupTabs();

      const closeCalls = cdpCallUrls.filter((u) => u.includes("/json/close"));
      expect(closeCalls.length).toBe(0);
    });

    it("handles empty tab list", async () => {
      cdpAutoResponse = [];
      await cleanupTabs(); // Should not throw
    });

    it("handles CDP returning null (invalid JSON)", async () => {
      cdpAutoResponse = null; // Will cause error/null response
      await cleanupTabs(); // Should not throw
    });
  });

  describe("chromeMcpArgs", () => {
    it("returns args with executable-path pointing to CHROME_PATH", () => {
      const args = chromeMcpArgs();

      expect(args).toContain("--executable-path");
      // The next element after --executable-path should be the Chrome path
      const idx = args.indexOf("--executable-path");
      expect(args[idx + 1]).toBe(process.env.CHROME_PATH || "/usr/bin/chromium");
    });

    it("includes --headless flag", () => {
      const args = chromeMcpArgs();
      expect(args).toContain("--headless");
    });

    it("includes --no-sandbox as a chrome-arg", () => {
      const args = chromeMcpArgs();
      expect(args).toContain("--chrome-arg=--no-sandbox");
    });

    it("disables usage statistics", () => {
      const args = chromeMcpArgs();
      expect(args).toContain("--no-usage-statistics");
    });
  });

  describe("ensureXvfb", () => {
    it("skips startup when lock file already exists", () => {
      mockExistsSync = true;
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      ensureXvfb();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("already running"),
      );
      // spawn should NOT have been called for Xvfb
      expect(spawn).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it("starts Xvfb when lock file does not exist", () => {
      // First call: lock doesn't exist; after execSync (sleep), it does
      let callCount = 0;
      vi.mocked(fs.existsSync).mockImplementation(() => {
        callCount++;
        return callCount > 1; // First call false, subsequent true
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      ensureXvfb();

      // Should have called spawn for Xvfb
      expect(spawn).toHaveBeenCalledWith(
        "Xvfb",
        expect.arrayContaining(["-screen", "0", "1280x800x24"]),
        expect.objectContaining({ detached: true }),
      );
      logSpy.mockRestore();
    });
  });

  describe("killChrome", () => {
    it("kills the chrome process when running", async () => {
      await ensureChromeRunning();
      mockKill.mockReset();

      killChrome();
      expect(mockKill).toHaveBeenCalledWith("SIGKILL");
    });

    it("is a no-op when no Chrome process exists", () => {
      // No Chrome was started — killChrome should not call kill
      killChrome();
      expect(mockKill).not.toHaveBeenCalled();
    });

    it("allows re-launch after kill", async () => {
      await ensureChromeRunning();
      expect(spawn).toHaveBeenCalledTimes(1);

      killChrome();

      await ensureChromeRunning();
      expect(spawn).toHaveBeenCalledTimes(2);
    });
  });
});
