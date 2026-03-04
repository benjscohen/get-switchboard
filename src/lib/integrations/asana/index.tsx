import type { IntegrationConfig, IntegrationToolDef } from "../types";
import { ASANA_TOOLS, type AsanaClient } from "./tools";

function AsanaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <circle cx="9" cy="4.5" r="3.2" fill="#F06A6A" />
      <circle cx="4" cy="12.5" r="3.2" fill="#F06A6A" />
      <circle cx="14" cy="12.5" r="3.2" fill="#F06A6A" />
    </svg>
  );
}

const tools: IntegrationToolDef[] = ASANA_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  schema: t.schema,
  execute: (args: Record<string, unknown>, client: unknown) =>
    t.execute(args, client as AsanaClient),
}));

export const asanaIntegration: IntegrationConfig = {
  id: "asana",
  name: "Asana",
  description:
    "Search, create, and manage tasks, projects, goals, and team collaboration in Asana",
  icon: AsanaIcon,
  oauth: {
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    clientIdEnvVar: "ASANA_CLIENT_ID",
    clientSecretEnvVar: "ASANA_CLIENT_SECRET",
    scopes: [],
    extraAuthParams: {},
  },
  createClient(tokens) {
    return {
      accessToken: tokens.accessToken,
      baseUrl: "https://app.asana.com/api/1.0",
    } satisfies AsanaClient;
  },
  tools,
  toolCount: tools.length,
};
