import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { RAILWAY_TOOLS, type RailwayClient } from "./tools";

function RailwayIcon() {
  return (
    <img
      src="/integrations/railway.svg"
      alt="Railway"
      width={18}
      height={18}
      className="shrink-0"
    />
  );
}

const tools: IntegrationToolDef[] = RAILWAY_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as RailwayClient),
}));

export const railwayIntegration: IntegrationConfig = {
  id: "railway",
  name: "Railway",
  description:
    "Deploy services, manage environments, set variables, and monitor deployments on Railway",
  icon: RailwayIcon,
  oauth: {
    authUrl: "https://backboard.railway.com/oauth/auth",
    tokenUrl: "https://backboard.railway.com/oauth/token",
    clientIdEnvVar: "RAILWAY_CLIENT_ID",
    clientSecretEnvVar: "RAILWAY_CLIENT_SECRET",
    scopes: ["openid", "offline_access", "workspace:member", "project:member"],
    extraAuthParams: { prompt: "consent" },
  },
  createClient(tokens) {
    const client: RailwayClient = {
      async graphql<T = unknown>(
        query: string,
        variables?: Record<string, unknown>
      ): Promise<T> {
        const res = await fetch(
          "https://backboard.railway.com/graphql/v2",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query, variables }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Railway API ${res.status}: ${text}`);
        }
        const json = await res.json();
        if (json.errors?.length) {
          throw new Error(
            `Railway GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join(", ")}`
          );
        }
        return json.data as T;
      },
    };
    return client;
  },
  tools,
  toolCount: tools.length,
};
