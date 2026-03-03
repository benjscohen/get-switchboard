import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/crypto";
import { getCalendarClient } from "@/lib/google/client";
import { CALENDAR_TOOLS } from "@/lib/google/tools";

const handler = createMcpHandler(
  (server) => {
    for (const tool of CALENDAR_TOOLS) {
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
          try {
            const cal = await getCalendarClient(userId);
            const result = await tool.execute(args as Record<string, unknown>, cal);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(result, null, 2) },
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
  },
  {
    serverInfo: {
      name: "switchboard-calendar",
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

    return {
      token: bearerToken,
      clientId: apiKey.userId,
      scopes: ["calendar"],
      extra: { userId: apiKey.userId },
    };
  },
  { required: true }
);

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
