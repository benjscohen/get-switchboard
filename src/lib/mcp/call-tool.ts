import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { filterToolsForUser, type ToolMeta, type RegisteredTool } from "./tool-filtering";

/**
 * Registers the `call_tool` meta-tool that lets discovery-mode users
 * execute any tool they have permission to use.
 */
export function registerCallTool(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
  registeredTools: Record<string, RegisteredTool>,
) {
  server.tool(
    "call_tool",
    "Execute any tool by name. Use discover_tools to find available tools, then call them through this tool. Pass the tool name and its arguments.",
    {
      tool_name: z.string().describe("The name of the tool to call (from discover_tools results)"),
      arguments: z.record(z.string(), z.unknown()).optional().default({}).describe("Arguments to pass to the tool"),
    },
    async (args, extra) => {
      const connections = extra.authInfo?.extra?.connections as
        | Array<{ integrationId: string }>
        | undefined;
      const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
      const permissionsMode = extra.authInfo?.extra?.permissionsMode as string | undefined;
      const integrationAccess = extra.authInfo?.extra?.integrationAccess as
        | Array<{ integrationId: string; allowedTools: string[] }>
        | undefined;
      const integrationOrgKeys = extra.authInfo?.extra?.integrationOrgKeys as
        | Record<string, string>
        | undefined;
      const proxyUserKeys = extra.authInfo?.extra?.proxyUserKeys as
        | Record<string, string>
        | undefined;
      const apiKeyScope = extra.authInfo?.extra?.apiKeyScope as string | undefined;
      const role = extra.authInfo?.extra?.role as string | undefined;
      const orgRole = extra.authInfo?.extra?.orgRole as string | undefined;

      // Check permissions with discoveryMode OFF to get real allowed tools
      const visibleList = filterToolsForUser(registeredTools, toolMeta, {
        connections,
        organizationId,
        permissionsMode,
        integrationAccess,
        integrationOrgKeys,
        proxyUserKeys,
        apiKeyScope,
        role,
        orgRole,
        discoveryMode: false,
      });
      const visibleToolNames = new Set(visibleList.map((t) => t.name));

      if (!visibleToolNames.has(args.tool_name)) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Tool "${args.tool_name}" not found or you don't have permission to use it. Use discover_tools to find available tools.`,
          }],
        };
      }

      // Look up the handler from the server's internal registry
      const serverInternal = server as unknown as {
        _registeredTools: Record<string, {
          handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown>;
          inputSchema?: unknown;
        }>;
      };
      const tool = serverInternal._registeredTools[args.tool_name];
      if (!tool) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Tool "${args.tool_name}" is registered but its handler was not found.`,
          }],
        };
      }

      // Call the tool handler with the same extra context (preserves auth)
      const result = await Promise.resolve(
        tool.inputSchema
          ? (tool.handler as (a: Record<string, unknown>, e: unknown) => Promise<unknown>)(args.arguments ?? {}, extra)
          : (tool.handler as (e: unknown) => Promise<unknown>)(extra)
      );

      return result as { content: Array<{ type: "text"; text: string }>; isError?: boolean };
    }
  );

  toolMeta.set("call_tool", { integrationId: "platform", orgId: null });
}
