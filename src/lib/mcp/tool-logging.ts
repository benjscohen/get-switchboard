import { logUsage } from "@/lib/usage-log";
import { getToolRisk } from "@/lib/mcp/tool-risk";

import type { McpAuthExtra } from "@/lib/mcp/types";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpResult = { content: any[]; isError?: boolean; [key: string]: unknown };

/**
 * Wraps an MCP tool handler callback with usage logging.
 * Auth logic inside the handler is unchanged — this only adds logging.
 */
export function withToolLogging<TArgs>(
  toolName: string,
  integrationId: string,
  handler: (args: TArgs, extra: McpAuthExtra) => Promise<McpResult>,
): (args: TArgs, extra: McpAuthExtra) => Promise<McpResult> {
  return async (args, extra) => {
    const userId = (extra.authInfo?.extra?.userId as string) ?? "unknown";
    const apiKeyId = extra.authInfo?.extra?.apiKeyId as string | undefined;
    const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
    const riskLevel = getToolRisk(toolName);
    const startTime = Date.now();

    try {
      const result = await handler(args, extra);
      logUsage({
        userId,
        apiKeyId,
        toolName,
        integrationId,
        status: result.isError ? "error" : "success",
        durationMs: Date.now() - startTime,
        organizationId,
        riskLevel,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logUsage({
        userId,
        apiKeyId,
        toolName,
        integrationId,
        status: "error",
        errorMessage: message,
        durationMs: Date.now() - startTime,
        organizationId,
        riskLevel,
      });
      throw err;
    }
  };
}
