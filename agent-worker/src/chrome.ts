// ---------------------------------------------------------------------------
// Chrome Lifecycle Manager
//
// Singleton headless Chromium instance shared across all agent sessions.
// Each session gets its own tabs; cleanup closes tabs between sessions.
// ---------------------------------------------------------------------------

import { spawn, execSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import { logger } from "./logger.js";

const CDP_PORT = 9222;
const CDP_HOST = "127.0.0.1";
const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/chromium";
const STARTUP_TIMEOUT_MS = 10_000;
const XVFB_DISPLAY = process.env.DISPLAY || ":99";

let chromeProcess: ChildProcess | null = null;
let chromeReady = false;
let xvfbStarted = false;

// ---------------------------------------------------------------------------
// Chrome DevTools MCP server args
// ---------------------------------------------------------------------------

/**
 * Build the CLI args for the chrome-devtools-mcp stdio process.
 *
 * Without --executable-path, chrome-devtools-mcp defaults to
 * channel='stable' which resolves to /opt/google/chrome/chrome via
 * Puppeteer — that path doesn't exist in our container (we have
 * Chromium at /usr/bin/chromium). Passing --executable-path explicitly
 * bypasses the channel lookup entirely.
 *
 * We also pass --no-sandbox and --headless as chrome-args because the
 * MCP launches its own browser instance (separate from ensureChromeRunning).
 */
export function chromeMcpArgs(): string[] {
  return [
    "--executable-path", CHROME_PATH,
    "--headless",
    "--chrome-arg=--no-sandbox",
    "--chrome-arg=--disable-dev-shm-usage",
    "--no-usage-statistics",
  ];
}

// ---------------------------------------------------------------------------
// Xvfb virtual display management
// ---------------------------------------------------------------------------

/**
 * Ensure the Xvfb virtual display is running. The entrypoint.sh should
 * start it, but if it didn't (e.g., Railway overrides CMD, container
 * restart, etc.) we start it here as a fallback.
 *
 * This is critical because chrome-devtools-mcp launches a *headed*
 * Chromium by default (headless is opt-in via CLI flag) and even with
 * --headless, some Chromium builds still need a DISPLAY to avoid
 * crashes in shared-memory/GPU paths.
 */
export function ensureXvfb(): void {
  if (xvfbStarted) return;

  // Check if Xvfb is already running on our display
  const lockFile = `/tmp/.X${XVFB_DISPLAY.replace(":", "")}-lock`;
  if (fs.existsSync(lockFile)) {
    console.log(`[chrome] Xvfb already running on ${XVFB_DISPLAY}`);
    xvfbStarted = true;
    return;
  }

  try {
    console.log(`[chrome] starting Xvfb on ${XVFB_DISPLAY}…`);
    const xvfb = spawn("Xvfb", [
      XVFB_DISPLAY,
      "-screen", "0", "1280x800x24",
      "-ac",
      "+extension", "GLX",
      "+render",
      "-noreset",
    ], {
      stdio: "ignore",
      detached: true,
    });
    xvfb.unref();

    // Give Xvfb a moment to create the lock file
    // (synchronous — this runs once at startup)
    execSync("sleep 0.5");

    if (fs.existsSync(lockFile)) {
      console.log(`[chrome] Xvfb ready on ${XVFB_DISPLAY}`);
      process.env.DISPLAY = XVFB_DISPLAY;
      xvfbStarted = true;
    } else {
      console.warn(`[chrome] Xvfb may not have started (no lock file at ${lockFile})`);
    }
  } catch (err) {
    console.error("[chrome] failed to start Xvfb:", err);
  }
}

/**
 * Start Chromium if not already running. Resolves when CDP is accepting
 * connections. Non-fatal — logs errors but does not throw.
 */
export async function ensureChromeRunning(): Promise<boolean> {
  // Xvfb must be up before we launch any browser
  ensureXvfb();
  if (chromeProcess && chromeReady) {
    // Quick health check
    if (await isCdpAlive()) return true;
    // Process died silently — reset and re-launch
    chromeProcess = null;
    chromeReady = false;
  }

  try {
    logger.info("[chrome] starting headless Chromium…");

    chromeProcess = spawn(CHROME_PATH, [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--remote-debugging-port=${CDP_PORT}`,
      `--remote-debugging-address=${CDP_HOST}`,
      // Start with a blank page
      "about:blank",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    chromeProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) logger.error({ msg }, "[chrome stderr]");
    });

    chromeProcess.on("exit", (code, signal) => {
      logger.info({ code, signal }, "[chrome] exited");
      chromeProcess = null;
      chromeReady = false;
    });

    // Wait for CDP to be reachable
    await waitForCdp();
    chromeReady = true;
    logger.info({ port: CDP_PORT }, "[chrome] ready");
    return true;
  } catch (err) {
    logger.error({ err }, "[chrome] failed to start");
    killChrome();
    return false;
  }
}

/**
 * Close all non-about:blank tabs via the CDP HTTP API.
 */
export async function cleanupTabs(): Promise<void> {
  try {
    const tabs = await cdpRequest<Array<{ id: string; url: string }>>("/json/list");
    if (!tabs) return;

    for (const tab of tabs) {
      if (tab.url === "about:blank") continue;
      try {
        await cdpRequest(`/json/close/${tab.id}`);
      } catch {
        // Tab may have already closed
      }
    }
    logger.info({ tabCount: tabs.length }, "[chrome] cleaned up tabs");
  } catch (err) {
    logger.error({ err }, "[chrome] tab cleanup failed");
  }
}

/**
 * Kill the Chrome process immediately.
 */
export function killChrome(): void {
  if (chromeProcess) {
    try {
      chromeProcess.kill("SIGKILL");
    } catch {
      // Already dead
    }
    chromeProcess = null;
    chromeReady = false;
    logger.info("[chrome] killed");
  }
}

/**
 * Reset all singleton state — for tests only.
 */
export function _resetForTesting(): void {
  killChrome();
  xvfbStarted = false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cdpRequest<T = unknown>(path: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://${CDP_HOST}:${CDP_PORT}${path}`, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function isCdpAlive(): Promise<boolean> {
  const result = await cdpRequest("/json/version");
  return result !== null;
}

function waitForCdp(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(async () => {
      if (await isCdpAlive()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > STARTUP_TIMEOUT_MS) {
        clearInterval(interval);
        reject(new Error("Chrome CDP did not become ready in time"));
      }
    }, 200);
  });
}
