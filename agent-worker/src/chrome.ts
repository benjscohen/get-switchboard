// ---------------------------------------------------------------------------
// Chrome Lifecycle Manager
//
// Singleton headless Chromium instance shared across all agent sessions.
// Each session gets its own tabs; cleanup closes tabs between sessions.
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";

const CDP_PORT = 9222;
const CDP_HOST = "127.0.0.1";
const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/chromium";
const STARTUP_TIMEOUT_MS = 10_000;

let chromeProcess: ChildProcess | null = null;
let chromeReady = false;

/**
 * Start Chromium if not already running. Resolves when CDP is accepting
 * connections. Non-fatal — logs errors but does not throw.
 */
export async function ensureChromeRunning(): Promise<boolean> {
  if (chromeProcess && chromeReady) {
    // Quick health check
    if (await isCdpAlive()) return true;
    // Process died silently — reset and re-launch
    chromeProcess = null;
    chromeReady = false;
  }

  try {
    console.log("[chrome] starting headless Chromium…");

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
      if (msg) console.error("[chrome stderr]", msg);
    });

    chromeProcess.on("exit", (code, signal) => {
      console.log(`[chrome] exited code=${code} signal=${signal}`);
      chromeProcess = null;
      chromeReady = false;
    });

    // Wait for CDP to be reachable
    await waitForCdp();
    chromeReady = true;
    console.log("[chrome] ready on port", CDP_PORT);
    return true;
  } catch (err) {
    console.error("[chrome] failed to start:", err);
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
    console.log(`[chrome] cleaned up ${tabs.length} tab(s)`);
  } catch (err) {
    console.error("[chrome] tab cleanup failed:", err);
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
    console.log("[chrome] killed");
  }
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
