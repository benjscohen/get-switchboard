import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/crypto";
import { allIntegrations } from "@/lib/integrations/registry";
import { getValidTokens } from "@/lib/integrations/token-refresh";

const handler = createMcpHandler(
  (server) => {
    for (const integration of allIntegrations) {
      for (const tool of integration.tools) {
        server.tool(
          tool.name,
          tool.description,
          tool.schema.shape,
          async (args, extra) => {
            const userId = extra.authInfo?.extra?.userId as string | undefined;
            if (!userId) {
              return {
                content: [{ type: "text" as const, text: "Unauthorized" }],
                isError: true,
              };
            }

            // Look up the user's connection for this integration
            const connections = extra.authInfo?.extra?.connections as
              | Array<{
                  id: string;
                  integrationId: string;
                  accessToken: string;
                  refreshToken: string | null;
                  expiresAt: Date | null;
                }>
              | undefined;

            const connection = connections?.find(
              (c) => c.integrationId === integration.id
            );

            if (!connection) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Integration "${integration.name}" is not connected. Connect it at your dashboard.`,
                  },
                ],
                isError: true,
              };
            }

            try {
              const tokens = await getValidTokens(connection);
              const client = integration.createClient(tokens);
              const result = await tool.execute(
                args as Record<string, unknown>,
                client
              );
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2),
                  },
                ],
              };
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : "Unknown error";
              return {
                content: [{ type: "text" as const, text: message }],
                isError: true,
              };
            }
          }
        );
      }
    }
  },
  {
    serverInfo: {
      name: "switchboard",
      version: "1.0.0",
    },
  },
  {
    basePath: "/api/mcp",
    sessionIdGenerator: undefined,
  }
);

const authedHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;

    const keyHash = hashApiKey(bearerToken);
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: { userId: true, id: true },
    });

    if (!apiKey) return undefined;

    // Update last used time (fire-and-forget)
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    // Load all connections for this user
    const connections = await prisma.connection.findMany({
      where: { userId: apiKey.userId },
      select: {
        id: true,
        integrationId: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
      },
    });

    return {
      token: bearerToken,
      clientId: apiKey.userId,
      scopes: ["all"],
      extra: { userId: apiKey.userId, connections },
    };
  },
  { required: true }
);

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
