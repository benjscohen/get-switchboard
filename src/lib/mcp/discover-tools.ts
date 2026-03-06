import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { filterToolsForUser, type ToolMeta, type RegisteredTool } from "./tool-filtering";
import { searchToolsWithEmbeddings, browseIntegrations, type ToolIndexEntry } from "./tool-search";
import { zodToJsonSchema } from "./schema-utils";
import { withToolLogging } from "./tool-logging";

/**
 * Registers the `discover_tools` MCP tool on the server.
 * This tool lets users search for or browse available integrations and tools,
 * respecting their current permissions and connections.
 */
export function registerDiscoverTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
  searchIndex: ToolIndexEntry[],
  registeredTools: Record<string, RegisteredTool>,
) {
  server.tool(
    "discover_tools",
    "Search for available tools or browse integrations. Use with a query to find specific tools by keyword or description, or without a query to see a summary of all available integrations and their tool counts.",
    {
      query: z.string().optional().describe("Search query to find tools by name, description, or capability"),
      integration: z.string().optional().describe("Filter results to a specific integration (e.g. 'google-calendar', 'slack')"),
      category: z.string().optional().describe("Filter by category (e.g. 'calendar', 'email', 'docs')"),
      action: z.string().optional().describe("Filter by action type (e.g. 'read', 'create', 'delete')"),
      limit: z.number().optional().default(10).describe("Maximum number of results to return (default 10)"),
    },
    withToolLogging("discover_tools", "platform", async (args, extra) => {
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

      // Compute which tools this user can actually see (without discovery mode to get real list)
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
      });
      const visibleToolNames = new Set(visibleList.map((t) => t.name));

      if (args.query) {
        // Search mode
        const rawResults = await searchToolsWithEmbeddings(args.query, searchIndex, visibleToolNames, {
          integration: args.integration,
          category: args.category,
          action: args.action,
          limit: args.limit ?? 10,
        });

        const results = rawResults.map((r) => ({
          name: r.entry.name,
          description: r.entry.description,
          integration: r.entry.integration,
          inputSchema: zodToJsonSchema(registeredTools[r.entry.name]?.inputSchema) ?? null,
        }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              mode: "search",
              query: args.query,
              results,
              total: results.length,
              tip: "Pass tool name and arguments to call_tool to execute. The inputSchema shows required parameters.",
            }, null, 2),
          }],
        };
      } else {
        // Browse mode
        const integrations = browseIntegrations(searchIndex, visibleToolNames, {
          integration: args.integration,
          category: args.category,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              mode: "browse",
              integrations,
              total: integrations.length,
              tip: "Use discover_tools with a query to search for specific tools, or specify an integration name to see its tools.",
            }, null, 2),
          }],
        };
      }
    })
  );

  toolMeta.set("discover_tools", { integrationId: "platform", orgId: null });
}
