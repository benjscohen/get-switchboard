import { query } from "@anthropic-ai/claude-code";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrepareWorkspaceOptions {
  /** The user's original prompt (plan prefix already stripped) */
  prompt: string;
  /** Working directory for the agent */
  cwd: string;
  /** Model to use for the prep agent */
  model: string;
  /** Switchboard MCP server URL */
  mcpServerUrl: string;
  /** User's agent key for MCP auth */
  agentKey: string;
  /** Timeout in ms (default: 2 minutes) */
  timeoutMs?: number;
}

export interface PrepareWorkspaceResult {
  success: boolean;
  /** Brief description of what was set up */
  summary?: string;
  /** Error message if failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// System prompt for the workspace prep agent
// ---------------------------------------------------------------------------

const PREP_SYSTEM_PROMPT = `You are a workspace preparation assistant. Your ONLY job is to set up the local workspace so that a planning agent can read the codebase.

RULES:
1. Analyze the user's prompt to identify any repositories, codebases, or projects they want to work with.
2. If the prompt mentions a GitHub repo (URL, org/repo format, or "clone X"):
   - Use the vault (vault_search_secrets, vault_get_secret) to find a GitHub PAT if the repo might be private
   - Clone the repo into the current working directory using git clone
   - If credentials are needed, use: git clone https://<PAT>@github.com/org/repo.git
3. If the prompt mentions installing dependencies, do a quick install (npm install, pip install, etc.)
4. Do NOT start planning or analyzing the code — that's not your job.
5. Do NOT write any files other than what git clone or package managers produce.
6. Do NOT modify any existing files.
7. Be fast — spend no more than 60 seconds total.
8. When done, respond with a brief summary of what you set up (e.g., "Cloned org/repo into ./repo-name").
9. If the prompt doesn't reference any repos or codebases to clone, just respond "No workspace setup needed."

IMPORTANT: You have Bash access. Use it to clone repos and install dependencies. You also have MCP tools for vault access.`;

// ---------------------------------------------------------------------------
// Prepare workspace for plan mode
// ---------------------------------------------------------------------------

export async function prepareWorkspaceForPlan(
  opts: PrepareWorkspaceOptions,
): Promise<PrepareWorkspaceResult> {
  const { prompt, cwd, model, mcpServerUrl, agentKey, timeoutMs = 120_000 } = opts;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    logger.info({ cwd, promptLen: prompt.length }, "[plan-prep] Running workspace prep agent");

    const conversation = query({
      prompt: `The user wants to plan the following task. Set up the workspace (clone repos, install deps) so a read-only planning agent can analyze the codebase.\n\nUser's task:\n${prompt}`,
      options: {
        model,
        customSystemPrompt: PREP_SYSTEM_PROMPT,
        cwd,
        permissionMode: "bypassPermissions" as const,
        mcpServers: {
          switchboard: {
            type: "http" as const,
            url: mcpServerUrl,
            headers: {
              Authorization: `Bearer ${agentKey}`,
            },
          },
        },
        abortController,
        maxTurns: 15,
        stderr: (data: string) => {
          const redacted = data
            .replace(/Bearer [^\s"']+/g, "Bearer [REDACTED]")
            .replace(/ghp_[^\s"']+/g, "ghp_[REDACTED]")
            .replace(/github_pat_[^\s"']+/g, "github_pat_[REDACTED]");
          logger.debug({ stderr: redacted }, "[plan-prep stderr]");
        },
      },
    });

    let resultText: string | null = null;

    for await (const message of conversation) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          resultText = message.result;
          logger.info(
            { resultLen: resultText?.length ?? 0, turns: message.num_turns, cost: message.total_cost_usd },
            "[plan-prep] Completed",
          );
        } else {
          const errorDetail =
            "error" in message && message.error ? String(message.error) : "unknown";
          logger.warn({ subtype: message.subtype, error: errorDetail }, "[plan-prep] Non-success result");
          return {
            success: false,
            error: `Workspace prep failed: ${errorDetail}`,
          };
        }
      }
    }

    return {
      success: true,
      summary: resultText || "Workspace preparation completed",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[plan-prep] Failed");
    return {
      success: false,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
