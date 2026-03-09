import { query } from "@anthropic-ai/claude-code";
import { fetchUserFiles, writeFilesToStableDir } from "./files.js";
import { extractClaudeMd, buildSystemPrompt, type UserIdentity } from "./prompt.js";
import { ensureChromeRunning, cleanupTabs, chromeMcpArgs } from "./chrome.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Headless agent execution (no Slack, no multi-turn — single prompt in/out)
// ---------------------------------------------------------------------------

export interface HeadlessRunOptions {
  prompt: string;
  model: string;
  agentKey: string;
  userId: string;
  systemPromptOverride?: string;
  timeoutMs?: number;
  userIdentity?: UserIdentity;
}

export interface HeadlessRunResult {
  text: string;
  turns: number;
  cost: number;
  claudeSessionId: string | null;
  status: "completed" | "failed" | "timeout";
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function runAgentHeadless(opts: HeadlessRunOptions): Promise<HeadlessRunResult> {
  const { prompt, model, agentKey, userId, systemPromptOverride, timeoutMs = DEFAULT_TIMEOUT_MS, userIdentity } = opts;

  let tempDir: string | null = null;

  try {
    // 1. Pull user files for local context
    let claudeMdContent: string | null = null;
    try {
      const userFiles = await fetchUserFiles(agentKey);
      if (userFiles) {
        tempDir = await writeFilesToStableDir(userFiles, userId);
        claudeMdContent = extractClaudeMd(userFiles);
      }
    } catch (err) {
      logger.error({ err }, "[headless] Failed to pull user files");
    }

    // 2. Build system prompt
    let systemPrompt = buildSystemPrompt(claudeMdContent, undefined, userIdentity);
    if (systemPromptOverride) {
      systemPrompt = `${systemPromptOverride}\n\n${systemPrompt}`;
    }

    // 2b. Ensure headless Chrome is running for browser tools
    if (process.env.ENABLE_CHROME_MCP !== "false") {
      try {
        await ensureChromeRunning();
      } catch (err) {
        logger.error({ err }, "[headless] Chrome startup failed (non-fatal)");
      }
    }

    // 3. Set up timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    // 4. Run query (single prompt, not multi-turn)
    let claudeSessionId: string | null = null;
    let resultText = "";
    let totalTurns = 0;
    let totalCost = 0;
    let lastAssistantText = "";

    try {
      const conversation = query({
        prompt,
        options: {
          model,
          customSystemPrompt: systemPrompt,
          ...(tempDir ? { cwd: tempDir } : {}),
          permissionMode: "bypassPermissions" as const,
          mcpServers: {
            switchboard: {
              type: "http" as const,
              url: process.env.SWITCHBOARD_MCP_URL!.trim(),
              headers: {
                Authorization: `Bearer ${agentKey}`,
              },
            },
            ...(process.env.ENABLE_CHROME_MCP !== "false" ? {
              "chrome-devtools": {
                type: "stdio" as const,
                command: "chrome-devtools-mcp",
                args: chromeMcpArgs(),
              },
            } : {}),
          },
          abortController,
          stderr: (data: string) => {
            const redacted = data
              .replace(/Bearer [^\s"']+/g, "Bearer [REDACTED]")
              .replace(/sk_live_[^\s"']+/g, "sk_live_[REDACTED]");
            logger.error({ stderr: redacted }, "[headless stderr]");
          },
        },
      });

      for await (const message of conversation) {
        if ("session_id" in message && message.session_id && !claudeSessionId) {
          claudeSessionId = message.session_id;
        }

        if (message.type === "assistant") {
          const msg = message as {
            message?: { content?: Array<{ type: string; text?: string }> };
          };
          const blocks = msg.message?.content || [];
          const textContent = blocks
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text!)
            .join("");
          if (textContent) lastAssistantText = textContent;
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            resultText = message.result || lastAssistantText || "(No response generated)";
            totalTurns += message.num_turns;
            totalCost += message.total_cost_usd;
          } else {
            clearTimeout(timeoutId);
            return {
              text: "",
              turns: 0,
              cost: 0,
              claudeSessionId,
              status: "failed",
              error: (message as { error?: string }).error || `Agent error: ${message.subtype}`,
            };
          }
        }
      }

      clearTimeout(timeoutId);

      return {
        text: resultText,
        turns: totalTurns,
        cost: totalCost,
        claudeSessionId,
        status: "completed",
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (abortController.signal.aborted) {
        return {
          text: "",
          turns: totalTurns,
          cost: totalCost,
          claudeSessionId,
          status: "timeout",
          error: "Execution timed out",
        };
      }

      return {
        text: "",
        turns: totalTurns,
        cost: totalCost,
        claudeSessionId,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  } catch (err) {
    return {
      text: "",
      turns: 0,
      cost: 0,
      claudeSessionId: null,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    // Clean up Chrome tabs opened during this session
    if (process.env.ENABLE_CHROME_MCP !== "false") {
      cleanupTabs().catch((err) => {
        logger.error({ err }, "[headless] Chrome tab cleanup failed");
      });
    }
  }
}
