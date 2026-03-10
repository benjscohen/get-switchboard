import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { withToolLogging } from "@/lib/mcp/tool-logging";
import { ok, err, unauthorized } from "@/lib/mcp/types";
import type { McpAuthExtra } from "@/lib/mcp/types";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";

export function registerSessionTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
) {
  const toolName = "close_thread";

  toolMeta.set(toolName, { integrationId: "switchboard", orgId: null });

  server.tool(
    toolName,
    "Close the current thread/session. Use this when your task is definitively done (e.g. email sent, task completed). The session will be marked as completed.",
    { reason: z.string().optional().describe("Optional reason for closing the thread") },
    withToolLogging(toolName, "switchboard", async (args: { reason?: string }, extra: McpAuthExtra) => {
      const userId = extra.authInfo?.extra?.userId as string | undefined;
      if (!userId) return unauthorized();

      const sessionId = extra.authInfo?.extra?.sessionId as string | undefined;
      if (!sessionId) {
        return err("No session ID available — close_thread can only be used within an active agent session.");
      }

      const { error } = await supabaseAdmin
        .from("agent_sessions")
        .update({ close_requested: true, updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (error) {
        return err(`Failed to close thread: ${error.message}`);
      }

      return ok(
        args.reason
          ? `Thread closed: ${args.reason}`
          : "Thread closed. The session will complete after this response."
      );
    }),
  );
}
